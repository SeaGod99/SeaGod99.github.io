#!/usr/bin/env python3
"""
build_item_sources.py —— 裝備 ID → 完整取得方式清單（前端篩選／來源總覽用）
=============================================================================
為什麼要這支：
  curated／mirapri 的每件裝備只留「優先度最高的一種」來源（pipeline.py `_best()`），
  官方套裝逐件來源也只留前兩條、且一件掉多個副本時只寫第一個副本名（build_sets.py
  `fmt_piece_source()`）。結果約四成裝備的其他取法根本沒進前端，使用者用取得方式
  篩選會「明明拿得到卻找不到」。

  修法不是把字串複製進三份資料檔（mirapri_outfits.js 已 10MB），而是外連一份
  **以裝備 ID 為 key 的共用表**——三份資料的每件裝備都有 id（curated/mirapri 是
  `iid`、官方套裝是 `id`），前端 join 即可。

輸出：item_sources.js
  const _ITEM_SOURCES = {"k": [來源字串…], "i": {裝備ID: [k 的索引…]}}
  字串表 + 索引的寫法讓 1900 種來源、1.2 萬件裝備壓在約 230KB。

來源字串＝「正規化來源鍵」：只有 emoji + 來源名，**不含價格、NPC 地點、副本類型**
（🗡️水妖幻園多恩美格禁園、🪙亞拉戈詩學神典石、🛒葉川）。這樣同一個來源在
官方套裝檢視（「🗡️副本掉落：X」）與配裝檢視（「🗡️X（迷宮挑戰）」）不會變成
兩個對不起來的選項——前端 srcKeyOf() 把既有字串也正規化到同一個鍵空間。

一件掉多個副本時**每個副本名各自成鍵**（不再是「等N處」），這正是漏最多的一類。

執行：py scripts\build_item_sources.py
      （改完 curated／重建 mirapri 或官方套裝後跑，讓表涵蓋新裝備）
"""
import json
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).parent.parent
DB = ROOT / "資料來源"
OUT = ROOT / "item_sources.js"

# 副本名繁中化：sources.json 的 instanceNames 有些仍是英文（7.x 新副本，繁中 DB 未收），
# 與官方套裝那邊已翻好的來源會對不起來變成兩個選項 → 共用 build_site.duty_zh()
# （權威＝主庫 data/dungeons.json 的台服官方名，詳見 docs/專案慣例與記憶.md §4.3b）
sys.path.insert(0, str(Path(__file__).parent))
from build_site import duty_zh  # noqa: E402

# 與 build_sets.py 同一組慣例（改任一邊要同步）
PVP_CURRENCIES = {25, 36656, 40479}
MGP_CURRENCIES = {29, 41629}
EQUIP_CATEGORY_MAX = 49       # categoryId 1–49 = 貨幣其實是裝備 → 前一階升級兌換
MAX_MOBS = 3                  # 掉落怪太多時只取前幾隻，避免鍵爆炸


def load_js_array(path):
    """讀 `const _X = [...]` 這種前端資料檔的陣列部分"""
    t = path.read_text(encoding="utf-8")
    return json.loads(t[t.index("["):].rstrip().rstrip(";"))


def collect_item_ids():
    """三份前端資料檔用到的所有裝備 ID"""
    ids = set()
    for name in ("curated_outfits.js", "mirapri_outfits.js", "official_sets.js"):
        p = ROOT / name
        if not p.exists():
            print(f"  跳過（不存在）：{name}")
            continue
        n0 = len(ids)
        for o in load_js_array(p):
            for p2 in o.get("pieces", []) or []:
                iid = p2.get("iid") or p2.get("id")
                if iid:
                    ids.add(int(iid))
            for eq in o.get("equipments", []) or []:
                if isinstance(eq, dict) and eq.get("iid"):
                    ids.add(int(eq["iid"]))
        print(f"  {name}：累計 {len(ids):,} 件（+{len(ids) - n0:,}）")
    return ids


def main():
    print("=== build_item_sources.py ===")
    sources = json.loads((DB / "sources.json").read_text(encoding="utf-8"))["sources"]
    items = json.loads((DB / "items.json").read_text(encoding="utf-8"))["items"]
    recipes = json.loads((DB / "recipes.json").read_text(encoding="utf-8"))
    recipes = recipes.get("recipes", recipes)
    print(f"  sources {len(sources):,} 筆 ｜ items {len(items):,} 筆")

    def cur_info(cid):
        it = items.get(str(cid)) or {}
        return it.get("name", ""), it.get("categoryId", 0)

    def keys_of(iid):
        """一件裝備的全部來源鍵（去重、保持出現順序）"""
        out = []
        for e in sources.get(str(iid), []):
            t = e.get("type")
            if t == "instance":
                # 掉多個副本時每個副本名各自成鍵（舊版只留第一個 + 「等N處」）
                out += ["🗡️" + duty_zh(n) for n in (e.get("instanceNames") or []) if n]
            elif t == "specialshop":
                cid = e.get("currencyItemId") or 0
                nm, cat = cur_info(cid) if cid else ("", 0)
                if cat and 1 <= cat <= EQUIP_CATEGORY_MAX:
                    out.append("🛒裝備升級兌換")
                elif cid in PVP_CURRENCIES:
                    out.append("⚔️" + (nm or "PvP戰利品"))
                elif cid in MGP_CURRENCIES:
                    out.append("🎲金碟幣")
                elif cid == 1:
                    out.append("🛒金幣購買")
                else:
                    out.append("🪙" + nm if nm else "🪙兌換")
            elif t == "vendor":
                v = (e.get("vendors") or [{}])[0]
                out.append("🛒" + (v.get("npcName") or "NPC商人"))
            elif t == "gilshop":
                out.append("🛒NPC商店")
            elif t == "gcshop":
                out.append("🪙軍票商店")
            elif t == "quest":
                qs = e.get("questNames") or ([e["questName"]] if e.get("questName") else [])
                out += ["📋" + q for q in qs if q] or ["📋任務獎勵"]
            elif t == "treasure":
                out.append("🗺️寶圖")
            elif t == "drop":
                out += ["🎯" + m for m in (e.get("mobNames") or [])[:MAX_MOBS] if m]
            elif t == "desynth":
                out.append("🔨分解取得")
            elif t == "venture":
                out.append("🛡️雇員探險")
            elif t == "voyage":
                out.append("🚢潛水艇探索")
        if str(iid) in recipes:
            out.append("🔨製作")
        return list(dict.fromkeys(out))

    ids = collect_item_ids()
    key_table, index = {}, {}
    n_multi = 0
    for iid in sorted(ids):
        ks = keys_of(iid)
        if not ks:
            continue
        if len(ks) > 1:
            n_multi += 1
        index[iid] = [key_table.setdefault(k, len(key_table)) for k in ks]

    payload = {"k": list(key_table), "i": index}
    text = ("// 由 scripts/build_item_sources.py 產生，勿手改\n"
            "const _ITEM_SOURCES = "
            + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    OUT.write_text(text, encoding="utf-8")
    print(f"\nitem_sources.js: {len(key_table):,} 種來源 / {len(index):,} 件裝備"
          f"（其中 {n_multi:,} 件有多種取法）· {len(text.encode('utf-8')) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
