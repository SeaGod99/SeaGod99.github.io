#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ab_resolution.py —— Phase 4：在「OCR 驗證失敗集」上 A/B 不同解析度（與模型），
決定全量重跑（步驟18）要用哪個 max_edge，並量化「低信心升級重讀」的增益。

做法：
  ① 撈失敗集：用現有快取重算 diff，挑出有 maybe_wrong（圖上應看到、OCR 卻對不上）的套。
  ② 對抽樣的失敗圖，分別用各 max_edge（與可選大模型）重新 OCR（不寫快取），
     重算 verify 命中，比較哪個解析度把失敗救回最多。
  ③ best-of：每張取各設定中最佳的 verify，模擬「升級重讀」的天花板增益。

只量測、不改任何資料；GPU 工作建議背景跑。

用法：
  py scripts\\ab_resolution.py --sample 40
  py scripts\\ab_resolution.py --sample 30 --edges 1280,1568,2048 --also-model qwen3.6:latest
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_check as oc


def _verify_from_cached(entry, dye_names):
    """用快取的 OCR 重算 diff，回傳 (verify, has_maybe_wrong)。"""
    ck = entry["rel_image"]
    cache = entry["_cache"]
    rec = cache.get(ck)
    if not rec:
        return None, False
    items, dyes = oc.clean_ocr(rec.get("items", []), rec.get("dyes", []), dye_names)
    d = oc.diff_one(entry, items, dyes)
    mw = [m for m in d["missing_in_ocr"] if m["likely"] == "maybe_wrong"]
    return d["verify"], bool(mw)


def _verify_reocr(entry, dye_names, max_edge, model=None):
    """以指定解析度/模型重新 OCR（不寫快取），回傳 verify dict 或 None。"""
    try:
        raw_items, raw_dyes, _ = oc.ocr_ollama(entry["image"], max_edge=max_edge, model=model)
    except Exception as ex:
        print(f"    X 失敗 {os.path.basename(entry['image'])}: {ex}")
        return None
    items, dyes = oc.clean_ocr(raw_items, raw_dyes, dye_names)
    return oc.diff_one(entry, items, dyes)["verify"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=40, help="抽幾張失敗圖")
    ap.add_argument("--edges", default="1280,1568,2048", help="逗號分隔的 max_edge 清單")
    ap.add_argument("--also-model", default="", help="另測一個模型（在最大解析度上）")
    args = ap.parse_args()
    edges = [int(x) for x in args.edges.split(",") if x.strip()]

    dye_names = oc.load_dye_whitelist()
    cache = oc.load_json(oc.CACHE_JSON, {})
    targets = oc.build_targets("mirapri", "all")
    for t in targets:
        t["_cache"] = cache

    # ① 失敗集
    failures = []
    for e in targets:
        v, mw = _verify_from_cached(e, dye_names)
        if v and mw and v["shown"] > 0:
            failures.append(e)
    print(f"失敗集（含 maybe_wrong）：{len(failures)} 套 / 全部 {len(targets)} 套")
    sample = failures[: args.sample]
    if not sample:
        print("沒有失敗樣本，結束。")
        return
    print(f"抽樣 {len(sample)} 套做 A/B；edges={edges} model={oc.MODEL}"
          + (f" +{args.also_model}" if args.also_model else ""))

    # 基準：這些套用「現有快取」的 verify
    base_hit = base_shown = 0
    for e in sample:
        v, _ = _verify_from_cached(e, dye_names)
        base_hit += v["hit"]; base_shown += v["shown"]
    print(f"\n基準（現有快取 @ 舊設定）：{base_hit}/{base_shown}"
          f"（{100*base_hit/base_shown:.1f}%）")

    # ② 各設定重 OCR
    runs = [(f"max_edge={ed}", ed, None) for ed in edges]
    if args.also_model:
        runs.append((f"max_edge={max(edges)}+{args.also_model}", max(edges), args.also_model))

    per_img_best = {e["rel_image"]: 0.0 for e in sample}
    print("\n設定別 verify：")
    for label, ed, model in runs:
        hit = shown = 0
        for e in sample:
            v = _verify_reocr(e, dye_names, ed, model)
            if not v:
                continue
            hit += v["hit"]; shown += v["shown"]
            r = v["hit"] / v["shown"] if v["shown"] else 0
            per_img_best[e["rel_image"]] = max(per_img_best[e["rel_image"]], r)
        rate = 100 * hit / shown if shown else 0
        print(f"  {label:<32} {hit}/{shown}（{rate:.1f}%）")

    best_of = sum(per_img_best.values()) / len(sample) * 100
    print(f"\nbest-of（每張取最佳設定）≈ {best_of:.1f}%  ← 升級重讀的天花板")
    print("（基準若已很高代表解析度不是瓶頸；差距大才值得在全量用更高解析度）")


if __name__ == "__main__":
    main()
