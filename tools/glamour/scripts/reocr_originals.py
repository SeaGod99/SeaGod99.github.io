#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
reocr_originals.py — 用「來源原圖」重新 OCR 待檢視清單的套裝
============================================================
背景：配裝圖片/mirapri/ 的圖已被 compress_mirapri.py 原地壓到長邊 1100/q76（原檔覆蓋），
OCR 一直讀這份壓縮圖、還會再 q88 重編碼（雙重壓縮）。來源站原圖是長邊 1280 的新鮮 JPEG，
更清晰、未雙重壓縮 → 用原圖重 OCR 是「真的換了更好的輸入」，不是確定性 no-op。

流程：對指定套裝重新下載來源原圖 → 用 max_edge=1280 OCR → 比對快取（壓縮圖）結果。
  --pilot N   只抽樣 N 套、印出件數差異、不寫快取（驗證原圖到底有沒有幫助）
  （無 --pilot）對選定類別全跑，原圖結果「比快取多認出件數」時才更新 ocr_cache.json
              （加 src=orig 標記、sig 維持本地壓縮圖的 sig，下次正常跑視為 fresh 不重跑）

類別來源 review_data.js（build_review.py 產生）。預設類別＝OCR 可能受益的：
  empty / few / underread / lowconf / missing / recon（toomany 與 OCR 無關，預設不含）

用法：
  py scripts\\reocr_originals.py --pilot 20
  py scripts\\reocr_originals.py --cats underread,empty
  py scripts\\reocr_originals.py --all
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_check as oc

ROOT = oc.ROOT
REVIEW_JS = os.path.join(ROOT, "review_data.js")
ENRICHED = oc.ENRICHED_JSON
CACHE = oc.CACHE_JSON
UA = {"User-Agent": "Mozilla/5.0 (FF14-glam-reocr; local research)"}
DEFAULT_CATS = ["empty", "few", "underread", "lowconf", "missing", "recon"]


def load_review_items():
    txt = open(REVIEW_JS, encoding="utf-8").read()
    body = txt.split("const REVIEW_ITEMS =", 1)[1]
    body = body.split("];", 1)[0] + "]"
    return json.loads(body)


def url_by_id():
    m = {}
    for o in oc.load_json(ENRICHED, []):
        if o.get("type") == "mirapri":
            m[o["id"]] = o.get("image", "")
    return m


def download(url, timeout=30, retries=2):
    last = None
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=timeout).read()
        except Exception as e:
            last = e
            time.sleep(1.0)
    raise last


def ocr_bytes(raw, max_edge=1280):
    """把 bytes 存暫存檔交給既有 ocr_ollama（用原圖尺寸，不縮）。"""
    import tempfile
    from PIL import Image
    im = Image.open(io.BytesIO(raw))
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    fd, tmp = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    try:
        im.save(tmp, "JPEG", quality=95)
        return oc.ocr_ollama(tmp, max_edge=max_edge)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pilot", type=int, default=0, help="抽樣 N 套、不寫快取（驗證用）")
    ap.add_argument("--cats", default="", help="逗號分隔類別（預設＝OCR 可能受益的類）")
    ap.add_argument("--all", action="store_true", help="整個待檢視清單都跑")
    ap.add_argument("--limit", type=int, default=0, help="最多處理 N 套（0=不限）")
    ap.add_argument("--delay", type=float, default=0.2, help="每張下載間隔秒")
    args = ap.parse_args()

    cats = set(DEFAULT_CATS if not args.cats else
               [c.strip() for c in args.cats.split(",") if c.strip()])
    items = load_review_items()
    if not args.all:
        items = [it for it in items if set(it.get("cats", [])) & cats]

    urls = url_by_id()
    targets = [it for it in items if urls.get(it["id"])]
    print(f"待檢視符合條件：{len(items)} 套，其中有來源URL可重抓：{len(targets)} 套")

    if args.pilot:
        # 優先抽 OCR 真的少讀的類，看原圖能不能多認出
        pri = {"underread": 0, "empty": 1, "few": 2, "lowconf": 3, "missing": 4, "recon": 5}
        targets.sort(key=lambda it: min(pri.get(c, 9) for c in it["cats"]))
        targets = targets[: args.pilot]
        print(f"=== PILOT：{len(targets)} 套（不寫快取，只比較）===")
    elif args.limit:
        targets = targets[: args.limit]

    cache = oc.load_json(CACHE, {})
    dye_names = oc.load_dye_whitelist()
    gained = lost = same = failed = updated = 0
    t0 = time.time()

    for i, it in enumerate(targets, 1):
        oid = it["id"]
        url = urls[oid]
        bn = os.path.basename(url)
        ck = os.path.join("配裝圖片", "mirapri", bn)
        old = cache.get(ck, {})
        old_items = old.get("items", [])
        old_n = len([x for x in old_items if x])
        try:
            raw = download(url)
            items_o, dyes_o, pieces_o = ocr_bytes(raw)
        except Exception as e:
            failed += 1
            print(f"[{i}/{len(targets)}] X {bn[:40]} 下載/OCR失敗: {e}")
            continue

        ci_o, _ = oc.clean_ocr(items_o, dyes_o, dye_names)
        ci_old, _ = oc.clean_ocr(old_items, old.get("dyes", []), dye_names)
        new_n = len(ci_o)
        delta = new_n - len(ci_old)
        if delta > 0:
            gained += 1
        elif delta < 0:
            lost += 1
        else:
            same += 1

        mark = "＝" if delta == 0 else (f"＋{delta}" if delta > 0 else str(delta))
        if args.pilot:
            print(f"[{i}/{len(targets)}] {mark}  壓縮{len(ci_old)}→原圖{new_n}  "
                  f"{it.get('name','')[:14]}  cats={','.join(it['cats'])}")
            if delta != 0:
                print(f"        壓縮: {ci_old}")
                print(f"        原圖: {ci_o}")
        else:
            # 原圖是客觀更好的輸入（1280 新鮮 vs 1100 雙重壓縮）：
            # 件數 >= 舊值就採用（含「件數持平但字更準」的修正），只在「變少」時保留舊的避免回退。
            if delta >= 0:
                sig = oc.img_sig(os.path.join(ROOT, ck))  # 維持本地壓縮圖 sig → 視為 fresh
                cache[ck] = {"sig": sig, "ver": oc.OCR_SCHEMA_VER, "src": "orig",
                             "items": items_o, "dyes": dyes_o, "pieces": pieces_o,
                             "at": datetime.now().isoformat(timespec="seconds")}
                updated += 1
            if i % 25 == 0:
                oc._save_json(CACHE, cache)
                print(f"  …進度 {i}/{len(targets)}  多認{gained} 持平{same} 變少{lost} "
                      f"已更新{updated}  ({time.time()-t0:.0f}s)", flush=True)
        if args.delay:
            time.sleep(args.delay)

    if not args.pilot:
        oc._save_json(CACHE, cache)

    dt = time.time() - t0
    print(f"\n完成 {len(targets)} 套（{dt:.0f}s）：原圖比壓縮圖 多認出 {gained}、持平 {same}、"
          f"變少 {lost}、失敗 {failed}" + ("" if args.pilot else f"、已寫回快取 {updated}"))
    if args.pilot:
        print("→ 若『多認出』占比夠高，值得全量；否則原圖也救不了，OCR 已到模型上限。")


if __name__ == "__main__":
    main()
