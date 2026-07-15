#!/usr/bin/env python3
"""
build_site.py —— 從 JSON 重建網站資料檔
==========================================
資料流：
  data/curated_outfits.json（精選套裝唯一資料來源，直接編輯這份）
  data/all_outfits_enriched.json（mirapri 社群資料，由 pipeline.py 產生）
        ↓
  curated_outfits.js（精選，index.html 立即載入）
  mirapri_outfits.js（社群，index.html 延遲載入）

執行：python scripts/build_site.py
改完 data/curated_outfits.json 後跑這支即可。
st（取得方式分類）與 tags（卡片標籤）會自動從 source／job 欄位重新推導，
不必手動維護。
"""
import json
import sys
from pathlib import Path

# Windows 主控台/管線預設 cp950，印 emoji/罕見字會炸——統一改 UTF-8
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).parent.parent
CURATED_JSON = ROOT / "data" / "curated_outfits.json"
ENRICHED_PATH = ROOT / "data" / "all_outfits_enriched.json"
CURATED_JS = ROOT / "curated_outfits.js"
MIRAPRI_JS = ROOT / "mirapri_outfits.js"
OFFICIAL_SETS_JSON = ROOT / "data" / "official_sets.json"   # build_sets.py 產出
OFFICIAL_SETS_JS = ROOT / "official_sets.js"                # 官方套裝分頁（延遲載入）
ITEM_FALLBACK = ROOT / "data" / "item_fallback_multilang.json"  # 徽章資料（dye/mb/iid）來源
MIRAPRI_DYES = ROOT / "data" / "mirapri_dyes.json"     # apply_dyes.py 產生：{id: [繁中染色]}（整套 fallback）
MIRAPRI_PIECE_DYES = ROOT / "data" / "mirapri_piece_dyes.json"  # {id: {裝備日文名: [繁中染色]}}（v2 逐件）
MIRAPRI_VISIBLE = ROOT / "data" / "mirapri_visible.json"  # apply_dyes.py 產生：{id: [圖上可見裝備日文名]}
# review.html 匯出：action=="remove" 的套不顯示。
# 兩個位置都讀並取聯集——使用者常把瀏覽器下載的匯出檔直接丟在專案根目錄，
# 也可能放進 data/；兩邊的 remove 一律累積（移除過的不會因換檔復活）。
REVIEW_DECISIONS_PATHS = [ROOT / "review_decisions.json", ROOT / "data" / "review_decisions.json"]
MIRAPRI_RECON = ROOT / "data" / "mirapri_reconstructed.json"  # reconstruct_empty.py：空殼套用 OCR+DB 重建的裝備
SET_PHOTOS = ROOT / "data" / "set_photos.json"  # fetch_set_photos.py：官方套裝 wiki 模特照對應表
VIS_FLOOR = 4  # vismap 過濾後若 <此件數，視為 OCR 漏讀 → 改保留完整清單（一般幻化至少 4~5 件）

# 取得方式分類：先比對關鍵字（同一個 emoji 底下要再分家的），對不到再退回 emoji。
# 關鍵字依序比對，第一個命中就算數。
ST_KEYWORDS = [
    # 寶圖擺第一：箱子名會帶各種玩法字眼（「🗺️寶圖（無人島特殊配給貨箱）」），
    # 讓後面的 special 規則先咬到就會誤判——來源是寶圖，不是無人島玩法。
    ("寶圖", "other"),
    # 🛒 底下的「特殊玩法」——不是站著不動的商人，而是各自成一套的長期玩法
    ("伊修加德重建", "special"), ("無人島", "special"),
    ("宇宙探索", "special"), ("友好部族", "special"), ("友好部落", "special"),
    # 🪙 底下不是「代幣兌換」的幾種
    ("成就", "other"),          # 🪙成就獎勵
    ("Gil×", "npc"),           # 🪙Gil×N ＝ 拿金幣買，歸商店
    # 票據：官方套裝寫「🪙兌換：巧手橙票」、精選寫「🔶巧手橙票」，靠票名歸同一桶。
    # 只認「{顏色}票」——「拉札漢的三類票據」等友好部族貨幣不是票據，留在 token。
    ("橙票", "scrip"), ("紫票", "scrip"), ("白票", "scrip"),
    ("黃票", "scrip"), ("綠票", "scrip"),
    ("幻化套裝箱", "other"),    # wiki 對不出來源的殘餘
]
# 註：探索型內容（優雷卡／博茲雅）不需要關鍵字——🗺️／🗡️ emoji 就已經歸 raid。
# 曾加過「南方博茲雅→raid」，結果把「🛒義軍整備兵（南方博茲雅戰線）」這種
# 正牌 NPC 商人也拖進 raid，弊大於利，已移除。

