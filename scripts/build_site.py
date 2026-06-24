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

ROOT = Path(__file__).parent.parent
CURATED_JSON = ROOT / "data" / "curated_outfits.json"
ENRICHED_PATH = ROOT / "data" / "all_outfits_enriched.json"
CURATED_JS = ROOT / "curated_outfits.js"
MIRAPRI_JS = ROOT / "mirapri_outfits.js"
MIRAPRI_DYES = ROOT / "data" / "mirapri_dyes.json"     # apply_dyes.py 產生：{id: [繁中染色]}（整套 fallback）
MIRAPRI_PIECE_DYES = ROOT / "data" / "mirapri_piece_dyes.json"  # {id: {裝備日文名: [繁中染色]}}（v2 逐件）
MIRAPRI_VISIBLE = ROOT / "data" / "mirapri_visible.json"  # apply_dyes.py 產生：{id: [圖上可見裝備日文名]}
# review.html 匯出：action=="remove" 的套不顯示。
# 兩個位置都讀並取聯集——使用者常把瀏覽器下載的匯出檔直接丟在專案根目錄，
# 也可能放進 data/；兩邊的 remove 一律累積（移除過的不會因換檔復活）。
REVIEW_DECISIONS_PATHS = [ROOT / "review_decisions.json", ROOT / "data" / "review_decisions.json"]
MIRAPRI_RECON = ROOT / "data" / "mirapri_reconstructed.json"  # reconstruct_empty.py：空殼套用 OCR+DB 重建的裝備
VIS_FLOOR = 4  # vismap 過濾後若 <此件數，視為 OCR 漏讀 → 改保留完整清單（一般幻化至少 4~5 件）

# 取得方式 emoji → st 標籤（取 source 字串中第一個出現的 emoji）
EMOJI_ST = [
    ("🗡️", "raid"), ("🗡", "raid"),
    ("🔶", "scrip"), ("🟣", "scrip"),
    ("🛒", "npc"), ("📋", "npc"),
    ("🔨", "craft"),
    ("🎲", "gs"),
    ("⚔️", "pvp"), ("⚔", "pvp"),
    ("💎", "store"),
    ("🗓️", "event"), ("🗓", "event"),
    ("💒", "ceremony"),
    ("🪙", "other"),
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
ST_TAGS = {"event", "pvp", "store", "raid"}  # 會放上卡片的取得方式 tag

PIECE_DEFAULTS = {
    "slot": "", "zh": "", "en": "", "ja": "", "dye1": "—", "dye2": "—",
    "source": "—", "st": "other", "lv": "1", "job": "全職業",
    "gender": "", "race": "", "patch": "",
}


def st_from_source(source: str) -> str:
    best = None
    for emoji, st in EMOJI_ST:
        idx = source.find(emoji)
        if idx >= 0 and (best is None or idx < best[0]):
            best = (idx, st)
    return best[1] if best else "other"


def tags_from_pieces(pieces):
    tags = set()
    for p in pieces:
        job = p.get("job", "")
        for tag, jobs in JOB_TAGS.items():
            if any(j in job for j in jobs):
                tags.add(tag)
        if p.get("st") in ST_TAGS:
            tags.add(p["st"])
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


def transform_mirapri(o, dyemap=None, vismap=None, piecemap=None, reconmap=None):
    img = o.get("image") or o.get("img") or ""
    fname = img.split("/")[-1] if img else ""
    oid = o.get("id", "")

    equips = o.get("equipments", [])
    # 空殼套（來源 0 件）若有 OCR+DB 重建清單，改用重建的（已含部位/繁中/逐件染色）
    recon_used = False
    if not any(e.get("name") for e in equips):
        rc = (reconmap or {}).get(oid)
        if rc:
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


def main():
    curated = normalize_curated(json.loads(CURATED_JSON.read_text(encoding="utf-8")))

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

    enriched = json.loads(ENRICHED_PATH.read_text(encoding="utf-8"))
    arr = enriched if isinstance(enriched, list) else enriched.get("outfits", [])
    mirapri = [transform_mirapri(o, dyemap, vismap, piecemap, reconmap) for o in arr if o.get("type") == "mirapri"]
    if reconmap:
        print(f"  空殼重建合併：{sum(1 for m in mirapri if m.get('id') in reconmap)} 套")

    # 套用 review.html 的人工決定：action=="remove" 的套不顯示（其餘決定不影響網站）。
    # 根目錄與 data/ 兩處都讀，remove 取聯集。
    removed = set()
    for p in REVIEW_DECISIONS_PATHS:
        if p.exists():
            rj = json.loads(p.read_text(encoding="utf-8"))
            removed |= {d["id"] for d in rj.get("decisions", []) if d.get("action") == "remove"}
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
