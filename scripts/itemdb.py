#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
itemdb.py —— FF14 道具資料庫索引（繁中／英／日 + 日文＆英文名反查）。

給 OCR→DB 解析器（resolve_ocr.py）、空殼重建（reconstruct_empty.py）等腳本共用。
resolve() 同時支援日文與英文名：英文客戶端的投稿截圖 OCR 讀到的是英文裝備名，
也能對回正式道具（先日文、不到再英文）。沿用 ocr_check 的 norm／similar（DRY）。

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
ALIAS_JSON = os.path.join(ROOT, "data", "ocr_aliases.json")  # 學習修正表（Claude 教過的 Ollama 誤讀→道具id）

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

        # 名稱（正規化）→ id；同名取較小 id（多半是初出／正典款）。
        # 日文、英文各建一份：英文客戶端截圖的 OCR 讀到的是英文名（resolve 會兩者都試）。
        self.ja_norm_to_id = self._build_index(self.id_to_ja)
        self.en_norm_to_id = self._build_index(self.id_to_en)

        # 模糊回退候選：依正規化長度分桶，縮小搜尋空間（日／英各一）
        self._by_len = self._build_buckets(self.ja_norm_to_id)
        self._en_by_len = self._build_buckets(self.en_norm_to_id)

        # 學習修正表：{norm(Ollama誤讀): 道具id}（由 build_ocr_aliases.py 從 Claude 確認學來）
        self.alias = {}
        if os.path.exists(ALIAS_JSON):
            for k, v in json.load(open(ALIAS_JSON, encoding="utf-8")).items():
                if isinstance(v, dict) and v.get("id"):
                    self.alias[k] = str(v["id"])

    @staticmethod
    def _build_index(id_to_name):
        idx = {}
        for i, name in id_to_name.items():
            n = oc.norm(name)
            if not n:
                continue
            cur = idx.get(n)
            if cur is None or _safe_int(i) < _safe_int(cur):
                idx[n] = i
        return idx

    @staticmethod
    def _build_buckets(norm_to_id):
        by_len = {}
        for n, i in norm_to_id.items():
            by_len.setdefault(len(n), []).append((n, i))
        return by_len

    def _record(self, item_id, score, exact):
        return {
            "id": item_id,
            "ja": self.id_to_ja.get(item_id, ""),
            "zh": self.id_to_zh.get(item_id, ""),   # 繁中未實裝則為空
            "en": self.id_to_en.get(item_id, ""),
            "score": round(score, 3),
            "exact": exact,
        }

    def _fuzzy(self, n, by_len, cutoff):
        """在指定分桶表內找與 n 最相似者（只比相近長度），>=cutoff 才回傳 (id, score)。"""
        L = len(n)
        win = max(3, round(L * 0.3))
        best_id, best_s = None, 0.0
        for cand_len, lst in by_len.items():
            if abs(cand_len - L) > win:
                continue
            for cn, ci in lst:
                s = oc.similar(n, cn)
                if s > best_s:
                    best_id, best_s = ci, s
        if best_id is not None and best_s >= cutoff:
            return best_id, best_s
        return None, 0.0

    def resolve(self, name, cutoff=0.82):
        """OCR 字串 → 正式道具。日文與英文（英文客戶端截圖）都試：
        先各自精確（正規化相等，兩者字符集互斥），日文模糊不到 cutoff 再試英文模糊。
        回傳 record 或 None。"""
        n = oc.norm(name)
        if not n:
            return None
        # 1) 精確（正規化後相等）：日文 → 英文
        hit = self.ja_norm_to_id.get(n)
        if hit is None:
            hit = self.en_norm_to_id.get(n)
        if hit is not None:
            return self._record(hit, 1.0, True)
        # 1.5) 學習修正表：Claude 教過的 Ollama 誤讀，直接對回正解
        aid = self.alias.get(n)
        if aid is not None:
            return self._record(aid, 1.0, True)
        # 2) 模糊（similar 內含子字串包含 → 0.95）：先日文，不到再英文
        bid, bs = self._fuzzy(n, self._by_len, cutoff)
        if bid is None:
            bid, bs = self._fuzzy(n, self._en_by_len, cutoff)
        if bid is not None:
            return self._record(bid, bs, False)
        return None


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    db = ItemDB()
    print(f"載入：zh {len(db.id_to_zh)}｜ja {len(db.id_to_ja)}｜en {len(db.id_to_en)}"
          f"｜日文鍵 {len(db.ja_norm_to_id)}｜英文鍵 {len(db.en_norm_to_id)}")
    for q in sys.argv[1:]:
        print(f"\n{q!r} ->", db.resolve(q))
