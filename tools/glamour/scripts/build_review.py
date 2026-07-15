#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_review.py —— 把「異常／需人工檢視」的社群套裝彙整成一份資料，給 review.html 用。

分類（一套可同時多類）：
  empty      圖上抓不到任何裝備、連重建都救不回                  → 多半要「移除」或我逐張讀
  few        有資料但 <4 件（1~3 件，可能簡配或重建只救回部分）   → 人工檢視
  toomany    >7 件（mirapri 投稿常附替代款，待修剪）             → 人工修剪
  underread  OCR 只認出 <4 件、靠保留完整清單才 >=4（OCR 不可靠）→ 適合「用 Claude OCR」
  lowconf    有 maybe_wrong（OCR 讀到但對不上記錄裝備）          → 人工檢視 / Claude OCR
  missing    OCR 讀到、解析到 DB、但不在現有清單（可能漏抓的件）   → 人工檢視
  recon      OCR+DB 自動重建、但信心不足（<4 件或有件缺來源）     → 人工核對

設計重點（為什麼佇列不該很大）：
  1129 套(18%)的 mirapri API 本就回傳 equipments=[]（投稿者只上圖沒標裝備），
  重抓也救不回 → OCR+DB 重建是這些套「唯一」的真相來源。因此：
    · 高信心重建（>=4 件且全有來源）自動採信，不再列入待檢視（recon_confident）。
    · missing 只在「該套有權威清單(raw>0)」時才算；重建/空殼套(raw=0)的 extra 是
      門檻差(重建0.90 vs resolve0.82)造成的假性漏抓，不報。

輸出：review_data.js（const REVIEW_ITEMS = [...]，review.html 以 <script> 載入）

用法：py scripts\\build_review.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_check as oc

ROOT = oc.ROOT
OUT_JS = os.path.join(ROOT, "review_data.js")
VIS_FLOOR = 4
RECON_MIN_PIECES = 4  # 重建套達此件數且全有來源 → 視為高信心、自動採信、不再丟人工佇列


def _src_ok(s):
    s = (s or "").strip()
    return s != "" and "待確認" not in s


def recon_confident(pieces):
    """高信心重建：>=RECON_MIN_PIECES 件、且每件都已對應到真實道具。
    這 1129 套空殼的來源 API 本就沒有裝備清單，OCR+DB 重建是唯一真相來源；
    300 套 Claude 視覺確認已驗證重建方法準確，故 >=4 件且全部可信即採信。
    「可信」= 有繁中名，或有 patch（＝已透過多語系備選庫 item_fallback_multilang.json
    對應到真實 7.x 道具、含部位，只是繁中尚未實裝）。兩者皆無才是未解析、需人工。"""
    def _ok(p):
        return bool((p.get("zh") or "").strip() or (p.get("patch") or "").strip())
    return (bool(pieces) and len(pieces) >= RECON_MIN_PIECES and all(_ok(p) for p in pieces))


def _load_js_array(path):
    txt = open(path, encoding="utf-8").read()
    return json.loads(txt.split("=", 1)[1].rsplit(";", 1)[0])


def _thumb(img):
    if not img or not img.startswith("配裝圖片/"):
        return img
    rest = img[len("配裝圖片/"):]
    return "配裝圖片/縮圖/" + (rest if rest.lower().endswith(".jpg") else rest + ".jpg")


