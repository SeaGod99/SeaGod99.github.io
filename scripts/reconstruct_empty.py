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
JA2ZH = os.path.join(oc.DATA, "dye_ja_to_zh.json")
MIN_SIM = 0.90


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

    recon, rows = {}, []
    n_pieces = n_lowconf = n_nonequip = n_noresolve = n_src = 0
    for rel, rec in cache.items():
        o = bn2o.get(os.path.basename(str(rel).replace("\\", "/")))
        if not o:
            continue
        if any(e.get("name") for e in o.get("equipments", [])):
            continue  # 非空殼，跳過
        equips, skipped = [], []
        for cp in oc.clean_pieces(rec.get("pieces", []), dye_names):
            hit = resolve(cp["item"])
            if not hit:
                skipped.append((cp["item"], "無解")); n_noresolve += 1; continue
            if not hit["exact"] and hit["score"] < MIN_SIM:
                skipped.append((cp["item"], f"低信心{hit['score']}")); n_lowconf += 1; continue
            if not db.id_to_equip.get(hit["id"], False):
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

    oc._save_json(OUT, recon)
    _write_report(rows, len(recon), n_pieces, n_lowconf, n_nonequip, n_noresolve, n_src)
    pct = 100 * n_src // n_pieces if n_pieces else 0
    print(f"重建 {len(recon)} 套空殼｜共 {n_pieces} 件"
          f"（跳過 低信心{n_lowconf}／非裝備{n_nonequip}／無解{n_noresolve}）")
    print(f"  取得方式：{n_src}/{n_pieces}（{pct}%）已標來源＋版本（patch）")
    print(f"  → {os.path.relpath(OUT, oc.ROOT)} / {os.path.relpath(REPORT, oc.ROOT)}")
    print("  build_site.py 會對空殼套合併這份；側邊檔刪掉即還原。")


def _write_report(rows, n_outfit, n_pieces, lc, ne, nr, n_src=0):
    pct = 100 * n_src // n_pieces if n_pieces else 0
    L = ["# 空殼套裝重建報告", ""]
    L.append(f"- 產生：{datetime.now().strftime('%Y-%m-%d %H:%M')}")
    L.append(f"- **重建 {n_outfit} 套、共 {n_pieces} 件**　跳過：低信心 {lc}／非裝備 {ne}／無解 {nr}")
    L.append("- 只收「精確或相似≥0.9 且確實可裝備」的件；部位由 categoryName 推導。")
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
