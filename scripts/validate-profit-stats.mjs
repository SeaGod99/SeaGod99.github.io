// 收益排行「接自己的製作數值」回歸 — 改完 tools/market/market.js 的這段必跑。
//
// 兩個安靜的失敗模式：
//   ① 沒存過數值的人被影響到（多出按鈕、多出標記、白載 13,835 列的配方表）
//      —— 提案要求「沒存過完全靜默」，破壞它不會有任何錯誤訊息。
//   ② 門檻判斷用錯欄位。`craft-recipes.json` 是壓縮的陣列列，欄位靠 `columns` 對位，
//      拿錯索引會得到另一個合法數字（例如把 durability 當成 craftsmanshipReq），
//      畫面上只會看到「做不了」標錯人。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-profit-stats.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const JS = readFileSync(join(ROOT, 'tools/market/market.js'), 'utf8');
const HTML = readFileSync(join(ROOT, 'tools/market/index.html'), 'utf8');
const CR = JSON.parse(readFileSync(join(ROOT, 'data/craft-recipes.json'), 'utf8'));

// ── 門檻欄位真的存在且對得上 ────────────────────────────
{
  const need = ['itemId', 'jobId', 'lvl', 'craftsmanshipReq', 'controlReq'];
  const missing = need.filter((k) => CR.columns.indexOf(k) < 0);
  push('craft-recipes 有門檻欄位', missing.length === 0, missing.join('、') || need.join('、'));
  push('  欄位是靠 columns 對位（沒有寫死索引）',
    /c\.forEach\(function \(k, i\) \{ ix\[k\] = i; \}\)/.test(JS) && /ix\.craftsmanshipReq/.test(JS), '');
  push('  沒有出現寫死的數字索引（row[13] 之類）', !/row\[\d+\]/.test(JS), '');

  const ix = {};
  CR.columns.forEach((k, i) => { ix[k] = i; });
  const withReq = CR.data.filter((r) => r[ix.craftsmanshipReq] > 0);
  push('資料裡真的有帶硬門檻的配方', withReq.length > 100, withReq.length + ' / ' + CR.data.length + ' 筆');
  const maxC = Math.max(...withReq.map((r) => r[ix.craftsmanshipReq]));
  push('  門檻值落在合理範圍（不是抓到別欄）', maxC > 1000 && maxC < 20000, '最高作業精度門檻 ' + maxC);
}

// ── 沒存過數值的人完全不受影響 ──────────────────────────
async function runMarket(stats, uni) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://seagod99.github.io/tools/market/', virtualConsole: vc });
  const { window } = dom, doc = window.document;
  const store = stats ? { ffxiv_craftsim_stats: JSON.stringify(stats) } : {};
  const fetched = [];
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
      key: () => null, get length() { return 0; },
    },
  });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    fetched.push(rel);
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  const proto = window.HTMLElement.prototype;
  if (!proto.showModal) { proto.showModal = function () {}; proto.close = function () {}; }
  window.Universalis = {
    WORLDS: { 4028: '伊弗利特' }, worldName: String, fmtGil: String, fmtAge: () => '剛剛',
    clearCache() {}, fetchListings: async () => ({ items: {} }), fetchHistory: async () => ({ items: {} }),
    fetchAggregated: async () => ({ items: {}, fetched: Date.now() }),
    fillQuote: () => null,
  };
  if (uni) Object.assign(window.Universalis, uni);
  for (const f of ['assets/js/patch-gate.js', 'assets/js/toast.js', 'assets/js/item-sources.js']) {
    try { window.eval(readFileSync(join(ROOT, f), 'utf8')); } catch (e) { /* 非必要 */ }
  }
  window.eval(JS);
  await new Promise((r) => setTimeout(r, 1500));
  return { window, doc, errs, fetched };
}

