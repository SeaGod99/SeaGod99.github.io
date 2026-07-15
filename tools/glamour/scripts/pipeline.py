#!/usr/bin/env python3
"""
pipeline.py — FF14 時尚配裝更新流程
=======================================
整合了原本四支腳本：
  mirapri_update.py        → 步驟 A：從網路抓取最新 Mirapri 資料
  enrich_mirapri_zh.py     → 步驟 B1：補繁中名稱
  enrich_mirapri_iteminfo.py → 步驟 B2：補部位 / 等級 / 職業
  enrich_all_sources.py    → 步驟 B3：補取得方式，產生 all_outfits.js

執行方式：
  python pipeline.py           # 全部步驟（A → B1 → B2 → B3）
  python pipeline.py mirapri   # 只執行步驟 A（更新 Mirapri 原始資料）
  python pipeline.py enrich    # 只執行步驟 B（Enrich 流程，不需網路）
"""

import json, msgpack, time, sys
from pathlib import Path
from collections import Counter
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Windows 主控台/管線預設 cp950，印 emoji/罕見字會炸——統一改 UTF-8
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ══════════════════════════════════════════════════════════
# 路徑設定
# ══════════════════════════════════════════════════════════
ROOT_DIR      = Path(__file__).parent.parent          # FF14時尚配裝/
DATA_DIR      = ROOT_DIR / "資料來源"
MIRAPRI_JSON  = ROOT_DIR / "data" / "mirapri_all.json"
MIRAPRI_JS    = ROOT_DIR / "mirapri_data.js"
IMAGE_DIR     = ROOT_DIR / "配裝圖片" / "mirapri"
ENRICHED_JSON = ROOT_DIR / "data" / "all_outfits_enriched.json"

# ══════════════════════════════════════════════════════════
# 步驟 A：更新 Mirapri 資料（需要網路）
# ══════════════════════════════════════════════════════════
API_URL      = "https://mirapri.ff14eden.work/glamour/all_users_glamour.json"
IMG_HEADERS  = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer":    "https://mirapri.ff14eden.work/",
}
MAX_SIZE     = 800
JPEG_QUALITY = 82
DELAY        = 0.3


MAX_EQUIP = 12   # FF14 最多 12 個裝備槽（含武器、副手、飾品）
MAX_RING  = 2    # 戒指最多同款 2 個

def _clean_equipments(names: list[str]) -> list[str]:
    """去除重複裝備名稱（戒指允許最多 2 個），並截斷到最多 MAX_EQUIP 件。"""
    seen: dict[str, int] = {}
    cleaned = []
    for name in names:
        if not name:
            continue
        count = seen.get(name, 0)
        limit = MAX_RING if "リング" in name or "指輪" in name else 1
        if count < limit:
            cleaned.append(name)
            seen[name] = count + 1
    return cleaned[:MAX_EQUIP]


