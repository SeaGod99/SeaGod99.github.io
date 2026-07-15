#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_db.py —— 從公開上游更新繁中道具資料庫（資料來源/）。

上游：cycleapple/ffxiv-item-search-tc（GitHub Pages 開源繁中工具站）。
已驗證本專案的 items.json 與其 public/data/items.json byte 相同，即本資料的來源。
  - 繁中名：items.json 的 name 欄（來自上游 ffxiv-datamining-tc 繁中 datamine）
  - 日/英名：item-names-multi.json 的 ja/en（cn 欄是「簡中」，不採用）

注意：上游需等社群把新改版 datamine 出來、cycleapple 重建後才會更新；
      伺服器當天更新通常還抓不到新版（會顯示「無更新」）。

用法：
  py scripts\\update_db.py            # 只比對線上 vs 本機版本，不下載覆蓋（安全）
  py scripts\\update_db.py --apply    # 確認有新版後：下載→備份→換新→產 msgpack→報告繁中增量
"""
import argparse
import json
import os
import sys
import shutil
from collections import Counter
from datetime import datetime
from urllib.request import urlopen, Request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "資料來源")
BASE = "https://raw.githubusercontent.com/cycleapple/ffxiv-item-search-tc/main/public/data"

# 與本專案格式相同、可直接落地的 JSON
JSON_FILES = ["items.json", "sources.json", "recipes.json", "items-index.json"]
MULTI = "item-names-multi.json"  # {id:{en,ja,cn}}；cn=簡中不採用


def _fetch(name):
    req = Request(f"{BASE}/{name}", headers={"User-Agent": "ff14-fashion-updater"})
    with urlopen(req, timeout=180) as r:
        return r.read()


def _online_size(name):
    """只抓 1 byte，從 Content-Range 取線上檔案總大小（輕量版本檢查，不下載整檔）。"""
    req = Request(f"{BASE}/{name}",
                  headers={"User-Agent": "ff14-fashion-updater", "Range": "bytes=0-0"})
    with urlopen(req, timeout=60) as r:
        cr = r.headers.get("Content-Range", "")  # 例：bytes 0-0/24977961
        if "/" in cr:
            return int(cr.rsplit("/", 1)[-1])
        return int(r.headers.get("Content-Length", 0))


def _local_size(name):
    p = os.path.join(SRC, name)
    return os.path.getsize(p) if os.path.exists(p) else 0


def _patch_summary(items):
    pat = Counter(str(v.get("patch", "")) for v in items.values() if v.get("equipStats"))
    def pk(x):
        try:
            return tuple(int(n) for n in x.split("."))
        except ValueError:
            return (0,)
    top = sorted([p for p in pat if p], key=pk, reverse=True)[:3]
    ids = [int(k) for k in items if str(k).isdigit()]
    return top, (max(ids) if ids else 0), len(items)


def _local_items():
    p = os.path.join(SRC, "items.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8")).get("items", {})
    return {}


def do_check():
    """輕量比對 items.json 大小。exit code：10=有新版、0=無、1=錯誤（給排程判斷）。"""
    print(f"上游：{BASE}")
    try:
        online = _online_size("items.json")
    except Exception as ex:
        print(f"✗ 連線失敗：{ex}")
        return 1
    if not online:
        print("✗ 取不到線上檔案大小")
        return 1
    local = _local_size("items.json")
    print(f"  線上 items.json = {online:,} bytes｜本機 = {local:,} bytes")
    if online != local:
        print("→ 偵測到新版（檔案大小不同），可跑 --apply 更新")
        return 10
    print("→ 無新版（與本機相同；cycleapple 尚未為新改版重建）")
    return 0


def do_apply(force=False):
    print(f"上游：{BASE}\n下載中（約 50MB）…")
    try:
        blobs = {f: _fetch(f) for f in JSON_FILES}
        multi = json.loads(_fetch(MULTI).decode("utf-8"))
    except Exception as ex:
        print(f"✗ 下載失敗：{ex}")
        return 1
    items_new = json.loads(blobs["items.json"].decode("utf-8")).get("items", {})
    local = _local_items()
    on_top, on_max, on_n = _patch_summary(items_new)
    lo_top, lo_max, lo_n = _patch_summary(local) if local else ([], 0, 0)
    print(f"  線上：{on_n} 筆｜最大id {on_max}｜裝備最高版本 {on_top}")
    print(f"  本機：{lo_n} 筆｜最大id {lo_max}｜裝備最高版本 {lo_top}")
    if not ((on_max > lo_max) or (on_n > lo_n)) and not force:
        print("\n⚠ 線上沒有比本機新版本，未動任何檔（要強制覆蓋加 --force）。")
        return 0

    # ── 備份 ──
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = os.path.join(SRC, f"_backup_{stamp}")
    os.makedirs(backup, exist_ok=True)
    for f in JSON_FILES + ["ja-items.msgpack", "en-items.msgpack", "zh-items.msgpack"]:
        sp = os.path.join(SRC, f)
        if os.path.exists(sp):
            shutil.copy2(sp, os.path.join(backup, f))
    print(f"  已備份舊檔 → {os.path.relpath(backup, ROOT)}")

    # ── 落地 JSON ──
    for f, b in blobs.items():
        with open(os.path.join(SRC, f), "wb") as fp:
            fp.write(b)

    # ── 產生 msgpack：ja/en 取自 multi；zh 取自 items.json 的 name（繁中，非 multi 的 cn 簡中） ──
    import msgpack
    ja = {k: {"ja": v.get("ja", "")} for k, v in multi.items() if v.get("ja")}
    en = {k: {"en": v.get("en", "")} for k, v in multi.items() if v.get("en")}
    zh = {k: {"zh": v.get("name", "")} for k, v in items_new.items() if v.get("name")}
    for fname, obj in [("ja-items.msgpack", ja), ("en-items.msgpack", en), ("zh-items.msgpack", zh)]:
        with open(os.path.join(SRC, fname), "wb") as fp:
            fp.write(msgpack.packb(obj, use_bin_type=True))

    old_zh = {k for k, v in local.items() if v.get("name")}
    new_zh = {k for k, v in items_new.items() if v.get("name")}
    print(f"\n完成。繁中道具名：{len(old_zh)} → {len(new_zh)}（新增 {len(new_zh - old_zh)}）")
    print(f"  最大 id：{lo_max} → {on_max}")
    print("  ⚠ obtainable-methods/npcs/places/quests 等 msgpack 上游未提供，未更新（僅 source 解析 fallback）")
    print("\n接著重建：py scripts\\reconstruct_empty.py && py scripts\\build_site.py")
    return 0


def main():
    ap = argparse.ArgumentParser(description="從 cycleapple/ffxiv-item-search-tc 更新繁中道具 DB")
    ap.add_argument("--check", action="store_true", help="只輕量比對版本（預設行為），exit 10=有新版")
    ap.add_argument("--apply", action="store_true", help="實際下載並覆蓋 資料來源/（會先備份）")
    ap.add_argument("--force", action="store_true", help="即使線上不比本機新也覆蓋")
    args = ap.parse_args()
    sys.exit(do_apply(args.force) if args.apply else do_check())


if __name__ == "__main__":
    main()
