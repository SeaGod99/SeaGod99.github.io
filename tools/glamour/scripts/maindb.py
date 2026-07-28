#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
maindb.py —— 幻化配裝圖鑑的唯一資料入口：直接讀「水神的工具箱」主庫。

═══ 為什麼有這支（2026-07-28 改動）═══
本圖鑑原本自帶一份 `資料來源/`（items.json / sources.json / recipes.json + 一堆
msgpack），來自 cycleapple/ffxiv-item-search-tc。稽核發現兩個問題：

1. **重複**：`資料來源/` 104 MB，其中 45.6 MB 與 `out_data/` 位元組完全相同。
2. **脫鉤且名稱是錯的**：那份快照比主庫舊一個月、少 590 筆 7.1/7.2 道具（含 6 個
   幻化套裝箱），而且 588 筆同 id 名稱不同——以 Teamcraft 台服 tw-items 當裁判，
   **主庫對 570、它只對 18**；錯的那批多是簡中用詞（打底褲←打底裤、莽漢面具、
   把台服保留英文的曲名硬翻）。違反 docs/專案慣例與記憶.md §4.2／§4.5
   「繁中名以 tw-items 為準、絕不簡轉繁」。

所以本圖鑑不再自帶資料庫，一律走主庫。各腳本改呼叫本模組，不要再自己開檔。

═══ 對應關係 ═══
    舊：資料來源/items.json         → 新：data/items.json ＋ data/item-categories.json
    舊：資料來源/sources.json       → 新：out_data/obtainable-methods.msgpack（原始、較完整）
                                          ＋ npcs/places/tw-quests/dungeons/monsters 解析成繁中
    舊：資料來源/recipes.json       → 新：data/recipes.json
    舊：資料來源/{en,npcs,places,recipes,obtainable-methods,fates,loot-sources}.msgpack
                                    → 新：out_data/ 同名檔（本來就位元組相同）
    舊：資料來源/{ja,zh}-items.msgpack → 新：out_data/ja-items.msgpack、cn-items.msgpack
                                          （改名是因為舊檔名寫 zh 其實裝的是簡中，害人踩雷）

主庫沒有、也不需要的：items-index.json、quests.msgpack、ui_categories.msgpack
（quests 由 out_data/tw-quests.json 取代；ui_categories 與 fates/loot-sources 從來沒被用到）。

═══ 回傳格式 ═══
為了不動 20 幾支既有腳本，本模組把主庫的資料**轉成舊 `資料來源/` 的形狀**再回傳，
呼叫端看到的欄位與以前一致（items 的 categoryId／equipStats、sources 的
instanceNames／vendors／price…）。

用法：
    import maindb
    items   = maindb.load_items()      # {id字串: {name, categoryId, equipStats, …}}
    sources = maindb.load_sources()    # {id字串: [{type, …}, …]}
    recipes = maindb.load_recipes()    # {id字串: [{craftTypeName, classJobLevel, …}, …]}

自我檢查：py scripts\maindb.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # tools/glamour
REPO = os.path.dirname(os.path.dirname(ROOT))                        # repo 根
DATA = os.path.join(REPO, "data")
OUT_DATA = os.path.join(REPO, "out_data")

JA_MSGPACK = os.path.join(OUT_DATA, "ja-items.msgpack")
EN_MSGPACK = os.path.join(OUT_DATA, "en-items.msgpack")
CN_MSGPACK = os.path.join(OUT_DATA, "cn-items.msgpack")   # 簡中，僅供參考欄位用

# 三大軍團軍票：主庫原始資料把軍票商店併在 specialshop 底下，舊格式另立 gcshop
GC_SEAL_IDS = {20, 21, 22}

_cache = {}


def _memo(key, fn):
    if key not in _cache:
        _cache[key] = fn()
    return _cache[key]


def _read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_msgpack(path):
    import msgpack
    with open(path, "rb") as f:
        return msgpack.unpackb(f.read(), raw=False, strict_map_key=False)


def _envelope(name):
    """讀主庫「信封 + data」格式的檔案，回傳 data 部分。"""
    return _read_json(os.path.join(DATA, name))["data"]


# ───────────────────────── items ─────────────────────────

_ICON_RE = re.compile(r"/(\d+)\.png$")


def _icon_id(path):
    """主庫存 icon 路徑 '/i/030000/030502.png'，舊格式要的是數字 30502。"""
    if not path:
        return 0
    m = _ICON_RE.search(path)
    return int(m.group(1)) if m else 0


