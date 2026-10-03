// 頁內快捷鍵回歸 — 改完 nav.js 的快捷鍵區或 collection-tracker.js 的 wireShortcuts 必跑。
//
// 驗的是「按鍵有沒有真的做事」，而這類錯誤**畫面上看不出來**：
// 登記時序錯了就是安靜地什麼都不發生，沒有 console error、沒有例外。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-shortcuts.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { dirname, join as pjoin } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);
const unhandled = [];
process.on('unhandledRejection', (e) => unhandled.push(String((e && e.message) || e)));

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const html = readFileSync(join(ROOT, 'collections/mounts/index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://seagod99.github.io/collections/mounts/',
  virtualConsole: vc,
});
const { window } = dom;
const doc = window.document;

window.fetch = async (url) => {
  const rel = String(url).replace(/^.*\/(data|assets)\//, '$1/');
  if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
};
window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
const proto = window.HTMLElement.prototype;
if (!proto.showModal) { proto.showModal = function () { this.setAttribute('open', ''); }; proto.close = function () { this.removeAttribute('open'); }; }
if (!proto.scrollIntoView) proto.scrollIntoView = function () {};

// 載入順序刻意模擬真實情形：collection-tracker 先、inline init 再、nav.js 最後（它是 defer）
for (const f of ['assets/js/patch-gate.js', 'assets/js/toast.js', 'assets/js/collection-tracker.js']) {
  window.eval(readFileSync(join(ROOT, f), 'utf8'));
}
const inline = [...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n;\n');
window.eval(inline);

push('nav.js 還沒載時 init 不會炸', errors.length === 0, errors.slice(0, 1).join('') || '乾淨');
push('  登記進了待辦佇列', Array.isArray(window.SGT_SHORTCUTS_PENDING) && window.SGT_SHORTCUTS_PENDING.length > 0,
  (window.SGT_SHORTCUTS_PENDING || []).length + ' 批');

window.eval(readFileSync(join(ROOT, 'assets/js/nav.js'), 'utf8'));
await new Promise((r) => setTimeout(r, 1500));

const SC = window.SGT_SHORTCUTS;
push('nav.js 載入後佇列被吸乾', !!SC && window.SGT_SHORTCUTS_PENDING.length === 0, '');
const reg = SC ? SC.list() : [];
// 坐騎頁沒有分頁（pageSize 0），所以只該登記 s／o——[ ] 不該憑空出現
push('無分頁的頁面只登記 s／o', reg.length === 2 && reg.map((s) => s.keys[0]).join('') === 'so',
  reg.map((s) => s.keys.join('/')).join('、'));
push('  每個鍵都有說明文字', reg.every((s) => s.label && /[一-鿿]/.test(s.label)), reg.map((s) => s.label).join('｜'));

const press = (key, target) => {
  const ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  (target || doc.body).dispatchEvent(ev);
  return ev;
};

// ── s：聚焦搜尋框 ────────────────────────────────────────────
{
  const input = doc.getElementById('ct-search');
  doc.body.focus?.();
  press('s');
  push('按 s 聚焦搜尋框', doc.activeElement === input, doc.activeElement ? doc.activeElement.id || doc.activeElement.tagName : '(無)');
  // 在輸入框裡打字時不該再攔
  const before = input.value;
  press('s', input);
  push('  在搜尋框裡打 s 不會被攔走', doc.activeElement === input && input.value === before, '');
  input.blur();
}

// ── o：循環擁有狀態 ──────────────────────────────────────────
{
  const activeOwn = () => doc.querySelector('#ct-own .own-btn.active')?.dataset.own;
  push('o 之前是「全部」', activeOwn() === 'all', activeOwn());
  press('o');
  push('按 o → 已擁有', activeOwn() === 'owned', activeOwn());
  press('o');
  push('再按 o → 未擁有', activeOwn() === 'missing', activeOwn());
  press('o');
  push('再按 o → 繞回全部', activeOwn() === 'all', activeOwn());
  push('  網址跟著變（可分享）', !/own=/.test(window.location.search), window.location.search || '(空)');
}

// ── Esc 在搜尋框裡 ───────────────────────────────────────────
{
  const input = doc.getElementById('ct-search');
  input.focus();
  input.value = '獅鷲';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  press('Escape', input);
  push('搜尋框裡按 Esc 清空關鍵字', input.value === '', JSON.stringify(input.value));
  press('Escape', input);
  push('  已空時再按 Esc 才失焦', doc.activeElement !== input, '');
}

// ── ? 說明浮層 ───────────────────────────────────────────────
{
  push('一開始沒有浮層', !doc.querySelector('#sgt-kb-overlay.open'), '');
  press('?');
  const ov = doc.querySelector('#sgt-kb-overlay');
  push('按 ? 開啟說明浮層', !!ov && ov.classList.contains('open'), '');
  push('  是 dialog 且標了 aria-modal', ov?.getAttribute('role') === 'dialog' && ov?.getAttribute('aria-modal') === 'true', '');
  const rows = ov ? ov.querySelectorAll('.sgt-kb-row') : [];
  push('  列出全站 3 條＋本頁 2 條', rows.length === 5, rows.length + ' 條');
  push('  本頁那一節在', /本頁/.test(ov?.textContent || ''), '');
  push('  焦點落在關閉鈕（鍵盤可操作）', doc.activeElement === ov?.querySelector('.sgt-kb-x'), doc.activeElement?.className || '');

  // 浮層開著時不該誤觸底下的頁面
  const activeOwn = () => doc.querySelector('#ct-own .own-btn.active')?.dataset.own;
  const own0 = activeOwn();
  press('o');
  push('  浮層開著時按 o 不會動到底下的篩選', activeOwn() === own0, own0 + ' → ' + activeOwn());

  // 宣告了 aria-modal 就必須關住焦點，否則 Tab 會跑到底下那一頁去
  {
    const x = ov.querySelector('.sgt-kb-x');
    x.focus();
    press('Tab');
    push('  Tab 不會逃出浮層', ov.contains(doc.activeElement), doc.activeElement?.className || doc.activeElement?.tagName);
    doc.body.focus?.();
    // 焦點被外力移到浮層外時，下一次 Tab 要抓回來
    const outside = doc.querySelector('#ct-search');
    outside.focus();
    press('Tab', outside);
    push('  焦點跑掉時下一次 Tab 抓回浮層', ov.contains(doc.activeElement), doc.activeElement?.className || doc.activeElement?.tagName);
  }

  press('Escape');
  push('按 Esc 關閉浮層', !ov.classList.contains('open'), '');
  press('o');
  push('  關閉後快捷鍵恢復', activeOwn() !== own0, own0 + ' → ' + activeOwn());
}

// ── <dialog open> 時不攔 ─────────────────────────────────────
{
  const dlg = doc.createElement('dialog');
  dlg.setAttribute('open', '');
  doc.body.appendChild(dlg);
  const activeOwn = () => doc.querySelector('#ct-own .own-btn.active')?.dataset.own;
  const before = activeOwn();
  press('o');
  push('詳情彈窗開著時按 o 不動作', activeOwn() === before, before);
  dlg.remove();
}

// ── 修飾鍵不觸發 ─────────────────────────────────────────────
{
  const input = doc.getElementById('ct-search');
  input.blur();
  doc.body.focus?.();
  const activeOwn = () => doc.querySelector('#ct-own .own-btn.active')?.dataset.own;
  const before = activeOwn();
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }));
  push('Ctrl+O 不被攔（瀏覽器功能鍵）', activeOwn() === before, before);
}