# 取得方式 emoji → st 標籤（取 source 字串中第一個出現的 emoji）
EMOJI_ST = [
    ("🗡️", "raid"), ("🗡", "raid"),
    ("🗺️", "raid"), ("🗺", "raid"),
    ("📋", "quest"),
    ("🛒", "npc"),
    ("🪙", "token"),
    ("🔶", "scrip"), ("🟣", "scrip"),
    ("🔨", "craft"),
    ("🎲", "gs"),
    ("⚔️", "pvp"), ("⚔", "pvp"),
    ("💎", "store"),
    ("🗓️", "event"), ("🗓", "event"), ("💒", "event"),
    ("🎁", "other"),
]

# 職業 → 卡片 tag
JOB_TAGS = {
    "healer": ["治療職業", "白魔法師", "賢者", "占星術士", "學者"],
    "tank": ["盾衛職業", "騎士", "戰士", "暗黑騎士", "絕槍戰士"],
    "caster": ["法系職業", "赤魔法師", "黑魔法師", "青魔法師", "召喚師", "繪靈法師"],
    "pranged": ["遠程物理職業", "舞者", "吟遊詩人", "機工士"],
    "melee": ["近戰職業", "偵察職業", "武士", "忍者", "武僧", "龍騎士", "鐮刀師", "劍蛇師"],
    "crafter": ["布衣師", "製革師", "甲冑師", "鍛鐵師", "煉金術士", "廚師", "雕金師",
                "木工師", "製作職業", "採礦工", "採伐工", "漁夫", "捕魚人"],
}
ST_TAGS = {"raid", "quest", "npc", "token", "scrip", "craft",
           "pvp", "store", "event", "gs", "special", "other"}
# 會成為篩選 tag 的取得方式（與 index.html 的 ST_TAG_SET 同步；改這裡記得同步前端）
ALL_JOB = "全職業"   # 無職業限制的 job 標籤（curated／mirapri／official 三邊都用這個字）

PIECE_DEFAULTS = {
    "slot": "", "zh": "", "en": "", "ja": "", "dye1": "—", "dye2": "—",
    "source": "—", "st": "other", "lv": "1", "job": "全職業",
    "gender": "", "race": "", "patch": "",
}


# ── 徽章標記（可染欄數 / 可上拍賣板）────────────────────────────
# 名稱→道具的「精確」索引：只在名稱唯一對應時蓋章（低信心不標，寧缺勿錯）。
def build_badge_index():
    """回 (by_zh, by_ja, by_en)；值 = {"iid","dye","mb"}；名稱撞多件且屬性不同 → 剔除。"""
    if not ITEM_FALLBACK.exists():
        return {}, {}, {}
    items = json.loads(ITEM_FALLBACK.read_text(encoding="utf-8"))["items"]
    by_zh, by_ja, by_en = {}, {}, {}
    _AMB = object()
    for iid, v in items.items():
        rec = {"iid": int(iid), "dye": v.get("dye", 0), "mb": bool(v.get("mb", False))}
        for key, idx in ((v.get("zh"), by_zh), (v.get("ja"), by_ja),
                         ((v.get("en") or "").lower(), by_en)):
            if not key:
                continue
            old = idx.get(key)
            if old is None:
                idx[key] = rec
            elif old is not _AMB and (old["dye"], old["mb"]) != (rec["dye"], rec["mb"]):
                idx[key] = _AMB   # 同名不同屬性 → 放棄蓋章
    for idx in (by_zh, by_ja, by_en):
        for k in [k for k, v in idx.items() if v is _AMB]:
            del idx[k]
    return by_zh, by_ja, by_en


