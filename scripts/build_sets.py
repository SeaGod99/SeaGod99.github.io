#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_sets.py —— 建「官方套裝」資料（data/official_sets.json），供官方套裝圖鑑分頁用。

兩層來源（混合方案，2026-07-09 CEO review 定案）：
  第一層（權威）：XIVAPI MirageStoreSetItem —— row_id=套裝箱道具ID，欄位=各部位道具ID。
    涵蓋商城/活動/特典「幻化套裝箱」。套裝 ID = mirage:{row_id}（遊戲原生，永久穩定）。
    空列（約 89/1170）與 row 0 垃圾列排除；數量入報告。
  第二層（啟發式）：資料來源/sources.json 分組副本/兌換/任務裝。
    分組鍵 = (來源簽名, ClassJobCategory ID, ItemLevel)——必含職業分類，
    否則同副本 7 職能套會黏成一坨。來源簽名（sources.json 無數字副本 ID，用內容簽名）：
      instance    → inst:{sorted(instanceNames)}
      specialshop → shop:cur{currencyItemId}
      quest       → quest:{questId}
      gcshop      → gc
      vendor      → npc:{sorted(npcNames)}
    套裝 ID = src:{簽名md5前8}:{cjc}:{ilvl}。
    註：收藏追蹤是「逐件」勾選（鍵=道具ID），套裝 ID 漂移只影響書籤/顯示，不毀資料。

  跨層去重：啟發式套的可見件集合 ⊆ 某 mirage 套 → 砍啟發式、留官方。
  v1 收錄準則（防垃圾堆）：套內含上身、且可見件（頭/上身/手/腿/腳）≥2。
  未收錄/未分組件不丟——計數與樣本進 data/套裝報告.md（cp950 陷阱：報告寫檔不 print）。

網路與快取：
  MirageStoreSetItem + ClassJobCategory 快取在 data/xivapi_sets_cache.json。
  預設有快取就用（離線可跑，update_all local 模式安全）；--fetch 強制刷新（原子寫入保舊）。

用法：py scripts\\build_sets.py [--fetch]
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Windows 主控台/管線預設 cp950，印 emoji/罕見字會炸——統一改 UTF-8
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "資料來源")
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "official_sets.json")
CACHE = os.path.join(DATA, "xivapi_sets_cache.json")
REPORT = os.path.join(DATA, "套裝報告.md")

V2 = "https://beta.xivapi.com/api/1/sheet"

VISIBLE_SLOTS = ("頭部", "上身", "手部", "腿部", "腳部")
# MirageStoreSetItem 可能的部位欄位（多要不會錯，缺的欄 XIVAPI 直接忽略）
MSSI_FIELDS = ["MainHand", "OffHand", "Head", "Body", "Gloves", "Hands",
               "Legs", "Feet", "Earrings", "Necklace", "Bracelets",
               "Ring", "FingerL", "FingerR"]


# ───────────────────────── XIVAPI 快取 ─────────────────────────

def _get(url, params=None, tries=4):
    import requests
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            last = f"HTTP {r.status_code}"
        except Exception as e:
            last = str(e)
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"GET 失敗 {url} ({last})")


def fetch_cache():
    """抓 MirageStoreSetItem 全表 + ClassJobCategory 名稱 → CACHE（原子寫入保舊）。"""
    fields = ",".join(f"{f}.value" for f in MSSI_FIELDS)
    rows, after = [], None
    while True:
        params = {"limit": 500, "fields": fields}
        if after is not None:
            params["after"] = after   # API 只吃無號整數，首頁不帶 after
        j = _get(f"{V2}/MirageStoreSetItem", params)
        batch = j.get("rows", [])
        if not batch:
            break
        for row in batch:
            after = row["row_id"]
            pieces = {}
            for f in MSSI_FIELDS:
                v = (row.get("fields", {}).get(f) or {})
                iid = v.get("value", 0) if isinstance(v, dict) else 0
                if iid:
                    pieces[f] = iid
            rows.append({"row_id": row["row_id"], "pieces": pieces})
    print(f"  MirageStoreSetItem：{len(rows)} 列")

    cjc = {}
    j = _get(f"{V2}/ClassJobCategory", {"limit": 500, "fields": "Name"})
    for row in j.get("rows", []):
        cjc[str(row["row_id"])] = (row.get("fields", {}) or {}).get("Name", "")

    # 套裝箱本身不是裝備、不在 fallback 庫 → 名稱另抓（批次 rows 參數，~12 請求）
    coffer_names = {}
    ids = [r["row_id"] for r in rows if r["row_id"]]
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        j = _get(f"{V2}/Item", {"rows": ",".join(map(str, chunk)),
                                "fields": "Name,Name@lang(ja)"})
        for row in j.get("rows", []):
            f = row.get("fields", {}) or {}
            coffer_names[str(row["row_id"])] = {
                "en": f.get("Name", ""), "ja": f.get("Name@lang(ja)", "")}
    print(f"  套裝箱名稱：{len(coffer_names)} 筆")

    cache = {"_meta": {"generated": time.strftime("%Y-%m-%d %H:%M:%S")},
             "mirage": rows, "cjc_names": cjc, "coffer_names": coffer_names}
    tmp = CACHE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0)
    os.replace(tmp, CACHE)
    return cache


