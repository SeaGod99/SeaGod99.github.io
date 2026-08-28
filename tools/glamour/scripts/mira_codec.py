#!/usr/bin/env python3
"""mira_codec.py —— 社群配裝前端資料檔的編解碼（item_db.js ＋ mirapri_outfits.js v2）

**前端資料檔的格式定義只有這一份。** build_site.py 寫、build_review.py 與
check_duplicates.py 讀，都經由這裡；前端的解碼在 index.html 的 rehydrateMirapri()，
欄位順序必須與 ITEM_DB_FIELDS 一致。

## 為什麼要壓

6,860 套／35,249 件裝備，但只用到 6,347 個不重複道具。每件都把
name(日文)／zh／slot／patch／lv／job／source／st／dye／mb 再抄一次，而這些
**都是道具本身的屬性、不是這一套的屬性**——真正屬於這一套的只有「哪件道具」
＋「染了什麼色」。抄十份的結果是 mirapri_outfits.js 有 11.9MB（gzip 1.95MB），
瀏覽器光把它當 JS 原始碼編譯就要 235ms（中階手機 3–5 倍）。

## 格式

    item_db.js          const _ITEM_DB = {v, f:[欄位名], p:{欄位:[字串池]}, d:{iid:[值...]}}
    mirapri_outfits.js  const _MIRAPRI_RAW = {v:2, dy:[染色名], o:[套裝...]}
    套裝  {i:id, n:名稱, c:投稿者, m:圖檔名, t:時間, g?:性別, r?:種族,
           d?:[整套染色索引], h?:1 有逐件染色, q:[裝備...]}
    裝備  [iid, 染色1索引, 染色2索引, 旗標(bit0=recon), 例外?]

字串池與染色索引都是 1-based，0 代表「沒有值」。尾端的 0 會省略。

## 無損是硬性要求

資料裡確實有同一個 iid 在不同套帶不同值的情況（多半是空殼重建的套缺欄位，
少數是真的不一致），所以字典存**眾數**，與眾數不同的那件在 `ovr` 逐欄記下來
（`None` 代表「這件沒有這個欄位」）。build_site.py 每次建置都會把編碼結果
解回來跟原始結構完整比對，對不上就中止——這種格式轉換一旦悄悄掉資料，
畫面上完全看不出來，只會變成某一欄空白，而且會一路傳到線上。
"""
import json
from pathlib import Path

ITEM_DB_FIELDS = ["name", "zh", "slot", "patch", "lv", "job", "source", "st", "dye", "mb"]
ITEM_DB_POOLED = {"slot", "patch", "lv", "job", "source", "st"}   # 重複度高 → 進字串池
MIRA_IMG_PREFIX = "配裝圖片/mirapri/"


def _mode(values):
    """出現次數最多的值（含空值——空值本身也可能是多數）。平手取先出現的。"""
    counts, order = {}, {}
    for i, v in enumerate(values):
        k = json.dumps(v, ensure_ascii=False, sort_keys=True)
        counts[k] = counts.get(k, 0) + 1
        order.setdefault(k, i)
    best = min(counts, key=lambda k: (-counts[k], order[k]))
    return json.loads(best)


def build_item_db(mirapri):
    """{iid: {欄位: 眾數}}——只收社群配裝用得到的道具。"""
    bucket = {}
    for o in mirapri:
        for e in o.get("equipments", []):
            if not isinstance(e, dict) or not e.get("iid"):
                continue          # 沒有 id 就進不了字典，該件全部欄位走 ovr
            bucket.setdefault(int(e["iid"]), []).append(e)
    return {iid: {f: _mode([e.get(f) for e in rows]) for f in ITEM_DB_FIELDS}
            for iid, rows in bucket.items()}


