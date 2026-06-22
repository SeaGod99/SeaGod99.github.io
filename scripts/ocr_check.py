#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ocr_check.py —— 用 Ollama 視覺模型對 FF14 配裝圖做 OCR，
比對現有資料（curated / mirapri / 上傳圖），輸出「Claude 可確認」的報告。

OCR 能做 / 不能做
-----------------
能：① 驗證圖上有畫的裝備名是否正確　② 抽出染色（資料原本沒有）　③ 找出抓漏的裝備
不能：讀「取得方法（source）」——圖上沒有這資訊，仍需 sources.json／手動查。

比對範圍
--------
比對「整套有畫出來的裝備」（全套），不是只比未填 source 的部位，
所以命中率反映真實 OCR 準度。--mode 只決定要看哪些『套』：
  missing   只看「還有部位沒填取得方法」的套（待補的）
  confirmed 只看「取得方法都填好」的套（改版復查用）
  all       全部

每套分四類
----------
- 驗證吻合：圖上有畫、OCR 讀到且對到資料（命中）
- 名稱可能不符（maybe_wrong）：圖上應該有、但 OCR 讀到的名字對不太上 → 需確認
- 抓漏（extra）：OCR 讀到、資料卻沒有 → 可能漏抓
- 補染色：OCR 讀到的染色（資料可加）
（圖上沒畫的部位 not_shown 低優先，收在 <sub>，不算需確認）

降噪（自動）
------------
- 去重複同名部位；把黏在裝備名後的染色切出來
- 用 data/dye_names_ja.json（官方 146 色）過濾假染色、校正錯字
  （スーツブラック→スートブラック、スノーホワイト→スノウホワイト）

範例
----
  py scripts\\ocr_check.py --target mirapri  --mode missing  --limit 50
  py scripts\\ocr_check.py --target mirapri  --mode all
  py scripts\\ocr_check.py --target uploads  --images "C:\\圖\\新截圖"
  py scripts\\ocr_check.py --target mirapri  --id 0a5a58e0-...  --force

輸出
----
  data/OCR檢查報告.md / data/ocr_check_result.json / data/ocr_cache.json
  data/dye_names_ja.json（染色白名單，缺檔則不過濾，照樣可跑）

需求：Ollama + `ollama pull qwen2.5vl:7b`；Windows 用 py；
      py -m pip install requests pillow --break-system-packages
