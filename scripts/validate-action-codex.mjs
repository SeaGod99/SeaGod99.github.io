// 技能辭典回歸 — 改完 tools/action-codex/ 或 data/action-codex/ 必跑。
//
// 三件會安靜出錯的事：
//   ① **說明沒洗乾淨**：`<UIForeground>F201F8</UIForeground>` 包的是顏色碼，
//      只刪標籤會把 `F201F8F201F9威力：0101180` 印到畫面上。
//   ② **條件式沒收斂**：`<If(…)>A<Else/>B</If>` 有 359/1326 個技能在用，
//      不處理會看到七八行一模一樣的句子。
//   ③ **PvP 版與 PvE 版同名但威力差幾十倍**（火焰：PvE 180 / PvP 6000），
//      而且 PvP 版掛進階職、PvE 版掛基礎職——不分開的話黑魔點進來第一個看到 6000。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-action-codex.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const DIR = join(ROOT, 'data/action-codex');
const IDX = JSON.parse(readFileSync(join(DIR, '_index.json'), 'utf8'));
const ACT = JSON.parse(readFileSync(join(DIR, 'actions.json'), 'utf8')).data;
const TRA = JSON.parse(readFileSync(join(DIR, 'traits.json'), 'utf8')).data;
const STA = JSON.parse(readFileSync(join(DIR, 'statuses.json'), 'utf8')).data;
const HTML = readFileSync(join(ROOT, 'tools/action-codex/index.html'), 'utf8');

// ── ① 說明洗乾淨 ────────────────────────────────────────
{
  const all = [...ACT, ...TRA, ...STA].filter((x) => x.desc);
  const ui = all.filter((x) => /<UI|<Indent|<Sheet|<Clickable/.test(x.desc));
  push('沒有殘留的 UI 標記', ui.length === 0, ui.slice(0, 2).map((x) => x.name).join('、') || all.length + ' 筆全乾淨');
  // 顏色碼長這樣：F201F8。洗錯（只刪標籤）就會留下這串
  const hex = all.filter((x) => /F2[0-9A-F]{4}/.test(x.desc));
  push('  沒有把顏色碼印出來', hex.length === 0, hex.slice(0, 2).map((x) => x.name + '：' + x.desc.slice(0, 30)).join('｜') || '乾淨');
  // 威力值要是合理數字，不是被接在一起的怪數
  const pw = ACT.map((x) => (x.desc || '').match(/威力：(\d+)/)).filter(Boolean).map((m) => +m[1]);
  push('  威力值看起來正常（沒有接錯數字）', pw.length > 100 && pw.every((v) => v > 0 && v < 100000),
    pw.length + ' 個技能有威力，最小 ' + Math.min(...pw) + '、最大 ' + Math.max(...pw));
}

// ── ② 條件式收斂 ────────────────────────────────────────
{
  const all = [...ACT, ...TRA, ...STA].filter((x) => x.desc);
  const cond = all.filter((x) => /<If|<Else|<\/If>/.test(x.desc));
  push('沒有殘留的條件式標記', cond.length === 0, cond.slice(0, 2).map((x) => x.name).join('、') || '乾淨');
  // 去重：同一段說明裡不該有重複的行
  const dup = all.filter((x) => {
    const ls = x.desc.split('\n').map((l) => l.trim()).filter(Boolean);
    return new Set(ls).size !== ls.length;
  });
  push('  同一段說明裡沒有重複的行', dup.length === 0,
    dup.slice(0, 2).map((x) => x.name).join('、') || all.length + ' 筆全對');
}

