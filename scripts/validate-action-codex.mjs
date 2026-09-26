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

  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

push('頁面講明只收玩家技能', /只收玩家技能/.test(HTML), '');
push('  講明 PvP 與 PvE 威力差很多', /威力差幾十倍|PvE 180、PvP 6000/.test(HTML), '');
push('  講明日文說明不顯示', /不會把日文放行/.test(HTML), '');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
