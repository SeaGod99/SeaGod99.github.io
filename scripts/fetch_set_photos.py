#!/usr/bin/env python3
"""
fetch_set_photos.py — 官方套裝示意照（consolegameswiki 模特照）
================================================================
從 ffxiv.consolegameswiki.com（MediaWiki API）抓每套官方套裝的全身模特照，
下載 640px 縮圖到 配裝圖片/官方套裝/，對應表寫入 data/set_photos.json，
build_site.py 會把它當官方套裝的主要示意照（站內配裝照退為 fallback）。

對應方式（兩條路）：
  A. mirage 套：套裝英文名＝wiki 頁面標題（redirects=1），命中率極高。
     頁面圖片挑選順位：{頁名} Female.* → {頁名} Male.* → {頁名}1.* / {頁名}.*
  B. 啟發式套（src:*）：拿一件可見裝備的英文名查單品頁 wikitext 的
     `set-name` 欄位 → 該套裝家族頁 → 檔名同時含套裝名關鍵字＋職能字
     （fending/healing/…）才採用；對不上就放棄（寧缺勿錯）。

用法：
  py scripts\\fetch_set_photos.py             # 全量（已解析過的吃快取、已下載跳過）
  py scripts\\fetch_set_photos.py --limit 40  # 只處理前 N 套沒照片的（試跑）
  py scripts\\fetch_set_photos.py --force     # 忽略快取重新解析（不重下已有的圖檔）
  py scripts\\fetch_set_photos.py --retry-miss # 只重試之前標記 miss 的套
"""
import argparse
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).parent.parent
SETS_JSON = ROOT / "data" / "official_sets.json"
PHOTOS_JSON = ROOT / "data" / "set_photos.json"
OUT_DIR = ROOT / "配裝圖片" / "官方套裝"

API = "https://ffxiv.consolegameswiki.com/mediawiki/api.php"
UA = "ff14-fashion-glamour-catalog/1.0 (personal, contact: none)"
THUMB_W = 640          # 與精選卡縮圖同寬
BATCH = 40             # API 一次查幾個標題（上限 50，留餘裕）
DELAY = 0.25           # 每個 HTTP 請求間隔（禮貌性）

ROLE_WORDS = ["fending", "healing", "casting", "scouting", "aiming",
              "maiming", "striking", "slaying"]
# 頁面附圖裡的雜訊（道具 icon、slot 佔位圖、商城 icon、資料片 logo…）
NOISE = re.compile(r"icon\d*\.(png|jpg)$|slot icon|store icon"
                   r"|^File:(ARR|HW|SB|ShB|EW|DT|BSF)\.png$", re.I)


GE_API = "https://ffxiv.gamerescape.com/w/api.php"   # 第二來源：逐件模型圖


def api_get(params, retries=3, base=None):
    params = {"format": "json", **params}
    url = (base or API) + "?" + urllib.parse.urlencode(params)
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            time.sleep(DELAY)
            return data
        except Exception as e:
            if i == retries - 1:
                raise
            print(f"    ⚠ API 重試（{e}）")
            time.sleep(2 * (i + 1))


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def norm(s):
    """檔名/標題寬鬆比對用：小寫、去 File: 前綴與副檔名、壓空白與撇號"""
    s = re.sub(r"^File:", "", s)
    s = re.sub(r"\.(jpe?g|png|gif|webp)$", "", s, flags=re.I)
    return re.sub(r"[\s_'’\-]+", " ", s).strip().lower()


def query_page_images(titles):
    """titles → {正規化後頁名: [File:...]}，含 redirect 對回原查詢名。
    回傳 (by_query_title, missing_titles)"""
    out, missing = {}, []
    r = api_get({"action": "query", "redirects": 1, "prop": "images",
                 "imlimit": "500", "titles": "|".join(titles)})
    q = r.get("query", {})
    # redirect / normalize 映射：查詢名 → 實際頁名
    to_real = {}
    for m in q.get("normalized", []) + q.get("redirects", []):
        to_real[m["from"]] = m["to"]
    real2query = {}
    for t in titles:
        real = t
        seen = set()
        while real in to_real and real not in seen:   # 防環
            seen.add(real)
            real = to_real[real]
        real2query[real] = t
    pages = {p["title"]: p for p in q.get("pages", {}).values()}
    # imcontinue：圖多時分頁補完
    cont = r.get("continue")
    while cont and "imcontinue" in cont:
        r2 = api_get({"action": "query", "redirects": 1, "prop": "images",
                      "imlimit": "500", "titles": "|".join(titles),
                      "imcontinue": cont["imcontinue"]})
        for p in r2.get("query", {}).get("pages", {}).values():
            if p["title"] in pages and "images" in p:
                pages[p["title"]].setdefault("images", []).extend(p["images"])
        cont = r2.get("continue")
    for real, p in pages.items():
        qt = real2query.get(real, real)
        if "missing" in p:
            missing.append(qt)
        else:
            imgs = [i["title"] for i in p.get("images", [])
                    if not NOISE.search(i["title"])]
            out[qt] = (p["title"], imgs)
    return out, missing


