#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_ocr_aliases.py —— 從 Claude 確認結果「學習」Ollama 的系統性誤讀，產出修正表。

原理：對每個 Claude 已確認(src=claude)的套，把當初 Ollama 的讀法(注入前的快取備份)
和 Claude 正解配對。若某 Claude 正解能可信地對到 DB 道具，而對應的 Ollama 字串是它的
「誤讀」(相似但不相等、且本身對不到同一道具)，就記一條 alias：{norm(Ollama誤讀)→道具id}。

itemdb.resolve 會在精確/模糊比對前先查這張表，於是**未來任何套**只要 Ollama 讀出同樣的
誤讀字串(熱門裝備常重複)，就自動修對——把 Claude 的經驗回饋到 qwen 的 pipeline。

輸出：data/ocr_aliases.json  {norm(誤讀): {"id","ja","zh"}}
用法：py scripts/build_ocr_aliases.py
"""
import json, os, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ocr_check as oc
from itemdb import ItemDB

OUT = os.path.join(oc.DATA, "ocr_aliases.json")
SIM_LO, SIM_HI = 0.55, 0.95   # Ollama 字串視為「這件的誤讀」的相似度區間
ANCHOR_MIN = 0.95             # Claude 正解對到 DB 的最低信心（要很穩才當錨）


def main():
    db = ItemDB()
    db.alias = {}  # 重建時忽略既有 alias，避免「已被舊 alias 修好」而漏收，導致整表縮水
    dye = oc.load_dye_whitelist()
    cur = oc.load_json(oc.CACHE_JSON, {})
    baks = sorted(glob.glob(os.path.join(oc.DATA, "ocr_cache.bak_claude_*.json")))
    if not baks:
        print("找不到 Ollama 備份（ocr_cache.bak_claude_*.json），無法學習。")
        return
    bak = json.load(open(baks[0], encoding="utf-8"))  # 最早那份＝注入前的 Ollama 全量

    aliases = {}   # 重建（precision 優先，不累加舊的）
    added = ambiguous = 0
    for k, v in cur.items():
        if v.get("src") != "claude":
            continue
        o_items = [p["item"] for p in oc.clean_pieces(bak.get(k, {}).get("pieces", []), dye)]
        c_items = [p["item"] for p in oc.clean_pieces(v.get("pieces", []), dye)]
        # 先把每個 Claude 正解錨到 DB（要很穩）
        anchored = []
        for ci in c_items:
            h = db.resolve(ci)
            if h and (h["exact"] or h["score"] >= ANCHOR_MIN):
                anchored.append((ci, h))
        if not anchored:
            continue
        # 關鍵：對「每個 Ollama 字串」找它最像的 Claude 正解（而非反過來），
        # 避免同套同前綴（ヴァレンティオン裙 vs 靴）互相錯配。
        for oi in o_items:
            scored = sorted(((oc.similar(oi, ci), ci, h) for ci, h in anchored), reverse=True)
            best_s, _, best_h = scored[0]
            second_s = scored[1][0] if len(scored) > 1 else 0.0
            if not (SIM_LO <= best_s < SIM_HI):
                continue
            if best_s - second_s < 0.12:      # 與次佳太接近 = 模稜兩可，不收
                ambiguous += 1
                continue
            key = oc.norm(oi)
            if not key or key in aliases:
                continue
            if key in db.ja_norm_to_id or key in db.en_norm_to_id:
                continue
            oh = db.resolve(oi)
            if oh and oh["id"] == best_h["id"]:
                continue
            aliases[key] = {"id": best_h["id"], "ja": best_h["ja"], "zh": best_h["zh"]}
            added += 1

    oc._save_json(OUT, aliases)
    print(f"學習修正表：{added} 條（略過模稜兩可 {ambiguous}）→ {os.path.relpath(OUT, oc.ROOT)}")


if __name__ == "__main__":
    main()