def stamp_badges(piece, by_zh, by_ja, by_en):
    """把 iid/dye/mb 蓋進一件裝備 dict（curated 的 piece 或 mirapri 的 equipment）。"""
    rec = (by_zh.get(piece.get("zh") or "")
           or by_ja.get(piece.get("ja") or piece.get("name") or "")
           or by_en.get((piece.get("en") or "").lower()))
    if rec:
        piece["iid"] = rec["iid"]
        piece["dye"] = rec["dye"]
        piece["mb"] = rec["mb"]
        return True
    return False


def st_from_source(source: str) -> str:
    for kw, st in ST_KEYWORDS:
        if kw in source:
            return st
    best = None
    for emoji, st in EMOJI_ST:
        idx = source.find(emoji)
        if idx >= 0 and (best is None or idx < best[0]):
            best = (idx, st)
    return best[1] if best else "other"


def is_all_job(pieces) -> bool:
    """整套沒有任何職業限制＝每件都是「全職業」（job 空白＝資料未填，不當限制但也不能單獨成立）"""
    jobs = [(p.get("job") or "").strip() for p in pieces]
    return any(j == ALL_JOB for j in jobs) and all(j in ("", ALL_JOB) for j in jobs)


def tags_from_pieces(pieces):
    tags = set()
    for p in pieces:
        job = p.get("job", "")
        for tag, jobs in JOB_TAGS.items():
            if any(j in job for j in jobs):
                tags.add(tag)
        if p.get("st") in ST_TAGS:
            tags.add(p["st"])
    if is_all_job(pieces):
        tags.add("alljob")
    return sorted(tags)


def normalize_curated(curated):
    """補預設欄位、重算 st 與 tags、基本檢查"""
    seen = set()
    for o in curated:
        oid = o.get("id", "")
        if not oid:
            print("⚠️  有套裝缺 id")
        elif oid in seen:
            print(f"⚠️  編號重複：{oid}")
        seen.add(oid)
        o.setdefault("type", "curated")
        for k in ("name", "color", "image", "note", "gender", "race"):
            o.setdefault(k, "")
        if not o.get("gender") or not o.get("race"):
            print(f"ℹ️  {oid} 未填性別／種族（篩選時會被歸入「未指定」）")
        pieces = o.setdefault("pieces", [])
        for p in pieces:
            for k, v in PIECE_DEFAULTS.items():
                p.setdefault(k, v)
            p["st"] = st_from_source(p.get("source") or "")
        o["tags"] = tags_from_pieces(pieces)
    return curated


def transform_mirapri(o, dyemap=None, vismap=None, piecemap=None, reconmap=None, force_recon=None):
    img = o.get("image") or o.get("img") or ""
    fname = img.split("/")[-1] if img else ""
    oid = o.get("id", "")

    equips = o.get("equipments", [])
    # 空殼套（來源 0 件）若有 OCR+DB 重建清單，改用重建的（已含部位/繁中/逐件染色）。
    # force_recon：review.html 人工標記「人眼件數 > 清單」的套（投稿者漏標），即使非空殼也改用重建。
    recon_used = False
    rc = (reconmap or {}).get(oid)
    if rc and (not any(e.get("name") for e in equips) or oid in (force_recon or set())):
        equips = rc
        recon_used = True

    # 用 OCR 判斷「圖上實際畫出來」的裝備，濾掉投稿者附的替代裝備（清單比圖片多的元兇）。
    # 只有該套在 vismap 裡（= 有 OCR 過且至少認出 1 件）才過濾。
    # 但只在「過濾後仍保有完整套裝（>=VIS_FLOOR 件）」時才採用結果——否則多半是 OCR 漏讀，
    # 寧可保留完整清單，也不要把正常套裝砍到剩 2~3 件（一般幻化至少 4~5 件）。
    vis = None if recon_used else (vismap or {}).get(oid)
    if vis:
        visset = set(vis)
        filtered = [e for e in equips if e.get("name", "") in visset]
        if len(filtered) >= VIS_FLOOR:
            equips = filtered

    # 逐件染色（v2）：以裝備日文名對應 dye1/dye2；無資料則 — —，由 fallback 行顯示整套染色
    # 重建套已自帶 dye1/dye2，原樣保留
    pdye = (piecemap or {}).get(oid, {})
    out_equips = []
    for e in equips:
        e = dict(e)
        # st 一律由 source 重算，不吃 all_outfits_enriched.json 帶來的舊值——
        # 那是 pipeline.py 當年用舊分類算的，改 ST_TAGS 時不會跟著更新（曾害
        # 社群套的 🪙 停在 other、精選的 🪙 卻是 token，同一顆按鈕兩種行為）。
        e["st"] = st_from_source(e.get("source") or "")
        if recon_used:
            e.setdefault("dye1", "—")
            e.setdefault("dye2", "—")
        else:
            ds = pdye.get(e.get("name", ""), [])
            e["dye1"] = ds[0] if len(ds) >= 1 else "—"
            e["dye2"] = ds[1] if len(ds) >= 2 else "—"
        out_equips.append(e)
    has_piece = bool(pdye) or (recon_used and any(
        e.get("dye1", "—") != "—" or e.get("dye2", "—") != "—" for e in out_equips))

    return {
        "type": "mirapri",
        "id": oid,
        "name": o.get("title") or o.get("name") or "無題の投稿",
        "color": o.get("user") or "",
        "gender": o.get("gender", ""),
        "race": o.get("race", ""),
        "image": ("配裝圖片/mirapri/" + fname) if fname else "",
        "tags": [],
        "note": "",
        "timestamp": o.get("timestamp", ""),
        "equipments": out_equips,
        "dyes": (dyemap or {}).get(oid, []),  # 整套染色 fallback（繁中）
        "hasPieceDyes": has_piece,            # True：彈窗逐列已有染色，不再顯示整套 fallback 行
    }


