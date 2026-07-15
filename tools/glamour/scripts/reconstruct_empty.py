#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
reconstruct_empty.py —— 用 OCR + 資料庫重建「空殼套裝」的裝備清單。

很多 mirapri 投稿在 enriched 來源是 0 件（pipeline 當初沒抓到），
但 OCR 早就把圖上的裝備讀出來了。這支把那些空殼套的 OCR pieces
解析到資料庫正式道具（部位／繁中名／逐件染色），寫成側邊檔給 build_site 合併。

只收「精確 or 相似≥MIN_SIM」且「該道具確實可裝備（有 equipStats）」的件，
濾掉低信心與非裝備誤判。部位由 categoryName 推導。

輸出：
  data/mirapri_reconstructed.json  {oid: [equip,...]}（build_site 對空殼套合併）
  data/重建報告.md                  每套填了什麼 + 跳過了什麼
  data/OCR無解清單.md               無解件彙整（附套裝 id/圖）→ 待 Claude 視覺複查補 aliases

用法：py scripts\\reconstruct_empty.py
"""
import json
import os
import sys
from collections import Counter
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_check as oc
import pipeline as pl  # 取得方式／版本解析（與 mirapri enrich 同一套邏輯，DRY）
from itemdb import ItemDB

OUT = os.path.join(oc.DATA, "mirapri_reconstructed.json")
REPORT = os.path.join(oc.DATA, "重建報告.md")
NORESOLVE = os.path.join(oc.DATA, "OCR無解清單.md")  # 無解件彙整（附套裝/圖）→ 待 Claude 視覺複查
JA2ZH = os.path.join(oc.DATA, "dye_ja_to_zh.json")
OVERRIDE = os.path.join(oc.DATA, "mirapri_recon_override.json")  # 人眼判讀的部位＋日文名＋染色（7.x DB 未收錄者）
FALLBACK = os.path.join(oc.DATA, "item_fallback_multilang.json")  # 多語系備選庫（build_item_fallback.py 產）：7.x 件補部位/patch
# 與 itemdb/resolve_ocr/ocr_check 一致的 0.82（重建原本獨自用 0.90，是系統內門檻不一致的源頭）。
# 抽 30 筆 0.82~0.90 band 人工驗證全對（FF14 名稱獨特、OCR 多為小字元滑誤），
# 加上既有 equipStats 閘（必為可裝備）後，0.82 安全且多救回 ~231 件正確裝備。
MIN_SIM = 0.82


def load_force_ids():
    """讀 review.html 匯出的 review_decisions.json（根目錄與 data/ 都看），
    回傳「人眼件數 > 現有清單件數」的 outfit id 集合 → 這些套要強制依圖重建。"""
    ids = set()
    for p in (os.path.join(oc.ROOT, "review_decisions.json"),
              os.path.join(oc.DATA, "review_decisions.json")):
        if not os.path.exists(p):
            continue
        for d in oc.load_json(p, {}).get("decisions", []):
            # action==claude：已由 Claude 視覺親自判讀（cache 為權威），一律依圖重建、取代原始清單。
            # 對 toomany（投稿者列了替代款）尤其重要——visible 過濾常因名稱對不上而修剪失敗。
            if d.get("action") == "claude":
                ids.add(d["id"]); continue
            ec, sh = d.get("eyeCount"), d.get("shown")
            # 只對「稀疏套」(現顯示 <4 件) 強制依圖重建——這類原始清單太少、取代為重建是淨賺。
            # shown>=4 的套清單已足，避免用 OCR 重建蓋掉好資料（漏 1~2 件屬可接受）。
            if ec is not None and sh is not None and ec > sh and sh < 4:
                ids.add(d["id"])
    return ids


def cat_to_slot(cat):
    """categoryName → 部位。對不到（非裝備類）回 None。"""
    if not cat:
        return None
    if "防具" in cat:
        if "頭" in cat:
            return "頭部"
        if "胴" in cat or "身" in cat:
            return "上身"
        if "手" in cat:
            return "手部"
        if "腿" in cat:
            return "腿部"
        if "脚" in cat or "腳" in cat:
            return "腳部"
        return "防具"
    if "耳" in cat:
        return "耳飾"
    if "首飾" in cat or "項" in cat or "頸" in cat:
        return "項鍊"
    if "腕" in cat or "鐲" in cat:
        return "手鐲"
    if "指" in cat or "戒" in cat:
        return "戒指"
    if "盾" in cat:
        return "盾"
    return "武器"  # 其餘可裝備（已 equipStats 過濾）= 武器／工具


def enrich_meta(iid, pdb):
    """item id → (patch, lv, job, source, st)，沿用 pipeline 的 enrich 邏輯。
    取得方式先查 sources.json，補不到再查 obtainable-methods，最後啟發式（舊化的→幻洋奇境）。"""
    items = pdb["items"]
    item = items.get(iid, {})
    patch = item.get("patch", "")
    lvv = item.get("equipLevel", "")
    lv = str(lvv) if lvv and lvv != 1 else ""          # 同 step_b2：Lv.1 視為無等級限制
    job_str = item.get("equipStats", {}).get("classJobCategoryName", "")
    job = pl._job_label(job_str) if job_str else "全職業"
    src, st = pl._resolve_from_sources(iid, items, pdb["sources"], pdb["recipes_json"])
    if not src:
        src, st = pl._resolve_from_om(iid, items, pdb["om"], pdb["tw_npcs"],
                                      pdb["tw_places"], pdb["tw_quests"], pdb["recipe_by_id"])
    return patch, lv, job, src, (st or "other")


def main():
    db = ItemDB()
    pdb = pl.load_all_data()  # items/sources/om/recipes…（取得方式解析用）
    dye_names = oc.load_dye_whitelist()
    ja2zh = oc.load_json(JA2ZH, {})
    cache = oc.load_json(oc.CACHE_JSON, {})

    bn2o = {}
    for o in oc.load_json(oc.ENRICHED_JSON, []):
        if o.get("type") != "mirapri":
            continue
        bn = os.path.basename((o.get("image") or "").replace("\\", "/"))
        if bn:
            bn2o[bn] = o

    memo = {}
    def resolve(s):
        if s not in memo:
            memo[s] = db.resolve(s)
        return memo[s]

    # review.html 匯出的人工決定：填了人眼件數且 > 現有清單件數 → 投稿者漏標，
    # 強制改用「依圖重建」（即使 enriched 已有少數件）。eyeCount==shown 視為「確認無誤」不重建。
    force_ids = load_force_ids()

    recon, rows = {}, []
    noresolve_rows = []  # [(outfit, [無解名,...])]，含整套全滅、沒進 rows 的
    n_pieces = n_lowconf = n_nonequip = n_noresolve = n_src = n_dye = 0

    # ── 人眼 override：部位由人工確認，故跳過「可裝備/部位推導」閘，保留每一件（含 7.x 未收錄者）。
    # 日文名仍向 DB 解析繁中/取得方式（缺則留空＝繁中未實裝）；染色走官方白名單清洗。
    id2o = {o["id"]: o for o in oc.load_json(oc.ENRICHED_JSON, []) if o.get("type") == "mirapri"}
    override = oc.load_json(OVERRIDE, {})
    fb_data = oc.load_json(FALLBACK, {}).get("items", {})  # 7.x 備選：繁中 DB 未收錄時的部位/patch
    ov_done = set()
    n_override = n_fallback = 0
    for oid, ovp in override.items():
        if oid.startswith("_"):
            continue  # _README 等註解鍵
        o = id2o.get(oid)
        if not o:
            continue
        cps = oc.clean_pieces([{"item": p["item"], "dyes": p.get("dyes", [])} for p in ovp], dye_names)
        equips = []
        for src_p, cp in zip(ovp, cps):
            slot = src_p.get("slot", "")
            hit = resolve(cp["item"])
            zhd = list(dict.fromkeys(ja2zh.get(d, d) for d in cp["dyes"]))
            if hit:
                patch, lv, job, source, st = enrich_meta(hit["id"], pdb)
                name, zh = hit["ja"] or cp["item"], hit["zh"]
                fb = fb_data.get(str(hit["id"]), {})
                if not patch:
                    patch = fb.get("patch", "")  # 7.x：繁中 DB 無 patch，取備選庫
                if not lv and fb.get("equipLevel"):
                    lv = str(fb["equipLevel"])
            else:
                patch, lv, job, source, st = "", "", "全職業", "", "other"
                name, zh = cp["item"], ""
            if source:
                n_src += 1
            equips.append({
                "name": name, "zh": zh, "slot": slot,
                "patch": patch, "lv": lv, "job": job, "source": source, "st": st,
                "dye1": zhd[0] if len(zhd) >= 1 else "—",
                "dye2": zhd[1] if len(zhd) >= 2 else "—",
                "recon": True,
            })
        if equips:
            recon[oid] = equips
            ov_done.add(oid)
            n_pieces += len(equips)
            n_override += 1
            rows.append((o, equips, []))
    for rel, rec in cache.items():
        o = bn2o.get(os.path.basename(str(rel).replace("\\", "/")))
        if not o:
            continue
        if o["id"] in ov_done:
            continue  # 已由人眼 override 處理
        # src==claude：該圖經 Claude 視覺親讀，一律重建（claude 為權威，用於修剪過多/補漏）。
        if (any(e.get("name") for e in o.get("equipments", []))
                and o["id"] not in force_ids and rec.get("src") != "claude"):
            continue  # 非空殼、未標漏件、也非 claude 讀取 → 跳過
        equips, skipped = [], []
        for cp in oc.clean_pieces(rec.get("pieces", []), dye_names):
            hit = resolve(cp["item"])
            if not hit or (not hit["exact"] and hit["score"] < MIN_SIM):
                # 解析失敗才驗染色：OCR 常把染色名放進裝備欄（佔位／看錯行），
                # 整名能校回官方染色（snap_dye 含錯字修正）＝染色誤植，不算無解
                if oc.snap_dye(cp["item"], dye_names):
                    skipped.append((cp["item"], "染色誤植")); n_dye += 1; continue
                if not hit:
                    skipped.append((cp["item"], "無解")); n_noresolve += 1; continue
                skipped.append((cp["item"], f"低信心{hit['score']}")); n_lowconf += 1; continue
            if not db.id_to_equip.get(hit["id"], False):
                # 繁中 DB 未收錄（多為 7.x）→ 查多語系備選庫；庫裡是裝備就採用其部位/patch，否則才丟。
                fb = fb_data.get(str(hit["id"]))
                if fb and fb.get("slot"):
                    zhd = list(dict.fromkeys(ja2zh.get(d, d) for d in cp["dyes"]))
                    equips.append({
                        "name": hit["ja"], "zh": hit["zh"], "slot": fb["slot"],
                        "patch": fb.get("patch", ""),
                        "lv": str(fb["equipLevel"]) if fb.get("equipLevel") else "",
                        "job": "全職業", "source": "", "st": "other",
                        "dye1": zhd[0] if len(zhd) >= 1 else "—",
                        "dye2": zhd[1] if len(zhd) >= 2 else "—",
                        "recon": True,
                    })
                    n_fallback += 1
                    continue
                skipped.append((cp["item"], "非裝備")); n_nonequip += 1; continue
            zhd = list(dict.fromkeys(ja2zh.get(d, d) for d in cp["dyes"]))
            patch, lv, job, src, st = enrich_meta(hit["id"], pdb)
            if src:
                n_src += 1
            equips.append({
                "name": hit["ja"], "zh": hit["zh"], "slot": cat_to_slot(db.id_to_cat.get(hit["id"], "")) or "",
                "patch": patch, "lv": lv, "job": job, "source": src, "st": st,
                "dye1": zhd[0] if len(zhd) >= 1 else "—",
                "dye2": zhd[1] if len(zhd) >= 2 else "—",
                "recon": True,
            })
        if equips:
            recon[o["id"]] = equips
            n_pieces += len(equips)
            rows.append((o, equips, skipped))
        bad = [n for n, r in skipped if r == "無解"]
        if bad:
            noresolve_rows.append((o, bad))

    oc._save_json(OUT, recon)
    _write_noresolve(noresolve_rows)
    _write_report(rows, len(recon), n_pieces, n_lowconf, n_nonequip, n_noresolve, n_src, n_dye)
    pct = 100 * n_src // n_pieces if n_pieces else 0
    print(f"重建 {len(recon)} 套空殼｜共 {n_pieces} 件"
          f"（跳過 低信心{n_lowconf}／非裝備{n_nonequip}／無解{n_noresolve}／染色誤植{n_dye}）")
    print(f"  其中人眼 override：{n_override} 套（部位人工確認、保留 7.x 未收錄件）")
    print(f"  7.x 備選庫救回：{n_fallback} 件（繁中 DB 未收錄、改用 fallback 部位/patch）")
    print(f"  取得方式：{n_src}/{n_pieces}（{pct}%）已標來源＋版本（patch）")
    print(f"  → {os.path.relpath(OUT, oc.ROOT)} / {os.path.relpath(REPORT, oc.ROOT)}"
          f" / {os.path.relpath(NORESOLVE, oc.ROOT)}")
    print("  build_site.py 會對空殼套合併這份；側邊檔刪掉即還原。")


def _write_noresolve(noresolve_rows):
    """無解件彙整 → data/OCR無解清單.md：本機 DB＋7.x 備選庫都對不到的 OCR 名。
    多為 Ollama 亂碼／幻覺；待 Claude 視覺看圖確認正名後補進 ocr_aliases／recon_override。"""
    n = sum(len(b) for _, b in noresolve_rows)
    L = ["# OCR 無解清單（待 Claude 視覺複查）", "",
         "重建時「無解」跳過的裝備名（本機 DB＋7.x 備選庫都對不到）。",
         "多為 Ollama OCR 亂碼／幻覺；請 Claude 看圖確認正確裝備名後，寫入 ocr_aliases 或 recon_override。",
         "描述性幻覺（如「パンツ」「猫耳」）看圖後若圖上根本沒有名稱標籤，直接忽略即可。",
         f"共 {n} 件。", ""]
    for o, bad in noresolve_rows:
        img = o.get("image", "")
        L.append(f"- `{o.get('id','')}` {o.get('title','')}　→ " + "、".join(bad)
                 + (f"　（{img}）" if img else ""))
    with open(NORESOLVE, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def _write_report(rows, n_outfit, n_pieces, lc, ne, nr, n_src=0, nd=0):
    pct = 100 * n_src // n_pieces if n_pieces else 0
    L = ["# 空殼套裝重建報告", ""]
    L.append(f"- 產生：{datetime.now().strftime('%Y-%m-%d %H:%M')}")
    L.append(f"- **重建 {n_outfit} 套、共 {n_pieces} 件**　跳過：低信心 {lc}／非裝備 {ne}／無解 {nr}／染色誤植 {nd}")
    L.append("- 只收「精確或相似≥0.82 且確實可裝備」的件；部位由 categoryName 推導。")
    L.append(f"- 取得方式／版本／職業／等級已由資料庫補上（與 mirapri enrich 同邏輯）；"
             f"**有來源 {n_src}/{n_pieces}（{pct}%）**。染色取自 OCR 逐件。")
    L.append("")
    slots = Counter(e["slot"] for _, eqs, _ in rows for e in eqs)
    L.append("部位分布：" + "　".join(f"{s or '?'}×{n}" for s, n in slots.most_common()))
    L.append("")
    for o, eqs, skipped in rows:
        L.append(f"### {o.get('title','')}　`{o.get('id','')}`（{len(eqs)} 件）")
        for e in eqs:
            d = "／".join(x for x in [e["dye1"], e["dye2"]] if x and x != "—")
            meta = "　".join(x for x in [
                (f"v{e['patch']}" if e.get("patch") else ""),
                (e["source"] if e.get("source") else "（無來源）"),
            ] if x)
            L.append(f"- [{e['slot'] or '?'}] {e['zh'] or '（無繁中）'}　{e['name']}"
                     + (f"　染:{d}" if d else "") + (f"　<sub>{meta}</sub>" if meta else ""))
        if skipped:
            L.append("  <sub>跳過：" + "、".join(f"{n}({r})" for n, r in skipped) + "</sub>")
        L.append("")
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


if __name__ == "__main__":
    main()
