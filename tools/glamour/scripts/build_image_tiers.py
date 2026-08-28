# -*- coding: utf-8 -*-
"""配裝圖片的兩層化：卡片用小圖（WebP）＋ 彈窗用大圖（AVIF）。

## 為什麼要分兩層

原本 `配裝圖片/縮圖/` 一份圖同時餵給「卡片格子」與「彈窗大圖」，
規格是 619×1100 / 平均 90.6KB 的 JPEG。彈窗需要這個尺寸，但卡片在
桌機 6 欄時只有約 230 CSS px 寬——等於用彈窗規格去餵格子。
實測**一頁 60 張卡要載 5.3MB 圖片**，比整份社群資料（1.9MB gzip）還重。

分兩層之後：

| 用途 | 目錄 | 規格 | 一張 | 6,963 張合計 |
|------|------|------|------|-------------|
| 卡片 | `配裝圖片/卡片/` | 寬 320px WebP q74 | ~23KB | ~164MB |
| 彈窗 | `配裝圖片/縮圖/` | 原尺寸 AVIF q50   | ~43KB | ~297MB |

原本的 619px JPEG 共 616MB，換掉之後淨少約 155MB——這同時把
**GitHub Pages 1GB 發佈上限的餘裕從約 140MB 拉到約 300MB**。

## 格式選擇

- **卡片用 WebP**：所有現役瀏覽器都支援（Safari 14 起），這是 99% 的瀏覽都會打到的那層，
  不能有相容性風險。
- **彈窗用 AVIF**：同畫質下比 WebP 再小三成。少數不支援 AVIF 的舊瀏覽器會走
  index.html 既有的 onerror 退路鏈，退到卡片用的 WebP——比較糊但功能正常。

## 用法

    py scripts\\build_image_tiers.py              # 產生兩層（已存在的跳過，可續跑）
    py scripts\\build_image_tiers.py --limit 500  # 分批
    py scripts\\build_image_tiers.py --force      # 重做（改了品質參數時）
    py scripts\\build_image_tiers.py --drop-jpg   # 兩層都齊了才刪掉舊的 .jpg

`--drop-jpg` 是獨立步驟而不是自動的：刪檔不可逆，而且要先確認前端已經改用新路徑。
"""
import argparse
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "配裝圖片"
THUMB = IMG / "縮圖"          # 彈窗層（就地把 .jpg 換成 .avif）
CARD = IMG / "卡片"           # 卡片層（新目錄，鏡射 縮圖/ 的相對路徑）

CARD_WIDTH = 320              # 桌機 6 欄時卡片約 230 CSS px，320 給高 DPI 還有餘裕
CARD_QUALITY = 74
AVIF_QUALITY = 50

# 只走 縮圖/ 底下的東西。官方套裝示意照（配裝圖片/官方套裝/）不在這裡：
# 它本來就是 wiki 的 640px 縮圖、平均只有 32KB，多做一層卡片圖反而多佔空間，
# 前端 thumbOf()／cardOf() 也是直接用原檔。


def iter_sources():
    """縮圖/ 底下所有 .jpg（含 縮圖/mirapri/），回傳相對 縮圖/ 的路徑"""
    if not THUMB.exists():
        return
    for p in sorted(THUMB.rglob("*.jpg")):
        yield p.relative_to(THUMB)


def convert_one(args):
    rel, force = args
    src = THUMB / rel
    avif = (THUMB / rel).with_suffix(".avif")
    card = (CARD / rel).with_suffix(".webp")
    made = []
    try:
        need_avif = force or not avif.exists()
        need_card = force or not card.exists()
        if not need_avif and not need_card:
            return ("skip", str(rel), 0, 0)
        im = Image.open(src)
        im.load()
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        if need_avif:
            avif.parent.mkdir(parents=True, exist_ok=True)
            im.save(avif, "AVIF", quality=AVIF_QUALITY)
            made.append("avif")
        if need_card:
            card.parent.mkdir(parents=True, exist_ok=True)
            small = im.copy()
            small.thumbnail((CARD_WIDTH, 10 ** 6), Image.LANCZOS)
            small.save(card, "WEBP", quality=CARD_QUALITY, method=4)
            made.append("card")
        return ("ok", str(rel),
                avif.stat().st_size if avif.exists() else 0,
                card.stat().st_size if card.exists() else 0)
    except Exception as e:      # 單張壞掉不要讓整批停下來
        return ("err", f"{rel}: {type(e).__name__}: {e}", 0, 0)


def drop_jpg():
    """兩層都在了才刪掉舊 .jpg。少一層就跳過並報出來——寧可留著也不要刪出破圖。"""
    dropped = freed = kept = 0
    for rel in iter_sources():
        avif = (THUMB / rel).with_suffix(".avif")
        card = (CARD / rel).with_suffix(".webp")
        if avif.exists() and card.exists():
            p = THUMB / rel
            freed += p.stat().st_size
            p.unlink()
            dropped += 1
        else:
            kept += 1
    print(f"  刪除 {dropped:,} 個舊 .jpg，釋出 {freed / 1024 / 1024:.0f}MB"
          f"（{kept:,} 個因為新的兩層不齊而保留）")
    if kept:
        # 不用非 0 退出中斷 update_all——保留 .jpg 只是多佔空間，前端照樣能顯示，
        # 而且緊接著的 health_check.py 會把「卡片層覆蓋」不足報出來。
        print("  ⚠️  有檔案沒轉齊，請先跑一次不帶 --drop-jpg 的完整轉檔")
    return kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="最多處理幾張（分批用）")
    ap.add_argument("--force", action="store_true", help="已存在也重做")
    ap.add_argument("--drop-jpg", action="store_true", help="兩層齊備後刪掉舊 .jpg")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 4) - 2))
    a = ap.parse_args()

    print("=== build_image_tiers.py ===")
    if a.drop_jpg:
        drop_jpg()
        return 0

    rels = list(iter_sources())
    if a.limit:
        rels = rels[:a.limit]
    if not rels:
        print("  縮圖/ 底下沒有 .jpg，沒事可做")
        return 0
    print(f"  來源 {len(rels):,} 張（{THUMB}）")
    print(f"  卡片層 → {CARD}（寬 {CARD_WIDTH}px WebP q{CARD_QUALITY}）")
    print(f"  彈窗層 → 縮圖/ 就地 AVIF q{AVIF_QUALITY}")

    n_ok = n_skip = 0
    errs = []
    avif_bytes = card_bytes = 0
    with ProcessPoolExecutor(max_workers=a.jobs) as ex:
        for i, (st, name, ab, cb) in enumerate(
                ex.map(convert_one, ((r, a.force) for r in rels), chunksize=16), 1):
            if st == "ok":
                n_ok += 1
                avif_bytes += ab
                card_bytes += cb
            elif st == "skip":
                n_skip += 1
            else:
                errs.append(name)
            if i % 500 == 0:
                print(f"    {i:,}/{len(rels):,}…", flush=True)

    print(f"  完成：新做 {n_ok:,}、跳過（已存在）{n_skip:,}、失敗 {len(errs):,}")
    if n_ok:
        print(f"  本次產出：彈窗層 {avif_bytes / 1024 / 1024:.0f}MB"
              f"／卡片層 {card_bytes / 1024 / 1024:.0f}MB")
    for e in errs[:20]:
        print(f"    ⚠️  {e}")
    if len(errs) > 20:
        print(f"    …另外還有 {len(errs) - 20} 筆")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
