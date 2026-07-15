#!/usr/bin/env python3
"""
compress_mirapri.py — 壓縮 mirapri 原圖
==========================================
將 配裝圖片/mirapri/ 的 JPEG 原地壓縮：
  - 長邊縮到 1100px（彈窗顯示寬 520px，足夠 Retina 兩倍解析度）
  - 品質 76、漸進式 JPEG
  - 新檔需比原檔小 8% 以上才取代，否則保留原檔
  - 保留原檔 mtime（避免 make_thumbs.py 誤判縮圖過期而全部重做）
  - 已處理清單記錄在 data/mirapri_compress_done.json，
    重跑只處理新圖片，不會重複壓縮造成畫質劣化

執行：python scripts/compress_mirapri.py [秒數上限]
（給秒數上限時跑滿即停，重跑會接續未完成的部分）
"""
import json
import os
import sys
import time
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent.parent
SRC_DIR = ROOT / "配裝圖片" / "mirapri"
DONE_PATH = ROOT / "data" / "mirapri_compress_done.json"
MAX_EDGE = 1100
QUALITY = 76
MIN_SAVING = 0.08  # 至少省 8% 才取代


def load_done():
    if DONE_PATH.exists():
        return set(json.loads(DONE_PATH.read_text(encoding="utf-8")))
    return set()


def save_done(done):
    DONE_PATH.write_text(json.dumps(sorted(done)), encoding="utf-8")


def compress_one(src: Path) -> int:
    """回傳節省的 bytes（0 = 未取代）"""
    orig_size = src.stat().st_size
    orig_stat = src.stat()
    with Image.open(src) as im:
        im = im.convert("RGB")
        if max(im.size) > MAX_EDGE:
            r = MAX_EDGE / max(im.size)
            im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
        tmp = src.with_suffix(".tmp.jpg")
        im.save(tmp, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    new_size = tmp.stat().st_size
    if new_size < orig_size * (1 - MIN_SAVING):
        os.replace(tmp, src)
        os.utime(src, (orig_stat.st_atime, orig_stat.st_mtime))  # 保留 mtime
        return orig_size - new_size
    tmp.unlink()
    return 0


def main():
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 0
    t0 = time.time()
    done = load_done()
    files = sorted(p for p in SRC_DIR.glob("*.jpg") if p.name not in done)
    n_all = len(files)
    print(f"待處理 {n_all} 張（已完成 {len(done)} 張）")

    saved = comp = kept = err = 0
    try:
        for i, f in enumerate(files):
            if budget and time.time() - t0 > budget:
                print(f"時間到，先停（重跑可續）")
                break
            try:
                s = compress_one(f)
                if s:
                    comp += 1
                    saved += s
                else:
                    kept += 1
                done.add(f.name)
            except Exception as e:
                err += 1
                print(f"[ERR] {f.name}: {e}", file=sys.stderr)
            if (i + 1) % 500 == 0:
                print(f"進度 {i+1}/{n_all}：壓縮 {comp}、保留 {kept}、省 {saved/1024/1024:.0f} MB", flush=True)
    finally:
        save_done(done)

    print(f"本次：壓縮 {comp}、保留原檔 {kept}、失敗 {err}、節省 {saved/1024/1024:.0f} MB")
    rest = n_all - comp - kept - err
    if rest > 0:
        print(f"尚餘 {rest} 張，請再執行一次")
    return 0


if __name__ == "__main__":
    sys.exit(main())