# ── 官方套裝 → official_sets.js ────────────────────────────────
# wiki Outfit infobox 的 source-type → 站內取得方式標籤（fetch_set_photos.py 抓回）
# 幻化套裝箱本體不存在於 sources.json（0/1078），wiki 是取得方式唯一來源
WIKI_STYPE_LABEL = {
    "Premium":        "💎Mog Station",
    "Seasonal Event": "🗓️季節活動",          # 實際 label 會帶活動名，見 wiki_source_label
    "Dungeons":       "🗡️副本掉落",
    "Trials":         "🗡️討伐戰",
    "Raids":          "🗡️團隊戰",
    "V&C Dungeons":   "🗡️多變／異聞迷宮",
    "Deep Dungeons":  "🗡️深層迷宮",
    "Eureka":         "🗡️禁地優雷卡",
    "Occult Crescent": "🗡️Occult Crescent",   # 繁中版未實裝，暫留英文
    "Crafting":       "🔨製作",
    "Gathering":      "🔨採集／分解",
    "Main Scenario":  "📋主線任務",
    "Quests":         "📋任務獎勵",
    "Hall of the Novice": "📋新手訓練所",
    "PvP":            "⚔️PvP",
    "PvP (Ranked)":   "⚔️PvP 排位",
    "Gold Saucer":    "🎲金碟遊樂園",
    "Ishgardian Restoration": "🛒伊修加德重建",
    "Island Sanctuary": "🛒無人島開拓",
    "Cosmic Exploration": "🛒宇宙探索",
    "Allied Societies": "🛒友好部族",
    "Achievements":   "🪙成就獎勵",
    "FATE":           "🪙危命任務兌換",
    "Gil":            "🛒NPC 商店",
}


def _obtain_name(x):
    """obtain 條目是否像「名稱」（過濾說明文句碎片，如 'Use  obtained as…'）"""
    return (x and len(x) <= 40 and x[0].isupper()
            and not x.startswith(("Use ", "Is ", "Random ")))


def wiki_source_label(info):
    """set_photos.json 一筆的 stype/obtain → 取得方式標籤（對不出來回空字串）"""
    stype = (info or {}).get("stype") or ""
    obtain = (info or {}).get("obtain") or []
    if stype == "Seasonal Event":
        ev = next((x for x in obtain if x != "Online Store"), "")
        label = f"🗓️{ev}" if ev else "🗓️季節活動"
        if "Online Store" in obtain:
            label += "／💎商城"
        return label
    if stype == "Dungeons":   # obtain 常是 {{i|副本名}} → 帶上副本名
        ev = next((x for x in obtain if _obtain_name(x)), "")
        return f"🗡️副本掉落：{ev}" if ev else "🗡️副本掉落"
    label = WIKI_STYPE_LABEL.get(stype, "")
    if not label and "Veteran Rewards" in obtain:
        label = "💎老玩家獎勵（Veteran Rewards）"
    return label


