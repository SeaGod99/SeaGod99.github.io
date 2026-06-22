#!/usr/bin/env python3
"""
verify_data.py — curated_outfits.json 資料正確性檢查
=====================================================
以日文→英文→繁中名稱依序定錨道具 ID，核對：
  名稱（zh/en/ja）、部位、等級、職業限制、取得方式

執行：
  py scripts\\verify_data.py            # curated 檢查 → data/驗證報告.md
  py scripts\\verify_data.py --json     # 另輸出 data/驗證報告.json（程式可讀）
  py scripts\\verify_data.py mirapri    # mirapri 品質檢查 → data/mirapri品質報告.md

注意：mirapri 的 zh/部位/等級/取得方式由 pipeline.py 從同一套 DB 推導，
拿同一套 DB「驗證」會循環論證；mirapri 模式做的是品質檢查——
定錨失敗的裝備名稱（API 名稱異常或 DB 過舊）、欄位覆蓋率、結構異常。

依賴：pipeline.py 的資料庫載入與取得方式解析函式（不需網路）。
"""

import json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pipeline as P
import msgpack

ROOT = Path(__file__).parent.parent
CURATED = ROOT / "data" / "curated_outfits.json"
ENRICHED = ROOT / "data" / "all_outfits_enriched.json"
REPORT_MD = ROOT / "data" / "驗證報告.md"
REPORT_JSON = ROOT / "data" / "驗證報告.json"
MIRAPRI_REPORT_MD = ROOT / "data" / "mirapri品質報告.md"

JOBZH = {'WHM':'白魔法師','SCH':'學者','AST':'占星術士','SGE':'賢者','PLD':'騎士','WAR':'戰士',
 'DRK':'暗黑騎士','GNB':'絕槍戰士','BLM':'黑魔法師','SMN':'召喚師','RDM':'赤魔法師','BLU':'青魔法師',
 'PCT':'繪靈法師','BRD':'吟遊詩人','MCH':'機工士','DNC':'舞者','MNK':'武僧','DRG':'龍騎士','NIN':'忍者',
 'SAM':'武士','RPR':'收割者','VPR':'劍蛇師','CRP':'木工師','BSM':'鍛鐵師','ARM':'甲冑師','GSM':'寶石工藝師',
 'LTW':'製革師','WVR':'布衣師','ALC':'煉金術士','CUL':'廚師','MIN':'採礦工','BTN':'園藝工','FSH':'捕魚人'}
_BASE = {'GLA':'PLD','PGL':'MNK','MRD':'WAR','LNC':'DRG','ARC':'BRD',
         'CNJ':'WHM','THM':'BLM','ACN':'SMN','ROG':'NIN'}

EMOJI_ST = [('🗡️','raid'),('🔶','scrip'),('🟣','scrip'),('🛒','npc'),('📋','npc'),('🔨','craft'),
            ('🎲','gs'),('⚔️','pvp'),('🪙','other'),('💎','store'),('🗓️','event'),('🗺️','other'),
            ('🚢','other'),('🏆','other'),('🌿','other')]


def st_of(src):
    for e, s in EMOJI_ST:
        if src.startswith(e):
            return s
    return None


def job_ok_set(js):
    """classJobCategoryName 可接受的中文標籤集合（群組名或單一職業名）"""
    if not js:
        return {'全職業'}
    s = {P._job_label(js)}
    eff = {_BASE.get(t, t) for t in js.split()}
    if len(eff) == 1 and next(iter(eff)) in JOBZH:
        s.add(JOBZH[next(iter(eff))])
    return s


