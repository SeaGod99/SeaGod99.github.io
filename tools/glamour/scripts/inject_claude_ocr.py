# -*- coding: utf-8 -*-
"""把 Claude 親讀的配裝判讀結果寫進 `data/ocr_cache.json`。

## 為什麼要有這支

`ocr_check.py` 走 Ollama，準度只有 58%（Claude 親讀 99%，實測見
[知識庫 §4.20](../../../docs/專案慣例與記憶.md)）。所以每輪新投稿的**逐字轉錄由 Claude
親讀並回查道具庫**，讀完要有一條把結果寫回快取的路，`apply_dyes` →
`reconstruct_empty` → `build_site` 才吃得到。

這支腳本 2026-08-04～08-08 那輪就存在，但當時是 `scripts/_tmp_*.py`（被 `.gitignore` 擋著），
**每輪都得重寫一次**。2026-08-30 這輪改成常駐腳本。

## 兩個非做不可的行為（踩過才知道）

1. **判讀為空要「刪除」而不是「跳過」。** 沒有裝備清單面板的圖（官方 `#ミラプリレシピ`
   宣傳橫幅、純角色照…），正解是**快取裡沒有這筆**。但 ollama 早就把「看圖說故事」的
   結果寫進去了（`マント`／`猫耳`／染色填 `"0"`），只跳過等於讓假資料繼續餵
   `mirapri_visible` 與 `reconstruct_empty`。
2. **名稱不在道具庫就中止整批。** 錯名不會報錯，只會讓 `mirapri_visible` 把玩家真的穿著的
   裝備靜靜隱藏。真有道具庫缺口（例：`デコレート・フラワーグラス`）要用
   `--allow-unknown` 逐個具名放行，逼人回查過才放它進去。

備份檔名固定為 `data/ocr_cache.bak_claude_<時間>.json`——`build_ocr_aliases.py` 靠這個
glob 去學「ollama 當初怎麼讀錯的」，改名字會讓那支學不到東西。

## 輸入格式

```json
{
  "glamour_recipe_1787842493049-gpx7vn.jpg": {
    "note": "選填，只是給人看的",
    "pieces": [
      {"item": "アイルバケーション・バイザー", "dyes": ["シェールブラウン", "メサレッド"]},
      {"item": "ナバスアレン・ヒーラーグローブ", "dyes": []}
    ]
  }
}
```

key 可以是圖片檔名或 `配裝圖片/mirapri/xxx.jpg` 這種相對路徑。`items` 與整套 `dyes`
由 `pieces` 自動導出（`dyes` 去重＝色票清單；`pieces[].dyes` **不去重**，那是有序槽位，
兩槽同色是有效資料，見[知識庫 §4.28](../../../docs/專案慣例與記憶.md)）。

## 用法

    py scripts\\inject_claude_ocr.py 判讀.json                    # dry-run
    py scripts\\inject_claude_ocr.py 判讀.json --apply            # 寫入
    py scripts\\inject_claude_ocr.py 判讀.json --apply --allow-unknown "デコレート・フラワーグラス"

寫完接：`apply_dyes.py` → `reconstruct_empty.py` → `build_site.py` →
`build_item_sources.py` → `health_check.py`。
"""
import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).parent.parent
REPO = ROOT.parent.parent
DATA = ROOT / "data"
CACHE_JSON = DATA / "ocr_cache.json"
IMG_DIR = ROOT / "配裝圖片" / "mirapri"
OCR_SCHEMA_VER = 2


def load_json(p, default):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return default


def img_sig(path):
    """與 ocr_check.img_sig 同義：mtime-size。兩邊必須一致，否則下次跑會被判成過期。"""
    st = os.stat(path)
    return f"{int(st.st_mtime)}-{st.st_size}"


def cache_key(fname):
    # ocr_check 用 os.path.relpath(圖片, ROOT)，Windows 下是反斜線
    return os.path.join("配裝圖片", "mirapri", fname)