def main():
    built = _load_js_array(os.path.join(ROOT, "mirapri_outfits.js"))
    enr = {o["id"]: o for o in oc.load_json(os.path.join(oc.DATA, "all_outfits_enriched.json"), [])
           if o.get("type") == "mirapri"}
    vis = oc.load_json(os.path.join(oc.DATA, "mirapri_visible.json"), {})

    # 每張圖的 OCR 來源（claude=已 Claude 視覺確認 / orig=高清重讀 / ollama=只跑過 ollama / none=無紀錄）
    cache = oc.load_json(os.path.join(oc.DATA, "ocr_cache.json"), {})
    src_map = {}
    for k, v in cache.items():
        if isinstance(v, dict):
            src_map[k.replace("\\", "/")] = v.get("src", "ollama")

    def src_of(img):
        return src_map.get((img or "").replace("\\", "/"), "none")

    # OCR 驗證結果（maybe_wrong / verify）
    res_by_id = {}
    for r in oc.load_json(os.path.join(oc.DATA, "ocr_check_result.json"), {}).get("items", []):
        res_by_id[r["outfit_id"]] = r
    # 解析建議（抓漏候選 / 繁中校正）
    resolve_by_id = {}
    for r in oc.load_json(os.path.join(oc.DATA, "ocr_resolve.json"), {}).get("items", []):
        resolve_by_id[r["outfit_id"]] = r
    # 由 OCR+DB 自動重建的空殼套（高信心者自動採信，其餘待人工核對）
    recon_data = oc.load_json(os.path.join(oc.DATA, "mirapri_reconstructed.json"), {})
    recon_ids = set(recon_data.keys())

    # review.html 人眼件數：用「目前顯示件數 == 人眼件數」判定確認，移出待檢視佇列。
    # 比『現值』而非匯出當下的 shown——因為 claude 修剪/重建後 shown 會變（例：原始12件、人眼6、
    # claude 修成6 → 應視為確認）。件數對得上＝沒漏抓也沒多抓，不再強制複查。action==remove 不計。
    eye_by_id = {}
    for p in (os.path.join(ROOT, "review_decisions.json"), os.path.join(oc.DATA, "review_decisions.json")):
        for d in oc.load_json(p, {}).get("decisions", []):
            if d.get("action") != "remove" and d.get("eyeCount") is not None:
                eye_by_id[d["id"]] = d["eyeCount"]

    items = []
    cat_count = {"empty": 0, "few": 0, "toomany": 0, "underread": 0, "lowconf": 0, "missing": 0, "recon": 0}
    for o in built:
        oid = o["id"]
        pieces = o.get("equipments", [])
        shown = len(pieces)
        if eye_by_id.get(oid) == shown:
            continue  # 人眼件數 == 目前顯示件數 → 確認沒問題，移出佇列
        raw = len([e for e in enr.get(oid, {}).get("equipments", []) if e.get("name")])
        viscount = len(vis[oid]) if oid in vis else None

        cats = []
        if shown == 0:
            cats.append("empty")
        elif shown < 4:
            cats.append("few")
        if shown > 7:
            cats.append("toomany")  # 裝備過多（>7 件，多半含替代款/飾品，待修剪）
        if viscount is not None and viscount < VIS_FLOOR and shown >= VIS_FLOOR:
            cats.append("underread")

        rr = res_by_id.get(oid, {})
        diff = rr.get("diff", {})
        maybe_wrong = [{"s": m["slot"], "j": m["name"], "z": m.get("zh", ""),
                        "ocr": m.get("closest_ocr", ""), "sc": m.get("score", 0)}
                       for m in diff.get("missing_in_ocr", []) if m.get("likely") == "maybe_wrong"]
        if maybe_wrong:
            cats.append("lowconf")

        # 可能漏抓：解析到 DB、且不在現有清單（以正規化日文名比對）
        # 只在「有權威清單(raw>0)」時才算 missing：重建/空殼套(raw=0)的清單本身就來自 OCR，
        # 拿同源 OCR 的 extra 去 diff 只是門檻差(重建0.90 vs resolve0.82)造成的假性漏抓，過濾掉。
        have = {oc.norm(e.get("name", "")) for e in pieces}
        miss = []
        if raw > 0:
            for x in resolve_by_id.get(oid, {}).get("extra", []):
                h = x.get("resolved")
                if h and oc.norm(h["ja"]) not in have:
                    miss.append({"ocr": x["ocr"], "z": h["zh"], "e": h["en"], "j": h["ja"],
                                 "id": h["id"], "sc": h["score"], "ex": h["exact"]})
        if miss:
            cats.append("missing")
        # 高信心重建(>=4件+全來源)直接採信，不列入待檢視；其餘重建才需人工核對
        if oid in recon_ids and not recon_confident(recon_data.get(oid)):
            cats.append("recon")

        # Claude 視覺已親讀的套：其件數/清單即真相，OCR 品質類旗標
        # （toomany 過多、underread 漏讀、lowconf 名稱可疑、missing 漏抓）不再適用——
        # 例如滿配飾品套本就 8~10 件（toomany 誤判）。只保留結構類（空殼/過少/重建待核）。
        if src_of(o.get("image", "")) == "claude":
            cats = [c for c in cats if c in ("empty", "few", "recon")]

        if not cats:
            continue
        for c in cats:
            cat_count[c] += 1

        # 預設建議動作
        if "empty" in cats:
            suggest = "remove"
        elif "underread" in cats or "lowconf" in cats:
            suggest = "claude"
        elif cats == ["recon"]:
            suggest = "keep"   # 重建乾淨、看起來沒問題 → 預設維持
        else:
            suggest = "review"

        src = src_of(o.get("image", ""))
        # 真正還值得人工裁決的：尚未經 Claude 確認、且屬「OCR 可改善」類（漏讀/可疑/漏抓）。
        # few/empty/recon/toomany 多屬結構性或投稿本身限制，再 OCR 也不會變，不算待裁決。
        actionable = src != "claude" and bool({"underread", "lowconf", "missing"} & set(cats))

        v = diff.get("verify", {})
        items.append({
            "id": oid, "name": o.get("name", ""),
            "img": o.get("image", ""), "thumb": _thumb(o.get("image", "")),
            "src": src, "actionable": actionable,
            "cats": cats, "shown": shown, "raw": raw, "vis": viscount,
            "verify": f'{v.get("hit","?")}/{v.get("shown","?")}' if v else "",
            "pieces": [{"s": p.get("slot", ""), "j": p.get("name", ""), "z": p.get("zh", ""),
                        "d": "／".join(d for d in [p.get("dye1"), p.get("dye2")] if d and d != "—")}
                       for p in pieces],
            "maybe_wrong": maybe_wrong,
            "miss": miss,
            "zhfix": resolve_by_id.get(oid, {}).get("zh_fix", []),
            "suggest": suggest,
        })

    # 排序：真正待裁決(actionable)優先，其次嚴重度 empty → few → underread → lowconf → missing
    order = {"empty": 0, "few": 1, "toomany": 2, "underread": 3, "lowconf": 4, "missing": 5, "recon": 6}
    items.sort(key=lambda it: (0 if it["actionable"] else 1, min(order[c] for c in it["cats"])))

    # 進度摘要：依 OCR 來源 + 待裁決數，給 review.html 標頭顯示
    src_count = {"claude": 0, "orig": 0, "ollama": 0, "none": 0}
    for it in items:
        src_count[it["src"]] = src_count.get(it["src"], 0) + 1
    actionable_n = sum(1 for it in items if it["actionable"])
    summary = {"total": len(items), "actionable": actionable_n, "src": src_count}

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("const REVIEW_ITEMS = " + json.dumps(items, ensure_ascii=False) + ";\n")
        f.write("const REVIEW_CATS = " + json.dumps(cat_count, ensure_ascii=False) + ";\n")
        f.write("const REVIEW_SUMMARY = " + json.dumps(summary, ensure_ascii=False) + ";\n")

    sz = os.path.getsize(OUT_JS) // 1024
    print(f"待檢視套裝：{len(items)} 套 → review_data.js（{sz} KB）")
    print(f"  真正待裁決(actionable)：{actionable_n} 套｜已Claude確認：{src_count['claude']}｜高清重讀：{src_count['orig']}｜純ollama：{src_count['ollama']}")
    for c, n in cat_count.items():
        print(f"  {c:<10} {n} 套")


if __name__ == "__main__":
    main()