def main():
    db = P.load_all_data()
    items = db['items']
    en_by_id = {str(k): v.get('en','') for k, v in
                msgpack.unpackb(open(P.DATA_DIR/'en-items.msgpack','rb').read(), raw=False).items()
                if isinstance(v, dict)}
    ja_by_id = {str(k): v.get('ja','') for k, v in
                msgpack.unpackb(open(P.DATA_DIR/'ja-items.msgpack','rb').read(), raw=False).items()
                if isinstance(v, dict)}
    zh2ids = {}
    for iid, v in items.items():
        nm = v.get('name','')
        if nm:
            zh2ids.setdefault(nm, []).append(iid)

    def anchor(p):
        zh = (p.get('zh','') or '').strip().rstrip('★').strip()
        en = (p.get('en','') or '').strip()
        ja = (p.get('ja','') or '').strip()
        return db['ja_to_id'].get(ja) or db['en_to_id'].get(en) or \
               (zh2ids.get(zh, [None])[0] if len(zh2ids.get(zh, [])) == 1 else None)

    cur = json.load(open(CURATED, encoding='utf-8'))

    L = {'en':[], 'ja':[], 'zh':[], 'slot':[], 'lv':[], 'job':[], 'noid':[],
         'src_fill':[], 'src_gil':[], 'src_multi':[], 'src_conflict':[], 'src_manual':[]}
    stat = dict(total=0, anchored=0)

    for o in cur:
        for p in o.get('pieces', []):
            stat['total'] += 1
            tag = f"{o['id']}/{p.get('slot','?')}"
            nm = (p.get('zh') or p.get('ja') or p.get('en') or '').strip()
            iid = anchor(p)
            if not iid:
                L['noid'].append((tag, nm, p.get('ja','')))
                continue
            stat['anchored'] += 1
            item = items.get(iid) or {}
            zh = (p.get('zh','') or '').strip()
            en = (p.get('en','') or '').strip()
            ja = (p.get('ja','') or '').strip()
            zc = zh.rstrip('★').strip()
            if item.get('name') and zc and zc != item['name']:
                L['zh'].append((tag, nm, zh, item['name']))
            if en and en_by_id.get(iid) and en != en_by_id[iid]:
                L['en'].append((tag, nm, en, en_by_id[iid]))
            if ja and ja_by_id.get(iid) and ja != ja_by_id[iid]:
                L['ja'].append((tag, nm, ja, ja_by_id[iid]))
            if item:
                cid = item.get('categoryId')
                es = P._CAT_TO_SLOT.get(int(cid),'') if cid else ''
                if es and p.get('slot') and p['slot'] != es and es != '武器':
                    L['slot'].append((tag, nm, p['slot'], es))
                lv = str(item.get('equipLevel','') or '')
                jlv = str(p.get('lv','') or '').strip()
                if lv and jlv and jlv != lv:
                    L['lv'].append((tag, nm, jlv, lv))
                js = item.get('equipStats',{}).get('classJobCategoryName','')
                jl = re.sub(r'^Lv\.?\s*\d+\s*', '', (p.get('job','') or '').strip())
                if ('equipStats' in item or js) and jl and jl not in job_ok_set(js):
                    L['job'].append((tag, nm, jl, '/'.join(sorted(job_ok_set(js))), js))
            # 取得方式
            jsrc = (p.get('source','') or '').strip()
            s1, st1 = P._resolve_from_sources(iid, items, db['sources'], db['recipes_json'])
            if s1:
                rsrc, rst = s1, st1
            else:
                rsrc, rst = P._resolve_from_om(iid, items, db['om'], db['tw_npcs'],
                                               db['tw_places'], db['tw_quests'], db['recipe_by_id'])
            if not rsrc:
                if jsrc and '待確認' not in jsrc and jsrc != '—':
                    L['src_manual'].append((tag, nm, jsrc))
                continue
            if jsrc == rsrc or (st_of(jsrc) == rst):
                continue
            if '待確認' in jsrc or jsrc in ('', '—'):
                L['src_fill'].append((tag, nm, jsrc or '(空)', rsrc))
            elif jsrc.startswith('🪙Gil'):
                L['src_gil'].append((tag, nm, jsrc, rsrc))
            elif '/' in jsrc or '／' in jsrc:
                L['src_multi'].append((tag, nm, jsrc, rsrc))
            else:
                L['src_conflict'].append((tag, nm, jsrc, rsrc))

    # ── 輸出報告 ──
    import datetime
    today = datetime.date.today().isoformat()
    out = ['# 裝備資料正確性檢查報告', '',
           f'檢查日期：{today}　對象：data/curated_outfits.json（{len(cur)} 套、{stat["total"]} 件裝備）', '',
           f'以日文→英文→繁中名稱依序定錨道具 ID：可驗證 {stat["anchored"]} 件，'
           f'無法定錨 {len(L["noid"])} 件（繁中 DB 未收錄的新道具，名稱與取得方式皆無法核對）。', '',
           '## 一、需要修正（建議自動修正）', '',
           f'### 1. 裝備等級錯誤（{len(L["lv"])} 件）', '',
           '多為以預設值 1 填入未查 DB。格式：套裝/部位「名稱」JSON→DB', '']
    for t,n,a,b in L['lv']: out.append(f'- {t}「{n}」 {a} → **{b}**')
    out += ['', f'### 2. 取得方式「待確認／空白」但 DB 可解出（{len(L["src_fill"])} 件）', '']
    for t,n,a,b in L['src_fill']: out.append(f'- {t}「{n}」 {a} → **{b}**')
    out += ['', f'### 3. 🪙Gil 標法應為 🛒NPC商店（{len(L["src_gil"])} 件）', '']
    for t,n,a,b in L['src_gil']: out.append(f'- {t}「{n}」 {a} → **{b}**')
    out += ['', f'### 4. 英文名稱與 DB 不符（{len(L["en"])} 件）', '']
    for t,n,a,b in L['en']: out.append(f'- {t}「{n}」 {a} → **{b}**')
    out += ['', f'### 5. 日文名稱與 DB 不符（{len(L["ja"])} 件）', '']
    for t,n,a,b in L['ja']: out.append(f'- {t}「{n}」 {a} → **{b}**')
    out += ['', f'### 6. 部位錯誤（{len(L["slot"])} 件）', '']
    for t,n,a,b in L['slot']: out.append(f'- {t}「{n}」 {a} → **{b}**')
    out += ['', f'### 7. 繁中名稱與 DB 不符（{len(L["zh"])} 件，已忽略結尾★）', '']
    for t,n,a,b in L['zh']: out.append(f'- {t}「{n}」 {a} → **{b}**')
    out += ['', f'## 二、需要逐筆覆核（{len(L["src_conflict"]) + len(L["job"])} 件）', '',
            f'### 取得方式類別衝突（{len(L["src_conflict"])} 件）——JSON 與 DB 說法不同，需確認哪邊對', '']
    for t,n,a,b in L['src_conflict']: out.append(f'- {t}「{n}」\n  - JSON：{a}\n  - DB：{b}')
    out += ['', f'### 職業限制不符（{len(L["job"])} 件）——DB raw 欄位附在後', '']
    for t,n,a,b,js in L['job']: out.append(f'- {t}「{n}」 JSON「{a}」 / DB 建議「{b}」（raw: {js or "無限制"}）')
    out += ['', '## 三、無法驗證、僅供參考', '',
            f'### JSON 取得方式比 DB 豐富（{len(L["src_multi"])} 件，多來源寫法，通常 JSON 較完整）', '']
    for t,n,a,b in L['src_multi']: out.append(f'- {t}「{n}」 JSON：{a}｜DB：{b}')
    out += ['', f'### 人工補充、DB 解不出（{len(L["src_manual"])} 件）', '']
    for t,n,a in L['src_manual']: out.append(f'- {t}「{n}」 {a}')
    out += ['', f'### 無法定錨道具 ID（{len(L["noid"])} 件）', '',
            '繁中 DB 未收錄，無法核對。', '']
    for t,n,j in L['noid']: out.append(f'- {t}「{n or j}」')

    REPORT_MD.write_text('\n'.join(out), encoding='utf-8')
    counts = {k: len(v) for k, v in L.items()}
    print(f'\n✅ 報告已寫入 {REPORT_MD}')
    print(f'   共 {stat["total"]} 件、可驗證 {stat["anchored"]} 件')
    print(f'   可自動修正：lv={counts["lv"]} 補來源={counts["src_fill"]} Gil標法={counts["src_gil"]} '
          f'en={counts["en"]} ja={counts["ja"]} slot={counts["slot"]} zh={counts["zh"]}')
    print(f'   需覆核：來源衝突={counts["src_conflict"]} 職業={counts["job"]}')
    print(f'   無法驗證：無ID={counts["noid"]} 人工補充={counts["src_manual"]} 多來源={counts["src_multi"]}')

    if '--json' in sys.argv:
        REPORT_JSON.write_text(json.dumps({'stat': stat, 'issues': {k: v for k, v in L.items()}},
                               ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'   JSON 版：{REPORT_JSON}')


def main_mirapri():
    """mirapri 品質檢查：定錨失敗名稱、欄位覆蓋率、結構異常"""
    from collections import Counter
    import datetime

    print('[載入] ja/en-items …', end=' ', flush=True)
    ja_data = msgpack.unpackb(open(P.DATA_DIR/'ja-items.msgpack','rb').read(), raw=False)
    en_data = msgpack.unpackb(open(P.DATA_DIR/'en-items.msgpack','rb').read(), raw=False)
    ja_to_id = {v.get('ja',''): str(k) for k, v in ja_data.items() if isinstance(v,dict) and v.get('ja')}
    en_to_id = {v.get('en',''): str(k) for k, v in en_data.items() if isinstance(v,dict) and v.get('en')}
    print(f'ja={len(ja_to_id):,} en={len(en_to_id):,}')

    data = json.load(open(ENRICHED, encoding='utf-8'))
    mir = [o for o in data if o.get('type') == 'mirapri']

    img_dir = ROOT / '配裝圖片' / 'mirapri'
    thumb_dir = ROOT / '配裝圖片' / '縮圖' / 'mirapri'

    n_eq = n_zh = n_src = n_slot = n_noid = 0
    unmatched = Counter()
    no_equip, no_image, dup_ids = [], [], []
    seen = Counter()
    for o in mir:
        seen[o.get('id')] += 1
        eqs = o.get('equipments', [])
        if not eqs:
            no_equip.append(o.get('id'))
        img = (o.get('image','') or '').rsplit('/',1)[-1]
        if img and not (img_dir/img).exists() and not (thumb_dir/(img)).exists():
            no_image.append(o.get('id'))
        for eq in eqs:
            n_eq += 1
            name = (eq.get('name','') or '')
            if eq.get('zh'): n_zh += 1
            if (eq.get('source','') or '').strip(): n_src += 1
            if eq.get('slot'): n_slot += 1
            if not (ja_to_id.get(name) or en_to_id.get(name) or
                    ja_to_id.get(name.strip()) or en_to_id.get(name.strip())):
                n_noid += 1
                unmatched[name] += 1
    dup_ids = [k for k, v in seen.items() if v > 1]

    def pct(x): return f'{100*x//n_eq}%' if n_eq else '-'
    today = datetime.date.today().isoformat()
    out = ['# Mirapri 資料品質報告', '',
           f'檢查日期：{today}　對象：data/all_outfits_enriched.json（{len(mir):,} 套、{n_eq:,} 件裝備）', '',
           '> mirapri 的衍生欄位由 pipeline.py 從 DB 推導，本報告檢查的是品質與覆蓋率，',
           '> 不是欄位正確性（那會循環論證）。', '',
           '## 覆蓋率', '',
           f'- 道具 ID 可定錨：{n_eq-n_noid:,}/{n_eq:,}（{pct(n_eq-n_noid)}）',
           f'- 有繁中名稱：{n_zh:,}（{pct(n_zh)}）　※ 空白 = 繁中版未實裝或定錨失敗',
           f'- 有取得方式：{n_src:,}（{pct(n_src)}）',
           f'- 有部位：{n_slot:,}（{pct(n_slot)}）', '',
           '## 結構異常', '',
           f'- 重複套裝 ID：{len(dup_ids)} 個' + (f'：{dup_ids[:10]}' if dup_ids else ''),
           f'- 無裝備清單的套裝：{len(no_equip)} 套' + (f'（前10：{no_equip[:10]}）' if no_equip else ''),
           f'- 原圖與縮圖皆缺：{len(no_image)} 套' + (f'（前10：{no_image[:10]}）' if no_image else ''), '',
           f'## 定錨失敗的裝備名稱（共 {n_noid:,} 件、{len(unmatched):,} 種，依出現次數）', '',
           '可能原因：API 名稱含異常字元、DB 未收錄的最新道具、改名道具。', '']
    for name, cnt in unmatched.most_common(60):
        out.append(f'- ×{cnt}　「{name}」')
    if len(unmatched) > 60:
        out.append(f'- …其餘 {len(unmatched)-60:,} 種')

    MIRAPRI_REPORT_MD.write_text('\n'.join(out), encoding='utf-8')
    print(f'\n✅ 報告已寫入 {MIRAPRI_REPORT_MD}')
    print(f'   {len(mir):,} 套 / {n_eq:,} 件　定錨 {pct(n_eq-n_noid)}　繁中 {pct(n_zh)}　來源 {pct(n_src)}')
    print(f'   結構異常：重複ID={len(dup_ids)} 無裝備={len(no_equip)} 缺圖={len(no_image)}')


if __name__ == '__main__':
    if 'mirapri' in sys.argv[1:]:
        main_mirapri()
    else:
        main()
