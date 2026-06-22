#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_dyes.py —— 把 OCR 結果整理回資料（① 逐件染色　② 圖上實際可見的裝備）。

流程
----
  data/ocr_cache.json（累積所有 OCR 過的圖，原始結果）
    → 清理 + 官方染色白名單校正（沿用 ocr_check 的 clean_*）
    → ① 逐件染色（v2 有 pieces 才有）：把每件 OCR 染色對到該套記錄裝備
         → data/mirapri_piece_dyes.json   {oid: {裝備日文名: [繁中染色]}}
    → ② 整套染色（fallback，v1/v2 都產）：整套染色清單
         → data/mirapri_dyes.json          {oid: [繁中染色]}
    → ③ 圖上實際畫出來的裝備（= OCR 有讀到的）
         → data/mirapri_visible.json        {oid: [裝備日文名]}

build_site.py 會用這三份：
  - mirapri_piece_dyes.json → 彈窗逐件顯示 dye1/dye2（優先）
  - mirapri_dyes.json       → 沒有逐件資料時的整套染色 fallback（尚未重跑 v2 的套）
  - mirapri_visible.json    → 過濾掉「圖上沒畫」的替代裝備，讓清單與圖片一致

用法（讀快取，不需 Ollama）：
  py scripts\\apply_dyes.py
  py scripts\\build_site.py     # 重建，再重新整理頁面
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_check as oc  # 沿用同資料夾的 clean_ocr / clean_pieces / best_match / 路徑 / IO

JA2ZH = os.path.join(oc.DATA, "dye_ja_to_zh.json")
DYE_OUT = os.path.join(oc.DATA, "mirapri_dyes.json")            # 整套染色（fallback）
PIECE_OUT = os.path.join(oc.DATA, "mirapri_piece_dyes.json")   # 逐件染色（v2）
VIS_OUT = os.path.join(oc.DATA, "mirapri_visible.json")


def _zh(dyes, ja2zh):
    """日文官方染色名 → 繁中名（查無對照則原樣保留），去重。"""
    return list(dict.fromkeys(ja2zh.get(d, d) for d in dyes))


def main():
    cache = oc.load_json(oc.CACHE_JSON, {})
    if not cache:
        print("⚠ data/ocr_cache.json 是空的，先跑 ocr_check.py 產生 OCR 結果。")
        return
    dye_names = oc.load_dye_whitelist()
    ja2zh = oc.load_json(JA2ZH, {})
    if not ja2zh:
        print("⚠ 找不到 data/dye_ja_to_zh.json，染色會以日文名輸出。")

    # 圖檔名 → 該套 outfit（mirapri）
    outfit_by_bn = {}
    for o in oc.load_json(oc.ENRICHED_JSON, []):
        bn = os.path.basename((o.get("image") or "").replace("\\", "/"))
        if bn:
            outfit_by_bn[bn] = o

    dyes_map, piece_map, vis_map = {}, {}, {}
    n_v2 = 0
    for rel, rec in cache.items():
        bn = os.path.basename(str(rel).replace("\\", "/"))
        o = outfit_by_bn.get(bn)
        if not o:
            continue
        oid = o.get("id")
        equip_names = [p.get("name", "") for p in o.get("equipments", []) if p.get("name")]
        pieces = rec.get("pieces")

        if pieces:  # ---- v2 逐件路徑 ----
            n_v2 += 1
            cleaned = oc.clean_pieces(pieces, dye_names)
            per_piece, visible, all_dyes = {}, [], []
            for cp in cleaned:
                idx, score = oc.best_match(cp["item"], equip_names)
                if idx < 0 or score < oc.MATCH_THRESHOLD:
                    continue  # 對不到記錄裝備：染色錨點不可靠，不掛（留給 Phase 3 解析器）
                ename = equip_names[idx]
                visible.append(ename)
                if cp["dyes"]:
                    zh = _zh(cp["dyes"], ja2zh)
                    all_dyes.extend(zh)
                    cur = per_piece.setdefault(ename, [])
                    for z in zh:
                        if z not in cur:
                            cur.append(z)
            if per_piece:
                piece_map[oid] = per_piece
            if all_dyes:
                dyes_map[oid] = list(dict.fromkeys(all_dyes))  # 整套 fallback
            if visible:
                vis_map[oid] = list(dict.fromkeys(visible))
        else:       # ---- v1 舊扁平回退：只給整套染色 + visible ----
            items, dyes = oc.clean_ocr(rec.get("items", []), rec.get("dyes", []), dye_names)
            zh = _zh(dyes, ja2zh)
            if zh:
                dyes_map[oid] = zh
            if items:
                visible = []
                for name in equip_names:
                    _, score = oc.best_match(name, items)
                    if score >= oc.MATCH_THRESHOLD:
                        visible.append(name)
                if visible:
                    vis_map[oid] = list(dict.fromkeys(visible))

    oc._save_json(DYE_OUT, dyes_map)
    oc._save_json(PIECE_OUT, piece_map)
    oc._save_json(VIS_OUT, vis_map)
    print(f"逐件染色（v2）：{len(piece_map)} 套 → {os.path.relpath(PIECE_OUT, oc.ROOT)}")
    print(f"整套染色 fallback：{len(dyes_map)} 套 → {os.path.relpath(DYE_OUT, oc.ROOT)}")
    print(f"可見裝備清單：{len(vis_map)} 套 → {os.path.relpath(VIS_OUT, oc.ROOT)}")
    print(f"（快取中 v2 逐件圖：{n_v2} 張）")


if __name__ == "__main__":
    main()
