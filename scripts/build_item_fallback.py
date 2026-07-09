#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_item_fallback.py —— 建「多語系裝備資料」備選庫（繁中 DB 找不到時的 fallback）。

背景：繁中 items.json 的 id 上限約 45590（停在約 7.0），7.x 新裝備查不到繁中名/部位/patch。
本腳本把『全部可裝備道具』彙整成一份多語系庫，缺繁中時可改用日/英/簡中名 + patch + 部位。

來源（自動分工，本機優先、缺口才連網）：
  名稱   日(ja)/英(en)/簡中(cn)：本機 資料來源/{ja,en,zh}-items.msgpack（注意 zh msgpack 實為簡中）
         本機 msgpack 缺的（>45590 的 7.x 件）：ja/en 由 XIVAPI 同批補（Name@lang(ja)），
         OCR 讀日文截圖才對得回這些新裝備（resolve 的 fallback 索引靠這個）
         繁中(zh)：本機 資料來源/items.json（≤45590，缺則留 ""）
  patch  xivapi/ffxiv-datamining-patches：patchdata/Item.json(id→patch索引) + patchlist.json(索引→版本 X.xx)
         → 涵蓋到最新改版；本機 items.json.patch 作為次要校驗
  部位   ≤45590：本機 items.json 的 categoryName → cat_to_slot（與 reconstruct_empty 同一套）
         >45590：XIVAPI v2 beta 的 EquipSlotCategory（實際裝備位置）+ ItemUICategory（分類）
  等級   本機 items.json（≤45590）/ XIVAPI v2 LevelEquip（>45590）

輸出：data/item_fallback_multilang.json
  {"_meta":{...}, "items":{ "id":{ja,en,cn,zh,patch,slot,categoryId,categoryName,equipLevel,src} }}
  只收「可裝備」道具（有裝備部位）。zh 為 "" 即代表繁中尚未實裝＝此庫的使用時機。

