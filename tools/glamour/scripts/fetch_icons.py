#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_icons.py —— 下載官方套裝所需的裝備 icon（僅 official_sets.json 收錄件，約 8-9k 張）。

來源：XIVAPI asset 端點（icon id → ui/icon/{千位段}/{id}.tex，format=png，40px 原生）
存放：配裝圖片/icons/{icon_id}.png（配裝圖片/ 已 gitignore，與縮圖同策略）
可續傳：已存在且非空的檔直接跳過——中斷重跑只補缺的。
失敗清單寫 data/icons_failed.txt，重跑會再試。

用法：
  py scripts\\fetch_icons.py            # 下載全部缺的
  py scripts\\fetch_icons.py --limit 500   # 最多下載 N 張（分批跑）
"""
import argparse
import json
import os
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETS = os.path.join(ROOT, "data", "official_sets.json")
OUT_DIR = os.path.join(ROOT, "配裝圖片", "icons")
FAILED = os.path.join(ROOT, "data", "icons_failed.txt")
ASSET = "https://beta.xivapi.com/api/1/asset"


def icon_path(icon_id: int) -> str:
    group = icon_id // 1000 * 1000
    return f"ui/icon/{group:06d}/{icon_id:06d}.tex"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="最多下載 N 張（0=不限）")
    args = ap.parse_args()

    sets = json.load(open(SETS, encoding="utf-8"))["sets"]
    icons = sorted({p["icon"] for s in sets for p in s["pieces"] if p.get("icon")})
    os.makedirs(OUT_DIR, exist_ok=True)

    # 新 icon（ID 大）先下載：套裝頁面排「版本新→舊」，使用者最先看到的是最新套裝
    todo = [i for i in reversed(icons)
            if not (os.path.exists(p := os.path.join(OUT_DIR, f"{i}.png"))
                    and os.path.getsize(p) > 0)]
    print(f"套裝所需 icon {len(icons)} 張｜已有 {len(icons)-len(todo)}｜待下載 {len(todo)}")
    if args.limit:
        todo = todo[:args.limit]

    sess = requests.Session()
    ok, fail = 0, []
    t0 = time.time()
    for n, iid in enumerate(todo, 1):
        dest = os.path.join(OUT_DIR, f"{iid}.png")
        got = False
        for attempt in range(3):
            try:
                r = sess.get(ASSET, params={"path": icon_path(iid), "format": "png"},
                             timeout=30)
                if r.status_code == 200 and r.content[:8].startswith(b"\x89PNG"):
                    tmp = dest + ".tmp"
                    with open(tmp, "wb") as f:
                        f.write(r.content)
                    os.replace(tmp, dest)
                    got = True
                    break
                if r.status_code == 429:
                    time.sleep(3 * (attempt + 1))
                    continue
                break  # 404 等不重試
            except Exception:
                time.sleep(1.5 * (attempt + 1))
        if got:
            ok += 1
        else:
            fail.append(iid)
        if n % 500 == 0:
            rate = n / max(time.time() - t0, 1)
            eta = (len(todo) - n) / max(rate, 0.1)
            print(f"  {n}/{len(todo)}（成功 {ok}｜失敗 {len(fail)}｜約剩 {eta/60:.0f} 分）")
        time.sleep(0.05)  # 溫和限速

    if fail:
        with open(FAILED, "w", encoding="utf-8") as f:
            f.write("\n".join(map(str, fail)))
        print(f"⚠ 失敗 {len(fail)} 張 → {os.path.relpath(FAILED, ROOT)}（重跑會再試）")
    elif os.path.exists(FAILED):
        os.remove(FAILED)
    print(f"✅ 本次下載 {ok} 張 → {os.path.relpath(OUT_DIR, ROOT)}")


if __name__ == "__main__":
    main()