def pick_model_image(page_title, images, role=None):
    """從頁面附圖挑全身模特照。回傳 (File:..., who) 或 None。
    職能字一律整字比對——'aiming' 是 'maiming' 的子字串，用 in 會誤判。"""
    t = norm(page_title)

    def roles_in(n):
        return {w for w in ROLE_WORDS if re.search(rf"\b{w}\b", n)}

    scored = []
    for f in images:
        n = norm(f)
        fr = roles_in(n)
        if fr and (not role or role not in fr):
            continue  # 檔名標了別的職能 → 不是這套
        who = None
        if n == f"{t} female" or (t in n and "female" in n):
            who, rank = "female", 0
        elif n == f"{t} male" or (t in n and "male" in n and "female" not in n):
            who, rank = "male", 1
        elif re.fullmatch(re.escape(t) + r"\s*\d*", n):
            who, rank = "gallery", 2
        elif role and role in fr and any(
                w in n for w in t.split() if w not in GENERIC_WORDS):
            # 職能字＋頁名任一實義字在檔名裡（例：Bygone Brass Scouting Set.png；
            # Augmented Diadochos Armor 頁的圖叫 Diadochos Fending Set.png，
            # 沒有 augmented 前綴，所以不能只認頭字）
            who, rank = "role", 3
        else:
            continue
        scored.append((rank, len(n), f, who))
    if not scored:
        return None
    scored.sort()
    _, _, f, who = scored[0]
    return f, who


GENERIC_WORDS = {"of", "the", "a", "an", "s", "attire", "set", "gear", "armor",
                 "arms"} | set(ROLE_WORDS)


def common_suffix_words(names):
    """裝備英文名的詞級共同字尾：Helm/Armor/Gauntlets of the Behemoth King
    → 'of the behemoth king'。少於兩件無從交叉，回空字串。"""
    toks = [norm(n).split() for n in names if n]
    if len(toks) < 2:
        return ""
    suf = toks[0]
    for t in toks[1:]:
        i = 0
        while i < min(len(suf), len(t)) and suf[-1 - i] == t[-1 - i]:
            i += 1
        suf = suf[len(suf) - i:] if i else []
        if not suf:
            return ""
    return " ".join(suf)


def pick_by_piece_names(images, piece_ens, role=None):
    """後備比對：家族頁圖檔名 ↔ 裝備名共同字尾（例：Beastlord Armor 頁的
    'Attire of the Behemoth King.png' ↔ 'Helm of the Behemoth King'）。
    字尾去掉 of/the/職能字後須剩實義詞（≥1，且字尾至少兩個詞）；
    圖檔名寫法可能省略 of/the（Divine Wisdom attire ↔ of Divine Wisdom），
    兩種變體都試。"""
    suf = common_suffix_words(piece_ens)
    words = suf.split()
    if len(words) < 2 or not [w for w in words if w not in GENERIC_WORDS]:
        return None
    stripped = suf
    while stripped.split() and stripped.split()[0] in ("of", "the", "a", "an"):
        stripped = " ".join(stripped.split()[1:])
    cands = []
    for f in images:
        n = norm(f)
        fr = {w for w in ROLE_WORDS if re.search(rf"\b{w}\b", n)}
        if fr and (not role or role not in fr):
            continue
        if re.search(rf"\b{re.escape(suf)}\b", n) or \
           (stripped and re.search(rf"\b{re.escape(stripped)}\b", n)):
            cands.append((len(n), f))
    if not cands:
        return None
    return min(cands)[1], "piece"