// ── 有分頁的頁面另開一份 DOM 測 [ ] ────────────────────────────
{
  const vc2 = new VirtualConsole();
  const err2 = [];
  vc2.on('jsdomError', (e) => err2.push(e.message));
  vc2.on('error', (...a) => err2.push(a.join(' ')));
  const h2 = readFileSync(join(ROOT, 'collections/hunting-log/index.html'), 'utf8');
  const d2 = new JSDOM(h2, { runScripts: 'outside-only', url: 'https://seagod99.github.io/collections/hunting-log/', virtualConsole: vc2 });
  const w2 = d2.window, dc2 = w2.document;
  w2.fetch = window.fetch;
  w2.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  const pr2 = w2.HTMLElement.prototype;
  if (!pr2.showModal) { pr2.showModal = function () { this.setAttribute('open', ''); }; pr2.close = function () { this.removeAttribute('open'); }; }
  if (!pr2.scrollIntoView) pr2.scrollIntoView = function () {};
  for (const f of ['assets/js/patch-gate.js', 'assets/js/toast.js', 'assets/js/collection-tracker.js']) {
    w2.eval(readFileSync(join(ROOT, f), 'utf8'));
  }
  // 這頁有一個 type="module" 的 inline script（map-modal），jsdom 的 eval 吃不下 import → 跳過
  w2.eval([...dc2.querySelectorAll('script:not([src])')]
    .filter((s) => (s.getAttribute('type') || '') !== 'module')
    .map((s) => s.textContent).join(';\n'));
  w2.eval(readFileSync(join(ROOT, 'assets/js/nav.js'), 'utf8'));
  await new Promise((r) => setTimeout(r, 1800));

  const reg2 = w2.SGT_SHORTCUTS.list();
  push('有分頁的頁面登記 4 個鍵', reg2.length === 4, reg2.map((s) => s.keys.join('/')).join('、'));
  const press2 = (key, target) => (target || dc2.body).dispatchEvent(new w2.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const cur = () => dc2.querySelector('#ct-pagination .ct-page-btn.active')?.textContent;
  push('  分頁有渲染出來', !!cur(), '現在第 ' + cur() + ' 頁');
  press2(']');
  push('按 ] 到第 2 頁', cur() === '2', '第 ' + cur() + ' 頁');
  push('  網址帶上 p=2（可分享）', /(\?|&)p=2/.test(w2.location.search), w2.location.search);
  press2('[');
  push('按 [ 回第 1 頁', cur() === '1', '第 ' + cur() + ' 頁');
  press2('[');
  push('  第 1 頁再按 [ 不會翻成負的', cur() === '1', '第 ' + cur() + ' 頁');
  // 翻到最後一頁之後再按 ] 也不能越界
  const last = [...dc2.querySelectorAll('#ct-pagination .ct-page-btn')].filter((b) => /^\d+$/.test(b.textContent)).pop();
  last.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const lastNo = cur();
  press2(']');
  push('  最後一頁再按 ] 不會越界', cur() === lastNo, '第 ' + cur() + ' 頁');
  push('  這頁也沒有 console error', err2.length === 0, err2.slice(0, 1).join('') || '乾淨');
}

// ── 命令面板依相關度排序（2026-10-03）────────────────────────────
/* 原本只取索引順序前 40 筆、不排序：「陸行鳥」（幻卡）排第 50 搜不到、「騎士」的職業行會排第 29、
   單字「鳥」40 格全被坐騎與寵物佔滿。現在：完全相符 → 開頭相符 → 包含，超過 40 筆講還有幾筆。 */
{
  if (!doc.getElementById('sgt-nav-input')) press('/');        // 面板第一次打開才建 DOM
  await new Promise((r) => setTimeout(r, 50));
  const inp = doc.getElementById('sgt-nav-input');
  const search = async (q) => {
    inp.value = q;
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));          // 第一次要等索引載入
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    return [...doc.querySelectorAll('#sgt-nav-list .sgt-nav-item')].map((a) => ({
      nm: a.querySelector('.nm').textContent, sub: (a.querySelector('.ext') || {}).textContent || '',
    }));
  };
  if (inp) {
    const content = (rows) => rows.filter((r) => r.sub && r.sub !== '物品' && r.sub !== '↗ 外部');
    const k = content(await search('騎士'));
    push('命令面板：完全相符的排第一（騎士）', k[0] && k[0].nm === '騎士', k.slice(0, 3).map((r) => r.nm + '/' + r.sub).join('、'));
    const c = content(await search('陸行鳥'));
    push('  原本排第 50 搜不到的「陸行鳥」（幻卡）找得到', c.some((r) => r.nm === '陸行鳥' && /幻卡/.test(r.sub)), c.slice(0, 3).map((r) => r.nm + '/' + r.sub).join('、'));
    const b = await search('鳥');
    push('  超過 40 筆時最後一列講還有幾筆', b.some((r) => /^另有 \d+ 筆符合/.test(r.nm)), (b.find((r) => /另有/.test(r.nm)) || {}).nm || '(沒有)');
    const types = new Set(content(b).map((r) => r.sub));
    push('  單字查詢不再只有坐騎與寵物（開頭相符的先排）', types.size >= 3, [...types].join('、'));
  } else push('命令面板輸入框存在', false, '(找不到 #sgt-nav-input)');
}

push('全程無 console error', errors.length === 0, errors.slice(0, 1).join('') || '乾淨');
push('沒有未捕捉的 rejection', unhandled.length === 0, unhandled.slice(0, 2).join(' | ') || '乾淨');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