def compact_mirapri(mirapri, itemdb):
    """→ (mirapri_outfits.js 的內容, item_db.js 的內容)"""
    pools = {f: [] for f in ITEM_DB_POOLED}
    pool_idx = {f: {} for f in ITEM_DB_POOLED}

    def enc_pool(f, v):
        if v is None or v == "":
            return 0
        key = json.dumps(v, ensure_ascii=False)
        i = pool_idx[f].get(key)
        if i is None:
            pools[f].append(v)
            i = len(pools[f])          # 1-based，0 保留給「沒有值」
            pool_idx[f][key] = i
        return i

    dyes, dye_idx = [], {}

    def enc_dye(v):
        if not v or v == "—":
            return 0
        i = dye_idx.get(v)
        if i is None:
            dyes.append(v)
            i = len(dyes)
            dye_idx[v] = i
        return i

    def enc_field(f, v):
        if f in ITEM_DB_POOLED:
            return enc_pool(f, v)
        if f == "mb":
            return 1 if v else 0
        return v if v is not None else ""

    db_rows = {str(iid): [enc_field(f, rec[f]) for f in ITEM_DB_FIELDS]
               for iid, rec in itemdb.items()}

    outfits = []
    for o in mirapri:
        img = o.get("image") or ""
        # 6,860/6,860 都是 配裝圖片/mirapri/{檔名}，固定前綴拔掉。
        # 萬一哪天出現別的路徑，含 "/" 就代表是完整路徑，解碼時據此分辨。
        m = img[len(MIRA_IMG_PREFIX):] if img.startswith(MIRA_IMG_PREFIX) else img
        row = {"i": o.get("id", ""), "n": o.get("name", ""), "c": o.get("color", ""),
               "m": m, "t": o.get("timestamp", "")}
        if o.get("gender"):
            row["g"] = o["gender"]
        if o.get("race"):
            row["r"] = o["race"]
        if o.get("dyes"):
            row["d"] = [enc_dye(x) for x in o["dyes"]]
        if o.get("hasPieceDyes"):
            row["h"] = 1
        q = []
        for e in o.get("equipments", []):
            if not isinstance(e, dict):
                q.append(e)             # 極少數是純字串，原樣保留
                continue
            iid = int(e["iid"]) if e.get("iid") else 0
            base = itemdb.get(iid, {}) if iid else {}
            ovr = {}
            for f in ITEM_DB_FIELDS:
                if f in e:
                    if f not in base or e[f] != base[f]:
                        ovr[f] = e[f]
                elif f in base:
                    ovr[f] = None       # 字典有、這件沒有 → 明確記成「刪掉」
            ovr.update({k: v for k, v in e.items()
                        if k not in ITEM_DB_FIELDS and k not in ("iid", "dye1", "dye2", "recon")})
            p = [iid, enc_dye(e.get("dye1")), enc_dye(e.get("dye2")),
                 1 if e.get("recon") else 0]
            if ovr:
                p.append(ovr)
            while len(p) > 1 and not p[-1]:
                p.pop()                 # 尾端的 0／空 ovr 省掉
            q.append(p)
        row["q"] = q
        outfits.append(row)
    return ({"v": 2, "dy": dyes, "o": outfits},
            {"v": 1, "f": ITEM_DB_FIELDS, "p": pools, "d": db_rows})


def rehydrate_mirapri(compact, itemdb_js):
    """把 compact_mirapri() 的產物解回原本的結構。
    **必須與 index.html 的 rehydrateMirapri() 邏輯一模一樣**——這裡是驗證用的參考實作。"""
    fields, pools, dyes = itemdb_js["f"], itemdb_js["p"], compact["dy"]

    def dec_pool(f, i):
        return pools[f][i - 1] if i else ""

    def dec_dye(i):
        return dyes[i - 1] if i else "—"

    db = {}
    for iid, row in itemdb_js["d"].items():
        rec = {}
        for f, v in zip(fields, row):
            rec[f] = dec_pool(f, v) if f in ITEM_DB_POOLED else (bool(v) if f == "mb" else v)
        db[int(iid)] = rec

    out = []
    for row in compact["o"]:
        m = row.get("m", "")
        equips = []
        for p in row.get("q", []):
            if not isinstance(p, list):
                equips.append(p)
                continue
            iid = p[0] if len(p) > 0 else 0
            ovr = p[4] if len(p) > 4 and isinstance(p[4], dict) else {}
            e = dict(db.get(iid, {})) if iid else {}
            for k, v in ovr.items():
                if v is None:
                    e.pop(k, None)
                else:
                    e[k] = v
            e["dye1"] = dec_dye(p[1] if len(p) > 1 else 0)
            e["dye2"] = dec_dye(p[2] if len(p) > 2 else 0)
            if len(p) > 3 and (p[3] or 0) & 1:
                e["recon"] = True
            if iid:
                e["iid"] = iid
            equips.append(e)
        out.append({
            "type": "mirapri", "id": row.get("i", ""), "name": row.get("n", ""),
            "color": row.get("c", ""), "gender": row.get("g", ""), "race": row.get("r", ""),
            "image": (m if ("/" in m or not m) else MIRA_IMG_PREFIX + m),
            "tags": [], "note": "", "timestamp": row.get("t", ""),
            "equipments": equips,
            "dyes": [dec_dye(x) for x in row.get("d", [])],
            "hasPieceDyes": bool(row.get("h")),
        })
    return out


def load_mirapri(root):
    """讀回完整的社群配裝結構（給 build_review.py／check_duplicates.py 用）。

    舊格式（`const _MIRAPRI_RAW = [...]`）也吃，這樣還沒重跑 build_site.py 的
    工作目錄不會突然壞掉。
    """
    root = Path(root)

    def js_value(p):
        t = p.read_text(encoding="utf-8")
        return json.loads(t[t.index("=") + 1:].strip().rstrip(";"))

    data = js_value(root / "mirapri_outfits.js")
    if isinstance(data, list):
        return data                      # 舊格式：本來就是完整結構
    return rehydrate_mirapri(data, js_value(root / "item_db.js"))
