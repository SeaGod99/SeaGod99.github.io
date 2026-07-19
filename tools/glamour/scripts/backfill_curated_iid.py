#!/usr/bin/env python3
"""
backfill_curated_iid.py —— 把道具 ID 回填進 data/curated_outfits.json
=====================================================================
為什麼：精選套裝原本每件只記名稱（zh/en/ja），道具 ID 是 build_site.py 每次
建置時用「名稱精確且唯一」現猜的。猜不到不會報錯，該件就靜默掉 iid ——
跟著失去徽章（可染/可交易）與 item_sources.js 的完整取得方式。改版撞同名或
官方改譯名就會踩到。改成把 ID 記在資料檔裡，名稱比對只當新件的輔助。

用法：
  py scripts\\backfill_curated_iid.py           # dry-run，只報告
  py scripts\\backfill_curated_iid.py --apply   # 寫回 data/curated_outfits.json

規則：
- 已有 iid 的件不動（人工填的最大）。
- 名稱索引來自 data/item_fallback_multilang.json（build_item_fallback.py 產出），
  zh → ja → en 依序比對，**名稱在該語言下唯一才採用**；撞名或查無 → 不填，列進報告
  讓人工處理，絕不亂猜（同 §「繁中名絕不硬翻」的寧缺勿錯原則）。
- 回填後會驗一次：以 ID 反查的繁中名要與資料檔的 zh 相符，不符則不填並列出。
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
CURATED_JSON = ROOT / "data" / "curated_outfits.json"
ITEM_FALLBACK = ROOT / "data" / "item_fallback_multilang.json"


def build_name_index(items):
    """名稱 → iid，只保留唯一對應（撞名的整個剔除）"""
    idx = {"zh": {}, "ja": {}, "en": {}}
    dupe = {"zh": set(), "ja": set(), "en": set()}
    for iid, v in items.items():
        for lang, key in (("zh", v.get("zh")), ("ja", v.get("ja")),
                          ("en", (v.get("en") or "").lower())):
            if not key:
                continue
            if key in idx[lang] and idx[lang][key] != int(iid):
                dupe[lang].add(key)
            else:
                idx[lang][key] = int(iid)
    for lang in idx:
        for k in dupe[lang]:
            idx[lang].pop(k, None)
    return idx


def main():
    apply = "--apply" in sys.argv
    items = json.loads(ITEM_FALLBACK.read_text(encoding="utf-8"))["items"]
    idx = build_name_index(items)
    zh_of = {int(i): v.get("zh", "") for i, v in items.items()}

    curated = json.loads(CURATED_JSON.read_text(encoding="utf-8"))
    kept = filled = 0
    unresolved, mismatched = [], []

    for o in curated:
        for p in o.get("pieces", []):
            if p.get("iid"):
                kept += 1
                continue
            iid = (idx["zh"].get(p.get("zh") or "")
                   or idx["ja"].get(p.get("ja") or "")
                   or idx["en"].get((p.get("en") or "").lower()))
            where = f"#{o.get('id', '?')}「{o.get('name', '')}」{p.get('slot', '')}"
            name = p.get("zh") or p.get("ja") or p.get("en") or "(無名)"
            if not iid:
                unresolved.append(f"{where} {name}")
                continue
            # 反查驗證：ID 的繁中名要與資料檔一致（zh 為空＝台服未實裝，跳過驗證）
            if p.get("zh") and zh_of.get(iid) and zh_of[iid] != p["zh"]:
                mismatched.append(f"{where} {name} → id {iid} 是「{zh_of[iid]}」")
                continue
            p["iid"] = iid
            filled += 1

    total = sum(len(o.get("pieces", [])) for o in curated)
    print(f"總件數 {total} ｜ 原本已有 id {kept} ｜ 這次回填 {filled} ｜ "
          f"對不到 {len(unresolved)} ｜ 名稱不符 {len(mismatched)}")
    for label, rows in (("對不到（撞名或 DB 無此名）", unresolved), ("反查名稱不符", mismatched)):
        if rows:
            print(f"\n【{label}】")
            for r in rows:
                print("  " + r)

    if not apply:
        print("\n（dry-run，未寫入。加 --apply 才寫回）")
        return 0
    CURATED_JSON.write_text(
        json.dumps(curated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n✅ 已寫回 {CURATED_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