def load_items():
    """{id字串: {name, categoryId, categoryName, itemLevel, equipLevel, rarity,
                stackSize, isUntradable, icon, patch, equipStats?}}

    `equipStats` 只有可裝備的道具才有（舊格式如此，itemdb／reconstruct_empty 拿它
    當「這件是不是裝備」的判斷），classJobCategoryName 是空白分隔的職業縮寫。
    """
    def build():
        cats = _read_json(os.path.join(DATA, "item-categories.json"))["data"]
        name2id = {v: int(k) for k, v in cats.items()}
        out = {}
        for x in _envelope("items.json"):
            eq = x.get("equip")
            rec = {
                "id": x["id"],
                "name": x.get("name", ""),
                "categoryId": name2id.get(x.get("category"), 0),
                "categoryName": x.get("category") or "",
                "itemLevel": x.get("ilvl", 0),
                "equipLevel": (eq or {}).get("level", 1) or 1,
                "rarity": x.get("rarity", 1),
                "stackSize": x.get("stackSize", 1),
                "isUntradable": not x.get("marketable", True),
                "icon": _icon_id(x.get("icon")),
                "patch": x.get("patch", "") or "",
            }
            if eq:
                rec["equipStats"] = {
                    "classJobCategoryName": " ".join(eq.get("jobs") or []),
                    "equipSlotCategory": eq.get("slot", 0),
                }
            out[str(x["id"])] = rec
        return out

    return _memo("items", build)


def job_names():
    """{職業縮寫: 台服繁中職業名}，來自主庫 data/equip.json 的 names 表。

    這是**全站唯一的職業名權威**（docs/專案慣例與記憶.md §4.2）：
    白魔道士（非白魔法師）、召喚士（非召喚師）、占星術師（非占星術士）、
    奪魂者（RPR，非鐮刀師／釤鐮客）、毒蛇劍士（VPR，非劍蛇師／蝰蛇劍士）、
    製作職一律「匠」不是「師」（刻木匠／鍛鐵匠／鑄甲匠／雕金匠／製革匠／裁衣匠）。
    不要在別處另抄一份——本圖鑑原本自帶一張表，33 個裡有 16 個是錯的。
    """
    return _memo("jobs", lambda: dict(
        _read_json(os.path.join(DATA, "equip.json"))["names"]))


def item_categories():
    """{categoryId: 繁中分類名}"""
    return _memo("cats", lambda: {
        int(k): v for k, v in
        _read_json(os.path.join(DATA, "item-categories.json"))["data"].items()
    })


# ───────────────────────── recipes ─────────────────────────

# 主庫 recipes 的 jobId（8=木工…15=烹調）→ 舊格式的 craftType／craftTypeName
_JOB_CRAFT = {8: "木工", 9: "鍛造", 10: "甲冑", 11: "金工",
              12: "皮革", 13: "裁縫", 14: "鍊金", 15: "烹調"}


def load_recipes():
    """{itemId字串: [{id, itemId, craftType, craftTypeName, classJobLevel,
                     recipeLevel, stars, ingredients, resultAmount, …}, …]}"""
    def build():
        out = {}
        for r in _envelope("recipes.json"):
            jid = r.get("jobId") or 0
            out.setdefault(str(r["itemId"]), []).append({
                "id": r.get("id"),
                "itemId": r.get("itemId"),
                "craftType": jid - 8 if jid else None,
                "craftTypeName": _JOB_CRAFT.get(jid, r.get("job", "製作")),
                "recipeLevel": r.get("rlvl"),
                "stars": r.get("stars", 0),
                "classJobLevel": r.get("level"),
                "difficulty": r.get("progress"),
                "quality": r.get("quality"),
                "durability": r.get("durability"),
                "resultAmount": r.get("yield", 1),
                "ingredients": [{"itemId": i.get("itemId"), "amount": i.get("qty")}
                                for i in (r.get("ingredients") or [])],
            })
        return out

    return _memo("recipes", build)


def craft_types():
    return [{"id": jid - 8, "name": nm} for jid, nm in sorted(_JOB_CRAFT.items())]


# ───────────────────────── 名稱解析表 ─────────────────────────

def tw_npcs():
    return _memo("npcs", lambda: {
        str(k): v.get("tw", "")
        for k, v in load_msgpack(os.path.join(OUT_DATA, "npcs.msgpack")).get("twNpcs", {}).items()
    })


def tw_places():
    return _memo("places", lambda: {
        str(k): v.get("tw", "")
        for k, v in load_msgpack(os.path.join(OUT_DATA, "places.msgpack")).get("twPlaces", {}).items()
    })


def tw_quests():
    """舊 quests.msgpack 的替代品：out_data/tw-quests.json {questId: {tw}}"""
    return _memo("quests", lambda: {
        str(k): (v.get("tw", "") if isinstance(v, dict) else str(v))
        for k, v in _read_json(os.path.join(OUT_DATA, "tw-quests.json")).items()
    })