def step_a_fetch():
    """從 API 下載最新 Mirapri 配裝資料，存為 mirapri_all.json"""
    print("▶ 步驟 A-1：下載最新 Mirapri 資料...")
    try:
        with urlopen(API_URL, timeout=30) as r:
            raw = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"  ✗ 下載失敗：{e}")
        sys.exit(1)

    prev = 0
    if MIRAPRI_JSON.exists():
        try:
            with open(MIRAPRI_JSON, encoding="utf-8") as f:
                prev = len(json.load(f))
        except Exception:
            pass

    result = []
    for e in raw:
        char = e.get("character") or {}
        urls = e.get("image_urls") or []
        img  = urls[0].split("?")[0] if urls else ""
        result.append({
            "id":         e.get("glamour_id"),
            "title":      e.get("glamour_title"),
            "user":       e.get("user_name"),
            "race":       char.get("race"),
            "gender":     char.get("gender"),
            "timestamp":  e.get("timestamp"),
            "image":      img,
            "equipments": _clean_equipments(
                              [eq.get("name", "") for eq in (e.get("equipments") or [])]),
        })

    with open(MIRAPRI_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    print(f"  ✓ 共 {len(result):,} 筆（前次：{prev:,} 筆，新增 {max(0, len(result)-prev):,} 筆）")
    return result


def step_a_rebuild_js():
    """將 mirapri_all.json 轉成 mirapri_data.js（mirapri.html 使用）"""
    print("▶ 步驟 A-2：重建 mirapri_data.js...")
    with open(MIRAPRI_JSON, encoding="utf-8") as f:
        data = json.load(f)
    with open(MIRAPRI_JS, "w", encoding="utf-8") as f:
        f.write("// 自動產生，請勿手動編輯。由 pipeline.py 產生。\n")
        f.write("const MIRAPRI_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    size_kb = MIRAPRI_JS.stat().st_size // 1024
    print(f"  ✓ mirapri_data.js（{size_kb:,} KB）")


def step_a_download_images():
    """補充下載新增圖片（已存在的自動跳過）"""
    print("▶ 步驟 A-3：補充下載新圖片...")
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    try:
        from PIL import Image
        import io
        USE_PILLOW = True
    except ImportError:
        USE_PILLOW = False
        print("  ⚠️  Pillow 未安裝，圖片不會壓縮。pip install Pillow")

    with open(MIRAPRI_JSON, encoding="utf-8") as f:
        outfits = json.load(f)

    new_count = skipped = failed = 0
    total = len(outfits)

    for i, entry in enumerate(outfits, 1):
        url = entry.get("image", "")
        if not url:
            skipped += 1
            continue
        fname = url.rsplit("/", 1)[-1]
        dest  = IMAGE_DIR / fname
        if dest.exists():
            skipped += 1
            if i % 1000 == 0:
                print(f"  [{i}/{total}] 進行中... (新增={new_count})")
            continue
        print(f"  [{i}/{total}] {fname[:55]}", end="  ", flush=True)
        try:
            req = Request(url, headers=IMG_HEADERS)
            with urlopen(req, timeout=15) as resp:
                data = resp.read()
            if USE_PILLOW:
                img = Image.open(io.BytesIO(data)).convert("RGB")
                if max(img.width, img.height) > MAX_SIZE:
                    img.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)
                img.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)
            else:
                dest.write_bytes(data)
            print(f"✓ {dest.stat().st_size // 1024} KB")
            new_count += 1
        except Exception as e:
            print(f"✗ {e}")
            failed += 1
        time.sleep(DELAY)

    print(f"  完成！新增={new_count}  跳過={skipped}  失敗={failed}")


# ══════════════════════════════════════════════════════════
# 步驟 B 共用：載入資料庫
# ══════════════════════════════════════════════════════════
def _load_msgpack(path):
    with open(path, "rb") as f:
        return msgpack.unpackb(f.read(), raw=False)


def load_all_data():
    """載入所有 Enrich 步驟需要的資料庫，回傳一個 dict"""
    print("[載入] ja/en-items …", end=" ", flush=True)
    ja_data = _load_msgpack(DATA_DIR / "ja-items.msgpack")
    en_data = _load_msgpack(DATA_DIR / "en-items.msgpack")
    ja_to_id = {v.get("ja", ""): str(k) for k, v in ja_data.items() if v.get("ja")}
    en_to_id = {v.get("en", ""): str(k) for k, v in en_data.items()
                if isinstance(v, dict) and v.get("en")}
    print(f"ja={len(ja_to_id):,}  en={len(en_to_id):,}")

    print("[載入] items.json …", end=" ", flush=True)
    with open(DATA_DIR / "items.json", encoding="utf-8") as f:
        items = json.load(f)["items"]
    print(f"{len(items):,} 筆")

    print("[載入] sources.json …", end=" ", flush=True)
    with open(DATA_DIR / "sources.json", encoding="utf-8") as f:
        sources = json.load(f)["sources"]
    print(f"{len(sources):,} 筆")

    print("[載入] obtainable-methods …", end=" ", flush=True)
    om = _load_msgpack(DATA_DIR / "obtainable-methods.msgpack")
    print(f"{len(om):,} 筆")

    print("[載入] npcs / places / quests …", end=" ", flush=True)
    npcs_raw   = _load_msgpack(DATA_DIR / "npcs.msgpack")
    places_raw = _load_msgpack(DATA_DIR / "places.msgpack")
    quests_raw = _load_msgpack(DATA_DIR / "quests.msgpack")
    tw_npcs    = {str(k): v.get("tw","") for k, v in npcs_raw.get("twNpcs",{}).items()}
    tw_places  = {str(k): v.get("tw","") for k, v in places_raw.get("twPlaces",{}).items()}
    tw_quests  = {str(k): v.get("tw","") for k, v in quests_raw.get("twQuests",{}).items()}
    print(f"npc={len(tw_npcs):,}  place={len(tw_places):,}  quest={len(tw_quests):,}")

    print("[載入] recipes.msgpack + recipes.json …", end=" ", flush=True)
    recipes_list = _load_msgpack(DATA_DIR / "recipes.msgpack")
    recipe_by_id = {str(r["id"]): r for r in recipes_list if isinstance(r, dict)}
    with open(DATA_DIR / "recipes.json", encoding="utf-8") as f:
        recipes_json = json.load(f)["recipes"]
    print(f"msgpack={len(recipe_by_id):,}  json={len(recipes_json):,} 筆")

    # ja 名稱 → 繁中名稱（用於 zh 步驟）
    id_to_zh = {k: v["name"] for k, v in items.items() if "name" in v}
    ja_to_zh = {}
    for item_id, val in ja_data.items():
        ja_name = val.get("ja","")
        zh_name = id_to_zh.get(str(item_id),"")
        if ja_name and zh_name:
            ja_to_zh[ja_name] = zh_name
    print(f"[對照表] 日文→繁中：{len(ja_to_zh):,} 組")

    return dict(
        ja_to_id=ja_to_id, en_to_id=en_to_id, items=items,
        sources=sources, om=om,
        tw_npcs=tw_npcs, tw_places=tw_places, tw_quests=tw_quests,
        recipe_by_id=recipe_by_id, recipes_json=recipes_json,
        ja_to_zh=ja_to_zh,
    )


