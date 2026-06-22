#!/usr/bin/env python3
"""
make_thumbs.py — 產生卡片縮圖
================================
將 配裝圖片/ 下所有圖片（含 mirapri/ 子資料夾）縮成寬 480px 的 JPEG，
輸出到 配裝圖片/縮圖/，保留相對路徑。已存在且較新的縮圖會跳過。

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
THUMB_W = 480
QUALITY = 72
EXTS = {".jpe", ".jpg", ".jpeg", ".png", ".webp"}


def iter_sources():
    for p in sorted(SRC.rglob("*")):
        if p.is_file() and p.suffix.lower() in EXTS and DST not in p.parents:
            yield p


def thumb_path(src: Path) -> Path:
    rel = src.relative_to(SRC)
    return (DST / rel).with_suffix(rel.suffix + ".jpg") if rel.suffix.lower() != ".jpg" else DST / rel


def main():
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 0
    t0 = time.time()
    done = skip = err = 0
    for src in iter_sources():
        if budget and time.time() - t0 > budget:
            print(f"時間到，先停：完成 {done}、跳過 {skip}、失敗 {err}（重跑可續）")
            return
        dst = thumb_path(src)
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
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