# ───────────────────────── 資料載入 ─────────────────────────

def load_inputs():
    tc = json.load(open(os.path.join(SRC, "items.json"), encoding="utf-8"))["items"]
    sources = json.load(open(os.path.join(SRC, "sources.json"), encoding="utf-8"))["sources"]
    fb_path = os.path.join(DATA, "item_fallback_multilang.json")
    fb = json.load(open(fb_path, encoding="utf-8"))["items"]
    return tc, sources, fb


def patch_key(p):
    """版本比較：minor 當小數位比（7.5 > 7.35 > 7.05），不能當整數比。"""
    try:
        a, b = str(p).split(".")[:2]
        digits = re.sub(r"\D", "", b) or "0"
        return (int(a), float("0." + digits))
    except Exception:
        return (0, 0.0)


class ItemInfo:
    """統一視角：名稱取繁中優先，dye/mb/icon/ilvl/cjc 來自 fallback（XIVAPI 全件掃描）。"""

    def __init__(self, tc, fb):
        self.tc, self.fb = tc, fb

    def get(self, iid):
        s = str(iid)
        f = self.fb.get(s)
        if not f:
            return None
        t = self.tc.get(s, {})
        return {
            "id": iid,
            "zh": t.get("name", "") or f.get("zh", ""),
            "ja": f.get("ja", ""),
            "en": f.get("en", ""),
            "slot": f.get("slot", ""),
            "patch": f.get("patch", "") or t.get("patch", ""),
            "lv": f.get("equipLevel", 0),
            "dye": f.get("dye", 0),
            "mb": bool(f.get("mb", False)),
            "icon": f.get("icon", 0),
            "ilvl": f.get("ilvl", 0),
            "cjc": f.get("cjc", 0),
            "cjc_name": (t.get("equipStats") or {}).get("classJobCategoryName", ""),
        }


# ───────────────────────── 第一層：MirageStoreSetItem ─────────────────────────

def build_mirage_sets(cache, info):
    coffer_names = cache.get("coffer_names", {})
    sets, skipped_empty, skipped_unresolved = [], 0, 0
    for row in cache["mirage"]:
        rid = row["row_id"]
        if rid == 0:
            continue
        ids = list(dict.fromkeys(row["pieces"].values()))
        if not ids:
            skipped_empty += 1
            continue
        pieces = [info.get(i) for i in ids]
        pieces = [p for p in pieces if p]
        if not pieces:
            skipped_unresolved += 1
            continue
        # 套裝箱名稱：繁中查 items.json，日/英用 fetch 時抓的 coffer_names
        cn = coffer_names.get(str(rid), {})
        name_zh = (info.tc.get(str(rid)) or {}).get("name", "")
        name_ja = cn.get("ja", "")
        name_en = cn.get("en", "")
        best = max((p["patch"] for p in pieces if p["patch"]), key=patch_key, default="")
        sets.append({
            "id": f"mirage:{rid}",
            "layer": "mirage",
            "name_zh": name_zh, "name_ja": name_ja, "name_en": name_en,
            "source": "🎁幻化套裝箱",
            "patch": best,
            "pieces": pieces,
        })
    return sets, skipped_empty, skipped_unresolved


# ───────────────────────── 第二層：sources.json 啟發式 ─────────────────────────

def source_signatures(entries):
    """一件裝備的 sources 條目 → [(簽名, 顯示label)]，只取「套裝式」來源。"""
    sigs = []
    for e in entries:
        t = e.get("type")
        if t == "instance":
            names = sorted(e.get("instanceNames") or [])
            if names:
                sigs.append(("inst:" + "|".join(names), "🗡️" + names[0]))
        elif t == "specialshop":
            cur = e.get("currencyItemId")
            if cur:
                sigs.append((f"shop:cur{cur}", "🪙兌換"))
        elif t == "quest":
            qid = e.get("questId")
            if qid:
                sigs.append((f"quest:{qid}", "📋" + (e.get("questName") or "任務").strip()))
        elif t == "gcshop":
            sigs.append(("gc", "🛒軍票商店"))
        elif t == "vendor":
            npcs = sorted({v.get("npcName", "") for v in (e.get("vendors") or []) if v.get("npcName")})
            if npcs:
                sigs.append(("npc:" + "|".join(npcs), "🛒" + npcs[0]))
    return sigs


