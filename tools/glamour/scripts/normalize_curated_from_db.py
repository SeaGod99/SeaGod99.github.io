#!/usr/bin/env python3
"""
normalize_curated_from_db.py —— 以道具 DB 校正精選套裝的客觀欄位
=================================================================
背景（2026-07-20 稽核）：精選 500 件是人工輸入的，稽核出 190+ 個欄位與 DB 不符——
版本一律填 7.0（實際 7.3/7.4/7.5）、等級多半留在預設 Lv.1、日文名有濁點長音抄錯
（バルチザン／パルチザン…）、英文名由另一語言回譯，最嚴重的是**台服未實裝的裝備被
填了自編中文名**（違反「繁中名絕不自己翻」鐵則），連帶讓 5 套被誤標「繁中版可幻化」。

既然每件都有權威 `iid` 了，下列欄位就不該手填，一律以 DB 為準：
    zh / ja / en / patch / lv / job（由 cjc 推導）
手填的主觀欄位一概不動：source（取得方式）、dye1/dye2（該套實際染色）、
gender/race、套裝名稱與色彩描述等。job 推導與建置期共用 build_site.job_from_cjc。

`上身①`／`上身②` 這種雙上身標記會保留（DB 只會回「上身」）。

用法：
  py scripts\\normalize_curated_from_db.py           # dry-run，列出每一處差異
  py scripts\\normalize_curated_from_db.py --apply   # 寫回 data/curated_outfits.json

⚠ 這支只負責「照 DB 對齊」。**部位放錯（填了別的部位的道具）不會被修**——那是
「抄到不對的道具」，得看圖重判，腳本只會列進報告。
"""
import json
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).parent))
from build_site import job_from_cjc  # noqa: E402  共用 job 推導，避免兩處邏輯分歧

ROOT = Path(__file__).parent.parent
CURATED_JSON = ROOT / "data" / "curated_outfits.json"
ITEM_FALLBACK = ROOT / "data" / "item_fallback_multilang.json"
XIVAPI_CACHE = ROOT / "data" / "xivapi_sets_cache.json"

# 欄位 → 從 DB 哪個 key 取
FIELDS = [("zh", "zh"), ("ja", "ja"), ("en", "en"), ("patch", "patch")]


def db_value(field, rec):
    if field == "lv":
        return str(rec.get("equipLevel") or "1")
    return rec.get(field) or ""


def main():
    apply = "--apply" in sys.argv
    items = json.loads(ITEM_FALLBACK.read_text(encoding="utf-8"))["items"]
    curated = json.loads(CURATED_JSON.read_text(encoding="utf-8"))
    cjc_names = {}
    if XIVAPI_CACHE.exists():
        cjc_names = json.loads(XIVAPI_CACHE.read_text(encoding="utf-8")).get("cjc_names", {})

    changes = {}      # 欄位 → [說明…]
    slot_bad = []     # 部位對不上＝抄到別部位的道具，人工處理
    no_id = []

    for o in curated:
        for p in o.get("pieces", []):
            iid = p.get("iid")
            rec = items.get(str(iid)) if iid else None
            where = f"#{o.get('id')} {p.get('slot')}"
            if not rec:
                no_id.append(f"{where} {p.get('zh') or p.get('ja') or p.get('en')}")
                continue
            label = p.get("zh") or p.get("ja") or p.get("en") or ""

            for field, _ in FIELDS + [("lv", "lv")]:
                new = db_value(field, rec)
                old = str(p.get(field) or "")
                if field == "patch" and not new:
                    continue          # DB 沒版本資訊就別把原本的清掉
                if old == new:
                    continue
                changes.setdefault(field, []).append(
                    f"{where} {label}：「{old}」→「{new}」")
                p[field] = new

            # job 由 cjc 推導（推得出來才覆寫）
            jl = job_from_cjc(cjc_names.get(str(rec.get("cjc")), ""))
            if jl and str(p.get("job") or "") != jl:
                changes.setdefault("job", []).append(
                    f"{where} {label}：「{p.get('job')}」→「{jl}」")
                p["job"] = jl

            # 部位：DB 只給基本部位，保留「上身①」這類人工標記；
            # 完全對不上＝這件根本不是該部位的道具 → 不動，列報告
            dbslot = rec.get("slot") or ""
            cur = p.get("slot") or ""
            if dbslot and cur != dbslot and not cur.startswith(dbslot):
                slot_bad.append(f"{where} {label}：資料檔 {cur}，但這件其實是「{dbslot}」道具")

    total = sum(len(v) for v in changes.values())
    print(f"=== 以 DB 校正精選套裝：{total} 處差異 ===")
    for field, rows in changes.items():
        print(f"\n【{field}】{len(rows)} 處")
        for r in rows[:40]:
            print("  " + r)
        if len(rows) > 40:
            print(f"   …還有 {len(rows) - 40} 處")
    if slot_bad:
        print(f"\n⚠ 部位對不上（抄到別部位的道具，腳本不動，需看圖重判）：{len(slot_bad)} 件")
        for r in slot_bad:
            print("  " + r)
    if no_id:
        print(f"\n⚠ 沒有 iid／DB 查無：{len(no_id)} 件（先跑 backfill_curated_iid.py）")
        for r in no_id[:10]:
            print("  " + r)

    if not apply:
        print("\n（dry-run，未寫入。加 --apply 才寫回）")
        return 0
    CURATED_JSON.write_text(
        json.dumps(curated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n✅ 已寫回 {CURATED_JSON}（記得重跑 build_site.py）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
