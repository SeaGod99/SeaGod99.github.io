#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
check_maindb.py —— 主庫健檢（取代舊的 update_db.py）。

═══ 為什麼不再有 update_db.py ═══
舊流程是從 cycleapple/ffxiv-item-search-tc 下載一整套 `資料來源/` 自己存一份。
2026-07-28 稽核發現那份的繁中名有 570 筆是錯的（多為簡中用詞），且比主庫少 590 筆
道具，於是本圖鑑改為**直接讀主庫**（見 maindb.py 的說明）。

所以「更新資料」的動作已經不在本目錄，而是回到 repo 根的既有流程：

    node scripts/build-items.mjs            # 物品主表（繁中名權威＝out_data/tw-items.msgpack）
    node scripts/build-item-categories.mjs  # 分類 id ↔ 繁中名（categoryId 靠它）
    node scripts/build-recipes.mjs          # 製作配方
    node scripts/validate-data.mjs          # 驗收

取得方式（out_data/obtainable-methods.msgpack）、NPC／地名（npcs／places.msgpack）、
任務名（out_data/tw-quests.json）也都在主庫，跟著主庫的節奏更新即可。

日文／英文道具名（out_data/{ja,en}-items.msgpack）主庫沒有對應建置腳本，是既有快照；
**改版後的新裝備不必手動補**——`build_item_fallback.py` 會就地向 XIVAPI v2 抓
`Name@lang(ja)`／`Name`，寫進 data/item_fallback_multilang.json，OCR 解析（itemdb.py）
會自動吃那一層。

本腳本只做「跑得起來嗎」的檢查，不改任何檔案：
  py scripts\check_maindb.py            # 檢查並印摘要
  py scripts\check_maindb.py --strict   # 有任何警告就以非 0 退出
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import maindb  # noqa: E402

# (相對主庫的路徑, 說明, 是不是 msgpack)
REQUIRED = [
    ("data/items.json", "物品主表（繁中名／分類／等級／patch）", False),
    ("data/item-categories.json", "分類 id ↔ 繁中名（categoryId 來源）", False),
    ("data/recipes.json", "製作配方", False),
    ("data/dungeons.json", "副本名（取得方式的副本要靠它翻成台服官方名）", False),
    ("data/monsters.json", "怪物名（掉落來源）", False),
    ("out_data/obtainable-methods.msgpack", "取得方式原始表", True),
    ("out_data/npcs.msgpack", "NPC 繁中名", True),
    ("out_data/places.msgpack", "地名繁中名", True),
    ("out_data/tw-quests.json", "任務繁中名", False),
    ("out_data/ja-items.msgpack", "日文道具名（OCR 比對用）", True),
    ("out_data/en-items.msgpack", "英文道具名", True),
    ("out_data/cn-items.msgpack", "簡中道具名（僅備選庫的參考欄位）", True),
]


def main():
    ap = argparse.ArgumentParser(description="主庫健檢（不改檔）")
    ap.add_argument("--strict", action="store_true", help="有警告就以非 0 退出")
    # 舊流程的旗標，留著避免既有指令列打錯就整個爆掉
    ap.add_argument("--check", action="store_true", help="（相容用，行為與預設相同）")
    args = ap.parse_args()

    print("=== 主庫健檢 ===")
    print(f"主庫位置：{maindb.REPO}\n")

    problems, warns = [], []

    # 1) 檔案在不在、讀不讀得開
    for rel, desc, is_mp in REQUIRED:
        path = os.path.join(maindb.REPO, rel)
        if not os.path.exists(path):
            problems.append(f"缺檔：{rel}（{desc}）")
            continue
        try:
            if is_mp:
                # msgpack 特別要「真的解一次」：repo 沒有 .gitattributes 時
                # git 的 autocrlf 會把檔案弄壞，而且 git status 仍顯示 clean
                n = len(maindb.load_msgpack(path))
            else:
                with open(path, encoding="utf-8") as f:
                    d = json.load(f)
                n = len(d.get("data", d))
            size = os.path.getsize(path) / 1048576
            print(f"  ✓ {rel:<42} {n:>7,} 筆  {size:6.2f} MB")
        except Exception as e:
            problems.append(f"讀不開：{rel} → {type(e).__name__}: {e}"
                            + ("（msgpack 解碼失敗多半是被 git autocrlf 弄壞，"
                               "確認 repo 根有 .gitattributes 且該檔標成 binary）" if is_mp else ""))

    if problems:
        print()
        for p in problems:
            print(f"  ❌ {p}")
        print("\n主庫不完整，幻化配裝圖鑑無法重建。")
        sys.exit(1)

    # 2) 版本與筆數摘要
    meta = json.load(open(os.path.join(maindb.REPO, "data", "_meta.json"), encoding="utf-8"))
    items_env = json.load(open(os.path.join(maindb.REPO, "data", "items.json"), encoding="utf-8"))
    print(f"\n台服版本門檻 gamePatch = {meta.get('gamePatch')}"
          f"｜items 資料涵蓋到 {items_env.get('patch')}（更新於 {items_env.get('updated')}）")

    items = maindb.load_items()
    equip = [v for v in items.values() if "equipStats" in v]
    print(f"物品 {len(items):,} 筆｜可裝備 {len(equip):,}｜"
          f"取得方式 {len(maindb.load_sources()):,} 筆｜配方 {len(maindb.load_recipes()):,} 種產物")

    # 3) 有分類名卻對不到 id＝分類表沒跟上，會讓「貨幣是不是裝備」判斷失準。
    #    分類名本身是空的（上游就沒給，目前 1 筆）不算問題。
    unmapped = [k for k, v in items.items() if v["categoryName"] and not v["categoryId"]]
    blank = sum(1 for v in items.values() if not v["categoryName"])
    if unmapped:
        warns.append(f"{len(unmapped)} 筆物品的分類名對不到 id，請重跑 "
                     f"node scripts/build-item-categories.mjs：{unmapped[:5]}")
    if blank:
        print(f"  （{blank} 筆物品上游就沒有分類名，正常）")

    # 4) 副本名解析率——官方套裝的啟發式分組靠副本名當簽名
    insts = maindb.tw_instances()
    src = maindb.load_sources()
    ref = named = 0
    for iid in (k for k, v in items.items() if "equipStats" in v):
        for e in src.get(iid, []):
            if e.get("type") == "instance":
                ref += 1
                if e.get("instanceNames"):
                    named += 1
    pct = 100 * named // max(ref, 1)
    print(f"副本名對照 {len(insts):,} 個｜裝備的副本來源 {ref:,} 條，解得出名字的 {named:,}（{pct}%）")
    if pct < 90:
        warns.append(f"副本名解析率只有 {pct}%，官方套裝分組會退步"
                     f"（檢查 out_data/cfc-content.json 與 data/dungeons.json）")

    if warns:
        print()
        for w in warns:
            print(f"  ⚠ {w}")
        if args.strict:
            sys.exit(2)
    else:
        print("\n✅ 主庫齊全，可以重建。")


if __name__ == "__main__":
    main()
