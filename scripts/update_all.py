#!/usr/bin/env python3
"""
update_all.py — 一鍵更新（總控腳本）
=======================================
用法：
  python scripts/update_all.py          # 沒給參數時會出現選單讓你選
  python scripts/update_all.py full     # 完整更新（需要網路）
  python scripts/update_all.py local    # 本地重建（改完 JSON 後用，數秒完成）
"""
import importlib.util
import subprocess
import sys
import time
from pathlib import Path

# Windows 主控台/管線預設 cp950，印 emoji 會炸——統一改 UTF-8
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SCRIPTS = Path(__file__).parent
ROOT = SCRIPTS.parent

# (檔名, 標題, 說明, 參數)
FULL_STEPS = [
    ("update_db.py",         "檢查物品DB",   "比對線上繁中道具庫版本（只檢查不覆蓋；要更新再手動跑 --apply）", ["--check"]),
    ("pipeline.py",          "取圖＋配裝",   "從 Mirapri 抓新投稿、下載圖片，補繁中名稱／部位／取得方式（視新資料量約 1～10 分鐘）", ["all"]),
    ("compress_mirapri.py",  "圖片壓縮",     "壓縮新下載的圖片（之前壓過的會自動跳過）", []),
    ("make_thumbs.py",       "卡片縮圖",     "為新圖片產生縮圖（已有的會自動跳過）", []),
    ("ocr_check.py",         "OCR 辨識",     "對新圖 OCR 讀裝備名＋染色（需 Ollama；已 OCR 過的吃快取跳過）", ["--target", "mirapri", "--mode", "all"]),
    ("apply_dyes.py",        "逐件染色",     "OCR 結果 → 逐件染色 + 整套 fallback + 可見裝備", []),
    ("reconstruct_empty.py", "重建空殼裝備", "空殼套裝用 OCR+DB 重建裝備（部位／繁中／染色／取得方式）", []),
    ("build_item_fallback.py", "多語裝備庫", "XIVAPI 全件掃描（名稱/部位/可染/可交易/icon；約 3 分鐘）", []),
    ("build_sets.py",        "官方套裝",     "MirageStoreSetItem＋sources.json → 官方套裝資料（--fetch 刷新 XIVAPI 快取）", ["--fetch"]),
    ("fetch_icons.py",       "套裝 icon",    "下載官方套裝所需 icon（已有的自動跳過，可續傳）", []),
    ("build_site.py",        "重建網頁資料", "curated／mirapri／重建／染色／官方套裝 → *.js 資料檔", []),
    ("health_check.py",      "資料健檢",     "檢查缺圖、缺繁中、重複編號、官方套裝、JSON 是否同步", []),
]
# 本地重建：不抓網路、不 OCR，只用現有快取/enriched 重新整理＋重建
# （build_sets 不帶 --fetch＝吃 XIVAPI 快取，離線可跑）
LOCAL_STEPS = [
    (n, t, d, ([] if n == "build_sets.py" else a))
    for (n, t, d, a) in FULL_STEPS
    if n in ("apply_dyes.py", "reconstruct_empty.py", "build_sets.py",
             "build_site.py", "health_check.py")
]
NONFATAL = {"health_check.py", "update_db.py"}  # 非 0 退出視為提示，不中止流程


def fail(msg, hint=""):
    print(f"\n❌ {msg}")
    if hint:
        print(f"   👉 {hint}")
    sys.exit(1)