# ══════════════════════════════════════════════════════════
# 步驟 B1：補繁中名稱
# ══════════════════════════════════════════════════════════
def step_b1_enrich_zh(all_outfits, db):
    print("\n── 步驟 B1：補繁中名稱 ──")
    total = success = 0
    for outfit in all_outfits:
        if outfit.get("type") != "mirapri":
            continue
        for eq in outfit.get("equipments", []):
            total += 1
            zh = db["ja_to_zh"].get(eq.get("name",""),"")
            eq["zh"] = zh
            if zh:
                success += 1
    pct = 100 * success // total if total else 0
    print(f"  補繁中名稱：{success:,}/{total:,}（{pct}%）")


# ══════════════════════════════════════════════════════════
# 步驟 B2：補部位 / 等級 / 職業
# ══════════════════════════════════════════════════════════
_CAT_TO_SLOT = {
    34:"頭部", 35:"上身", 36:"腿部", 37:"手部", 38:"腳部",
    40:"項鍊", 41:"耳飾", 42:"手鐲", 43:"戒指",
    **{i:"武器" for i in range(1, 31)},
    11:"副手", 12:"副手",
}
_HEALER  = {'WHM','SCH','AST','SGE'}
_TANK    = {'PLD','WAR','DRK','GNB'}
_CASTER  = {'BLM','SMN','RDM','BLU','PCT'}
_PRANGED = {'BRD','MCH','DNC'}
_MELEE   = {'MNK','DRG','NIN','SAM','RPR','VPR'}
_ALL_ADV = _HEALER | _TANK | _CASTER | _PRANGED | _MELEE
_BASE_JOBS = {'GLA','PGL','MRD','LNC','ARC','CNJ','THM','ACN',
              'CRP','BSM','ARM','GSM','LTW','WVR','ALC','CUL',
              'MIN','BTN','FSH'}

def _job_label(job_str):
    if not job_str:
        return "全職業"
    jobs = set(job_str.split()) - _BASE_JOBS
    adv  = jobs & _ALL_ADV
    if not adv:
        return job_str.split()[0] if job_str else "全職業"
    if adv >= _ALL_ADV:  return "全職業"
    if adv <= _HEALER:   return "治療職業"
    if adv <= _TANK:     return "盾衛職業"
    if adv <= _CASTER:   return "法系職業"
    if adv <= _PRANGED:  return "遠程物理職業"
    if adv <= _MELEE:    return "近戰職業"
    parts = sorted(adv)
    return " ".join(parts) if len(parts) <= 3 else job_str


