#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_duplicates.py —— 找出圖鑑裡的重複投稿，並可把「真重複」標記成不顯示。

為什麼需要這支
--------------
Mirapri 上同一套配裝常常被投稿兩次：同一人補日期重投、或日文版與英文版各投一次
（標題 `🔠Glamours English version…`）。這些在圖鑑裡會變成兩張一模一樣的卡片。

判斷方式（三種簽章交叉）
------------------------
  裝備簽章  = 該套所有裝備日文名排序後的 tuple（＋可選逐件染色）
  圖片簽章  = md5（位元組相同）＋ dHash（視覺近似，漢明距離 <= 5）

交叉出三類，只有第一類該處理：

  類型 1  裝備一樣 ＋ 圖也近似  → 真的重複投稿，可標記移除
  類型 2  裝備一樣 ＋ 圖不一樣  → 同一套在不同場景／不同人各拍一張，**照片本身有價值，不要刪**
  類型 3  圖近似   ＋ 裝備不一樣 → 同一張照片配了不同長度的清單，短的那筆多半漏件，是補件線索

保留規則（2026-08-27 定案）
---------------------------
類型 1 每組保留**染色資訊最完整**的那筆（逐件染色的格數最多者），平手才取較新。
不用「一律取最新」是因為這批重複多半是同一人重投／日英雙投，時間新舊沒有意義，
而且實測有 6 組最新那筆的染色反而比舊的少——照時間取會丟資訊。

用法
----
  py scripts/check_duplicates.py            # 只稽核，印摘要（預設）
  py scripts/check_duplicates.py --report   # 另外輸出 data/重複稽核.md 完整清單
  py scripts/check_duplicates.py --apply    # 把類型 1 的落選者寫進 data/review_decisions.json
                                            #（action=remove），接著跑 build_site.py 才會生效