def build_heuristic_sets(sources, info, equip_ids):
    groups = {}   # (sig, cjc, ilvl) -> {"label":…, "items":[info]}
    no_source = []
    for iid in equip_ids:
        p = info.get(iid)
        if not p or not p["slot"]:
            continue
        entries = sources.get(str(iid)) or []
        sigs = source_signatures(entries)
        if not sigs:
            no_source.append(iid)
            continue
        for sig, label in sigs:   # 多來源件複製進每個來源套（湊齊視角）
            key = (sig, p["cjc"], p["ilvl"])
            g = groups.setdefault(key, {"label": label, "items": []})
            if all(x["id"] != iid for x in g["items"]):
                g["items"].append(p)

    sets, conflicted = [], []
    for (sig, cjc, ilvl), g in groups.items():
        # 驗證：可見部位不得重複（同鍵兩套外觀 → 整組進未分組桶，不硬拆）
        seen = {}
        dup = False
        for p in g["items"]:
            if p["slot"] in VISIBLE_SLOTS:
                if p["slot"] in seen:
                    dup = True
                    break
                seen[p["slot"]] = p
        if dup:
            conflicted.append({"sig": sig, "cjc": cjc, "ilvl": ilvl,
                               "n": len(g["items"]),
                               "sample": [p["zh"] or p["ja"] for p in g["items"][:6]]})
            continue
        h = hashlib.md5(sig.encode("utf-8")).hexdigest()[:8]
        sets.append({
            "id": f"src:{h}:{cjc}:{ilvl}",
            "layer": "src",
            "name_zh": "", "name_ja": "", "name_en": "",   # 稍後補共同前綴
            "source": g["label"],
            "patch": max((p["patch"] for p in g["items"] if p["patch"]),
                         key=patch_key, default=""),
            "pieces": sorted(g["items"], key=lambda p: VISIBLE_SLOTS.index(p["slot"])
                             if p["slot"] in VISIBLE_SLOTS else 99),
        })
    return sets, no_source, conflicted


_SLOT_SUFFIX = re.compile(
    r"(頭飾|頭盔|兜帽|帽|面具|眼鏡|上衣|外衣|外套|長袍|胸甲|鎧甲|襯衫|短上衣|背心|"
    r"手套|護手|長手套|腕套|半指手套|長褲|短褲|裙|褲|裙褲|護腿|"
    r"長靴|短靴|靴|鞋|涼鞋|木屐)$")


def common_prefix_name(pieces, lang):
    names = [p[lang] for p in pieces if p.get(lang) and p["slot"] in VISIBLE_SLOTS]
    if len(names) < 2:
        return ""
    pre = names[0]
    for n in names[1:]:
        while pre and not n.startswith(pre):
            pre = pre[:-1]
    pre = pre.strip("・･ 　-—:：之的")
    return pre if len(pre) >= 2 else ""


def fill_heuristic_names(sets):
    lead_sym = re.compile(r"^[^\w一-鿿]+")
    for s in sets:
        if s["layer"] != "src":
            continue
        zh = common_prefix_name(s["pieces"], "zh")
        if zh:
            zh = _SLOT_SUFFIX.sub("", zh).strip("之的 　")
        s["name_zh"] = zh
        s["name_ja"] = common_prefix_name(s["pieces"], "ja")
        s["name_en"] = common_prefix_name(s["pieces"], "en")
        if not (s["name_zh"] or s["name_ja"] or s["name_en"]):
            # 共同前綴抓不到（雜牌組合）→ 用「來源＋ilvl」合成，避免 UI 顯示裸 ID
            label = lead_sym.sub("", s["source"] or "").strip() or "官方套裝"
            ilvl = s["id"].rsplit(":", 1)[-1]
            s["name_zh"] = f"{label} i{ilvl} 套裝"


# ───────────────────────── 準則 / 去重 ─────────────────────────

def visible_ok(s):
    slots = {p["slot"] for p in s["pieces"] if p["slot"] in VISIBLE_SLOTS}
    return "上身" in slots and len(slots) >= 2