def preflight(local_only):
    """執行前環境檢查，問題越早發現越好"""
    print("🔍 執行前檢查…")
    problems = []
    # Python 套件
    for mod, pkg, needed_by in [("PIL", "pillow", "圖片壓縮／縮圖"),
                                ("msgpack", "msgpack", "裝備名稱查詢")]:
        if importlib.util.find_spec(mod) is None:
            if local_only and mod == "msgpack":
                continue  # local 模式用不到
            problems.append(f"缺少套件 {pkg}（{needed_by}會用到）→ 請執行：pip install {pkg}")
    # 必要檔案
    must_have = [ROOT / "data" / "curated_outfits.json"]
    if not local_only:
        must_have += [ROOT / "data" / "all_outfits_enriched.json",
                      ROOT / "資料來源" / "items.json"]
    for f in must_have:
        if not f.exists():
            problems.append(f"找不到必要檔案：{f.relative_to(ROOT)}")
    # 腳本齊全
    steps = LOCAL_STEPS if local_only else FULL_STEPS
    for name, *_ in steps:
        if not (SCRIPTS / name).exists():
            problems.append(f"找不到腳本：scripts/{name}")
    if problems:
        print()
        for p in problems:
            print(f"  ❌ {p}")
        fail("環境檢查未通過，請先處理上面的問題再重新執行。")
    print("  ✓ 套件與檔案都齊全\n")


def choose_mode():
    print("""請選擇要執行的模式：

  [1] 完整更新   抓 Mirapri 新資料 → 壓縮圖片 → 縮圖 → 重建網頁資料 → 健檢
                 （需要網路；視新資料量約 1～10 分鐘）

  [2] 本地重建   只重建網頁資料 + 健檢
                 （改完 data/curated_outfits.json 之後用；數秒完成）

  [Q] 離開
""")
    while True:
        ans = input("輸入 1 / 2 / Q 後按 Enter：").strip().lower()
        if ans == "1":
            return False
        if ans == "2":
            return True
        if ans == "q":
            print("已取消，未做任何變更。")
            sys.exit(0)
        print("⚠️  看不懂這個輸入，請輸入 1、2 或 Q。")


def run_step(i, total, name, title, desc, args):
    print(f"\n{'═'*58}")
    print(f"▶ 步驟 {i}/{total}：{title}（{name}{' ' + ' '.join(args) if args else ''}）")
    print(f"  {desc}")
    print("═"*58, flush=True)
    t0 = time.time()
    r = subprocess.run([sys.executable, str(SCRIPTS / name), *args])
    dt = time.time() - t0
    if r.returncode != 0 and name not in NONFATAL:
        fail(f"步驟「{title}」失敗（exit {r.returncode}），流程已中止。",
             f"可單獨重跑檢查問題：python scripts/{name} {' '.join(args)}")
    print(f"✓ 步驟 {i}/{total} 完成（{dt:.0f} 秒）")
    return r.returncode


def main():
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    if arg in ("local", "l"):
        local_only = True
    elif arg in ("full", "f"):
        local_only = False
    elif arg in ("-h", "--help", "help", "?"):
        print(__doc__)
        return 0
    elif arg:
        print(f"⚠️  不認識的參數「{sys.argv[1]}」。\n{__doc__}")
        return 1
    elif sys.stdin.isatty():
        local_only = choose_mode()
    else:
        local_only = False  # 非互動環境（排程等）預設完整更新

    steps = LOCAL_STEPS if local_only else FULL_STEPS
    mode = "本地重建" if local_only else "完整更新"
    print(f"\n📋 模式：{mode}，共 {len(steps)} 個步驟")
    for i, (name, title, *_rest) in enumerate(steps, 1):
        print(f"   {i}. {title}（{name}）")

    preflight(local_only)

    t0 = time.time()
    warn = 0
    for i, (name, title, desc, args) in enumerate(steps, 1):
        rc = run_step(i, len(steps), name, title, desc, args)
        if name == "health_check.py":
            warn = rc

    print(f"\n{'═'*58}")
    print(f"🎉 全部完成！共花 {time.time()-t0:.0f} 秒。")
    if warn:
        print("⚠️  健檢有警告（往上捲動可看細節）——通常不影響網頁瀏覽，有空再處理即可。")
    else:
        print("✅ 健檢全部通過。")
    print("""
接下來你可以：
  • 直接開啟 index.html 看最新內容（重新整理即可，不必重開瀏覽器）
  • 新增精選套裝 → 編輯 data/curated_outfits.json 後跑：python scripts/update_all.py local
  • 想抓 Mirapri 新投稿 → python scripts/update_all.py full""")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n已手動中斷（Ctrl+C）。已完成的步驟不會遺失，重跑會自動接續。")
        sys.exit(130)