_JOB_GROUPS_EN = {
    "tank": {"PLD", "WAR", "DRK", "GNB"},
    "healer": {"WHM", "SCH", "AST", "SGE"},
    "caster": {"BLM", "SMN", "RDM", "BLU", "PCT"},
    "pranged": {"BRD", "MCH", "DNC"},
    "melee": {"MNK", "DRG", "NIN", "SAM", "RPR", "VPR"},
    "crafter": {"CRP", "BSM", "ARM", "GSM", "LTW", "WVR", "ALC", "CUL",
                "MIN", "BTN", "FSH"},
}
_JOB_GROUP_ZH = {"tank": "盾衛職業", "healer": "治療職業", "caster": "法系職業",
                 "pranged": "遠程物理職業", "melee": "近戰職業", "crafter": "製作採集職業"}


def transform_sets():
    """official_sets.json → 前端精簡結構（st/職業 tag 建置期算好）。"""
    if not OFFICIAL_SETS_JSON.exists():
        return None
    data = json.loads(OFFICIAL_SETS_JSON.read_text(encoding="utf-8"))
    wiki_info = {}
    if SET_PHOTOS.exists():
        wiki_info = json.loads(SET_PHOTOS.read_text(encoding="utf-8"))
    out = []
    for s in data.get("sets", []):
        # 幻化套裝箱的取得方式：wiki source-type 對得出來就取代籠統的「🎁幻化套裝箱」
        source = s["source"]
        if s["layer"] == "mirage":
            lbl = wiki_source_label(wiki_info.get(s["id"]))
            if lbl:
                source = lbl
        codes = set((s.get("cjc_name") or "").split())
        tags = sorted(g for g, grp in _JOB_GROUPS_EN.items() if codes & grp)
        combat = {c for g in ("tank", "healer", "caster", "pranged", "melee")
                  for c in _JOB_GROUPS_EN[g]}
        cjc_raw = (s.get("cjc_name") or "").strip()
        if codes >= combat or cjc_raw.lower().startswith("all"):
            job_label = ALL_JOB   # 含 XIVAPI 的 "All Classes"
            tags = ["alljob"]  # 不掛六個職能 tag（每張卡會爆），改掛單一「全職業」
        elif len(tags) == 1:
            job_label = _JOB_GROUP_ZH[tags[0]]
        else:
            job_label = s.get("cjc_name") or ""
        out.append({
            "type": "set",
            "id": s["id"],
            "layer": s["layer"],
            "name_zh": s["name_zh"], "name_ja": s["name_ja"], "name_en": s["name_en"],
            "source": source,
            "st": st_from_source(source or ""),
            "patch": s["patch"],
            "job": job_label,
            "tags": tags,
            "tw": bool(s.get("zh_ok")),
            "pieces": [{k: p[k] for k in
                        ("id", "slot", "zh", "ja", "en", "dye", "mb", "icon",
                         "patch", "lv", "src")
                        if k in p and p[k] != ""}
                       for p in s["pieces"]],
        })
    return out


def attach_wiki_photos(sets):
    """官方套裝掛 consolegameswiki 模特照（fetch_set_photos.py 下載）——
    官方素體全身照，最能回答「整套長什麼樣」，優先於站內配裝照。
    圖檔不存在（例如換機器沒抓圖）就不掛，退回站內照/icon 網格。"""
    if not SET_PHOTOS.exists():
        return 0
    photos = json.loads(SET_PHOTOS.read_text(encoding="utf-8"))
    n = 0
    for s in sets:
        c = photos.get(s["id"])
        if not c or "img" not in c:
            continue
        if not (ROOT / c["img"]).exists():
            continue
        s["img"] = c["img"]
        s["imgSrc"] = "wiki"     # 前端據此顯示「官方外觀圖」而非「N 件吻合」
        if c.get("src") == "ge":
            s["imgFrom"] = "ge"  # Gamer Escape 逐件模型圖（上身單件示意）
        n += 1
    return n