def common_prefix_words(names):
    """裝備英文名的詞級共同字首：Templar's Haubergeon/Vambraces → 'templar s'"""
    toks = [norm(n).split() for n in names if n]
    if len(toks) < 2:
        return ""
    pre = toks[0]
    for t in toks[1:]:
        i = 0
        while i < min(len(pre), len(t)) and pre[i] == t[i]:
            i += 1
        pre = pre[:i]
        if not pre:
            return ""
    return " ".join(pre)


def pick_by_piece_prefix(images, piece_ens, role=None):
    """後備比對 2：圖檔名＝裝備名共同字首＋attire/set 等泛字
    （例：Dzemael Armor 頁的 'Templar's attire.png' ↔ 'Templar's Haubergeon'）。
    字首去掉檔名後，剩餘 token 只能是泛字／數字／本套職能字，避免撈到別套。"""
    pre = common_prefix_words(piece_ens)
    if not pre or len(pre.replace(" ", "")) < 5 or \
       not [w for w in pre.split() if w not in GENERIC_WORDS]:
        return None
    cands = []
    for f in images:
        n = norm(f)
        if not (n == pre or n.startswith(pre + " ")):
            continue
        rest = n[len(pre):].split()
        ok = all(w in GENERIC_WORDS or w.isdigit() for w in rest)
        role_in_rest = [w for w in rest if w in ROLE_WORDS]
        if role_in_rest and (not role or role not in role_in_rest):
            ok = False   # 檔名標了別的職能
        if ok:
            cands.append((len(rest), len(n), f))
    if not cands:
        return None
    return min(cands)[2], "prefix"


JOB_EN = {"PLD": "paladin", "WAR": "warrior", "DRK": "dark knight",
          "GNB": "gunbreaker", "WHM": "white mage", "SCH": "scholar",
          "AST": "astrologian", "SGE": "sage", "MNK": "monk", "DRG": "dragoon",
          "NIN": "ninja", "SAM": "samurai", "RPR": "reaper", "VPR": "viper",
          "BRD": "bard", "MCH": "machinist", "DNC": "dancer",
          "BLM": "black mage", "SMN": "summoner", "RDM": "red mage",
          "BLU": "blue mage", "PCT": "pictomancer",
          "CRP": "carpenter", "BSM": "blacksmith", "ARM": "armorer",
          "GSM": "goldsmith", "LTW": "leatherworker", "WVR": "weaver",
          "ALC": "alchemist", "CUL": "culinarian",
          "MIN": "miner", "BTN": "botanist", "FSH": "fisher"}
EXPANSION_WORDS = r"(?:a realm reborn|heavensward|stormblood|shadowbringers|endwalker|dawntrail)"

# 泛職能圖檔字（heavy/war/magic/tank…）：由套裝 cjc 的基礎職業組成推得
_BASE_MAGIC = {"CNJ", "THM", "ACN"}
_BASE_LIGHT = {"ARC", "PGL", "ROG"}          # 輕甲物理
_BASE_TANK = {"GLA", "MRD"}
_BASE_HEAL = {"CNJ"}
_JOBSETS = {
    "healing":  {"CNJ", "WHM", "SCH", "AST", "SGE"},
    "casting":  {"THM", "BLM", "ACN", "SMN", "RDM", "BLU", "PCT"},
    "fending":  {"GLA", "MRD", "PLD", "WAR", "DRK", "GNB"},
    "maiming":  {"LNC", "DRG", "RPR"},
    "aiming":   {"ARC", "BRD", "MCH", "DNC"},
    "striking": {"PGL", "MNK", "SAM"},
    "scouting": {"ROG", "NIN", "VPR"},
    "crafting": {"CRP", "BSM", "ARM", "GSM", "LTW", "WVR", "ALC", "CUL"},
    "gathering": {"MIN", "BTN", "FSH"},
}