def dedup(mirage_sets, src_sets):
    """啟發式套可見件集合 ⊆ 某 mirage 套 → 砍啟發式。"""
    mirage_pieceset = []
    for m in mirage_sets:
        mirage_pieceset.append((m, {p["id"] for p in m["pieces"]}))
    kept, dropped = [], 0
    for s in src_sets:
        vis = {p["id"] for p in s["pieces"] if p["slot"] in VISIBLE_SLOTS}
        if any(vis and vis <= mset for _, mset in mirage_pieceset):
            dropped += 1
            continue
        kept.append(s)
    return kept, dropped


# ───────────────────────── main ─────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="強制重抓 XIVAPI 快取")
    args = ap.parse_args()

    tc, sources, fb = load_inputs()
    info = ItemInfo(tc, fb)

    if args.fetch or not os.path.exists(CACHE):
        print("抓 XIVAPI（MirageStoreSetItem + ClassJobCategory）…")
        cache = fetch_cache()
    else:
        cache = json.load(open(CACHE, encoding="utf-8"))
        print(f"用快取 {os.path.relpath(CACHE, ROOT)}"
              f"（{cache['_meta'].get('generated','?')}，--fetch 可刷新）")

    print("第一層：MirageStoreSetItem 官方套裝…")
    mirage_sets, n_empty, n_unres = build_mirage_sets(cache, info)
    print(f"  成套 {len(mirage_sets)}｜空列 {n_empty}｜件無法解析 {n_unres}")

    print("第二層：sources.json 啟發式分組…")
    equip_ids = [int(k) for k in fb.keys()]
    src_sets, no_source, conflicted = build_heuristic_sets(sources, info, equip_ids)
    fill_heuristic_names(src_sets)
    print(f"  分組 {len(src_sets)}｜無來源件 {len(no_source)}｜同鍵衝突組 {len(conflicted)}")

    src_sets, n_dedup = dedup(mirage_sets, src_sets)
    all_sets = mirage_sets + src_sets
    included = [s for s in all_sets if visible_ok(s)]
    excluded = len(all_sets) - len(included)
    print(f"  跨層去重砍 {n_dedup}｜v1 準則收錄 {len(included)}｜未達準則 {excluded}")

    cjc_names = cache.get("cjc_names", {})
    for s in included:
        cjcs = {p["cjc"] for p in s["pieces"]}
        s["cjc_name"] = (s["pieces"][0].get("cjc_name")
                         or cjc_names.get(str(next(iter(cjcs))), "")) if cjcs else ""
        s["zh_ok"] = all(p["zh"] for p in s["pieces"])   # 繁中版可幻化（全件有繁中）

    included.sort(key=lambda s: (patch_key(s["patch"]), s["id"]), reverse=True)
    meta = {
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "sets": len(included),
        "mirage_sets": sum(1 for s in included if s["layer"] == "mirage"),
        "src_sets": sum(1 for s in included if s["layer"] == "src"),
        "excluded_by_criteria": excluded,
        "dedup_dropped": n_dedup,
        "mirage_empty_rows": n_empty,
        "no_source_items": len(no_source),
        "conflict_groups": len(conflicted),
    }
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"_meta": meta, "sets": included}, f, ensure_ascii=False, indent=0)
    os.replace(tmp, OUT)

    # 報告（cp950 陷阱：詳細內容寫檔）
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(f"# 官方套裝重建報告\n\n{json.dumps(meta, ensure_ascii=False, indent=2)}\n\n")
        f.write(f"## 同鍵衝突組（{len(conflicted)}，整組進未分組桶）\n\n")
        for c in conflicted[:80]:
            f.write(f"- `{c['sig'][:60]}` cjc={c['cjc']} ilvl={c['ilvl']}：{c['n']} 件"
                    f"（{('、'.join(x for x in c['sample'] if x))[:120]}）\n")
        f.write(f"\n## 收錄抽樣（前 40 套）\n\n")
        for s in included[:40]:
            nm = s["name_zh"] or s["name_ja"] or s["name_en"] or s["id"]
            f.write(f"- [{s['layer']}] **{nm}** patch {s['patch']}｜{s['source']}｜"
                    f"{len(s['pieces'])} 件｜{'繁中✓' if s['zh_ok'] else '繁中✗'}\n")
    sz = os.path.getsize(OUT) // 1024
    print(f"\n✅ 官方套裝 {len(included)} 套 → {os.path.relpath(OUT, ROOT)}（{sz} KB）")
    print(f"   報告 → {os.path.relpath(REPORT, ROOT)}")


if __name__ == "__main__":
    main()
