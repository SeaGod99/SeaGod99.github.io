# -*- coding: utf-8 -*-
"""一次性回填精選套裝的 `added`（收錄日期）。

## 為什麼需要這支

前端預設排序是「投稿新→舊」，但**精選 95 套沒有任何時間欄位**（它們不是投稿、
是站方自選）。2026-08-28 把三個可能的日期來源全查過一遍：

| 來源 | 結果 |
|------|------|
| git 歷史（圖片首次進版控） | **95/95 全部同一個 commit**（2026-07-16「上線資產（一）」）——<br>2026-07-15 從獨立 repo 併入時是一次性匯入，原 repo 的逐次歷史沒帶過來，零分辨力 |
| EXIF 拍攝時間 | **0/95 有**——`.jpe` 是壓縮轉檔過的遊戲截圖，EXIF 已被剝掉 |
| 檔案 mtime | 有三群，但**不進 git**：換一台機器 clone 後全變成 checkout 時間 |

所以 mtime 是**唯一僅存的訊號，而且只存在於當初做這批圖的那台機器**——不固化進
JSON 就會永久消失。這支就是幹這件事的，跑過一次之後就不需要再跑了。

## 精度：只到「日」，而且是批次時間不是逐套時間

實測 mtime 分三群：2026-05-24（32 套）、2026-05-27（57 套）、2026-06-26（6 套，
＝#33a–#33f，#33 那張總覽圖後來拆成 6 套，所以晚了一個月）。
同一群內的時分秒擠在幾分鐘內，是**整批複製／下載**的時間戳，不是逐套建立的時間
（編號序與 mtime 的時分秒序有 15 處逆序）。**因此只取日期、丟掉時分**，
同一天內的先後改用編號決定。

`added` 的語意是「這套大約在哪天被收進圖鑑」，**不是精確的建立時間，也不是拍攝時間**。
新增精選套裝時請手填當天日期。

## 用法

    py scripts\\backfill_curated_added.py            # dry-run，只印會怎麼填
    py scripts\\backfill_curated_added.py --apply    # 寫入 data/curated_outfits.json

**只補沒有 `added` 的**，已經有值的一律不動（手工修正過的不會被蓋掉）。
"""
import argparse
import datetime
import io
import json
import os
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).parent.parent
CURATED_JSON = ROOT / "data" / "curated_outfits.json"
# `added` 排在 id 後面（讀 JSON 的人一眼看得到），不要讓它掉到物件最後
AFTER_KEY = "id"


def mtime_date(rel_img):
    p = ROOT / rel_img.replace("/", os.sep)
    if not p.exists():
        return None
    return datetime.date.fromtimestamp(p.stat().st_mtime).isoformat()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="寫入檔案（預設只印）")
    a = ap.parse_args()

    print("=== backfill_curated_added.py ===")
    data = json.loads(CURATED_JSON.read_text(encoding="utf-8"))

    filled, kept, missing = [], [], []
    out = []
    for o in data:
        if o.get("added"):
            kept.append(o["id"])
            out.append(o)
            continue
        d = mtime_date(o.get("image") or "")
        if not d:
            missing.append((o["id"], o.get("image") or "(無 image)"))
            out.append(o)
            continue
        filled.append((o["id"], o.get("name", ""), d))
        # 重建 dict 以便把 added 插在 id 後面
        neo = {}
        for k, v in o.items():
            neo[k] = v
            if k == AFTER_KEY:
                neo["added"] = d
        if "added" not in neo:      # 沒有 id 欄的異常資料 → 放最前面
            neo = {"added": d, **o}
        out.append(neo)

    by_day = {}
    for _, _, d in filled:
        by_day[d] = by_day.get(d, 0) + 1
    print(f"  共 {len(data)} 套：要補 {len(filled)}、已有值跳過 {len(kept)}、"
          f"對不到圖片 {len(missing)}")
    for d in sorted(by_day):
        ids = [i for i, _, dd in filled if dd == d]
        print(f"    {d}  {by_day[d]:2d} 套　#{ids[0]}–#{ids[-1]}")
    for i, img in missing:
        print(f"    ⚠️  #{i} 找不到圖片，未填：{img}")

    if not a.apply:
        print("  （dry-run：未寫入。確認無誤後加 --apply）")
        return 0
    if not filled:
        print("  沒有要補的，未寫入。")
        return 0

    CURATED_JSON.write_text(
        json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  ✅ 已寫入 {CURATED_JSON.relative_to(ROOT)}（補了 {len(filled)} 筆 added）")
    print("  接著跑：py scripts\\build_site.py（讓 added 進到 curated_outfits.js）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
