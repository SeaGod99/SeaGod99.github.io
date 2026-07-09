#!/usr/bin/env python3
"""
health_check.py — 配裝資料健檢
================================
檢查項目：
  1. 重複的套裝編號／名稱
  2. 圖片檔（原圖或縮圖擇一存在即可；含縮圖覆蓋率）
  3. 裝備缺繁中名稱、取得方式「待確認」、版本「—」
  4. 染色欄位疑似被來源文字污染（含 emoji）
  5. data/curated_outfits.json 與 curated_outfits.js 是否同步（提醒重跑 build_site.py）

執行：python scripts/health_check.py
"""
import json
import re
import sys
from pathlib import Path

# Windows 主控台/管線預設 cp950，印 emoji/罕見字會炸——統一改 UTF-8
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).parent.parent
EMOJI_RE = re.compile(r"[🗡🔶🟣🛒📋🔨🎲⚔🪙💎🗓💒]")

def load_js(path, var):
    t = path.read_text(encoding="utf-8")
    return json.loads(t[t.index("["): t.rindex("]") + 1])

def main():
    warn = 0
    def w(msg):
        nonlocal warn
        warn += 1
        print(f"  ⚠️  {msg}")

    curated = load_js(ROOT / "curated_outfits.js", "_CURATED_RAW")

    print("── 1. 編號／名稱重複 ──")
    seen_id, seen_name = {}, {}
    for o in curated:
        if o["id"] in seen_id:
            w(f"編號重複：{o['id']}")
        seen_id[o["id"]] = True
        if o["name"] in seen_name:
            w(f"名稱重複：{seen_name[o['name']]} 與 {o['id']} 都叫「{o['name']}」")
        seen_name[o["name"]] = o["id"]

    print("── 2. 圖片檔 ──")
    def thumb_of(img):
        rest = img[len("配裝圖片/"):]
        return ROOT / "配裝圖片" / "縮圖" / (rest if rest.lower().endswith(".jpg") else rest + ".jpg")
    only_thumb = 0
    for o in curated:
        if not o["image"]:
            continue
        has_orig = (ROOT / o["image"]).exists()
        has_thumb = o["image"].startswith("配裝圖片/") and thumb_of(o["image"]).exists()
        if not has_orig and not has_thumb:
            w(f"{o['id']} 原圖與縮圖都不存在：{o['image']}")
        elif not has_orig:
            only_thumb += 1
    if only_thumb:
        print(f"  ℹ️  {only_thumb} 套僅有縮圖（原圖已刪除，彈窗會自動改用縮圖）")
    thumb_dir = ROOT / "配裝圖片" / "縮圖"
    n_src = sum(1 for p in (ROOT / "配裝圖片").rglob("*")
                if p.is_file() and thumb_dir not in p.parents
                and p.suffix.lower() in (".jpe", ".jpg", ".jpeg", ".png", ".webp"))
    n_thumb = sum(1 for p in thumb_dir.rglob("*") if p.is_file()) if thumb_dir.exists() else 0
    print(f"  縮圖覆蓋：{n_thumb}/{n_src}" + ("（請跑 scripts/make_thumbs.py）" if n_thumb < n_src else " ✓"))

    print("── 3. 裝備欄位完整度 ──")
    n_zh = n_src_unconfirmed = n_patch = 0
    for o in curated:
        for p in o["pieces"]:
            if not p["zh"]:
                n_zh += 1
            if "待確認" in (p.get("source") or ""):
                n_src_unconfirmed += 1
            if not p.get("patch"):
                n_patch += 1
    total = sum(len(o["pieces"]) for o in curated)
    print(f"  共 {total} 件：缺繁中 {n_zh}、取得方式待確認 {n_src_unconfirmed}、缺版本 {n_patch}")

    print("── 4. 染色欄位污染 ──")
    for o in curated:
        for p in o["pieces"]:
            for k in ("dye1", "dye2"):
                if EMOJI_RE.search(p.get(k) or ""):
                    w(f"{o['id']} {p['slot']} {k}=「{p[k]}」疑似不是染色")

    print("── 5. JSON 同步 ──")
    src_m = (ROOT / "data" / "curated_outfits.json").stat().st_mtime
    js_m = (ROOT / "curated_outfits.js").stat().st_mtime
    if src_m > js_m:
        w("data/curated_outfits.json 比 curated_outfits.js 新，請執行 python scripts/build_site.py")
    else:
        print("  已同步 ✓")

    print("── 6. 官方套裝 ──")
    sets_path = ROOT / "data" / "official_sets.json"
    if not sets_path.exists():
        print("  ℹ️  data/official_sets.json 不存在（跑 scripts/build_sets.py 產生）")
    else:
        sets = json.loads(sets_path.read_text(encoding="utf-8"))["sets"]
        vis_slots = {"頭部", "上身", "手部", "腿部", "腳部"}
        seen_sid = set()
        n_thin = n_noname = 0
        icon_dir = ROOT / "配裝圖片" / "icons"
        missing_icons = 0
        need_icons = set()
        for s in sets:
            if s["id"] in seen_sid:
                w(f"套裝 ID 重複：{s['id']}")
            seen_sid.add(s["id"])
            vis = {p["slot"] for p in s["pieces"] if p["slot"] in vis_slots}
            if "上身" not in vis or len(vis) < 2:
                n_thin += 1
            if not (s["name_zh"] or s["name_ja"] or s["name_en"]):
                n_noname += 1
            for p in s["pieces"]:
                if p.get("icon"):
                    need_icons.add(p["icon"])
        for ic in need_icons:
            fp = icon_dir / f"{ic}.png"
            if not fp.exists() or fp.stat().st_size == 0:
                missing_icons += 1
        if n_thin:
            w(f"{n_thin} 套不符 v1 收錄準則（含上身＋可見件≥2）——build_sets.py 準則可能失效")
        if n_noname:
            w(f"{n_noname} 套三語名稱皆空")
        print(f"  共 {len(sets)} 套｜icon 覆蓋 {len(need_icons)-missing_icons}/{len(need_icons)}"
              + ("（請跑 scripts/fetch_icons.py）" if missing_icons else " ✓"))
        js_sets = ROOT / "official_sets.js"
        if not js_sets.exists() or sets_path.stat().st_mtime > js_sets.stat().st_mtime:
            w("official_sets.json 比 official_sets.js 新，請執行 python scripts/build_site.py")

    print(f"\n{'❗ 共 ' + str(warn) + ' 個警告' if warn else '✅ 全部通過'}")
    return 1 if warn else 0

if __name__ == "__main__":
    sys.exit(main())
