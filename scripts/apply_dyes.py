#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_dyes.py —— 把 OCR 結果整理回資料（① 染色　② 圖上實際可見的裝備）。

流程
----
  data/ocr_cache.json（累積所有 OCR 過的圖，原始結果）
    → 清理 + 官方染色白名單校正（沿用 ocr_check.clean_ocr）
    → ① 日文官方染色名 → 繁中名（data/dye_ja_to_zh.json）→ data/mirapri_dyes.json
    → ② 把每套「OCR 有讀到（= 圖上實際畫出來）」的裝備名挑出來 → data/mirapri_visible.json

build_site.py 會用這兩份：
  - mirapri_dyes.json   → 彈窗顯示「使用染色」
  - mirapri_visible.json → 過濾掉「圖上沒畫」的替代裝備，讓清單與圖片一致
（Mirapri 投稿常含替代裝備，導致清單比圖片多；用 OCR 判斷實際穿了哪些。）

用法（讀快取，不需 Ollama）：
  py scripts\\apply_dyes.py
  py scripts\\build_site.py     # 重建，再重新整理頁面
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_check as oc  # 沿用同資料夾的 clean_ocr / best_match / 路徑 / IO

JA2ZH = os.path.join(oc.DATA, "dye_ja_to_zh.json")
DYE_OUT = os.path.join(oc.DATA, "mirapri_dyes.json")
VIS_OUT = os.path.join(oc.DATA, "mirapri_visible.json")


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

    dyes_map, vis_map = {}, {}
    for rel, rec in cache.items():
        bn = os.path.basename(str(rel).replace("\\", "/"))
        o = outfit_by_bn.get(bn)
        if not o:
            continue
        oid = o.get("id")
        items, dyes = oc.clean_ocr(rec.get("items", []), rec.get("dyes", []), dye_names)

        # ① 染色（繁中）
        zh = list(dict.fromkeys(ja2zh.get(d, d) for d in dyes))
        if zh:
            dyes_map[oid] = zh

        # ② 可見裝備：資料裡有名字、且 OCR 有讀到（相似度過門檻）的才算「圖上實際穿了」
        if items:
            visible = []
            for p in o.get("equipments", []):
                name = p.get("name", "")
                if not name:
                    continue
                _, score = oc.best_match(name, items)
                if score >= oc.MATCH_THRESHOLD:
                    visible.append(name)
            visible = list(dict.fromkeys(visible))
            if visible:
                vis_map[oid] = visible

    oc._save_json(DYE_OUT, dyes_map)
    oc._save_json(VIS_OUT, vis_map)
    print(f"寫入 {len(dyes_map)} 套染色 → {os.path.relpath(DYE_OUT, oc.ROOT)}")
    print(f"寫入 {len(vis_map)} 套可見裝備清單 → {os.path.relpath(VIS_OUT, oc.ROOT)}")


if __name__ == "__main__":
    main()