def step_b2_enrich_iteminfo(all_outfits, db):
    print("\n── 步驟 B2：補部位 / 等級 / 職業 ──")
    stats = Counter()
    ja_to_id = db["ja_to_id"]
    en_to_id = db["en_to_id"]
    items    = db["items"]
    for outfit in all_outfits:
        if outfit.get("type") != "mirapri":
            continue
        for eq in outfit.get("equipments", []):
            name = eq.get("name","")
            iid  = (ja_to_id.get(name) or en_to_id.get(name) or
                    ja_to_id.get(name.strip()) or en_to_id.get(name.strip()))
            if not iid:
                stats["no_id"] += 1
                continue
            item = items.get(iid, {})
            if not item:
                stats["not_in_items"] += 1
                continue
            cid  = item.get("categoryId")
            slot = _CAT_TO_SLOT.get(int(cid),"") if cid else ""
            if slot and not eq.get("slot"):   eq["slot"] = slot
            patch = item.get("patch","")
            if patch and not eq.get("patch"): eq["patch"] = patch
            lv = item.get("equipLevel","")
            if lv and not eq.get("lv"):       eq["lv"] = str(lv) if lv != 1 else ""
            job_str = item.get("equipStats",{}).get("classJobCategoryName","")
            if not eq.get("job"):             eq["job"] = _job_label(job_str) if job_str else "全職業"
            stats["enriched"] += 1
    print(f"  補欄位：{stats['enriched']:,}  查無ID：{stats['no_id']:,}  超出DB：{stats['not_in_items']:,}")


# ══════════════════════════════════════════════════════════
# 步驟 B3：補取得方式
# ══════════════════════════════════════════════════════════
_PVP_IDS      = {25, 36656, 40479}
_MGP_IDS      = {29, 41629}
_ORANGE_SCRIP = {41784, 41785}
_PURPLE_SCRIP = {33913, 33914}
_OLD_SCRIP    = {28,10309,24909,30272,31339,33329,33330,
                 35834,36658,38211,38942,39365,39919,41305,41306,41786}
_INST_TYPE    = {1:"試煉",2:"迷宮挑戰",3:"高難度討伐",4:"討伐歼滅戰",
                 5:"聯隊突擊",6:"絕境戰",22:"聯隊突擊",28:"絕境戰"}  # 28=絕（絕巴哈姆特/絕龍詩…）
_JOB_CRAFT    = {8:"木工",9:"鍛造",10:"甲冑",11:"金工",
                 12:"皮革",13:"裁縫",14:"鍊金",15:"烹調"}
_NEEDS_RESOLVE = {"🪙代幣","🛒商店","🗡️副本（副本）","⚔️PvP",
                  "🪙雇員探險","gcshop","desynth","drop","venture"}
_CLEAR_TYPES   = {"desynth","drop","venture","🪙雇員探險",
                  "gardening","alarm","reduction","islandcrop","islandpasture"}


def _add_specialshop(cid, pstr, items, results, vendor=None):
    if cid in _PVP_IDS:
        cname = items.get(str(cid),{}).get("name","PvP")
        results.append((2, f"⚔️PvP {cname}{pstr}", "pvp"))
    elif cid in _MGP_IDS:
        results.append((2, f"🎲金碟遊樂園 MGP{pstr}", "gs"))
    elif cid in _ORANGE_SCRIP:
        results.append((2, f"🔶巧手橙票{pstr}", "scrip"))
    elif cid in _PURPLE_SCRIP:
        results.append((2, f"🟣製作紫票{pstr}", "scrip"))
    elif cid in _OLD_SCRIP:
        cname = items.get(str(cid),{}).get("name","神典石")
        results.append((2, f"🪙{cname}{pstr}", "other"))
    elif cid == 1:
        results.append((4, f"🛒NPC商店（{pstr.lstrip('×')} Gil）", "npc"))
    else:
        cat = items.get(str(cid),{}).get("categoryId",0) if cid else 0
        if 1 <= (cat or 0) <= 49:
            # 兌換貨幣本身是「裝備」=拿前一階裝備向 NPC 兌換升級版（非副本，更非「幻洋奇境」）
            npc, zone = vendor or ("", "")
            if npc:
                results.append((4, f"🛒{npc}（{zone}）" if zone else f"🛒{npc}", "npc"))
            else:
                results.append((5, "🛒裝備升級兌換", "npc"))
        else:
            cname = items.get(str(cid),{}).get("name","代幣") if cid else "代幣"
            results.append((2, f"🪙{cname}{pstr}", "other"))