def group_words(cjc_name):
    """套裝 cjc → 圖檔可能用的職能/群組字（wiki 編輯命名不統一，全列出來）。"""
    codes = set((cjc_name or "").split())
    if not codes or "All" in (cjc_name or ""):
        return []
    for role, jobs in _JOBSETS.items():
        if codes <= jobs:
            extra = {"healing": ["healer"], "casting": ["caster", "magic"],
                     "fending": ["tank", "heavy"], "maiming": ["heavy"],
                     "crafting": ["crafter"], "gathering": ["gatherer"],
                     }.get(role, [])
            return [role] + extra
    combat = {c for js in list(_JOBSETS.values())[:7] for c in js}
    if codes <= combat:
        if not codes & _BASE_MAGIC and not codes & _BASE_LIGHT:
            return ["heavy"]                  # 重甲物理（坦＋槍龍鐮）
        if not codes & _BASE_MAGIC:
            return ["war"]                    # 廣義物理（輕甲混編）
        if not codes & (combat - _JOBSETS["healing"] - _JOBSETS["casting"]):
            return ["magic"]                  # 法系＋治療
    return []


def pick_by_tokens(images, page_title, piece_ens, cjc_name):
    """後備比對 4：檔名的實義詞都出現在「裝備名＋頁名」詞庫中，且帶一個
    符合本套職能/群組的字（例：Qarn heavy attire ↔ Qarn Circlet［重甲組］、
    High Steel Maiming Set ↔ High Steel Helm of Maiming）。"""
    gws = set(group_words(cjc_name))
    role_and_group = set(ROLE_WORDS) | {"heavy", "war", "magic", "tank",
                                        "healer", "caster", "crafter", "gatherer"}
    if not gws:
        return None
    vocab = set()
    for nm2 in piece_ens:
        vocab.update(norm(nm2).split())
    vocab.update(norm(page_title).split())
    cands = []
    for f in images:
        toks = norm(f).split()
        sig = [w for w in toks if w not in GENERIC_WORDS
               and w not in role_and_group and not w.isdigit()]
        marks = [w for w in toks if w in role_and_group]
        if not marks or not all(m in gws for m in marks):
            continue   # 沒有職能字，或標了別組的職能字
        if not sig or not all(w in vocab for w in sig):
            continue   # 實義詞必須全部對得上裝備名/頁名
        cands.append((len(toks), f))
    if not cands:
        return None
    return min(cands)[1], "group"


def pick_by_body_piece(images, piece_by_slot):
    """後備比對 5：圖檔名＝上身裝備的完整名稱（活動服常見，如
    White Moonfire Happi.png）。上身照通常就是整套的樣子。"""
    body = piece_by_slot.get("上身")
    if not body:
        return None
    target = norm(body)
    for f in images:
        if re.fullmatch(re.escape(target) + r"\s*\d*", norm(f)):
            return f, "body"
    return None


def pick_by_job(images, cjc_name):
    """後備比對 3：AF 職業套頁的圖用職業名命名（Dancer af1.png、Black Mage5.png）。
    只在套裝屬於單一職業時嘗試。編號＝AF 世代，頁面會被 navbox 混進別世代的圖
    （ShB 頁上出現 Paladin4），所以先算「頁面主流編號」（各職業圖數字的眾數），
    只收該編號；af 系列（該資料片新職業）取最小號（af1 是本體、af2 起是概念圖）。"""
    job = JOB_EN.get((cjc_name or "").strip())
    if not job:
        return None
    def jnorm(f):
        return re.sub(rf"\b{EXPANSION_WORDS}\b", " ", norm(f)).strip()

    digits = []
    for f in images:
        m = re.fullmatch(r"([a-z' ]+?)\s*(\d+)", jnorm(f))
        if m and m.group(1).strip() in JOB_EN.values():
            digits.append(m.group(2))
    page_digit = max(set(digits), key=digits.count) if digits else None
    cands = []
    for f in images:
        m = re.fullmatch(re.escape(job) + r"\s*(af\s*)?(\d*)", jnorm(f))
        if not m:
            continue
        is_af, num = bool(m.group(1)), m.group(2)
        if is_af:
            cands.append(((1, num or "9"), f))
        elif page_digit and num == page_digit:
            cands.append(((0, num), f))
        elif not page_digit:
            cands.append(((2, num or "9"), f))
        # 有主流編號但數字不符 → 別世代的圖，跳過
    if not cands:
        return None
    return min(cands)[1], "job"


def resolve_urls(file_titles):
    """File:xxx → 640px 縮圖網址"""
    urls = {}
    for grp in chunks(sorted(set(file_titles)), BATCH):
        r = api_get({"action": "query", "prop": "imageinfo",
                     "iiprop": "url", "iiurlwidth": str(THUMB_W),
                     "titles": "|".join(grp)})
        q = r.get("query", {})
        norm_map = {m["to"]: m["from"] for m in q.get("normalized", [])}
        for p in q.get("pages", {}).values():
            ii = p.get("imageinfo")
            if not ii:
                continue
            u = ii[0].get("thumburl") or ii[0].get("url")
            title = norm_map.get(p["title"], p["title"])
            urls[title] = u
            urls[p["title"]] = u
    return urls