def attach_set_photos(sets, curated, mirapri):
    """官方套裝掛「示意照」：站內精選/社群照片中，穿了該套 ≥2 件者取吻合最多的一張。
    只補 wiki 官方照沒涵蓋的套；冷門套沒人穿過 → 不掛，前端退回 icon 網格。"""
    name2sets = {}
    for i, s in enumerate(sets):
        for p in s["pieces"]:
            for nm in (p.get("zh"), p.get("ja")):
                if nm:
                    name2sets.setdefault(nm, set()).add(i)

    best = {}   # set idx -> ((吻合件數, 精選加權), img, label)

    def consider(pieces, img, label, curated_bonus):
        if not img:
            return
        cnt = {}
        for p in pieces:
            if not isinstance(p, dict):
                continue
            for nm in (p.get("zh"), p.get("ja"), p.get("name")):
                if nm and nm in name2sets:
                    for si in name2sets[nm]:
                        cnt[si] = cnt.get(si, 0) + 1
                    break   # 一件裝備只計一次
        for si, c in cnt.items():
            if c < 2:
                continue
            score = (c, curated_bonus)
            if si not in best or score > best[si][0]:
                best[si] = (score, img, label)

    for o in curated:
        consider(o.get("pieces", []), o.get("image"),
                 f"精選 #{o.get('id','')}「{o.get('name','')}」", 1)
    for m in mirapri:
        by = f" by {m['color']}" if m.get("color") else ""
        consider(m.get("equipments", []), m.get("image"),
                 f"社群配裝{by}", 0)

    n = 0
    for si, (score, img, label) in best.items():
        if sets[si].get("img"):   # wiki 官方照已掛 → 不覆蓋
            continue
        sets[si]["img"] = img
        sets[si]["imgN"] = score[0]
        sets[si]["imgLabel"] = label
        n += 1
    return n


