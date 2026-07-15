#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
resolve_ocr.py —— 把 OCR 讀到的裝備字串對回資料庫的「正式值」，產生待確認報告。

回答需求：「OCR 後的清單能不能跟目前的裝備比對並取出正確值」。
做法（讀快取 + items 資料庫，不需 Ollama）：
  對每套：
    ① 抓漏候選（extra）：OCR 讀到、但對不到該套記錄裝備的字串
        → 用 itemdb 解析到正式道具（id/繁中/英/日）。這是「漏抓 or 別名」的候選。
    ② 繁中校正／補全（zh_fix）：記錄裝備的日文名在 DB 精確命中、
        但 DB 繁中名與資料裡的不同（或資料缺繁中而 DB 有）→ 提出更正/補全。

★ 只輸出報告，不自動改 data/curated_outfits.json / enriched —— 由人工/Claude 審後再套。

輸出：
  data/ocr_resolve.json     結構化（給 Claude 逐項確認）
  data/OCR解析建議.md       給人看（抓漏候選 / 繁中校正 / 無法解析）

用法：
  py scripts\\resolve_ocr.py            # 全部快取
  py scripts\\resolve_ocr.py --limit 50
"""
import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_check as oc
from itemdb import ItemDB

RESOLVE_JSON = os.path.join(oc.DATA, "ocr_resolve.json")
RESOLVE_MD = os.path.join(oc.DATA, "OCR解析建議.md")
CUTOFF = 0.82  # 解析採信門檻（與裝備比對一致）


def _ocr_items(rec, dye_names):
    """取該圖 OCR 的乾淨裝備名：v2 用 pieces，v1 用扁平。"""
    if rec.get("pieces"):
        return [p["item"] for p in oc.clean_pieces(rec["pieces"], dye_names)]
    items, _ = oc.clean_ocr(rec.get("items", []), rec.get("dyes", []), dye_names)
    return items


def main():
    ap = argparse.ArgumentParser(description="OCR→DB 解析（產生待確認報告）")
    ap.add_argument("--limit", type=int, default=0, help="最多處理幾套（0=全部）")
    args = ap.parse_args()

    cache = oc.load_json(oc.CACHE_JSON, {})
    if not cache:
        print("⚠ data/ocr_cache.json 是空的，先跑 ocr_check.py。")
        return
    dye_names = oc.load_dye_whitelist()
    db = ItemDB()

    # 同名字串在數千套裡重複出現，記憶化避免重算模糊比對（最大加速來源）
    _memo = {}
    def resolve(s):
        if s not in _memo:
            _memo[s] = db.resolve(s, CUTOFF)
        return _memo[s]

    outfit_by_bn = {}
    for o in oc.load_json(oc.ENRICHED_JSON, []):
        bn = os.path.basename((o.get("image") or "").replace("\\", "/"))
        if bn:
            outfit_by_bn[bn] = o

    results = []
    n_extra = n_extra_hit = n_zhfix = 0
    processed = 0
    for rel, rec in cache.items():
        o = outfit_by_bn.get(os.path.basename(str(rel).replace("\\", "/")))
        if not o:
            continue
        recorded = [(p.get("name", ""), p.get("zh", ""))
                    for p in o.get("equipments", []) if p.get("name")]
        rec_names = [r[0] for r in recorded]
        items = _ocr_items(rec, dye_names)

        # ① 抓漏候選：OCR 有、對不到記錄裝備 → 解析到 DB
        extra = []
        for it in items:
            idx, s = oc.best_match(it, rec_names)
            if idx >= 0 and s >= oc.MATCH_THRESHOLD:
                continue
            hit = resolve(it)
            extra.append({"ocr": it, "resolved": hit})
            n_extra += 1
            if hit:
                n_extra_hit += 1

        # ② 繁中校正／補全：記錄日文名 DB 精確命中、繁中不同或缺
        zh_fix = []
        for ja, zh in recorded:
            hit = resolve(ja)
            if hit and hit["exact"] and hit["zh"] and (zh or "") != hit["zh"]:
                zh_fix.append({"ja": ja, "old_zh": zh, "db_zh": hit["zh"],
                               "id": hit["id"], "en": hit["en"],
                               "kind": "補全" if not zh else "更正"})
                n_zhfix += 1

        if extra or zh_fix:
            results.append({
                "outfit_id": o.get("id", ""), "title": o.get("title", ""),
                "image": os.path.relpath(str(rel), oc.ROOT) if os.path.isabs(str(rel)) else str(rel),
                "extra": extra, "zh_fix": zh_fix,
            })
        processed += 1
        if args.limit and processed >= args.limit:
            break

    summary = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "processed": processed, "outfits_with_findings": len(results),
        "extra_total": n_extra, "extra_resolved": n_extra_hit, "zh_fix_total": n_zhfix,
    }
    oc._save_json(RESOLVE_JSON, {"summary": summary, "items": results})
    _write_md(results, summary)
    print(f"處理 {processed} 套｜有發現 {len(results)} 套")
    print(f"  抓漏候選 {n_extra}（其中解析到 DB {n_extra_hit}）｜繁中校正/補全 {n_zhfix}")
    print(f"  → {os.path.relpath(RESOLVE_MD, oc.ROOT)} / {os.path.relpath(RESOLVE_JSON, oc.ROOT)}")
    print("  （只是報告，未改 curated；審完再套）")


def _write_md(results, summary):
    L = ["# OCR → 資料庫 解析建議（待確認）", ""]
    L.append(f"- 產生：{summary['generated']}　處理 {summary['processed']} 套")
    L.append(f"- **抓漏候選 {summary['extra_total']}（解析到 DB {summary['extra_resolved']}）"
             f"　繁中校正/補全 {summary['zh_fix_total']}**")
    L.append("- 只是建議，未改 `curated_outfits.json`；逐項確認後再套。")
    L.append("")

    has_extra = [r for r in results if r["extra"]]
    L.append(f"## 抓漏候選：OCR 讀到、資料卻沒有（{len(has_extra)} 套）")
    L.append("")
    for r in has_extra:
        L.append(f"### {r['title']}　`{r['outfit_id']}`")
        for x in r["extra"]:
            h = x["resolved"]
            if h:
                tag = "精確" if h["exact"] else f"相似{h['score']}"
                zh = h["zh"] or "（繁中未實裝）"
                L.append(f"- OCR「{x['ocr']}」→ **{zh}** / {h['en']} / {h['ja']}　`id={h['id']}`（{tag}）")
            else:
                L.append(f"- OCR「{x['ocr']}」→ ⚠ 無法解析到 DB")
        L.append("")

    has_fix = [r for r in results if r["zh_fix"]]
    L.append(f"## 繁中校正／補全：DB 繁中名與資料不同（{len(has_fix)} 套）")
    L.append("")
    for r in has_fix:
        L.append(f"### {r['title']}　`{r['outfit_id']}`")
        for f in r["zh_fix"]:
            old = f["old_zh"] or "（空）"
            L.append(f"- [{f['kind']}] {f['ja']}：`{old}` → **{f['db_zh']}**　`id={f['id']}`")
        L.append("")

    with open(RESOLVE_MD, "w", encoding="utf-8") as fp:
        fp.write("\n".join(L))


if __name__ == "__main__":
    main()