def _resolve_from_sources(item_id, items, sources, recipes_json):
    results = []
    for s in sources.get(item_id, []):
        t = s.get("type","")
        if t == "instance":
            names = s.get("instanceNames",[]); types = s.get("instanceContentTypes",[])
            name  = names[0] if names else "副本"
            itype = _INST_TYPE.get(types[0] if types else 0, "副本")
            results.append((1, f"🗡️{name}（{itype}）", "raid"))
        elif t == "specialshop":
            cid = s.get("currencyItemId"); price = s.get("price","")
            v = (s.get("vendors") or [{}])[0]
            _add_specialshop(cid, f"×{price}" if price else "", items, results,
                             vendor=(v.get("npcName",""), v.get("zoneName","")))
        elif t == "vendor":
            v = (s.get("vendors") or [{}])[0]
            npc  = v.get("npcName","NPC商人"); zone = v.get("zoneName","")
            results.append((4, f"🛒{npc}（{zone}）" if zone else f"🛒{npc}", "npc"))
        elif t == "gilshop":
            results.append((4, f"🛒NPC商店（{s.get('price','')} Gil）", "npc"))
        elif t == "gcshop":
            results.append((4, "🪙軍票商店", "other"))
        elif t == "quest":
            qn = s.get("questNames",[]); part = f"：{qn[0]}" if qn else ""
            results.append((5, f"📋任務獎勵{part}", "npc"))
        elif t == "drop":
            mobs = s.get("mobNames",[]); mob = mobs[0] if mobs else "怪物"
            results.append((6, f"🗡️{mob}（怪物掉落）", "raid"))
        elif t == "treasure":
            mn = s.get("mapNames",["寶圖"])[0]
            results.append((7, f"🗺️寶圖（{mn}）", "other"))
        elif t == "voyage":
            results.append((7, "🚢潛水艇探索", "other"))
    for r in recipes_json.get(item_id, []):
        if isinstance(r, dict):
            ctype = r.get("craftTypeName","製作"); lv = r.get("classJobLevel","")
            results.append((3, f"🔨製作（{ctype}{' Lv.'+str(lv) if lv else ''}）", "craft"))
    return (_best(results))


def _resolve_from_om(item_id, items, om, tw_npcs, tw_places, tw_quests, recipe_by_id):
    results = []
    for m in om.get(item_id, []):
        t = m.get("type","")
        if t == "mogstation":
            results.append((1, "💎Mog Station", "store"))
        elif t == "instance":
            types = m.get("instanceContentTypes",[]); itype = _INST_TYPE.get(types[0] if types else 0,"副本")
            results.append((2, f"🗡️副本（{itype}）", "raid"))
        elif t == "specialshop":
            cid = m.get("currencyItemId"); pstr = f"×{m.get('currencyAmount','')}" if m.get("currencyAmount") else ""
            _add_specialshop(cid, pstr, items, results)
        elif t in ("craft","masterbook"):
            rid = str(m.get("recipeId","")); r = recipe_by_id.get(rid,{})
            job = r.get("job", m.get("job")); lvl = r.get("lvl","")
            cname = _JOB_CRAFT.get(job,"製作")
            results.append((3, f"🔨製作（{cname}{' Lv.'+str(lvl) if lvl else ''}）", "craft"))
        elif t == "vendor":
            data = m.get("data",[])
            if data and isinstance(data, list):
                npc_id = str(data[0].get("npcId","")); zone_id = str(data[0].get("zoneId",""))
                npc = tw_npcs.get(npc_id,"NPC商人"); zone = tw_places.get(zone_id,"")
                results.append((4, f"🛒{npc}（{zone}）" if zone else f"🛒{npc}", "npc"))
        elif t == "gcshop":
            results.append((4, "🪙軍票商店", "other"))
        elif t == "quest":
            data = m.get("data",[]); qn = tw_quests.get(str(data[0]),"") if data else ""
            results.append((5, f"📋任務獎勵：{qn}" if qn else "📋任務獎勵", "npc"))
        elif t == "treasure":
            results.append((7, "🗺️寶圖", "other"))
        elif t == "voyage":
            results.append((7, "🚢潛水艇探索", "other"))
        elif t == "fate":
            results.append((6, "🗡️危命任務（FATE）", "other"))
        elif t == "achievement":
            results.append((8, "🏆成就獎勵", "other"))
        elif t == "gathering":
            results.append((9, "🌿採集", "other"))
    return _best(results)


def _best(results):
    if not results:
        return "", "other"
    results.sort(key=lambda x: x[0])
    return results[0][1], results[0][2]