用法：py scripts\\build_item_fallback.py
依賴：requests、msgpack（py -m pip install requests msgpack）
"""
import json
import os
import sys
import time

import msgpack
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Windows 主控台/管線預設 cp950，印 emoji/罕見字會炸——統一改 UTF-8
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "資料來源")
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "item_fallback_multilang.json")

V2 = "https://beta.xivapi.com/api/1/sheet"
PATCHES_RAW = "https://raw.githubusercontent.com/xivapi/ffxiv-datamining-patches/master"

# EquipSlotCategory 的欄位 → 本站部位（值==1=佔該部位；-1=遮蔽，不算）
ESC_SLOT = [
    ("MainHand", "武器"), ("OffHand", "盾"), ("Head", "頭部"), ("Body", "上身"),
    ("Gloves", "手部"), ("Waist", "腰"), ("Legs", "腿部"), ("Feet", "腳部"),
    ("Ears", "耳飾"), ("Neck", "項鍊"), ("Wrists", "手鐲"),
    ("FingerR", "戒指"), ("FingerL", "戒指"),
]


def _get(url, params=None, tries=4):
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            last = f"HTTP {r.status_code}"
        except Exception as e:
            last = str(e)
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"GET 失敗 {url} ({last})")


def load_msgpack(name, key):
    p = os.path.join(SRC, name)
    if not os.path.exists(p):
        return {}
    d = msgpack.unpackb(open(p, "rb").read(), raw=False)
    return {int(k): v.get(key, "") for k, v in d.items()
            if str(k).isdigit() and isinstance(v, dict)}


def fetch_esc_map():
    """EquipSlotCategory id → 部位字串。"""
    fields = ",".join(f for f, _ in ESC_SLOT)
    j = _get(f"{V2}/EquipSlotCategory", {"limit": 100, "fields": fields})
    out = {}
    for row in j.get("rows", []):
        f = row.get("fields", {})
        for fld, slot in ESC_SLOT:
            if f.get(fld) == 1:
                out[row["row_id"]] = slot
                break
    return out


def fetch_all_equip(esc2slot):
    """分頁掃整個 Item 表，只留「可裝備」(EquipSlotCategory 對得到部位) 的。
    回 {id:{esc,uicat,lvl,name_en,…}}。從 id 0 起，涵蓋繁中 DB 的內部空缺。
    DyeCount/ItemSearchCategory/Icon/ItemLevel/ClassJobCategory 供徽章與官方套裝分組用
    （DyeCount 本機 DB 沒有，XIVAPI 是全件唯一來源）。"""
    out, after = {}, 0
    fields = ("Name,Name@lang(ja),EquipSlotCategory.value,ItemUICategory.value,LevelEquip,"
              "DyeCount,ItemSearchCategory.value,Icon,LevelItem.value,ClassJobCategory.value")
    while True:
        j = _get(f"{V2}/Item", {"after": after, "limit": 500, "fields": fields})
        rows = j.get("rows", [])
        if not rows:
            break
        for row in rows:
            rid = row["row_id"]
            after = rid
            f = row.get("fields", {})
            esc = (f.get("EquipSlotCategory") or {}).get("value", 0)
            if esc not in esc2slot:
                continue  # 非裝備（esc=0 / 靈魂石…）
            icon = f.get("Icon")
            icon_id = icon.get("id", 0) if isinstance(icon, dict) else (icon or 0)
            out[rid] = {
                "esc": esc,
                "uicat": (f.get("ItemUICategory") or {}).get("value", 0),
                "lvl": f.get("LevelEquip", 0),
                "name_en": f.get("Name", ""),
                "name_ja": f.get("Name@lang(ja)", ""),
                "dye": f.get("DyeCount", 0) or 0,
                "mb": ((f.get("ItemSearchCategory") or {}).get("value", 0) or 0) > 0,
                "icon": icon_id,
                "ilvl": (f.get("LevelItem") or {}).get("value", 0) or 0,
                "cjc": (f.get("ClassJobCategory") or {}).get("value", 0) or 0,
            }
        if after % 5000 < 500:
            print(f"    …掃到 id {after}（裝備累計 {len(out)} 筆）")
    return out


def load_id2patch():
    """patchdata/Item.json(id→索引) + patchlist.json(索引→版本) → {id:'X.xx'}。"""
    item_idx = _get(f"{PATCHES_RAW}/patchdata/Item.json")
    plist = _get(f"{PATCHES_RAW}/patchlist.json")
    idx2ver = {p["ID"]: p.get("Version", "") for p in plist}
    return {int(k): idx2ver.get(v, "") for k, v in item_idx.items() if str(k).isdigit()}


def main():
    print("讀本機名稱庫（ja/en/cn msgpack + 繁中 items.json）…")
    ja = load_msgpack("ja-items.msgpack", "ja")
    en = load_msgpack("en-items.msgpack", "en")
    cn = load_msgpack("zh-items.msgpack", "zh")  # 此 msgpack 實為簡中
    tc_items = json.load(open(os.path.join(SRC, "items.json"), encoding="utf-8"))["items"]
    tc = {int(k): v for k, v in tc_items.items() if str(k).isdigit()}
    catid2name = {}
    for v in tc.values():
        cid, cname = v.get("categoryId"), v.get("categoryName")
        if cid and cname:
            catid2name[cid] = cname

    print("抓 patch 對照（datamining-patches）…")
    id2patch = load_id2patch()

    print("抓 EquipSlotCategory 部位表（XIVAPI v2）…")
    esc2slot = fetch_esc_map()

    print("分頁掃整個 Item 表、篩出可裝備（XIVAPI v2，涵蓋繁中 DB 內部空缺）…")
    equip = fetch_all_equip(esc2slot)

    # 組裝：以 XIVAPI 的「可裝備」全集為準，名稱/繁中/patch 由本機補。
    items = {}
    n_zh = 0
    for iid, g in equip.items():
        slot = esc2slot[g["esc"]]
        cid = g["uicat"]
        tcv = tc.get(iid, {})
        zh = tcv.get("name", "")           # 繁中（缺則 ""）
        cname = tcv.get("categoryName", "") or catid2name.get(cid, "")
        items[iid] = {
            "ja": ja.get(iid, "") or g["name_ja"],
            "en": en.get(iid, "") or g["name_en"],
            "cn": cn.get(iid, ""),
            "zh": zh,
            "patch": id2patch.get(iid) or tcv.get("patch", ""),
            "slot": slot,
            "categoryId": cid,
            "categoryName": cname,
            "equipLevel": g["lvl"] or 0,
            "src": "local" if zh else "intl",
            "dye": g["dye"],
            "mb": g["mb"],
            "icon": g["icon"],
            "ilvl": g["ilvl"],
            "cjc": g["cjc"],
        }
        if zh:
            n_zh += 1

    meta = {
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(items),
        "has_zh_tw": n_zh,
        "no_zh_tw_fallback": len(items) - n_zh,
        "sources": {
            "equip_set_slot_level": "XIVAPI v2 beta（整表掃 EquipSlotCategory/ItemUICategory/LevelEquip）",
            "names_ja_en_cn": "資料來源/{ja,en,zh}-items.msgpack（zh=簡中）；缺者由 XIVAPI Name@lang(ja)/Name 補（7.x 件）",
            "name_zh_tw": "資料來源/items.json（繁中，缺則 ''）",
            "patch": "github xivapi/ffxiv-datamining-patches（涵蓋最新）",
        },
        "schema": ("items[id] = {ja,en,cn,zh,patch,slot,categoryId,categoryName,equipLevel,src,"
                   "dye,mb,icon,ilvl,cjc}"),
        "note": ("zh 為繁中名；空字串=繁中尚未實裝，此時用 ja/en/cn 與 patch/slot 作備選。"
                 "dye=染色欄數(0-2)、mb=有拍賣板搜尋分類(可上架)、icon=圖示ID、"
                 "ilvl=道具等級、cjc=ClassJobCategory ID（官方套裝分組鍵用）。"),
    }
    out = {"_meta": meta, "items": {str(k): items[k] for k in sorted(items)}}
    # 原子寫入：先寫暫存檔再 replace，中途失敗（或上面任一步網路炸掉）都不會弄壞舊檔
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    os.replace(tmp, OUT)
    sz = os.path.getsize(OUT) // 1024
    print(f"\n✅ 多語系裝備備選庫：{len(items)} 件 → {os.path.relpath(OUT, ROOT)}（{sz} KB）")
    print(f"   有繁中 {n_zh}｜無繁中(需備選) {len(items)-n_zh}")


if __name__ == "__main__":
    main()