def main():
    curated = normalize_curated(json.loads(CURATED_JSON.read_text(encoding="utf-8")))

    # 徽章（可染/拍賣板）：名稱精確對回道具 ID，蓋進每件裝備
    by_zh, by_ja, by_en = build_badge_index()
    if by_zh or by_ja:
        n_cur = sum(stamp_badges(p, by_zh, by_ja, by_en)
                    for o in curated for p in o.get("pieces", []))
        n_tot = sum(len(o.get("pieces", [])) for o in curated)
        print(f"  徽章蓋章（精選）：{n_cur}/{n_tot} 件")

    dyemap = {}
    if MIRAPRI_DYES.exists():
        dyemap = json.loads(MIRAPRI_DYES.read_text(encoding="utf-8"))
    piecemap = {}
    if MIRAPRI_PIECE_DYES.exists():
        piecemap = json.loads(MIRAPRI_PIECE_DYES.read_text(encoding="utf-8"))
    vismap = {}
    if MIRAPRI_VISIBLE.exists():
        vismap = json.loads(MIRAPRI_VISIBLE.read_text(encoding="utf-8"))
    reconmap = {}
    if MIRAPRI_RECON.exists():
        reconmap = json.loads(MIRAPRI_RECON.read_text(encoding="utf-8"))

    # review.html 人工決定：先讀一次，分出 remove（不顯示）與 force_recon（人眼件數>清單→依圖重建）。
    removed, force_recon, rem_name = set(), set(), {}
    for p in REVIEW_DECISIONS_PATHS:
        if p.exists():
            for d in json.loads(p.read_text(encoding="utf-8")).get("decisions", []):
                if d.get("action") == "remove":
                    removed.add(d["id"]); rem_name[d["id"]] = d.get("name", "")
                if d.get("action") == "claude":
                    force_recon.add(d["id"])  # Claude 親讀＝權威，依圖重建取代原始清單
                ec, sh = d.get("eyeCount"), d.get("shown")
                if ec is not None and sh is not None and ec > sh and sh < 4:
                    force_recon.add(d["id"])

    # 落地「決定帳本」：root review_decisions.json 每次匯出只含「當前佇列內」的套，被移出佇列者
    # （action==remove 或 eyeCount==shown 已確認）下次匯出就不含 → 不落地會「復活」。
    # 故把 root 全部決定 merge 進 data/ 帳本（同 id 以最新為準），移除與確認才能跨匯出持久。
    data_led = ROOT / "data" / "review_decisions.json"
    led = json.loads(data_led.read_text(encoding="utf-8")) if data_led.exists() else {"decisions": []}
    by_id = {d["id"]: d for d in led.get("decisions", []) if d.get("id")}
    root_led = ROOT / "review_decisions.json"
    if root_led.exists():
        for d in json.loads(root_led.read_text(encoding="utf-8")).get("decisions", []):
            if d.get("id"):
                by_id[d["id"]] = d
    merged = sorted(by_id.values(), key=lambda d: d["id"])
    new_txt = json.dumps({"_note": "決定帳本：累積所有 review.html 決定（同 id 取最新）。"
                          "root 檔每次匯出只含當前佇列，移除/確認須落地此處才不復活。",
                          "decisions": merged}, ensure_ascii=False, indent=1)
    if (not data_led.exists()) or data_led.read_text(encoding="utf-8") != new_txt:
        data_led.write_text(new_txt, encoding="utf-8")
        print(f"  決定帳本累積：{len(merged)} 筆 → data/review_decisions.json")

    enriched = json.loads(ENRICHED_PATH.read_text(encoding="utf-8"))
    arr = enriched if isinstance(enriched, list) else enriched.get("outfits", [])

    # src==claude 的圖 → 該套以 Claude 視覺讀取為權威，一律 force_recon（修剪過多/補漏）。
    cache = json.loads((ROOT / "data" / "ocr_cache.json").read_text(encoding="utf-8"))
    claude_bn = {k.replace("\\", "/").split("/")[-1] for k, v in cache.items()
                 if isinstance(v, dict) and v.get("src") == "claude"}
    for o in arr:
        if o.get("type") == "mirapri" and (o.get("image") or "").replace("\\", "/").split("/")[-1] in claude_bn:
            force_recon.add(o["id"])

    mirapri = [transform_mirapri(o, dyemap, vismap, piecemap, reconmap, force_recon) for o in arr if o.get("type") == "mirapri"]
    if by_zh or by_ja:
        n_hit = n_all = 0
        for m in mirapri:
            for eq in m.get("equipments", []):
                if isinstance(eq, dict):
                    n_all += 1
                    n_hit += stamp_badges(eq, by_zh, by_ja, by_en)
        print(f"  徽章蓋章（社群）：{n_hit}/{n_all} 件")
    if reconmap:
        print(f"  空殼重建合併：{sum(1 for m in mirapri if m.get('id') in reconmap)} 套")

    # 套用 action=="remove"：不顯示（其餘決定不影響網站）。
    if removed:
        before = len(mirapri)
        mirapri = [m for m in mirapri if m.get("id") not in removed]
        print(f"  依人工決定移除（不顯示）：{before - len(mirapri)} 套")

    n_piece = sum(1 for m in mirapri if m.get("hasPieceDyes"))
    print(f"  逐件染色（v2）套數：{n_piece}")

    CURATED_JS.write_text(
        "const _CURATED_RAW = " + json.dumps(curated, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    MIRAPRI_JS.write_text(
        "const _MIRAPRI_RAW = " + json.dumps(mirapri, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print(f"curated_outfits.js: {len(curated)} outfits ({CURATED_JS.stat().st_size//1024} KB)")
    print(f"mirapri_outfits.js: {len(mirapri)} outfits ({MIRAPRI_JS.stat().st_size//1024//1024} MB)")

    sets = transform_sets()
    if sets is not None:
        n_wiki = attach_wiki_photos(sets)
        n_photo = attach_set_photos(sets, curated, mirapri)
        print(f"  官方套裝示意照：wiki 官方照 {n_wiki} 套＋站內配裝照 {n_photo} 套"
              f" / 共 {len(sets)} 套")
        OFFICIAL_SETS_JS.write_text(
            "const _SETS_RAW = " + json.dumps(sets, ensure_ascii=False) + ";\n",
            encoding="utf-8")
        print(f"official_sets.js: {len(sets)} sets ({OFFICIAL_SETS_JS.stat().st_size//1024} KB)")
    else:
        print("official_sets.js: 略過（data/official_sets.json 不存在，先跑 build_sets.py）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
