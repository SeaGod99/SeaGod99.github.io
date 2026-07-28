#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
patch_curated_sources.py —— 把精選套裝裡「待確認／空白」的取得方式補成 DB 查得到的答案

背景（2026-07-29）：`source`（取得方式）是 `data/curated_outfits.json` 少數還手填的欄位，
`build_site.py` 的 `apply_db_fields()` 刻意不動它（那是主觀欄位，人工整理的寫法通常比
DB 精確）。但裡面有一批根本沒填——寫「🛒待確認」「🪙待確認」或整格空白。

2026-07-28 資料層改讀主庫後，取得方式表從 29,645 筆變成 39,257 筆，這批「待確認」
大多查得出來了（`verify_data.py` 報告的第 1 章第 2 節）。這支就是把那批補上。

**只動機械上安全的兩類**（與 verify_data.py 的分類一致）：
  src_fill —— JSON 是「待確認／空白／—」而 DB 解得出來 → 直接填
  src_gil  —— JSON 寫「🪙Gil×N」**且沒有附註**，改成「🛒NPC商店（N Gil）」（慣例：Gil 購買算商店）

**刻意不動的四類**（需要人判斷，留在 data/驗證報告.md 裡）：
  src_conflict —— JSON 與 DB 各說各話（例：JSON 說副本掉落、DB 說寶圖），要看圖或查證
  src_multi    —— JSON 寫了多來源（含「/」），通常比 DB 的單一答案完整
  帶附註的 Gil —— 「🪙Gil×2（舊薩雷安 瓦爾薩如德）」人工填了 NPC 與地點，比 DB 精確
  src_manual   —— DB 查不到、人工補的，動了只會退步

用法：
  py scripts\patch_curated_sources.py           # dry-run，列出每一處
  py scripts\patch_curated_sources.py --apply   # 寫回 data/curated_outfits.json
  （寫回後記得重跑 build_site.py → build_item_sources.py）
"""
import json
import re
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).parent))
import pipeline as P            # noqa: E402  共用 _resolve_from_sources／_resolve_from_om
from verify_data import st_of   # noqa: E402  共用 emoji→st 判定，避免兩處分歧

ROOT = Path(__file__).parent.parent
CURATED = ROOT / "data" / "curated_outfits.json"

BLANK = ("", "—", "-")

# 「🪙Gil×2」這種**沒有附註**的才改寫成商店標法。
# 有附註的（「🪙Gil×2（舊薩雷安 瓦爾薩如德）」）人工填了 NPC 與地點，比 DB 的
# 「🛒NPC商店（2 Gil）」精確，改了是退步 —— 而且 ST_KEYWORDS 的 `Gil×` 規則
# 本來就會把它歸到 npc 桶，篩選行為一致，沒有非改不可的理由。
GIL_PLAIN = re.compile(r"^🪙Gil×\d+$")


def main():
    apply = "--apply" in sys.argv
    db = P.load_all_data()
    items = db["items"]
    curated = json.loads(CURATED.read_text(encoding="utf-8"))

    filled, gil, skipped = [], [], {"conflict": 0, "multi": 0, "gil_detail": 0, "no_iid": 0}

    for o in curated:
        for p in o.get("pieces", []):
            iid = str(p.get("iid") or "")
            if not iid:
                skipped["no_iid"] += 1
                continue
            jsrc = (p.get("source", "") or "").strip()

            # 與 verify_data 相同的解析鏈：先精細來源，查不到才退回原始取得方式表
            rsrc, _ = P._resolve_from_sources(iid, items, db["sources"], db["recipes_json"])
            if not rsrc:
                rsrc, _ = P._resolve_from_om(iid, items, db["om"], db["tw_npcs"],
                                             db["tw_places"], db["tw_quests"], db["recipe_by_id"])
            if not rsrc or jsrc == rsrc:
                continue

            where = f"#{o.get('id')} {p.get('slot')}"
            label = p.get("zh") or p.get("ja") or p.get("en") or ""

            if "待確認" in jsrc or jsrc in BLANK:
                filled.append(f"{where}「{label}」：{jsrc or '(空)'} → {rsrc}")
                p["source"] = rsrc
            elif GIL_PLAIN.match(jsrc):
                gil.append(f"{where}「{label}」：{jsrc} → {rsrc}")
                p["source"] = rsrc
            elif jsrc.startswith("🪙Gil"):
                skipped["gil_detail"] += 1     # 帶 NPC/地點附註，保留人工寫法
            elif "/" in jsrc or "／" in jsrc:
                skipped["multi"] += 1
            elif st_of(jsrc) == st_of(rsrc):
                continue                      # 同一類、只是寫法不同 → 保留人工寫法
            else:
                skipped["conflict"] += 1

    print(f"=== 補精選套裝的取得方式 ===")
    print(f"\n【補上待確認／空白】{len(filled)} 件")
    for r in filled[:30]:
        print("  " + r)
    if len(filled) > 30:
        print(f"   …還有 {len(filled) - 30} 件")
    print(f"\n【Gil 標法改為 NPC商店】{len(gil)} 件")
    for r in gil:
        print("  " + r)
    print(f"\n不動（留給人工判斷）：來源衝突 {skipped['conflict']}、"
          f"多來源寫法 {skipped['multi']}、Gil 帶 NPC 附註 {skipped['gil_detail']}、"
          f"無 iid {skipped['no_iid']}")
    print("  → 明細見 data/驗證報告.md 第二章，或重跑 py scripts\\verify_data.py")

    if not apply:
        print("\n（dry-run，未寫入。加 --apply 才寫回）")
        return 0
    CURATED.write_text(json.dumps(curated, ensure_ascii=False, indent=2) + "\n",
                       encoding="utf-8")
    print(f"\n✅ 已寫回 {CURATED}"
          f"（共 {len(filled) + len(gil)} 處；記得重跑 build_site.py → build_item_sources.py）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