def tw_monsters():
    """BNpcBase id → 繁中怪物名。

    ⚠ 鍵是 `baseId` 不是 `id`：取得方式資料的 drop.data[].id 給的是 BNpcBase。
    monsters.json 的 `id`（BNpcName）有 12,937 筆是 null，且拿 `id` 去對會撈到
    完全不相干的怪（115 → baseId 是「風元精」、id 是「運河食人魔」）。
    """
    return _memo("mobs", lambda: {
        str(m["baseId"]): m.get("name", "")
        for m in _envelope("monsters.json") if m.get("baseId") is not None
    })


def tw_instances():
    """InstanceContent row id → 台服官方副本名。

    主庫的副本表 dungeons.json 以 ContentFinderCondition id 為主鍵，取得方式資料
    給的是 InstanceContent id，兩者用 out_data/cfc-content.json 橋接
    （副本名權威＝dungeons.json，見 docs/專案慣例與記憶.md §4.3b）。

    橋接表涵蓋 386 個副本；裝備類道具的 instance 引用 99.95% 解得出來，
    解不出的多是 Teamcraft 自編號的多變／異聞迷宮與寶物庫（幾乎不掉裝備）。
    """
    def build():
        cfc = _read_json(os.path.join(OUT_DATA, "cfc-content.json"))
        dung = {int(d["id"]): d.get("name", "") for d in _envelope("dungeons.json")}
        out = {}
        for cfc_id, inst_id in cfc.items():
            nm = dung.get(int(cfc_id))
            if nm:
                out.setdefault(int(inst_id), nm)
        return out

    return _memo("instances", build)


# ───────────────────────── sources ─────────────────────────

_INST_TYPE = {1: "試煉", 2: "迷宮挑戰", 3: "高難度討伐", 4: "討伐殲滅戰",
              5: "聯隊突擊", 6: "絕境戰", 22: "聯隊突擊", 28: "絕境戰"}


def _vendors_from_npc_ids(npc_ids, npcs, places, price=None, zone_ids=None, coords=None):
    out = []
    for i, nid in enumerate(npc_ids or []):
        nm = npcs.get(str(nid), "")
        if not nm:
            continue
        v = {"npcName": nm, "aetheryteName": ""}
        v["zoneName"] = places.get(str((zone_ids or [])[i]), "") if zone_ids else ""
        if price is not None:
            v["price"] = price
        if coords and i < len(coords) and coords[i]:
            v["x"], v["y"] = coords[i].get("x"), coords[i].get("y")
        out.append(v)
    return out


