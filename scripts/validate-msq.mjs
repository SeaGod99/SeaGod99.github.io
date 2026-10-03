// 主線進度回歸 — 改完 tools/msq/ 或 data/msq.json 必跑。
//
// 兩個會安靜出錯的地方：
//   ① **章節順序**。`SortKey` 只在章節內有意義，拿來跨章排會排出
//      「第七星曆在新生艾奧傑亞前面」這種錯的順序（第一版就是這樣），
//      而畫面上仍然是一份漂亮的進度表——只是算出來的「還剩幾個」全錯。
//      正確依據是 `JournalGenre` 的 row id。
//   ② **哪些算主線**。用 genre id 白名單的話，改版新增章節會安靜漏掉；
//      正確依據是 `JournalSection` 的名稱以 `Main Scenario` 開頭。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-msq.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const DB = JSON.parse(readFileSync(join(ROOT, 'data/msq.json'), 'utf8'));
const HTML = readFileSync(join(ROOT, 'tools/msq/index.html'), 'utf8');
const BUILD = readFileSync(join(ROOT, 'scripts/build-msq.mjs'), 'utf8');

// ── ① 章節順序 ──────────────────────────────────────────
{
  push('14 個主線章節', DB.chapters.length === 14, DB.chapters.length + ' 章');
  const ids = DB.chapters.map((c) => c.id);
  push('  章節依 JournalGenre 的 row id 排（那就是劇情順序）',
    ids.every((v, i) => i === 0 || v > ids[i - 1]), ids.join('→'));

  /* 釘住開頭那三章的順序。錯的版本會是「第七星曆 → 蒼天 → … → 新生」，
     因為新生第一個任務的 SortKey 是 2、其餘章節都是 1。 */
  const names = DB.chapters.map((c) => c.name);
  push('  新生艾奧傑亞排第一', names[0] === '新生艾奧傑亞', names.slice(0, 3).join(' → '));
  push('  第七星曆排在新生之後', names.indexOf('第七星曆') === 1, names.slice(0, 3).join(' → '));
  push('  黃金遺產終章排最後', names[names.length - 1] === '黃金遺產終章', names.slice(-2).join(' → '));
  push('  建置腳本沒有用 SortKey 跨章排', !/chapters\.sort[\s\S]{0,120}\.sort\b/.test(BUILD) &&
    /chapters\.sort\(\(a, b\) => a\.id - b\.id\)/.test(BUILD), '');

  // data[] 必須與章節同序，頁面的「還剩幾個」靠索引算
  const seq = DB.data.map((q) => q.genre);
  push('  任務清單與章節同序', seq.every((v, i) => i === 0 || v >= seq[i - 1]), '');
  const chCount = {};
  DB.data.forEach((q) => { chCount[q.genre] = (chCount[q.genre] || 0) + 1; });
  push('  每章的 count 與實際筆數相符',
    DB.chapters.every((c) => chCount[c.id] === c.count), '');
  push('  總數相符', DB.count === DB.data.length, DB.count + ' / ' + DB.data.length);
}