"""
import hashlib
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mira_codec  # noqa: E402

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
IMGDIR = os.path.join(ROOT, "配裝圖片", "mirapri")
LEDGER = os.path.join(DATA, "review_decisions.json")
REPORT = os.path.join(DATA, "重複稽核.md")

NEAR = 5          # dHash 漢明距離門檻；實測 <=5 抽驗零誤判
MIN_PIECES = 2    # 只有一件的不算「同一套」


def load_js(fn):
    """社群配裝自 2026-08-28 起是「item_db.js 共用字典 ＋ 緊湊編碼」，
    解碼統一走 mira_codec（格式只有那一份定義）。"""
    if fn == "mirapri_outfits.js":
        return mira_codec.load_mirapri(ROOT)
    raw = open(os.path.join(ROOT, fn), encoding="utf-8").read()
    m = re.search(r"=\s*(\[.*\])\s*;?\s*$", raw, re.S)
    if not m:
        raise SystemExit("讀不出 %s 的陣列，build_site.py 的輸出格式變了？" % fn)
    return json.loads(m.group(1))


def basename(o):
    return os.path.basename((o.get("image") or "").replace("\\", "/"))


def gear_of(o):
    return tuple(sorted(e["name"] for e in (o.get("equipments") or []) if e.get("name")))


def dye_score(o):
    """這筆帶了多少染色資訊（逐件染色的格數）——保留規則的主鍵。"""
    return sum(1 for e in (o.get("equipments") or [])
               for k in ("dye1", "dye2") if e.get(k, "—") not in ("—", "", None))


def dhash(path):
    """9x8 灰階，比相鄰像素亮度，回傳 64 bit。"""
    from PIL import Image
    px = list(Image.open(path).convert("L").resize((9, 8), Image.LANCZOS).getdata())
    bits = 0
    for r in range(8):
        for c in range(8):
            bits = (bits << 1) | (px[r * 9 + c] > px[r * 9 + c + 1])
    return bits


def image_clusters(files):
    """回傳 (位元組相同的組, 視覺近似叢集)。近似叢集用 union-find 併起來。"""
    by_md5, hashes = defaultdict(list), {}
    for f in files:
        p = os.path.join(IMGDIR, f)
        with open(p, "rb") as fh:
            by_md5[hashlib.md5(fh.read()).hexdigest()].append(f)
        try:
            hashes[f] = dhash(p)
        except Exception as e:
            print("  ⚠ 讀不了 %s：%s" % (f, e))
    exact = [v for v in by_md5.values() if len(v) > 1]

    # 四段 16-bit 前綴分桶，任一段相同就進同一桶（提高召回，避免 O(n^2)）
    buckets = defaultdict(list)
    for f, h in hashes.items():
        for sh in (0, 16, 32, 48):
            buckets[(sh, (h >> sh) & 0xFFFF)].append(f)

    parent = {f: f for f in hashes}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    seen = set()
    for arr in buckets.values():
        if len(arr) < 2 or len(arr) > 400:   # 桶太大多半是純色圖，跳過免得爆開
            continue
        for i in range(len(arr)):
            for j in range(i + 1, len(arr)):
                a, b = sorted((arr[i], arr[j]))
                if (a, b) in seen:
                    continue
                seen.add((a, b))
                if bin(hashes[a] ^ hashes[b]).count("1") <= NEAR:
                    ra, rb = find(a), find(b)
                    if ra != rb:
                        parent[rb] = ra

    groups = defaultdict(list)
    for f in hashes:
        groups[find(f)].append(f)
    return exact, [sorted(v) for v in groups.values() if len(v) > 1]


def main():
    apply_ = "--apply" in sys.argv
    want_report = "--report" in sys.argv or apply_

    outfits = load_js("mirapri_outfits.js")
    by_id = {o["id"]: o for o in outfits}
    print("社群套數 %d" % len(outfits))

    # ---- 裝備簽章 ----
    sig_gear, sig_full = defaultdict(list), defaultdict(list)
    for o in outfits:
        g = gear_of(o)
        if len(g) < MIN_PIECES:
            continue
        sig_gear[g].append(o)
        sig_full[tuple(sorted((e["name"], e.get("dye1", "—"), e.get("dye2", "—"))
                              for e in o["equipments"] if e.get("name")))].append(o)
    dup_gear = [v for v in sig_gear.values() if len(v) > 1]
    dup_full = [v for v in sig_full.values() if len(v) > 1]

    # ---- 圖片簽章 ----
    files = sorted(os.listdir(IMGDIR))
    print("圖片檔 %d，計算雜湊中…" % len(files))
    exact, clusters = image_clusters(files)
    img_cluster = {f: i for i, arr in enumerate(clusters) for f in arr}

    # ---- 交叉分類 ----
    t1, t2 = [], []
    for grp in dup_gear:
        cls = {img_cluster.get(basename(o)) for o in grp}
        (t1 if (len(cls) == 1 and None not in cls) else t2).append(grp)

    by_img = defaultdict(list)
    for o in outfits:
        by_img[basename(o)].append(o)
    t3 = []
    for arr in clusters:
        grp = [o for f in arr for o in by_img.get(f, [])]
        if len(grp) > 1 and len({gear_of(o) for o in grp}) > 1:
            t3.append(grp)

    print()
    print("【裝備重複】裝備一樣 %d 組／%d 套　｜　連染色都一樣 %d 組／%d 套"
          % (len(dup_gear), sum(len(v) for v in dup_gear),
             len(dup_full), sum(len(v) for v in dup_full)))
    print("【圖片重複】位元組相同 %d 組／%d 檔　｜　視覺近似 %d 叢／%d 檔"
          % (len(exact), sum(len(v) for v in exact),
             len(clusters), sum(len(v) for v in clusters)))
    print()
    print("  類型 1  裝備一樣＋圖也近似（真重複投稿，可移除）：%d 組、%d 套"
          % (len(t1), sum(len(v) for v in t1)))
    print("  類型 2  裝備一樣＋圖不一樣（照片有價值，別刪）    ：%d 組、%d 套"
          % (len(t2), sum(len(v) for v in t2)))
    print("  類型 3  圖近似＋裝備不一樣（短的那筆多半漏件）    ：%d 組、%d 套"
          % (len(t3), sum(len(v) for v in t3)))

    # ---- 類型 1 的保留計畫 ----
    plan = []
    for grp in t1:
        ordered = sorted(grp, key=lambda o: (dye_score(o), o.get("timestamp") or ""))
        plan.append((ordered[-1], ordered[:-1]))

    if want_report:
        lines = ["# 幻化配裝圖鑑重複稽核\n",
                 "由 `scripts/check_duplicates.py` 產生。社群 %d 套／圖 %d 張。\n" % (len(outfits), len(files)),
                 "保留規則：類型 1 每組取**染色資訊最完整**的那筆，平手才取較新。\n"]

        def dump(title, groups, note):
            lines.append("\n## %s（%d 組、%d 套）\n\n%s\n"
                         % (title, len(groups), sum(len(v) for v in groups), note))
            for grp in sorted(groups, key=lambda v: basename(v[0])):
                lines.append("- **%s**" % "｜".join(
                    (o.get("name") or "無題").replace("\n", " ")[:28] for o in grp))
                for o in grp:
                    lines.append("  - `%s` %s ｜%d 件 ｜染色 %d 格 ｜%s"
                                 % (o["id"][:8], basename(o), len(o.get("equipments") or []),
                                    dye_score(o), o.get("timestamp", "")))

        dump("類型 1：裝備一樣，圖也是同一張", t1,
             "真的重複投稿（同一人補日期重投，或日／英雙語版）。`--apply` 會把每組落選者標成不顯示。")
        dump("類型 2：裝備一樣，但照片不同", t2,
             "**不要一律刪**——有的是同一人重拍／重排面板，有的是同一套在不同場景各拍一張，"
             "照片本身仍有價值。要處理得逐組看圖決定。")
        dump("類型 3：圖近似，但裝備清單不同", t3,
             "同一張照片配了不同長度的清單，短的那筆通常漏了某件。可當作補件線索。")
        open(REPORT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
        print("\n完整清單 → %s" % os.path.relpath(REPORT, ROOT))

    if not apply_:
        print("\n(只稽核，未改任何資料。加 --apply 才會標記類型 1 的落選者)")
        return 0

    led = json.load(open(LEDGER, encoding="utf-8"))
    already = {d["id"] for d in led["decisions"] if d.get("action") == "remove"}
    added = 0
    for keep, drop in plan:
        for d in drop:
            if d["id"] in already:
                continue
            led["decisions"].append({
                "id": d["id"], "name": d.get("name", ""), "action": "remove",
                "cats": ["dup"],
                "note": "與 %s 同裝備同圖（重複投稿），保留染色資訊較完整的那筆" % keep["id"],
            })
            already.add(d["id"])
            added += 1
    if added:
        json.dump(led, open(LEDGER, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n✅ 帳本新增 %d 筆 remove（總決定數 %d）→ 記得跑 build_site.py 才會生效"
          % (added, len(led["decisions"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