def step_b3_enrich_sources(all_outfits, db):
    print("\n── 步驟 B3：補取得方式 ──")
    ja_to_id    = db["ja_to_id"]
    en_to_id    = db["en_to_id"]
    items       = db["items"]
    sources     = db["sources"]
    om          = db["om"]
    tw_npcs     = db["tw_npcs"]
    tw_places   = db["tw_places"]
    tw_quests   = db["tw_quests"]
    recipe_by_id= db["recipe_by_id"]
    recipes_json= db["recipes_json"]
    stats = Counter()

    for outfit in all_outfits:
        if outfit.get("type") != "mirapri":
            continue
        for eq in outfit.get("equipments", []):
            src = eq.get("source","").strip()
            if src in _CLEAR_TYPES:
                eq["source"] = ""; eq["st"] = "other"; stats["cleared"] += 1; continue
            if src and src not in _NEEDS_RESOLVE:
                stats["skipped"] += 1; continue
            ja_name = eq.get("name","")
            item_id = (ja_to_id.get(ja_name) or en_to_id.get(ja_name) or
                       ja_to_id.get(ja_name.strip()) or en_to_id.get(ja_name.strip()))
            if not item_id:
                stats["no_id"] += 1; continue
            new_src, new_st = _resolve_from_sources(item_id, items, sources, recipes_json)
            if new_src:
                eq["source"] = new_src; eq["st"] = new_st; stats["from_sources"] += 1; continue
            new_src, new_st = _resolve_from_om(item_id, items, om, tw_npcs, tw_places, tw_quests, recipe_by_id)
            if new_src:
                eq["source"] = new_src; eq["st"] = new_st; stats["from_om"] += 1; continue
            # 查不到就留空（待確認）；不再用「舊化的→幻洋奇境」啟發式造假
            stats["unresolvable"] += 1

    total  = sum(len(o["equipments"]) for o in all_outfits if o.get("type")=="mirapri")
    filled = sum(1 for o in all_outfits if o.get("type")=="mirapri"
                   for eq in o["equipments"] if eq.get("source","").strip())
    print(f"  sources.json：{stats['from_sources']:,}  obtainable-methods：{stats['from_om']:,}  "
          f"跳過：{stats['skipped']:,}  "
          f"查無ID：{stats['no_id']:,}  無來源：{stats['unresolvable']:,}")
    print(f"  有 source：{filled:,}/{total:,}（{100*filled//total if total else 0}%）")


# ══════════════════════════════════════════════════════════
# 主程式
# ══════════════════════════════════════════════════════════
def run_mirapri():
    """步驟 A：更新 Mirapri 原始資料（需要網路）"""
    print("\n" + "="*55)
    print("  步驟 A：更新 Mirapri 資料")
    print("="*55)
    step_a_fetch()
    step_a_rebuild_js()
    step_a_download_images()
    print("\n✅ Mirapri 更新完成。")


def run_enrich():
    """步驟 B：Enrich 流程（補繁中名稱、部位、取得方式，產生 all_outfits_enriched.json）"""
    print("\n" + "="*55)
    print("  步驟 B：Enrich 流程")
    print("="*55)
    db = load_all_data()

    # 直接從 mirapri_all.json 建立 enrich 輸入
    # （舊版讀 data/all_outfits.json 合併檔，該檔已不存在；
    #   curated 資料由 build_site.py 從 curated_outfits.json 讀取，這裡只需 mirapri）
    print(f"\n[讀取] mirapri_all.json …", end=" ", flush=True)
    with open(MIRAPRI_JSON, encoding="utf-8") as f:
        mirapri_raw = json.load(f)
    all_outfits_enriched = []
    for o in mirapri_raw:
        all_outfits_enriched.append({
            "type":       "mirapri",
            "id":         o.get("id"),
            "title":      o.get("title") or "",
            "user":       o.get("user") or "",
            "race":       o.get("race") or "",
            "gender":     o.get("gender") or "",
            "timestamp":  o.get("timestamp") or "",
            "image":      o.get("image") or "",
            "equipments": [{"name": n} for n in o.get("equipments", []) if n],
        })
    print(f"{len(all_outfits_enriched):,} 筆")

    step_b1_enrich_zh(all_outfits_enriched, db)
    step_b2_enrich_iteminfo(all_outfits_enriched, db)
    step_b3_enrich_sources(all_outfits_enriched, db)

    print(f"\n[寫入] all_outfits_enriched.json …")
    with open(ENRICHED_JSON, "w", encoding="utf-8") as f:
        json.dump(all_outfits_enriched, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Enrich 完成：{len(all_outfits_enriched):,} 筆（請再跑 scripts/build_site.py 重建網頁資料）")


if __name__ == "__main__":
    mode = sys.argv[1].lower() if len(sys.argv) > 1 else "all"

    if mode == "mirapri":
        run_mirapri()
    elif mode == "enrich":
        run_enrich()
    elif mode == "all":
        run_mirapri()
        run_enrich()
    else:
        print(f"未知模式：{mode}")
        print("用法：python pipeline.py [mirapri|enrich|all]")
        sys.exit(1)