// ── ② 主線的判定依據 ────────────────────────────────────
{
  push('用 JournalSection 判斷主線（不是 genre id 白名單）',
    /\^Main Scenario/.test(BUILD), '');
  push('  沒有寫死的 genre id 清單', !/\[1,\s*3,\s*6,\s*8/.test(BUILD), '');
}

// ── 台服名與資料品質 ────────────────────────────────────
{
  push('每個任務都有台服名', DB.data.every((q) => /[\u4e00-\u9fff]/.test(q.name)), '');
  push('  沒有日文原文', !/[\u3041-\u3096\u30A1-\u30FA]/.test(JSON.stringify(DB.data.map((q) => q.name))), '');
  push('  等級是數字不是陣列', DB.data.every((q) => typeof q.lv === 'number'),
    '例：' + DB.data[0].name + ' Lv' + DB.data[0].lv);
  push('  等級大致遞增（章節排對了的副作用）',
    DB.data[0].lv <= 10 && DB.data[DB.data.length - 1].lv >= 90,
    'Lv' + DB.data[0].lv + ' → Lv' + DB.data[DB.data.length - 1].lv);
  // 同名任務不去重——起始城市三選一那類
  const nameCount = {};
  DB.data.forEach((q) => { nameCount[q.name] = (nameCount[q.name] || 0) + 1; });
  const dup = Object.entries(nameCount).filter(([, n]) => n > 1);
  push('  同名任務保留著（去重會讓「本章剩幾個」對不上遊戲）', dup.length > 0,
    dup.slice(0, 2).map(([n, c]) => n + '×' + c).join('、'));
}

// ── 不宣稱做不到的事 ────────────────────────────────────
{
  push('頁面講明不估完成日', /不提供「每天 N 個估完成日」/.test(HTML), '');
  push('  講明不列沿途解鎖的副本', /沿途解鎖哪些副本/.test(HTML) && /交集為 0/.test(HTML), '');
  push('  資料檔沒有 unlocks 欄位（對不到就不放）',
    !DB.data.some((q) => q.unlocks), '');
}

// ── 前端 ────────────────────────────────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://seagod99.github.io/tools/msq/', virtualConsole: vc });
  const { window } = dom, doc = window.document;
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
  });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 600));

  push('章節表畫出來', doc.querySelectorAll('.ch-row').length === 14,
    doc.querySelectorAll('.ch-row').length + ' 列');

  // 搜尋一個真的存在的任務
  const target = DB.data[Math.floor(DB.data.length / 2)];
  const q = doc.getElementById('q');
  q.value = target.name;
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('搜得到任務', doc.querySelectorAll('.hit').length > 0,
    '「' + target.name + '」→ ' + doc.querySelectorAll('.hit').length + ' 筆');

  doc.querySelector('.hit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const cur = doc.getElementById('cur');
  push('  選了之後算出剩餘數', cur.style.display !== 'none' && /還剩/.test(cur.textContent),
    cur.textContent.replace(/\s+/g, ' ').slice(0, 60));
  push('  進度存進 ffxiv_ 開頭的 key', !!store.ffxiv_msq_at, Object.keys(store).join('、'));

  // 選最後一個任務 → 剩 0
  const last = DB.data[DB.data.length - 1];
  q.value = last.name;
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const hits = [...doc.querySelectorAll('.hit')];
  const exact = hits.find((h) => h.textContent.indexOf(last.name) >= 0) || hits[0];
  exact.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  push('  做到最後一個任務時顯示追完了', /已經追完了/.test(doc.getElementById('cur').textContent),
    doc.getElementById('cur').textContent.replace(/\s+/g, ' ').slice(-24));

  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

// ── 解鎖索引 → 主線頁（單向，2026-10-03）──────────────────
/* 解鎖索引的任務或前置任務是主線的，連到 `?id=<任務 id>`；主線頁只顯示「在哪一章、離你還有幾個」，
   **不改使用者的進度**（連過來的人不一定做到那裡）。主線頁也**不反向列解鎖**（見頁面說明）。 */
async function bootPage(path, query, seed) {
  const html = readFileSync(join(ROOT, path), 'utf8');
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://seagod99.github.io/' + path.replace('index.html', '') + query, virtualConsole: vc });
  const { window } = dom;
  const store = { ...(seed || {}) };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
  });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  // module 腳本（地圖彈窗）jsdom 跑不了，略過；這裡只驗清單與連結
  for (const sc of window.document.querySelectorAll('script:not([src]):not([type="module"])')) window.eval(sc.textContent);
  await new Promise((r) => setTimeout(r, 600));
  return { doc: window.document, store, errs };
}
{
  const UNL = JSON.parse(readFileSync(join(ROOT, 'data/system-unlocks.json'), 'utf8'));
  const ids = new Set(DB.data.map((x) => x.id));
  const want = new Set();
  for (const o of [...UNL.data.flatMap((s) => s.quests), ...UNL.jobs.map((j) => j.quest)]) {
    if (!o) continue;
    if (ids.has(o.id)) want.add(o.id);
    for (const p of o.prev || []) if (ids.has(p.id)) want.add(p.id);
  }
  const { doc, errs } = await bootPage('tools/unlock-index/index.html', '');
  const sysIds = new Set([...doc.querySelectorAll('a.u-msq')].map((a) => +a.getAttribute('href').split('=')[1]));
  const sysWant = new Set();
  for (const s of UNL.data) for (const o of s.quests) {
    if (ids.has(o.id)) sysWant.add(o.id);
    for (const p of o.prev || []) if (ids.has(p.id)) sysWant.add(p.id);
  }
  push('解鎖索引（系統分頁）：是主線的任務／前置都連到主線頁', sysWant.size > 0 && [...sysWant].every((id) => sysIds.has(id)),
    `應連 ${sysWant.size} 個、畫出 ${sysIds.size} 個；系統＋職業共 ${want.size} 個主線任務`);
  push('  每條連結都指向真的主線任務 id', [...sysIds].every((id) => ids.has(id)), '');
  push('  解鎖索引無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
  push('  主線頁沒有反向列解鎖（單向）', !/system-unlocks/.test(HTML), '');
}
{
  // 主線頁的 ?id=：還沒設進度 → 只說位置；設了進度 → 算出還差幾個；而且不改進度
  const t = DB.data[300];
  const a = await bootPage('tools/msq/index.html', '?id=' + t.id);
  const box = a.doc.getElementById('target');
  push('主線頁 ?id=<任務 id> 顯示它在哪一章的第幾個', box.style.display !== 'none' && box.textContent.includes(t.name) && /第 \d+ \/ \d+ 個/.test(box.textContent),
    box.textContent.replace(/\s+/g, ' ').slice(0, 70));
  push('  沒設進度時不改進度、也不假裝算得出差幾個', !('ffxiv_msq_at' in a.store) && /搜尋框/.test(box.textContent), '');
  const before = DB.data[100];
  const b = await bootPage('tools/msq/index.html', '?id=' + t.id, { ffxiv_msq_at: String(before.id) });
  const box2 = b.doc.getElementById('target');
  push('  設了進度：還差 (目標索引 − 目前索引) 個', box2.textContent.includes('還要 ' + (300 - 100) + ' 個'), box2.textContent.replace(/\s+/g, ' ').slice(-40));
  push('  連過來不會改掉原本的進度', b.store.ffxiv_msq_at === String(before.id), b.store.ffxiv_msq_at);
  const c = await bootPage('tools/msq/index.html', '?id=' + t.id, { ffxiv_msq_at: String(DB.data[400].id) });
  push('  已經做過的顯示 ✓', /已經做過/.test(c.doc.getElementById('target').textContent), '');
}

push('data/msq.json 有進 _meta', (() => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'data/_meta.json'), 'utf8'));
  return (meta.databases || []).some((d) => d.file === 'msq.json');
})(), '');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