"""

import argparse
import base64
import io
import json
import os
import re
import sys
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher

# ----- 路徑（相對於專案根目錄；腳本在 scripts/ 底下） -----
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CURATED_JSON = os.path.join(DATA, "curated_outfits.json")
ENRICHED_JSON = os.path.join(DATA, "all_outfits_enriched.json")
CACHE_JSON = os.path.join(DATA, "ocr_cache.json")
REPORT_MD = os.path.join(DATA, "OCR檢查報告.md")
RESULT_JSON = os.path.join(DATA, "ocr_check_result.json")
DYE_JSON = os.path.join(DATA, "dye_names_ja.json")
MIRAPRI_IMG_DIR = os.path.join(ROOT, "配裝圖片", "mirapri")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("OCR_MODEL", "qwen2.5vl:7b")
MATCH_THRESHOLD = 0.82  # 裝備名相似度門檻
DYE_THRESHOLD = 0.80    # 染色名校正門檻
NOT_SHOWN_BELOW = 0.70  # 低於此相似度視為「圖上沒畫」而非抓錯（同系列裝備易在 0.5~0.7 互相誤判）

OCR_PROMPT = (
    "これはFF14のミラージュプリズム（装備の見た目）の画像です。"
    "画像内に表示されている文字を読み取ってください。"
    "アイコンの近くにある大きめの白い文字が『装備アイテム名』、"
    "そのすぐ下にある小さい文字が『染色（カララント）名』です。"
    "装備名と染色名は別々の項目として分けてください。"
    "推測や創作はせず、実際に見える文字だけを出力してください。"
    "次のJSON形式『だけ』を出力（説明文やコードブロックは不要）:\n"
    '{"items": ["装備名1", "装備名2"], "dyes": ["染色名1"]}'
)


# ===================== 文字正規化 / 比對 =====================
def norm(s):
    """正規化日文名稱：全形轉半形、去空白/中點/冒號、拉丁字小寫。"""
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = s.lower()
    s = re.sub(r"[\s・·:：\-—/／、,，.。【】\[\]]", "", s)
    return s


def similar(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.95
    return SequenceMatcher(None, na, nb).ratio()


def best_match(name, candidates):
    """在 candidates(list[str]) 找與 name 最相似者，回傳 (idx, score)。"""
    best_i, best_s = -1, 0.0
    for i, c in enumerate(candidates):
        s = similar(name, c)
        if s > best_s:
            best_i, best_s = i, s
    return best_i, best_s


# ===================== 染色白名單 / OCR 清理 =====================
def load_dye_whitelist():
    return load_json(DYE_JSON, [])  # list[str]；缺檔回 []（= 不過濾）


def snap_dye(token, dye_names):
    """把 OCR 染色 token 校正到官方名；對不到就回 None（白名單為空時原樣保留）。"""
    token = token.strip()
    if not token:
        return None
    if not dye_names:
        return token
    idx, score = best_match(token, dye_names)
    if idx >= 0 and score >= DYE_THRESHOLD:
        return dye_names[idx]
    return None


def clean_ocr(items, dyes, dye_names):
    """降噪：把裝備名尾端黏到的染色切出來，染色經白名單過濾+校正。
    回傳 (clean_items, clean_dyes)。"""
    clean_items, extracted = [], []
    for it in items:
        parts = it.split()
        if len(parts) > 1:
            head, tail = parts[:], []
            while len(head) > 1:
                s = snap_dye(head[-1], dye_names)
                if s:
                    tail.insert(0, s)
                    head = head[:-1]
                else:
                    break
            clean_items.append(" ".join(head))
            extracted.extend(tail)
        else:
            clean_items.append(it)

    clean_dyes = []
    for d in list(dyes) + extracted:
        cand = snap_dye(d, dye_names)
        if cand is None:  # 整串對不到，再試逐 token（例：「シューズ スートブラック」）
            for tok in d.split():
                cand = snap_dye(tok, dye_names)
                if cand:
                    break
        if cand:
            clean_dyes.append(cand)
        elif not dye_names:
            clean_dyes.append(d)

    clean_items = list(dict.fromkeys([x for x in clean_items if x]))
    clean_dyes = list(dict.fromkeys(clean_dyes))
    return clean_items, clean_dyes


# ===================== OCR（Ollama） =====================
def _encode_image(path, max_edge=1280):
    from PIL import Image

    im = Image.open(path)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > max_edge:
        r = max_edge / max(w, h)
        im = im.resize((int(w * r), int(h * r)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def ocr_ollama(path):
    """回傳原始 (items, dyes)；清理留到後面做。失敗丟例外。"""
    import requests

    payload = {
        "model": MODEL,
        "prompt": OCR_PROMPT,
        "images": [_encode_image(path)],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0},
    }
    r = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=300)
    r.raise_for_status()
    return _parse_ocr_json(r.json().get("response", "").strip())


def _parse_ocr_json(raw):
    items, dyes = [], []
    try:
        m = re.search(r"\{.*\}", raw, re.S)
        obj = json.loads(m.group(0) if m else raw)
        items = [str(x).strip() for x in obj.get("items", []) if str(x).strip()]
        dyes = [str(x).strip() for x in obj.get("dyes", []) if str(x).strip()]
    except Exception:
        pass
    return list(dict.fromkeys(items)), list(dict.fromkeys(dyes))


# ===================== 快取 / IO =====================
def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def _save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def img_sig(path):
    try:
        st = os.stat(path)
        return f"{int(st.st_mtime)}-{st.st_size}"
    except OSError:
        return "0-0"


# ===================== 取得待處理清單 =====================
def piece_needs_source(src):
    s = (src or "").strip()
    return (s == "") or ("待確認" in s)


def _outfit_in_mode(rec, mode):
    """這套是否落在 mode：missing=至少一個部位缺source；confirmed=全部都有；all=全部。"""
    needs = [p["need"] for p in rec]
    if mode == "missing":
        return any(needs)
    if mode == "confirmed":
        return rec and not any(needs)
    return True


def build_targets(target, mode, only_id=None, images_dir=None):
    out = []

    if target in ("mirapri", "all"):
        for o in load_json(ENRICHED_JSON, []):
            if only_id and o.get("id") != only_id:
                continue
            bn = os.path.basename(o.get("image", ""))
            ip = os.path.join(MIRAPRI_IMG_DIR, bn)
            if not bn or not os.path.exists(ip):
                continue
            rec = [{
                "slot": p.get("slot", ""),
                "name": p.get("name", ""),
                "zh": p.get("zh", ""),
                "source": p.get("source", ""),
                "need": piece_needs_source(p.get("source")),
            } for p in o.get("equipments", [])]
            if not _outfit_in_mode(rec, mode):
                continue
            out.append({
                "outfit_id": o.get("id", ""), "title": o.get("title", ""),
                "image": ip, "rel_image": os.path.relpath(ip, ROOT),
                "source_type": "mirapri", "recorded": rec,
            })

    if target in ("curated", "all"):
        thumb_dir = os.path.join(ROOT, "配裝圖片", "縮圖")
        for o in load_json(CURATED_JSON, []):
            if only_id and o.get("id") != only_id:
                continue
            ip = os.path.join(ROOT, o.get("image", ""))
            bn = os.path.basename(o.get("image", ""))
            cand = [ip, os.path.join(thumb_dir, bn), os.path.join(thumb_dir, bn + ".jpg")]
            use = next((c for c in cand if os.path.exists(c)), None)
            if not use:
                continue
            rec = [{
                "slot": p.get("slot", ""),
                "name": p.get("ja", ""),
                "zh": p.get("zh", ""),
                "source": p.get("source", ""),
                "need": piece_needs_source(p.get("source")),
            } for p in o.get("pieces", [])]
            if not _outfit_in_mode(rec, mode):
                continue
            out.append({
                "outfit_id": o.get("id", ""), "title": o.get("name", ""),
                "image": use, "rel_image": os.path.relpath(use, ROOT),
                "source_type": "curated", "recorded": rec,
            })

    if target == "uploads":
        folder = images_dir or os.path.join(ROOT, "_新增圖片")
        if os.path.isdir(folder):
            for fn in sorted(os.listdir(folder)):
                if not fn.lower().endswith((".jpg", ".jpeg", ".jpe", ".png", ".webp")):
                    continue
                ip = os.path.join(folder, fn)
                out.append({
                    "outfit_id": "(upload)" + os.path.splitext(fn)[0], "title": fn,
                    "image": ip, "rel_image": ip,
                    "source_type": "upload", "recorded": [],
                })
        else:
            print(f"WARN 找不到上傳資料夾：{folder}（用 --images 指定）")

    return out


# ===================== 比對（全套） =====================
def _slim(p):
    return {"slot": p["slot"], "name": p["name"], "zh": p["zh"], "source": p["source"]}


def _dedupe(pieces):
    """去掉同名重複部位（資料裡常有複製欄位），保留第一個。"""
    seen, out = set(), []
    for p in pieces:
        k = norm(p["name"])
        if k and k in seen:
            continue
        seen.add(k)
        out.append(p)
    return out


def diff_one(entry, ocr_items, ocr_dyes):
    """比對整套有名字的裝備 vs OCR。"""
    recorded = _dedupe([p for p in entry["recorded"] if p.get("name")])
    rec_names = [p["name"] for p in recorded]

    matched, missing = [], []
    used = set()
    for p in recorded:
        idx, score = best_match(p["name"], ocr_items)
        if idx >= 0 and score >= MATCH_THRESHOLD:
            used.add(idx)
            matched.append({**_slim(p), "ocr": ocr_items[idx],
                            "score": round(score, 2), "unsourced": p["need"]})
        else:
            missing.append({
                **_slim(p),
                "closest_ocr": (ocr_items[idx] if idx >= 0 else ""),
                "score": round(score, 2),
                "likely": "not_shown" if score < NOT_SHOWN_BELOW else "maybe_wrong",
                "unsourced": p["need"],
            })

    extra = []
    for i, name in enumerate(ocr_items):
        if i in used:
            continue
        _, s = best_match(name, rec_names)
        if s >= MATCH_THRESHOLD:
            continue
        extra.append(name)

    maybe_wrong = [m for m in missing if m["likely"] == "maybe_wrong"]
    shown = len(matched) + len(maybe_wrong)  # 圖上「應該看得到」的件數
    return {
        "matched": matched,
        "missing_in_ocr": missing,
        "extra_in_ocr": extra,
        "dyes_found": ocr_dyes,
        "verify": {"hit": len(matched), "shown": shown, "recorded": len(recorded)},
    }


def needs_confirm(d):
    """需確認 = 名稱可能不符 / 抓漏 / 有可補染色（not_shown 不算）。"""
    maybe_wrong = [m for m in d["missing_in_ocr"] if m["likely"] == "maybe_wrong"]
    return bool(maybe_wrong or d["extra_in_ocr"] or d["dyes_found"])


# ===================== 主流程 =====================
def run(args, ocr_func):
    targets = build_targets(args.target, args.mode, args.id, args.images)
    if args.limit:
        targets = targets[: args.limit]
    if not targets:
        print("沒有符合條件的套裝（試試別的 --mode 或 --target）。")
        return

    dye_names = load_dye_whitelist()
    if not dye_names:
        print("（注意：找不到 data/dye_names_ja.json，染色不過濾）")
    cache = load_json(CACHE_JSON, {})
    results = []
    n = len(targets)
    print(f"共 {n} 套要處理｜target={args.target} mode={args.mode} model={MODEL}")

    for i, e in enumerate(targets, 1):
        sig = img_sig(e["image"])
        ck = e["rel_image"]
        cached = cache.get(ck)
        if cached and cached.get("sig") == sig and not args.force:
            raw_items, raw_dyes = cached["items"], cached["dyes"]
            tag = "cache"
        else:
            try:
                raw_items, raw_dyes = ocr_func(e["image"])
                cache[ck] = {"sig": sig, "items": raw_items, "dyes": raw_dyes,
                             "at": datetime.now().isoformat(timespec="seconds")}
                tag = "ocr"
            except Exception as ex:
                print(f"[{i}/{n}] X OCR 失敗 {e['rel_image']}: {ex}")
                continue

        items, dyes = clean_ocr(raw_items, raw_dyes, dye_names)
        d = diff_one(e, items, dyes)
        v = d["verify"]
        rec = {
            "outfit_id": e["outfit_id"], "title": e["title"],
            "source_type": e["source_type"], "image": e["rel_image"],
            "mode": args.mode, "ocr_items": items, "ocr_dyes": dyes,
            "diff": d, "needs_confirm": needs_confirm(d),
        }
        results.append(rec)
        flag = "需確認" if rec["needs_confirm"] else "OK"
        print(f"[{i}/{n}] {flag} {tag} {e['source_type']} {e['title'][:18]} "
              f"驗證{v['hit']}/{v['shown']} 抓漏{len(d['extra_in_ocr'])} 染色{len(dyes)}")

        if i % 25 == 0:
            _save_json(CACHE_JSON, cache)

    _save_json(CACHE_JSON, cache)
    tot_hit = sum(r["diff"]["verify"]["hit"] for r in results)
    tot_shown = sum(r["diff"]["verify"]["shown"] for r in results)
    _save_json(RESULT_JSON, {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "model": MODEL, "target": args.target, "mode": args.mode,
        "count": len(results),
        "need_confirm_count": sum(1 for r in results if r["needs_confirm"]),
        "verify_hit": tot_hit, "verify_shown": tot_shown,
        "items": results,
    })
    write_report(results, args)
    nc = sum(1 for r in results if r["needs_confirm"])
    rate = (tot_hit / tot_shown * 100) if tot_shown else 0
    print(f"\n完成：{len(results)} 套。名稱驗證命中 {tot_hit}/{tot_shown}（{rate:.0f}%），"
          f"{nc} 套有需確認項。")
    print(f"  報告 -> {os.path.relpath(REPORT_MD, ROOT)}")
    print(f"  結構化結果 -> {os.path.relpath(RESULT_JSON, ROOT)}")


def write_report(results, args):
    tot_hit = sum(r["diff"]["verify"]["hit"] for r in results)
    tot_shown = sum(r["diff"]["verify"]["shown"] for r in results)
    rate = (tot_hit / tot_shown * 100) if tot_shown else 0
    n_extra = sum(len(r["diff"]["extra_in_ocr"]) for r in results)
    n_dye_outfits = sum(1 for r in results if r["diff"]["dyes_found"])

    L = ["# OCR 檢查報告", ""]
    L.append(f"- 產生時間：{datetime.now().strftime('%Y-%m-%d %H:%M')}")
    L.append(f"- 範圍：target=`{args.target}` mode=`{args.mode}` model=`{MODEL}`")
    L.append(f"- **名稱驗證命中：{tot_hit}/{tot_shown}（{rate:.0f}%）**"
             f"　抓漏候選：{n_extra}　有可補染色：{n_dye_outfits} 套")
    L.append("")
    L.append("命中率只算「圖上應看得到」的件數；耳飾/武器等圖上沒畫的(not_shown)收在 <sub>，不列入。")
    L.append("")

    need = [r for r in results if r["needs_confirm"]]
    ok = [r for r in results if not r["needs_confirm"]]

    L.append(f"## 需確認（{len(need)}）")
    L.append("")
    for r in need:
        d = r["diff"]
        v = d["verify"]
        wrong = [m for m in d["missing_in_ocr"] if m["likely"] == "maybe_wrong"]
        notshown = [m for m in d["missing_in_ocr"] if m["likely"] == "not_shown"]
        L.append(f"### {r['title']}　`{r['outfit_id']}`　({r['source_type']})　驗證 {v['hit']}/{v['shown']}")
        L.append(f"圖：`{r['image']}`")
        if wrong:
            L.append("")
            L.append("**名稱可能不符（需確認）：**")
            for m in wrong:
                tail = (f"OCR讀到「{m.get('closest_ocr','')}」(相似{m.get('score',0)})"
                        if m.get("closest_ocr") else "OCR完全沒讀到")
                L.append(f"- [{m['slot']}] {m['name']}　{m['zh']}　{tail}")
        if d["extra_in_ocr"]:
            L.append("")
            L.append("**OCR 讀到、資料沒有（可能抓漏）：**")
            for x in d["extra_in_ocr"]:
                L.append(f"- {x}")
        if d["dyes_found"]:
            L.append("")
            L.append(f"**可補的染色：** {'、'.join(d['dyes_found'])}")
        if notshown:
            names = "、".join(f"{m['name']}({m['slot']})" for m in notshown)
            L.append("")
            L.append(f"<sub>圖上沒畫(低優先)：{names}</sub>")
        L.append("")

    L.append(f"## 全部吻合（{len(ok)}）")
    L.append("")
    for r in ok:
        v = r["diff"]["verify"]
        L.append(f"- {r['title']} `{r['outfit_id']}`（驗證 {v['hit']}/{v['shown']}）")
    L.append("")

    with open(REPORT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


# ===================== 自我測試用假 OCR =====================
_MOCK_LOOKUP = {}


def _mock_ocr_factory():
    for o in load_json(ENRICHED_JSON, []):
        bn = os.path.basename(o.get("image", ""))
        _MOCK_LOOKUP[bn] = [p.get("name", "") for p in o.get("equipments", []) if p.get("name")]

    def fake(path):
        bn = os.path.basename(path)
        names = list(dict.fromkeys(_MOCK_LOOKUP.get(bn, [])))
        if not names:
            return (["テスト装備A", "テスト装備B"], ["スノウホワイト"])
        items = names[:]
        if len(items) > 1:
            items = items[:-1]                       # 漏掉最後一件 → 測 missing
        items.append("謎の追加アイテムEX スートブラック")  # 多一件+名後黏染色 → 測 extra/clean
        return (items, ["スートブラック", "RE", "メイドパンプス"])  # 測白名單過濾

    return fake


# ===================== 互動選單（不帶參數時） =====================
def _pick(title, options, default_idx):
    """options: list[(value, 說明)]；回傳選到的 value。直接 Enter = 預設。"""
    print("\n" + title)
    for i, (val, desc) in enumerate(options, 1):
        mark = "←預設" if i - 1 == default_idx else ""
        print(f"  {i}) {val:<9}{desc} {mark}")
    raw = input(f"請輸入 1-{len(options)}（直接 Enter = {default_idx + 1}，q = 離開）: ").strip()
    if raw.lower() in ("q", "quit", "exit"):
        print("已離開。")
        sys.exit(0)
    if not raw:
        return options[default_idx][0]
    if raw.isdigit() and 1 <= int(raw) <= len(options):
        return options[int(raw) - 1][0]
    print("  輸入無效，用預設。")
    return options[default_idx][0]


def interactive_args():
    print("=" * 40)
    print(" FF14 配裝圖 OCR 檢查（互動模式）")
    print("=" * 40)

    target = _pick("① 要檢查哪些圖？", [
        ("mirapri", "社群套裝圖"),
        ("all", "mirapri + 精選"),
        ("curated", "精選套裝圖"),
        ("uploads", "尚未進庫的新圖"),
    ], 0)

    mode = _pick("② 檢查範圍（mode）？", [
        ("all", "全部套裝（含已填好的，染色覆蓋最廣）"),
        ("missing", "只看還有部位沒填取得方法的套"),
        ("confirmed", "只看取得方法都填好的套"),
    ], 0)

    images = None
    if target == "uploads":
        images = input("　圖片資料夾完整路徑: ").strip().strip('"') or None

    raw = input("\n③ 最多處理幾套？（直接 Enter = 不限，全部跑）: ").strip()
    limit = int(raw) if raw.isdigit() else 0

    force = input("④ 忽略快取、重新 OCR 已跑過的？(y/直接 Enter=否): ").strip().lower() == "y"

    print("\n" + "-" * 40)
    print(f" target={target}  mode={mode}  "
          f"limit={limit or '不限'}  force={force}")
    print("-" * 40)
    if input("確認開始？(直接 Enter=是 / n=取消): ").strip().lower() == "n":
        print("已取消。")
        sys.exit(0)

    return argparse.Namespace(target=target, mode=mode, images=images,
                              id=None, limit=limit, force=force, self_test=False)


# ===================== CLI =====================
def main():
    ap = argparse.ArgumentParser(description="FF14 配裝圖 OCR 檢查（Ollama）")
    ap.add_argument("--target", choices=["mirapri", "curated", "uploads", "all"],
                    default="mirapri")
    ap.add_argument("--mode", choices=["missing", "confirmed", "all"], default="missing",
                    help="missing=還有部位沒填source的套；confirmed=都填好的套；all=全部")
    ap.add_argument("--images", help="uploads 模式：自訂圖片資料夾")
    ap.add_argument("--id", help="只處理指定 outfit id")
    ap.add_argument("--limit", type=int, default=0, help="最多處理幾套（0=不限）")
    ap.add_argument("--force", action="store_true", help="忽略快取，重新 OCR")
    ap.add_argument("--self-test", action="store_true",
                    help="不呼叫 Ollama，用假 OCR 驗證流程")

    # 不帶任何參數 → 互動選單；帶參數 → 照舊用 CLI
    if len(sys.argv) <= 1:
        args = interactive_args()
    else:
        args = ap.parse_args()

    run(args, _mock_ocr_factory() if args.self_test else ocr_ollama)


if __name__ == "__main__":
    main()