// ── ③ PvP／PvE 分得開 ───────────────────────────────────
{
  const pvp = ACT.filter((x) => x.pvp);
  push('有標出 PvP 技能', pvp.length > 50, pvp.length + ' 個');
  const fire = ACT.filter((x) => x.name === '火焰');
  push('  同名的 PvE／PvP 版都在且分得開', fire.length >= 2 && fire.some((x) => x.pvp) && fire.some((x) => !x.pvp),
    fire.map((x) => (x.job || '-') + (x.pvp ? '(PvP)' : '') + ' ' + ((x.desc || '').match(/威力：(\d+)/) || [])[1]).join('、'));
  const pvePow = (fire.find((x) => !x.pvp && x.job) || {}).desc || '';
  const pvpPow = (fire.find((x) => x.pvp) || {}).desc || '';
  const a = +(pvePow.match(/威力：(\d+)/) || [])[1], b = +(pvpPow.match(/威力：(\d+)/) || [])[1];
  push('  兩者威力差很多（證明不能混在一起看）', a > 0 && b > 0 && b / a > 10, 'PvE ' + a + ' vs PvP ' + b);
}

// ── 台服名與說明都過守門 ────────────────────────────────
{
  const all = [...ACT, ...TRA, ...STA];
  push('每筆都有台服名', all.every((x) => /[\u4e00-\u9fff]/.test(x.name) || /^[A-Za-z]/.test(x.name)), '');
  const jp = all.filter((x) => /[\u3041-\u3096\u30A1-\u30FA]/.test(x.name + ' ' + (x.desc || '')));
  push('  沒有日文原文漏進來（說明也要各自驗）', jp.length === 0,
    jp.slice(0, 2).map((x) => x.name).join('、') || all.length + ' 筆全對');
  push('  只收玩家技能', ACT.length > 1000 && ACT.length < 2000, ACT.length + ' 個');
}