def safe_name(set_id):
    return re.sub(r"[^0-9A-Za-z]+", "_", set_id) + ".jpg"


def download(url, dest, jpeg_quality=82):
    from PIL import Image
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    img = Image.open(io.BytesIO(raw))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    if img.width > THUMB_W:
        img.thumbnail((THUMB_W, THUMB_W * 4))
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "JPEG", quality=jpeg_quality, optimize=True)
    time.sleep(DELAY)


def fetch_ge_fallback(cache, sets, save_cache):
    """第二來源（consolegameswiki 沒圖才用）：Gamer Escape 逐件模型圖
    Model-{裝備英文名}-Female-Hyur.png——單件全身照，拿「上身」當整套示意。"""
    todo = {}
    for s in sets:
        c = cache.get(s["id"])
        if c and ("img" in c or c.get("ge_miss")):
            continue
        piece = None
        for slot in ("上身", "腿部", "頭部"):
            piece = next((p for p in s["pieces"]
                          if p.get("slot") == slot and p.get("en")), None)
            if piece:
                break
        if piece:
            # GE 標題慣例：[F]→(F)（方括號是非法標題字元）、# 直接拿掉
            en = re.sub(r"\s+", " ",
                        piece["en"].replace("[", "(").replace("]", ")")
                                   .replace("#", "")).strip()
            # 女版優先；男性限定裝（種族服 (M) 等）只有男版模型圖
            todo[s["id"]] = [f"Model-{en}-Female-Hyur.png",
                             f"Model-{en}-Male-Hyur.png"]
    if not todo:
        return 0
    print(f"\n[D] Gamer Escape 逐件模型圖（第二來源）：{len(todo)} 套")
    titles = sorted({"File:" + f for fs in todo.values() for f in fs})
    urls = {}
    for grp in chunks(titles, BATCH):
        r = api_get({"action": "query", "prop": "imageinfo", "iiprop": "url",
                     "iiurlwidth": str(THUMB_W), "titles": "|".join(grp)},
                    base=GE_API)
        q = r.get("query", {})
        norm_map = {m["to"]: m["from"] for m in q.get("normalized", [])}
        for p in q.get("pages", {}).values():
            ii = p.get("imageinfo")
            if ii:
                u = ii[0].get("thumburl") or ii[0].get("url")
                urls[norm_map.get(p["title"], p["title"])] = u
                urls[p["title"]] = u
    n_dl = n_miss = 0
    for i, (sid, fnames) in enumerate(sorted(todo.items()), 1):
        fname = next((f for f in fnames if urls.get("File:" + f)), None)
        url = urls.get("File:" + fname) if fname else None
        if not url:
            cache.setdefault(sid, {})["ge_miss"] = True
            n_miss += 1
            continue
        dest = OUT_DIR / safe_name(sid)
        rel = str(dest.relative_to(ROOT)).replace("\\", "/")
        if not dest.exists():
            try:
                download(url, dest)
            except Exception as e:
                print(f"  ✗ {sid} {fname} 下載失敗：{e}")
                continue
        n_dl += 1
        cache[sid] = {"img": rel, "file": "File:" + fname,
                      "src": "ge", "who": "ge-model"}
        if i % 25 == 0:
            save_cache()
            print(f"  {i}/{len(todo)}", flush=True)
    save_cache()
    print(f"  GE 補到 {n_dl} 套、GE 也沒有 {n_miss} 套")
    return n_dl


def role_of(s):
    """從裝備英文名的 of Healing 等字尾推職能關鍵字"""
    for p in s.get("pieces", []):
        m = re.search(r"\bof (Fending|Healing|Casting|Scouting|Aiming|"
                      r"Maiming|Striking|Slaying)\b", p.get("en") or "")
        if m:
            return m.group(1).lower()
    return None


