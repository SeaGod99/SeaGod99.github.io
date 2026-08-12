#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
build_dye_names.py —— 由主庫產生染色三份對照檔（取代先前的手工維護）

═══ 為什麼有這支（2026-08-12 新增）═══
`data/dye_names_ja.json`（白名單）與 `data/dye_ja_to_zh.json`（日→繁）原本
**全庫只有讀取者、沒有任何寫入者**，所以台服每次加新色它們都不會跟著長，
一路凍在 146 色。稽核當下的實際損害（全庫 29,409 個染色標籤）：

  * 7.21 新增的 11 色不在名單裡。而 `snap_dye()` 是模糊比對，對不到不會留白，
    **會退回最像的舊色**——メタリックルビーレッド→ルビーレッド（60 件）、
    メタリックダークブルー→ダークブルー（46 件）、
    メタリックコバルトグリーン→メタリックグリーン（43 件），共 149 件顯示錯色。
    「靜默給錯答案」比留白更糟，這是補這支腳本的主因。
  * 舊名單混進 12 個「不是顏色」的東西（色素／生漆／黒漆／重建用上級色素），
    反而把殘字吸走：「レッド」→ダラガブレッド（37 次）、「イエロー」→イエローピグメント（13 次）。
  * 英文投稿的色名（Pure White、Jet Black…）共 412 個標籤整批對不到，全被丟掉。

═══ 判定規則 ═══
可染的顏色 = `categoryId == 55（染料）` **且日文名以 `カララント:` 開頭**。
後半這個條件是關鍵：染料分類底下同時裝著色素（ピグメント）、生漆／黒漆、
伊修加德重建用的上級色素——那些是製作素材，不是能套到裝備上的顏色。

═══ 產出 ═══
  data/dye_names_ja.json  白名單 list[str]（去掉 `カララント:` 前綴的日文色名）
  data/dye_ja_to_zh.json  {日文色名: 台服繁中名}；**台服未實裝就不收**
                          （依知識庫 §4.5，缺繁中名寧可留空，不用日/英/簡中補）
  data/dye_aliases.json   {正規化別名: 日文色名}；目前收英文名（去掉 " Dye" 字尾）,
                          給 ocr_check.snap_dye() 先做精確查表再退回模糊比對

用法：
    py scripts\build_dye_names.py            # dry-run，只印差異
    py scripts\build_dye_names.py --apply    # 寫入

**改版後必跑**（台服升版 → 主庫 build-items.mjs → 本支 → apply_dyes.py）。
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import maindb  # noqa: E402

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
WL_JSON = os.path.join(DATA, "dye_names_ja.json")
ZH_JSON = os.path.join(DATA, "dye_ja_to_zh.json")
ALIAS_JSON = os.path.join(DATA, "dye_aliases.json")

DYE_CATEGORY_ID = 55
JA_PREFIX = "カララント:"
APPLY = "--apply" in sys.argv


def norm_alias(s):
    """英文色名正規化：小寫、去掉 Dye 字尾、gray→grey、壓縮空白。

    規則需與 ocr_check._norm_alias 一致（一邊建表、一邊查表）。
    FF14 英文用 grey，但投稿者常打美式 gray，統一成 grey 才對得起來。
    """
    s = re.sub(r"\bdye\b", " ", s.lower())
    s = re.sub(r"\bgray\b", "grey", s)
    return re.sub(r"[\s_\-]+", " ", s).strip()


def tw_color(name):
    """台服道具名 → 前端要顯示的顏色名。

    道具名是「EX無瑕白染劑」這種完整品名，但彈窗要顯示的是顏色本身：
    去掉「染劑」字尾與「EX」前綴（EX 版與一般版是同一個顏色，只是道具不同，
    例如 ピュアホワイト 與 ピュアホワイトEX 都顯示「無瑕白」）。
    """
    s = (name or "").strip()
    s = re.sub(r"染劑$", "", s)
    s = re.sub(r"^EX", "", s)
    return s.strip()


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def main():
    items = maindb.load_items()
    ja = maindb.load_msgpack(maindb.JA_MSGPACK)
    en = maindb.load_msgpack(maindb.EN_MSGPACK)

    def _name(tbl, iid, field):
        rec = tbl.get(iid) or tbl.get(str(iid))
        return (rec or {}).get(field) or "" if isinstance(rec, dict) else ""

    colors, zh_map, alias, skipped = [], {}, {}, []
    for iid, rec in items.items():
        if int(rec.get("categoryId") or 0) != DYE_CATEGORY_ID:
            continue
        jname = _name(ja, iid, "ja")
        if not jname.startswith(JA_PREFIX):
            # 色素／生漆／重建用素材：在染料分類底下，但不是能套到裝備的顏色
            skipped.append((iid, jname or "(無日文名)", rec.get("name") or ""))
            continue
        base = jname[len(JA_PREFIX):].strip()
        if not base:
            continue
        colors.append(base)
        tw = tw_color(rec.get("name"))
        # 台服未實裝就不給繁中名（§4.5：寧可留空，不用日/英/簡中硬補）
        if tw and tw != base:
            zh_map[base] = tw
        ename = _name(en, iid, "en")
        if ename:
            key = norm_alias(ename)
            if key:
                alias[key] = base

    colors = sorted(dict.fromkeys(colors))
    zh_map = {k: zh_map[k] for k in colors if k in zh_map}
    alias = dict(sorted(alias.items()))

    old_wl = load_json(WL_JSON, [])
    old_zh = load_json(ZH_JSON, {})
    added = sorted(set(colors) - set(old_wl))
    removed = sorted(set(old_wl) - set(colors))

    print("=== 染色白名單 ===")
    print("舊 %d 色 → 新 %d 色（新增 %d、移除 %d）"
          % (len(old_wl), len(colors), len(added), len(removed)))
    if added:
        print("  新增：%s" % "、".join(added))
    if removed:
        print("  移除（不是可染的顏色）：%s" % "、".join(removed))
    print("\n=== 日→繁對照 ===")
    print("舊 %d 組 → 新 %d 組（%d 色台服尚未實裝，刻意留空）"
          % (len(old_zh), len(zh_map), len(colors) - len(zh_map)))
    for c in colors:
        if c not in zh_map:
            print("  未實裝：%s" % c)
    print("\n=== 英文別名 ===")
    print("%d 組（例：%s）" % (len(alias), list(alias.items())[:2]))
    print("\n=== 分類裡被排除的非顏色 %d 筆 ===" % len(skipped))
    for iid, jn, tw in skipped:
        print("  id=%-7s %-24s %s" % (iid, jn, tw))

    if not APPLY:
        print("\n(dry-run，未寫檔。加 --apply 才會寫入)")
        return 0

    for path, obj in ((WL_JSON, colors), (ZH_JSON, zh_map), (ALIAS_JSON, alias)):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        print("✅ 已寫入 %s" % os.path.relpath(path, ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