{
  const { doc, errs, fetched } = await runMarket(null);
  const btn = doc.getElementById('pfMine');
  push('沒存數值時「套用我的數值」不顯示', !!btn && btn.style.display === 'none',
    btn ? JSON.stringify(btn.style.display) : '(找不到按鈕)');
  push('  沒有去載 craft-recipes.json（13,835 列不該白載）',
    !fetched.some((u) => u.includes('craft-recipes')), fetched.filter((u) => u.includes('craft')).join('、') || '沒載');
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

// ── 存過數值的人：按鈕出現、套用會設好篩選 ──────────────
{
  const stats = { v: 3, lastJob: 14, jobs: {
    14: { level: 90, craftsmanship: 3000, control: 2800, cp: 500 },
    15: { level: 80, craftsmanship: 2500, control: 2300, cp: 450 },
    8: { level: 1, craftsmanship: 4200, control: 4000, cp: 600 },   // 沒練的（等級 1）不該被選進去
  } };
  const { window, doc, errs } = await runMarket(stats);
  const btn = doc.getElementById('pfMine');
  push('存過數值時按鈕會出現', !!btn && btn.style.display !== 'none', btn ? '顯示' : '(找不到)');

  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const active = [...doc.querySelectorAll('[data-pfjob].active')].map((c) => c.dataset.pfjob);
  push('  套用後選中有練到的職業', active.sort().join('、') === '烹調師、煉金術士', active.join('、') || '(沒選中)');
  push('  等級 1 的職業不被選進去（那是預設值不是真的練了）', !active.includes('刻木匠'), '');
  push('  等級區間設成最高職業的 -10 ~ 本級',
    doc.getElementById('pfMax').value === '90' && doc.getElementById('pfMin').value === '80',
    doc.getElementById('pfMin').value + '–' + doc.getElementById('pfMax').value);
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

// ── 「做不了」是獨立標記，不是混進利潤排序 ──────────────
{
  push('做不了用獨立的旗標顯示', /✗ 做不了/.test(JS), '');
  push('  title 會講出差在哪一項', /作業精度 ' \+ s\.craftsmanship \+ ' < '/.test(JS), '');
  push('  沒存數值時 gateOf 回 null（什麼都不畫）',
    /if \(!myStats \|\| !reqByItem\) return null;/.test(JS), '');
  push('  抓不到門檻表時不擋掃描', /catch \(e\) \{ \/\* 抓不到就不標記，不擋掃描 \*\/ \}/.test(JS), '');
  push('  沒有把做不了的從清單移除（使用者仍看得到它賺多少）',
    !/filter\([^)]*gateOf/.test(JS), '');
}

// ── 分批查價失敗不可以被當成「沒人在架」（2026-10-03）────────────────
/* 舊版 fetchInChunks 只在 `r && r.items` 時合併、失敗的批次直接略過：成品批失敗會落入
   「這一服沒人在架」的均價退路被標成「無競爭者」——查價失敗看起來像商機，畫面上完全看不出來。
   這裡讓第一批成品查價失敗、成交均價全部都有（正是舊版會誤標的條件）。 */
{
  let calls = 0, failFirst = true;
  const avg = (ids) => { const items = {}; ids.forEach((id) => { const side = { averageSalePrice: { world: { price: 1000 } }, dailySaleVelocity: { world: { quantity: 1 } } }; items[id] = { nq: side, hq: side }; }); return { items, fetched: Date.now() }; };
  const { window, doc, errs } = await runMarket(null, {
    fetchListings: async () => { calls++; if (failFirst && calls === 1) return null; return { items: {} }; },
    fetchAggregated: async (s, ids) => avg(ids),
  });
  const chip = doc.querySelector("[data-pfjob]");
  chip && chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  doc.getElementById("pfMin").value = "1"; doc.getElementById("pfMax").value = "100";
  doc.getElementById("pfRun").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 2500));
  const body = doc.getElementById("profitBody");
  const txt = body.textContent;
  push("分批查價失敗時，排行上方講出「幾批失敗」", /\d+／\d+ 批查價失敗/.test(txt), (txt.match(/\d+／\d+ 批查價失敗/) || ["(沒有)"])[0]);
  const lost = (txt.match(/(\d+) 項成品沒查到售價/) || [])[1];
  push("  失敗那批的成品不列入（不走「沒人在架」的均價退路）", lost && Number(lost) > 0, lost ? lost + " 項" : "(沒講)");
  const rows = body.querySelectorAll("tbody tr").length;
  push("  其餘批次照常列出", rows > 0, rows + " 列");
  push("  有「↻ 重查」鈕", !!doc.getElementById("pfRetry"), "");
  failFirst = false;
  doc.getElementById("pfRetry")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 2500));
  push("  重查成功後提示消失", !/批查價失敗/.test(doc.getElementById("profitBody").textContent), "");
  push("  無 console error", errs.length === 0, errs.slice(0, 1).join("") || "乾淨");
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