def heuristic_setnames(sets_todo, cache):
    """啟發式套：單品頁 wikitext 的 set-name 欄位 → {set_id: set-name}"""
    piece_of = {}
    for s in sets_todo:
        piece = next((p for p in s["pieces"]
                      if p.get("en") and p.get("slot") in ("上身", "頭部", "腿部", "腳部", "手部")), None)
        if piece:
            piece_of[s["id"]] = piece["en"]
    names = {}
    todo_titles = sorted(set(piece_of.values()))
    title2set = {}
    for grp in chunks(todo_titles, BATCH):
        r = api_get({"action": "query", "redirects": 1, "prop": "revisions",
                     "rvprop": "content", "rvslots": "main",
                     "titles": "|".join(grp)})
        q = r.get("query", {})
        to_real = {}
        for m in q.get("normalized", []) + q.get("redirects", []):
            to_real[m["from"]] = m["to"]
        real2query = {}
        for t in grp:
            real = t
            while real in to_real:
                nxt = to_real[real]
                if nxt == real:
                    break
                real = nxt
            real2query[real] = t
        for p in q.get("pages", {}).values():
            qt = real2query.get(p["title"], p["title"])
            if "missing" in p:
                continue
            try:
                txt = p["revisions"][0]["slots"]["main"]["*"]
            except (KeyError, IndexError):
                continue
            m = re.search(r"\|\s*set-name\s*=\s*([^\n|}]+)", txt)
            if m and m.group(1).strip():
                title2set[qt] = m.group(1).strip()
    for sid, piece_en in piece_of.items():
        if piece_en in title2set:
            names[sid] = title2set[piece_en]
    return names


WIKI_LINK = re.compile(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]")
TEMPLATE = re.compile(r"\{\{([^}|]+)(?:\|[^}]*)?\}\}")


def parse_outfit_info(txt):
    """Outfit/Item infobox → {stype, obtain[]}。取得方式資料，photo 之外的第二用途。"""
    out = {}
    m = re.search(r"\|\s*source-type\s*=\s*([^\n|}]+)", txt)
    if m and m.group(1).strip():
        out["stype"] = m.group(1).strip()
    # =[ \t]* 不能寫 \s*：空欄位時 \s* 會吃過換行、把後面的欄位掃進來
    m = re.search(r"\|\s*obtain-by\s*=[ \t]*(.*?)(?=\n\s*\|\s*[\w-]+\s*=|\n\}\})",
                  txt, re.S)
    if m:
        items = []
        for chunk in re.split(r"[\n;]", m.group(1)):
            chunk = chunk.strip().lstrip("*").strip()
            if not chunk or chunk.startswith("|"):
                continue
            t = TEMPLATE.search(chunk)
            if t and t.group(1).strip().lower() == "onlinestore":
                items.append("Online Store")
                continue
            # {{i|道具/副本名}} 連結模板 → 取第一個參數（副本掉落常這樣寫）
            for m2 in re.finditer(r"\{\{\s*i\s*\|\s*([^}|]+)", chunk):
                items.append(m2.group(1).strip())
            chunk = re.sub(r"\{\{\s*i\s*\|[^}]*\}\}", "", chunk)
            links = WIKI_LINK.findall(chunk)
            if links:
                items.extend(l.strip() for l in links)
            else:
                plain = TEMPLATE.sub("", chunk).strip(" .")
                if plain:
                    items.append(plain)
        # 去重保序
        seen = set()
        out["obtain"] = [x for x in items if not (x in seen or seen.add(x))]
    return out


