#!/usr/bin/env python3
"""
make_thumbs.py — 產生卡片縮圖
================================
將 配裝圖片/ 下的卡片圖（含 mirapri/ 子資料夾）縮成寬 640px 的 JPEG，
輸出到 配裝圖片/縮圖/，保留相對路徑。已存在、較新且寬度達標的縮圖會跳過
（調大 THUMB_W 後重跑會自動重產舊尺寸縮圖；來源本身比 THUMB_W 窄的不重產）。

⚠ **`icons/` 與 `官方套裝/` 不做縮圖**（SKIP_DIRS）：
  - `icons/` 是 40px 的裝備 icon，前端直接寫 `配裝圖片/icons/{id}.png`，
    根本不會去要縮圖版；
  - `官方套裝/` 的 wiki 示意照已經是 640px，`thumbOf()` 第 417 行明確
    「開頭是 配裝圖片/官方套裝/ 就原樣回傳」。
  以前用 `rglob("*")` 掃全部，替這兩個目錄生了 10,756 張**沒有任何程式碼會載入**
  的縮圖（icons 7MB＋官方套裝 56MB＝63MB 純浪費），2026-07-29 已刪並加上這道過濾。

執行：python scripts/make_thumbs.py [秒數上限]
（給秒數上限時跑滿即停，重跑會接續未完成的部分）
"""
import sys
import time
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent.parent
SRC = ROOT / "配裝圖片"
DST = SRC / "縮圖"
THUMB_W = 640   # 卡片 CSS 寬約 250~300px，高 DPI（125%~200%）需 500~600 實體像素
QUALITY = 78    # 72 在漸層/細節有明顯壓縮痕跡；78 檔案約 +40%，畫質明顯改善
EXTS = {".jpe", ".jpg", ".jpeg", ".png", ".webp"}
# 前端不會載入這兩個目錄的縮圖版（理由見檔頭）→ 不要生
SKIP_DIRS = {"icons", "官方套裝"}


def iter_sources():
    for p in sorted(SRC.rglob("*")):
        if not (p.is_file() and p.suffix.lower() in EXTS):
            continue
        if DST in p.parents:
            continue
        if SKIP_DIRS & set(p.relative_to(SRC).parts[:-1]):
            continue
        yield p


def thumb_path(src: Path) -> Path:
    rel = src.relative_to(SRC)
    return (DST / rel).with_suffix(rel.suffix + ".jpg") if rel.suffix.lower() != ".jpg" else DST / rel


def needs_update(src: Path, dst: Path) -> bool:
    """新檔／來源較新／寬度低於目標（且來源夠寬）→ 要重產。只讀標頭，成本低。"""
    if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
        return True
    try:
        with Image.open(dst) as dim:
            dw = dim.width
    except Exception:
        return True
    if dw >= THUMB_W:
        return False
    try:
        with Image.open(src) as sim:
            sw = sim.width
    except Exception:
        return False
    return dw < min(THUMB_W, sw)


def main():
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 0
    t0 = time.time()
    done = skip = err = 0
    for src in iter_sources():
        if budget and time.time() - t0 > budget:
            print(f"時間到，先停：完成 {done}、跳過 {skip}、失敗 {err}（重跑可續）")
            return
        dst = thumb_path(src)
        if not needs_update(src, dst):
            skip += 1
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            with Image.open(src) as im:
                im.draft("RGB", (THUMB_W * 2, THUMB_W * 2))  # JPEG 快速縮小解碼
                im = im.convert("RGB")
                if im.width > THUMB_W:
                    h = round(im.height * THUMB_W / im.width)
                    im = im.resize((THUMB_W, h), Image.LANCZOS)
                im.save(dst, "JPEG", quality=QUALITY, optimize=True)
            done += 1
        except Exception as e:
            err += 1
            print(f"[ERR] {src.name}: {e}", file=sys.stderr)
        if (done + skip) % 500 == 0:
            print(f"進度：完成 {done}、跳過 {skip}、失敗 {err}", flush=True)
    print(f"完成：新產生 {done}、跳過 {skip}、失敗 {err}")


if __name__ == "__main__":
    main()
