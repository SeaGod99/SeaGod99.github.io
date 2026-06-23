#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
itemdb.py —— FF14 道具資料庫索引（繁中／英／日 + 日文名反查）。

給 OCR→DB 解析器（resolve_ocr.py）等腳本共用，避免各自重載 msgpack。
沿用 ocr_check 的 norm／similar，比對邏輯與 OCR 比對一致（DRY）。

資料來源（資料來源/）：
  items.json         {"items": {id: {"name": 繁中名, ...}}}（繁中，id 上限約 45590）
  ja-items.msgpack   {id: {"ja": 日文名}}
  en-items.msgpack   {id: {"en": 英文名}}

用法：
  from itemdb import ItemDB
  db = ItemDB()
  hit = db.resolve("リパブリックディマカエリ・ロリカ")
  # hit = {"id","ja","zh","en","score","exact"} 或 None
"""
import os
import json

import ocr_check as oc  # norm / similar（DRY）

ROOT = oc.ROOT
SRC = os.path.join(ROOT, "資料來源")
ITEMS_JSON = os.path.join(SRC, "items.json")
JA_MSGPACK = os.path.join(SRC, "ja-items.msgpack")
EN_MSGPACK = os.path.join(SRC, "en-items.msgpack")

ZH_MAX_ID = 45590  # items.json 繁中上限；超過此 id 多半繁中尚未實裝（zh 會留空）


def _safe_int(s, default=10 ** 12):
    try:
        return int(s)
    except (TypeError, ValueError):
        return default


def _load_msgpack(path, field):
    import msgpack
    with open(path, "rb") as f:
        data = msgpack.unpackb(f.read(), raw=False)
    return {str(k): v.get(field, "") for k, v in data.items()
            if isinstance(v, dict) and v.get(field)}


class ItemDB:
    def __init__(self):
        raw = json.load(open(ITEMS_JSON, encoding="utf-8"))
        items = raw.get("items", raw)
        self.id_to_zh = {str(k): v.get("name", "") for k, v in items.items()}
        self.id_to_cat = {str(k): v.get("categoryName", "") for k, v in items.items()}
        self.id_to_equip = {str(k): bool(v.get("equipStats")) for k, v in items.items()}
        self.id_to_ja = _load_msgpack(JA_MSGPACK, "ja")
        self.id_to_en = _load_msgpack(EN_MSGPACK, "en")

        # 日文名（正規化）→ id；同名取較小 id（多半是初出／正典款）
        self.ja_norm_to_id = {}
        for i, ja in self.id_to_ja.items():
            n = oc.norm(ja)
            if not n:
                continue
            cur = self.ja_norm_to_id.get(n)
            if cur is None or _safe_int(i) < _safe_int(cur):
                self.ja_norm_to_id[n] = i

        # 模糊回退候選：依正規化長度分桶，縮小搜尋空間
        self._by_len = {}
        for n, i in self.ja_norm_to_id.items():
            self._by_len.setdefault(len(n), []).append((n, i))

    def _record(self, item_id, score, exact):
        return {
            "id": item_id,
            "ja": self.id_to_ja.get(item_id, ""),
            "zh": self.id_to_zh.get(item_id, ""),   # 繁中未實裝則為空
            "en": self.id_to_en.get(item_id, ""),
            "score": round(score, 3),
            "exact": exact,
        }

    def resolve(self, ja_name, cutoff=0.82):
        """OCR 日文字串 → 正式道具。先精確（正規化相等／子字串），再模糊（長度分桶）。
        回傳 record 或 None。"""
        n = oc.norm(ja_name)
        if not n:
            return None
        # 1) 精確（正規化後相等）
        hit = self.ja_norm_to_id.get(n)
        if hit is not None:
            return self._record(hit, 1.0, True)
        # 2) 模糊：只比相近長度的候選（similar 內含子字串包含 → 0.95）
        L = len(n)
        win = max(3, round(L * 0.3))
        best_id, best_s = None, 0.0
        for cand_len, lst in self._by_len.items():
            if abs(cand_len - L) > win:
                continue
            for cn, ci in lst:
                s = oc.similar(n, cn)
                if s > best_s:
                    best_id, best_s = ci, s
        if best_id is not None and best_s >= cutoff:
            return self._record(best_id, best_s, False)
        return None


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    db = ItemDB()
    print(f"載入：zh {len(db.id_to_zh)}｜ja {len(db.id_to_ja)}｜en {len(db.id_to_en)}"
          f"｜日文反查鍵 {len(db.ja_norm_to_id)}")
    for q in sys.argv[1:]:
        print(f"\n{q!r} ->", db.resolve(q))