def fetch_wiki_info(cache, sets):
    """mirage 套：抓套裝頁 wikitext，解析 source-type / obtain-by 進快取（可續傳）。"""
    todo = {}
    for s in sets:
        if not s["id"].startswith("mirage:"):
            continue
        c = cache.get(s["id"])
        if c is None or "stype" in c or "obtain" in c or c.get("noinfo"):
            continue
        page = c.get("page") or (s.get("name_en") if "miss" in c else None)
        if page:
            todo.setdefault(page, []).append(s["id"])
    if not todo:
        return 0
    print(f"\n[C] 取得方式（wiki source-type/obtain-by）：{len(todo)} 頁")
    n = 0
    pages = sorted(todo)
    for gi, grp in enumerate(chunks(pages, BATCH)):
        r = api_get({"action": "query", "redirects": 1, "prop": "revisions",
                     "rvprop": "content", "rvslots": "main",
                     "titles": "|".join(grp)})
        q = r.get("query", {})
        to_real = {}
        for m in q.get("normalized", []) + q.get("redirects", []):
            to_real[m["from"]] = m["to"]
        real2query = {}
        for t in grp:
            real, seen = t, set()
            while real in to_real and real not in seen:
                seen.add(real)
                real = to_real[real]
            real2query[real] = t
        for p in q.get("pages", {}).values():
            qt = real2query.get(p["title"], p["title"])
            if qt not in todo:
                continue
            info = {}
            if "missing" not in p:
                try:
                    info = parse_outfit_info(
                        p["revisions"][0]["slots"]["main"]["*"])
                except (KeyError, IndexError):
                    pass
            for sid in todo[qt]:
                c = cache.setdefault(sid, {})
                if info:
                    c.update(info)
                    n += 1
                else:
                    c["noinfo"] = True   # 頁面沒 infobox 欄位，下次不重抓
        if (gi + 1) % 5 == 0:
            print(f"  {min((gi+1)*BATCH, len(pages))}/{len(pages)}", flush=True)
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--limit", type=int, default=0, help="最多處理 N 套沒照片的")
    ap.add_argument("--force", action="store_true", help="忽略解析快取全部重查")
    ap.add_argument("--retry-miss", action="store_true", help="重試之前 miss 的套")
    args = ap.parse_args()

    data = json.loads(SETS_JSON.read_text(encoding="utf-8"))
    sets = data["sets"]
    cache = {}
    if PHOTOS_JSON.exists() and not args.force:
        cache = json.loads(PHOTOS_JSON.read_text(encoding="utf-8"))

    def save_cache():
        PHOTOS_JSON.write_text(
            json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    if args.retry_miss:   # 重試時 GE 第二來源也重查
        for v in cache.values():
            if isinstance(v, dict):
                v.pop("ge_miss", None)

    todo = []
    for s in sets:
        c = cache.get(s["id"])
        if c and "img" in c:
            continue
        if c and "miss" in c and not args.retry_miss:
            continue
        todo.append(s)
    if args.limit:
        todo = todo[:args.limit]
    print(f"官方套裝 {len(sets)} 套；已解析 {len(cache)}，本次處理 {len(todo)} 套")
    if not todo:
        print("沒有要處理的套裝。")
        return finalize(cache, sets, save_cache)

    # ---------- A. mirage：套裝名＝頁名 ----------
    mir = [s for s in todo if s["id"].startswith("mirage:") and s.get("name_en")]
    picks = {}   # set_id -> (page, File, who)
    if mir:
        print(f"\n[A] mirage 套（名稱直查）：{len(mir)} 套")
        by_name = {}
        for s in mir:
            by_name.setdefault(s["name_en"], []).append(s["id"])
        titles = sorted(by_name)
        done = 0
        for grp in chunks(titles, BATCH):
            got, missing = query_page_images(grp)
            for qt, (real, imgs) in got.items():
                pick = pick_model_image(real, imgs)
                for sid in by_name[qt]:
                    if pick:
                        picks[sid] = (real, pick[0], pick[1])
                    else:
                        cache[sid] = {"miss": "page-no-model-image", "page": real}
            for qt in missing:
                for sid in by_name[qt]:
                    cache[sid] = {"miss": "page-not-found", "q": qt}
            done += len(grp)
            print(f"  查頁 {done}/{len(titles)}（命中圖 {len(picks)}）", flush=True)

    # ---------- B. 啟發式：單品 → set-name → 家族頁 ----------
    heu = [s for s in todo if not s["id"].startswith("mirage:")]
    if heu:
        print(f"\n[B] 啟發式套（單品反查 set-name）：{len(heu)} 套")
        sid2setname = heuristic_setnames(heu, cache)
        print(f"  反查到 set-name：{len(sid2setname)}/{len(heu)} 套")
        by_page = {}
        for sid, pname in sid2setname.items():
            by_page.setdefault(pname, []).append(sid)
        sid_role = {s["id"]: role_of(s) for s in heu}
        set_by_id = {s["id"]: s for s in heu}
        pages = sorted(by_page)
        for grp in chunks(pages, BATCH):
            got, missing = query_page_images(grp)
            for qt, (real, imgs) in got.items():
                # 同一家族頁對到多個不同職能（cjc）的套 → 沒職能字的圖無法分辨
                # 是哪套的外觀（例：Beastlord Armor 一頁七套獵人裝），寧缺勿錯
                cjcs = {sid.split(":")[2] for sid in by_page[qt]
                        if sid.startswith("src:")}
                for sid in by_page[qt]:
                    role = sid_role.get(sid)
                    pick = pick_model_image(real, imgs, role=role)
                    if pick and len(cjcs) > 1 and pick[1] != "role":
                        # 多職能同頁的泛用圖不可信 → 改試「裝備名字尾」逐套比對
                        pick = None
                    if not pick:
                        s2 = set_by_id[sid]
                        # 只用可見防具算共同字首/字尾——武器名（Rainmaker…）
                        # 會破壞共同字首，曾害 True Blue 整套對不到
                        VIS = ("頭部", "上身", "手部", "腿部", "腳部")
                        ens = [p.get("en") for p in s2["pieces"]
                               if p.get("en") and p.get("slot") in VIS]
                        by_slot = {p.get("slot"): p.get("en")
                                   for p in s2["pieces"] if p.get("en")}
                        pick = (pick_by_piece_names(imgs, ens, role=role)
                                or pick_by_piece_prefix(imgs, ens, role=role)
                                or pick_by_tokens(imgs, real, ens,
                                                  s2.get("cjc_name"))
                                or pick_by_job(imgs, s2.get("cjc_name"))
                                or pick_by_body_piece(imgs, by_slot))
                    if pick:
                        picks[sid] = (real, pick[0], pick[1])
                    elif len(cjcs) > 1:
                        cache[sid] = {"miss": "ambiguous-multi-role", "page": real}
                    else:
                        cache[sid] = {"miss": "family-no-match", "page": real}
            for qt in missing:
                for sid in by_page[qt]:
                    cache[sid] = {"miss": "family-page-not-found", "q": qt}
        for s in heu:
            if s["id"] not in sid2setname and s["id"] not in cache:
                cache[s["id"]] = {"miss": "no-set-name"}

    # ---------- 解析下載網址 ----------
    files = sorted({f for (_, f, _) in picks.values()})
    print(f"\n解析圖檔網址：{len(files)} 張")
    urls = resolve_urls(files)

    # ---------- 下載 ----------
    n_dl = n_skip = n_err = 0
    save_every = 25
    for i, (sid, (page, f, who)) in enumerate(sorted(picks.items()), 1):
        url = urls.get(f)
        if not url:
            cache[sid] = {"miss": "no-image-url", "page": page, "file": f}
            continue
        dest = OUT_DIR / safe_name(sid)
        rel = str(dest.relative_to(ROOT)).replace("\\", "/")
        if dest.exists():
            n_skip += 1
        else:
            try:
                download(url, dest)
                n_dl += 1
            except Exception as e:
                print(f"  ✗ {sid} {f} 下載失敗：{e}")
                n_err += 1
                continue
        cache[sid] = {"img": rel, "page": page, "file": f, "who": who}
        if i % save_every == 0:
            save_cache()
            print(f"  {i}/{len(picks)}（新下載 {n_dl}）", flush=True)
    save_cache()
    print(f"下載完成：新 {n_dl}、已有 {n_skip}、失敗 {n_err}")
    return finalize(cache, sets, save_cache)


def finalize(cache, sets, save_cache):
    n_info = fetch_wiki_info(cache, sets)
    if n_info:
        print(f"  取得方式新解析：{n_info} 套")
        save_cache()
    fetch_ge_fallback(cache, sets, save_cache)
    ids = {s["id"] for s in sets}
    have = sum(1 for sid, c in cache.items() if sid in ids and "img" in c)
    n_ge = sum(1 for sid, c in cache.items()
               if sid in ids and c.get("src") == "ge")
    miss = sum(1 for sid, c in cache.items() if sid in ids and "miss" in c)
    print(f"\n總覽：{have}/{len(sets)} 套有官方示意照（其中 GE 單件 {n_ge}），"
          f"{miss} 套對不到（其餘 {len(sets)-have-miss} 套未處理）")
    # 統計 miss 原因
    from collections import Counter
    reasons = Counter(c["miss"] for sid, c in cache.items()
                      if sid in ids and "miss" in c)
    for k, v in reasons.most_common():
        print(f"  miss:{k} ×{v}")
    save_cache()
    return 0


if __name__ == "__main__":
    sys.exit(main())