def load_known_names():
    """道具庫的日文名集合（ja-items 為主，多語庫補 7.x 新件）。"""
    names = set()
    try:
        import msgpack
        with open(REPO / "out_data" / "ja-items.msgpack", "rb") as f:
            ja = msgpack.unpack(f, raw=False, strict_map_key=False)
        for v in ja.values():
            n = v if isinstance(v, str) else (v.get("name") or v.get("ja") or "")
            if n:
                names.add(n)
    except Exception as e:
        print(f"  ⚠️  讀不到 ja-items.msgpack（{e}），略過裝備名校驗")
        return None
    fb = load_json(DATA / "item_fallback_multilang.json", {}).get("items", {})
    for v in fb.values():
        if v.get("ja"):
            names.add(v["ja"])
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("readings", help="Claude 判讀結果 JSON")
    ap.add_argument("--apply", action="store_true", help="寫入（預設只印）")
    ap.add_argument("--allow-unknown", action="append", default=[],
                    metavar="裝備名", help="放行道具庫查無的名稱（可重複；請先回查確認是缺口）")
    a = ap.parse_args()

    print("=== inject_claude_ocr.py ===")
    readings = load_json(a.readings, None)
    if not isinstance(readings, dict):
        print(f"❌ 讀不到判讀檔或格式不對：{a.readings}")
        return 1
    cache = load_json(CACHE_JSON, {})
    print(f"  判讀 {len(readings)} 套｜快取現有 {len(cache)} 筆")

    known = load_known_names()
    whitelist = set(load_json(DATA / "dye_names_ja.json", []))

    # ── 校驗（不過就整批不寫）────────────────────────────────
    allow = set(a.allow_unknown)
    bad_items, bad_dyes, missing_img = [], [], []
    for key, rec in readings.items():
        fname = Path(str(key).replace("\\", "/")).name
        if not (IMG_DIR / fname).exists():
            missing_img.append(fname)
        for p in rec.get("pieces", []):
            it = p.get("item", "")
            if known is not None and it not in known and it not in allow:
                bad_items.append((fname, it))
            for d in p.get("dyes", []):
                if whitelist and d not in whitelist:
                    bad_dyes.append((fname, it, d))
    for f in missing_img:
        print(f"  ❌ 找不到圖片：{f}")
    for f, it in bad_items:
        print(f"  ❌ 道具庫查無：{it}  （{f}）")
    for f, it, d in bad_dyes:
        print(f"  ❌ 不在官方色表：{d}  （{it} / {f}）")
    if missing_img or bad_items or bad_dyes:
        print("\n  中止：先回查道具庫改對，或用 --allow-unknown 具名放行確認過的缺口。")
        return 1
    n_items = sum(len(r.get("pieces", [])) for r in readings.values())
    n_dyes = sum(len(p.get("dyes", [])) for r in readings.values() for p in r.get("pieces", []))
    print(f"  ✓ 校驗通過：裝備名 {n_items}/{n_items}、染色 {n_dyes}/{n_dyes}"
          + (f"（含具名放行 {len(allow)} 個）" if allow else ""))

    # ── 組出要寫的內容 ──────────────────────────────────────
    now = datetime.now().isoformat(timespec="seconds")
    writes, deletes, skips = [], [], []
    for key, rec in readings.items():
        fname = Path(str(key).replace("\\", "/")).name
        ck = cache_key(fname)
        pieces = [{"item": p["item"], "dyes": list(p.get("dyes", []))}
                  for p in rec.get("pieces", [])]
        if not pieces:
            # 判讀為空＝這張圖沒有裝備清單面板，正解是「快取裡沒有這筆」
            old = cache.get(ck)
            if old is None:
                skips.append((fname, "本來就沒有紀錄"))
            elif isinstance(old, dict) and old.get("src") == "claude":
                skips.append((fname, "已是 claude 的空紀錄，不動"))
            else:
                deletes.append(ck)
            continue
        items = list(dict.fromkeys(p["item"] for p in pieces))      # 清單去重
        dyes = list(dict.fromkeys(d for p in pieces for d in p["dyes"]))  # 色票去重
        writes.append((ck, {
            "sig": img_sig(IMG_DIR / fname), "ver": OCR_SCHEMA_VER, "src": "claude",
            "items": items, "dyes": dyes, "pieces": pieces, "at": now,
        }))

    new_n = sum(1 for ck, _ in writes if ck not in cache)
    print(f"  將寫入 {len(writes)} 筆（新增 {new_n}、覆蓋 {len(writes)-new_n}）"
          f"｜刪除 {len(deletes)} 筆假紀錄｜跳過 {len(skips)} 筆")
    for ck in deletes:
        print(f"    🗑  {Path(ck).name}")
    for f, why in skips:
        print(f"    －  {f}（{why}）")

    if not a.apply:
        print("\n  （dry-run：未寫入。確認無誤後加 --apply）")
        return 0

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = DATA / f"ocr_cache.bak_claude_{stamp}.json"
    bak.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"\n  備份舊快取 → {bak.name}（build_ocr_aliases.py 靠這個 glob 學錯字）")

    for ck in deletes:
        cache.pop(ck, None)
    for ck, v in writes:
        cache[ck] = v
    CACHE_JSON.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  ✅ 已寫入 {CACHE_JSON.name}（{len(cache)} 筆）")
    print("  接著跑：apply_dyes.py → reconstruct_empty.py → build_site.py "
          "→ build_item_sources.py → health_check.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