def load_sources():
    """把主庫 out_data/obtainable-methods.msgpack 轉成舊 `資料來源/sources.json` 的形狀。

    原始檔存的是 id（副本 id、NPC id、任務 id、怪物 id…），這裡一律解析成台服繁中名
    再交給呼叫端，所以 build_sets 的分組簽名、build_item_sources 的來源鍵都不用改。
    """
    def build():
        om = load_om()
        npcs, places = tw_npcs(), tw_places()
        quests, mobs, insts = tw_quests(), tw_monsters(), tw_instances()
        items = load_items()
        out = {}
        for iid, entries in om.items():
            conv = []
            for e in entries or []:
                t = e.get("type")

                if t == "instance":
                    ids = e.get("data") or []
                    names = [insts[i] for i in ids if i in insts]
                    types = e.get("instanceContentTypes") or []
                    conv.append({
                        "type": "instance",
                        "typeName": _INST_TYPE.get(types[0] if types else 0, "副本"),
                        "instanceNames": list(dict.fromkeys(names)),
                        "instanceContentTypes": types,
                        "totalInstances": e.get("totalInstances", len(ids)),
                    })

                elif t == "specialshop":
                    cur = e.get("currencyItemId")
                    price = e.get("currencyAmount") or 0
                    vendors = _vendors_from_npc_ids(e.get("npcIds"), npcs, places)
                    if cur in GC_SEAL_IDS:
                        # 軍票兌換在舊格式裡是「gcshop ＋ specialshop」兩條並存（621/622 都這樣）：
                        # gcshop 撐起 build_sets 的 "gc" 分組簽名，specialshop 撐起
                        # 「🪙雙蛇黨軍票」這種具體貨幣來源鍵。只留一條會少掉另一邊。
                        conv.append({"type": "gcshop", "typeName": "軍票商店",
                                     "price": price, "currency": "gc_seals"})
                    conv.append({"type": "specialshop", "typeName": "兌換",
                                 "price": price, "currencyItemId": cur,
                                 "currency": e.get("currency", "item"),
                                 "vendors": vendors})

                elif t == "vendor":
                    rows = e.get("data") or []
                    vendors = []
                    for r in rows:
                        nm = npcs.get(str(r.get("npcId")), "")
                        if not nm:
                            continue
                        c = r.get("coords") or {}
                        vendors.append({
                            "npcName": nm,
                            "price": r.get("price"),
                            "zoneName": places.get(str(r.get("zoneId")), ""),
                            "x": c.get("x"), "y": c.get("y"),
                            "aetheryteName": "",
                        })
                    conv.append({"type": "vendor", "typeName": "NPC商店", "vendors": vendors})

                elif t == "quest":
                    qids = e.get("data") or ([e["questId"]] if e.get("questId") else [])
                    names = [quests.get(str(q), "") for q in qids]
                    names = [n for n in names if n]
                    conv.append({
                        "type": "quest", "typeName": "任務獎勵",
                        "questId": qids[0] if qids else None,
                        "questName": names[0] if names else "",
                        "questNames": names,
                    })

                elif t == "drop":
                    ids = [d.get("id") for d in (e.get("data") or []) if isinstance(d, dict)]
                    names = [mobs.get(str(i), "") for i in ids]
                    names = [n for n in names if n]
                    conv.append({"type": "drop", "typeName": "怪物掉落",
                                 "mobIds": ids, "mobNames": names, "totalMobs": len(ids)})

                elif t == "treasure":
                    pids = e.get("productIds") or e.get("data") or []
                    names = [items.get(str(p), {}).get("name", "") for p in pids]
                    names = [n for n in names if n]
                    conv.append({"type": "treasure", "typeName": "藏寶圖",
                                 "mapNames": names, "totalMaps": e.get("count", len(pids))})

                elif t == "desynth":
                    ids = e.get("data") or []
                    conv.append({"type": "desynth", "typeName": "分解",
                                 "desynthItemIds": ids,
                                 "totalDesynthItems": e.get("count", len(ids))})

                elif t == "venture":
                    tasks = e.get("tasks") or []
                    first = tasks[0] if tasks else {}
                    conv.append({"type": "venture", "typeName": "雇員探險",
                                 "ventureLevel": first.get("level", 0),
                                 "ventureQuantities": first.get("quantities") or []})

                elif t == "voyage":
                    names = [(v.get("name") or {}).get("ja", "")
                             for v in (e.get("voyages") or []) if isinstance(v, dict)]
                    conv.append({"type": "voyage", "typeName": "遠航探索",
                                 "voyageNames": [n for n in names if n],
                                 "totalVoyages": e.get("totalVoyages", len(names))})

                else:
                    # craft／masterbook／gathering／mogstation… 舊格式沒有，原樣帶過。
                    # 既有呼叫端都是 if/elif 比對 type，不認得的自然略過，不影響行為。
                    conv.append(dict(e))

            if conv:
                out[str(iid)] = conv
        return out

    return _memo("sources", build)


def load_om():
    """原始（未解析）的取得方式表，pipeline.py 的 _resolve_from_om 用。"""
    return _memo("om", lambda: load_msgpack(os.path.join(OUT_DATA, "obtainable-methods.msgpack")))


# ───────────────────────── 自我檢查 ─────────────────────────

def _self_test():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    print("=== maindb 自我檢查 ===")
    print(f"主庫路徑：{DATA}")

    items = load_items()
    equip = [v for v in items.values() if "equipStats" in v]
    print(f"items      {len(items):>6} 筆｜可裝備 {len(equip):,}｜"
          f"有 categoryId {sum(1 for v in items.values() if v['categoryId']):,}")
    for iid in ("1066", "3317", "25068", "6112"):
        print(f"   {iid}: {items[iid]['name']}  [{items[iid]['categoryName']}"
              f"/{items[iid]['categoryId']}] patch={items[iid]['patch']}")

    rec = load_recipes()
    print(f"recipes    {len(rec):>6} 種產物｜樣本 1602 → {rec.get('1602')}")

    src = load_sources()
    n_inst = sum(1 for v in src.values() for e in v
                 if e["type"] == "instance" and e.get("instanceNames"))
    n_vend = sum(1 for v in src.values() for e in v
                 if e["type"] == "vendor" and e.get("vendors"))
    print(f"sources    {len(src):>6} 筆｜有副本名 {n_inst:,}｜有商人名 {n_vend:,}")
    print(f"   道具 2  → {json.dumps(src.get('2'), ensure_ascii=False)[:200]}")
    print(f"   道具 1601 → {json.dumps(src.get('1601'), ensure_ascii=False)[:200]}")

    print(f"npcs {len(tw_npcs()):,}｜places {len(tw_places()):,}｜"
          f"quests {len(tw_quests()):,}｜monsters {len(tw_monsters()):,}｜"
          f"instances {len(tw_instances()):,}")
    for p in (JA_MSGPACK, EN_MSGPACK, CN_MSGPACK):
        print(f"   {'✅' if os.path.exists(p) else '✗ 缺'} {os.path.relpath(p, REPO)}")


if __name__ == "__main__":
    _self_test()