// ── 前端 ────────────────────────────────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    url: 'https://seagod99.github.io/tools/action-codex/?job=' + encodeURIComponent('黑魔道士'),
    virtualConsole: vc,
  });
  const { window } = dom, doc = window.document;
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 900));

  push('預設只看 PvE', doc.getElementById('pvpSel').value === 'pve', doc.getElementById('pvpSel').value);
  const rows = () => doc.querySelectorAll('.row');
  push('  黑魔道士有技能列出來', rows().length > 0, rows().length + ' 筆');
  push('  列出的都不是 PvP', doc.querySelectorAll('.tag.pvp').length === 0,
    doc.querySelectorAll('.tag.pvp').length + ' 個 PvP 標記');

  doc.getElementById('pvpSel').value = 'pvp';
  doc.getElementById('pvpSel').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  push('  切到只看 PvP 會變成全部有標記', rows().length > 0 &&
    doc.querySelectorAll('.tag.pvp').length === rows().length,
    rows().length + ' 筆／' + doc.querySelectorAll('.tag.pvp').length + ' 個標記');

  doc.getElementById('pvpSel').value = 'pve';
  doc.getElementById('pvpSel').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));

  // 種類切換
  const seg = doc.querySelector('#kindSeg button[data-kind="statuses"]');
  seg.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  push('切到「狀態」有東西', rows().length > 0, rows().length + ' 筆');
  push('  職業／等級／PvP 選單收起來（狀態沒有這些）',
    doc.getElementById('jobSel').style.display === 'none' &&
    doc.getElementById('pvpSel').style.display === 'none', '');

  /* ── ⛓ 連擊 ────────────────────────────────────────────
     全遊戲只有 53 招有連擊前置，而且前置全都在辭典裡。
     兩個會安靜出錯的地方：①前置被篩掉時不可以畫出半截樹
     ②PvE／PvP 不分開會把同名不同威力的兩招混進同一棵樹。 */
  {
    const combo = doc.querySelector('#kindSeg button[data-kind="combo"]');
    push('有「連擊」檢視', !!combo, '');
    // 先把職業清掉，看全部
    doc.getElementById('jobSel').value = '';
    combo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const nodes = doc.querySelectorAll('.cb-node');
    push('  畫出連擊樹', nodes.length > 0, nodes.length + ' 個節點');
    push('  有後續招式（縮排 > 0 的節點）',
      [...nodes].some((n) => n.querySelector('.cb-arrow')),
      [...nodes].filter((n) => n.querySelector('.cb-arrow')).length + ' 個後續');
    push('  每棵樹都標了職業', doc.querySelectorAll('.row.cb .tag.job').length === doc.querySelectorAll('.row.cb').length,
      doc.querySelectorAll('.row.cb').length + ' 棵');
    /* 預設只看 PvE，所以樹裡不該出現 PvP 標記。
       混進去的話同名兩招長得一樣，畫面上完全看不出來。 */
    push('  預設不混進 PvP 版（同名但威力差幾十倍）',
      doc.querySelectorAll('.row.cb .tag.pvp').length === 0,
      doc.querySelectorAll('.row.cb .tag.pvp').length + ' 個 PvP 標記');
    push('  不會出現半截樹（前置被篩掉就不畫）',
      /if \(!x\.combo \|\| !byId\[x\.combo\]\) return;/.test(HTML), '');
    push('  畫樹有防環（一筆壞資料不該讓頁面無限遞迴）', /if \(seen\[x\.id\]\) return '';/.test(HTML), '');

    // 篩到一個沒有連擊的職業 → 要講清楚，不要留白
    doc.getElementById('jobSel').value = '白魔道士';
    doc.getElementById('jobSel').dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    push('  沒有連擊關係的職業會講明（不留白）',
      /沒有連擊關係/.test(doc.getElementById('status').textContent) &&
      /只有 53 招有連擊前置/.test(doc.getElementById('rows').textContent),
      doc.getElementById('status').textContent.trim());
  }

  /* ── 📈 解鎖時程 ───────────────────────────────────────
     沒選職業時**不可以畫**——910 個技能混在一起沒有意義，而且會被當成壞掉。 */
  {
    const path = doc.querySelector('#kindSeg button[data-kind="path"]');
    push('有「解鎖時程」檢視', !!path, '');
    doc.getElementById('jobSel').value = '';
    path.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    push('  沒選職業時要求先選（不畫 910 個混在一起的時間軸）',
      /請先選一個職業/.test(doc.getElementById('status').textContent) &&
      doc.querySelectorAll('.pathrow').length === 0,
      doc.getElementById('status').textContent.trim());

    doc.getElementById('jobSel').value = '白魔道士';
    doc.getElementById('jobSel').dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const prs = [...doc.querySelectorAll('.pathrow')];
    push('  選了職業就畫出時間軸', prs.length > 0, prs.length + ' 個等級');
    const lvs = prs.map((r) => Number((r.querySelector('.pl').textContent || '').replace('Lv', '')));
    push('  等級是遞增的（時間軸的意義就在順序）',
      lvs.every((v, i) => i === 0 || v > lvs[i - 1]), lvs.slice(0, 6).join('→'));
    push('  每個等級都至少一個技能籌碼',
      prs.every((r) => r.querySelectorAll('.pchip').length > 0), '');
    push('  標題講出職業與技能數',
      /白魔道士/.test(doc.getElementById('status').textContent) &&
      /個技能/.test(doc.getElementById('status').textContent),
      doc.getElementById('status').textContent.trim().slice(0, 40));
  }

  /* 兩個新檢視都是由 actions.json 推出來的，**不可以另外產一份資料**。 */
  push('新檢視不另外產資料檔（由 actions.json 推）',
    /var DERIVED = \{ combo: 'actions', path: 'actions' \}/.test(HTML), '');
  push('  combo 欄位在資料裡（沒有的話兩個檢視都是空的）',
    ACT.some((a) => a.combo), ACT.filter((a) => a.combo).length + ' 筆有 combo');
  push('  combo 的前置都在辭典裡（不會有死連結）',
    (() => { const ids = new Set(ACT.map((a) => a.id));
      return ACT.filter((a) => a.combo).every((a) => ids.has(a.combo)); })(), '');
  push('  沒有 combo 的寫 null 不是 0（前端用 falsy 判斷，0 會被當成 id 0）',
    !ACT.some((a) => a.combo === 0), '');

  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

push('頁面講明只收玩家技能', /只收玩家技能/.test(HTML), '');
push('  講明 PvP 與 PvE 威力差很多', /威力差幾十倍|PvE 180、PvP 6000/.test(HTML), '');
push('  講明日文說明不顯示', /不會把日文放行/.test(HTML), '');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
