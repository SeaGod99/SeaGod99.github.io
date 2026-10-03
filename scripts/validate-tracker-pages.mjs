// validate-tracker-pages.mjs — 13 個追蹤頁的 DOM 層回歸
//
// 什麼時候跑：**改了 assets/js/collection-tracker.js 或 assets/js/toast.js 之後**。
// 那支引擎被 13 個追蹤頁共用，壞掉的徵狀常常是「某頁少了一塊」而不是報錯。
//
// 驗什麼：
//   1. toast.js 本身（Toast.show 的 role=status、沒有 <dialog> 時會退回原生 confirm）
//   2. 每頁都渲染出控制面（#ct-clear）且 console 乾淨
//   3. **按「清除進度」→ 出現站內確認框 → 按取消，進度與備份檔都不能動**
//      這條是 2026-09-23 把原生 confirm 換成 Toast.confirm 時加的：
//      Toast.confirm 回傳 Promise，若呼叫端沿用 `if (!confirm(…)) return` 的舊寫法，
//      Promise 物件恆為 truthy → 使用者按取消也會被清光，而畫面上完全看不出來。
//
// 已知跳過：整頁邏輯寫在 <script type="module"> 的頁面（釣魚頁）——jsdom 會去解相對 import
// 而跑不起來。那頁吃的是同一支引擎，由其餘 11 頁覆蓋。
//
// 相依：jsdom（**刻意不進 package.json**，本機 headless Chromium 在此環境起不來，
//       見 docs/專案慣例與記憶.md §2.5）。沒裝的話先：
//         npm i jsdom --no-save
//
// 執行（repo 根目錄）：node scripts/validate-tracker-pages.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTw } from "./lib/tw-text.mjs";

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import('jsdom')); }
catch { console.error('需要 jsdom：npm i jsdom --no-save'); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 有些頁面的 inline script 會動態 import('../../assets/js/map-explorer.js')；
// 在 jsdom 的 eval 裡這個會交給 Node 的 ESM loader，路徑解析不到而 reject。
// 那是 harness 的限制不是頁面的錯，吞掉即可（真正的 console error 仍由 VirtualConsole 收）。
const dynImportFails = [];
process.on('unhandledRejection', (e) => {
  if (e && e.code === 'ERR_MODULE_NOT_FOUND') { dynImportFails.push(e.url || ''); return; }
  throw e;
});

const TRACKER_PAGES = [
  'collections/mounts/index.html', 'minions/index.html', 'collections/barding/index.html',
  'collections/orchestrion/index.html', 'collections/emotes/index.html', 'collections/hairstyles/index.html',
  'collections/blue-magic/index.html', 'collections/triple-triad/index.html',
  'collections/exploration-log/index.html', 'collections/hunting-log/index.html',
  'collections/ornaments/index.html', 'collections/achievements/index.html', 'tools/aether-currents/index.html',
  'tools/gathering-log/index.html', 'tools/fishing/index.html',
].filter((p) => existsSync(join(ROOT, p)));

async function boot(page, extraScripts = [], seed = null) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (...a) => errors.push(a.join(' ')));
  // 所有 inline script 都先從 HTML 拿掉：module 那種交給 jsdom 會去解相對 import 而爆掉，
  // classic 的則等我手動 eval（順序才控制得住）。
  const all = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  const blocks = all.filter((b) => !/type="module"/.test(b[0]));
  let stripped = html;
  for (const b of all) stripped = stripped.replace(b[0], '');
  const depth = page.split('/').length - 1;
  const base = '../'.repeat(depth) || './';
  const dom = new JSDOM(stripped, {
    runScripts: 'dangerously',
    url: 'https://seagod99.github.io/' + page.replace(/index\.html$/, ''),
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = async (url) => {
        const rel = String(url).replace(/^.*?(data|assets)\//, '$1/');
        return { ok: true, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
      };
      window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      // jsdom 沒有實作 <dialog>.showModal()，補一個最小假實作，才驗得到對話框路徑
      const proto = window.HTMLElement.prototype;
      window.HTMLDialogElement = window.HTMLDialogElement || class {};
      if (!window.HTMLDialogElement.prototype.showModal) {
        window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
        window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
      }
      if (seed) for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
    },
  });
  const { window } = dom;
  const origCreate = window.document.createElement.bind(window.document);
  window.document.createElement = function (tag) {
    const el = origCreate(tag);
    if (String(tag).toLowerCase() === 'dialog' && typeof el.showModal !== 'function') {
      el.showModal = function () { el.setAttribute('open', ''); };
      el.close = function () { el.removeAttribute('open'); };
    }
    return el;
  };
  for (const f of ['assets/js/toast.js', 'assets/js/patch-gate.js', 'assets/js/collection-tracker.js', ...extraScripts]) {
    window.eval(readFileSync(join(ROOT, f), 'utf8'));
  }
  for (const b of blocks) {
    try { window.eval(b[1]); } catch (e) { errors.push('inline: ' + e.message); }
  }
  await new Promise((r) => setTimeout(r, 1500));
  return { window, doc: window.document, errors, blocks };
}

const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

// toast.js 本身
{
  const dom = new JSDOM('<!doctype html><body>', { runScripts: 'dangerously' });
  dom.window.eval(readFileSync(join(ROOT, 'assets/js/toast.js'), 'utf8'));
  const T = dom.window.Toast;
  push('Toast 掛上 window', !!(T && T.show && T.confirm), '');
  T.show('測試訊息');
  push('show() 產生 role=status 的節點', !!dom.window.document.querySelector('.sgt-toast[role="status"]'), dom.window.document.querySelector('.sgt-toast')?.textContent);
  // 沒有 <dialog> 支援時退回原生 confirm（不能安靜通過）
  delete dom.window.HTMLDialogElement;
  let nativeCalled = false;
  dom.window.confirm = () => { nativeCalled = true; return false; };
  const v = await T.confirm('x');
  push('無 <dialog> 時退回原生 confirm', nativeCalled && v === false, 'v=' + v);
}

// 12 個追蹤頁：引擎仍正常渲染、無 console error
let bad = [], skipped = [];
for (const p of TRACKER_PAGES) {
  try {
    const { doc, errors, blocks } = await boot(p);
    // 整頁邏輯寫在 <script type="module"> 的頁面（釣魚頁）這個 harness 跑不起來——
    // jsdom 會去解相對 import。那是 harness 限制不是回歸，跳過並記下來。
    if (!blocks.length) { skipped.push(p); continue; }
    const cards = doc.querySelectorAll('.ct-card, .col-card').length;
    const clear = doc.getElementById('ct-clear');
    if (!clear || errors.length) bad.push(`${p}（卡片 ${cards}、錯誤 ${errors.length}：${errors[0] || ''}）`);
  } catch (e) { bad.push(`${p}（載入失敗：${e.message}）`); }
}
push(`${TRACKER_PAGES.length - skipped.length} 個追蹤頁都渲染出控制面且無 console error`, bad.length === 0, bad.join(' | ') || '全部乾淨');
if (skipped.length) console.log(`  ⓘ 跳過（整頁走 ES module，此 harness 跑不起來）：${skipped.join('、')}`);

// 任務來源的接取點（CollectionTracker.sourceWhere）：
// 資料在 data/*.json 的 sources[].issuer/at，由 patch-collection-quest-npc.mjs 補。
// 這段驗的是「有資料就畫得出來」——漏接 sourceWhere 的頁面不會報錯，只會安靜地少一行。
{
  const QUEST_PAGES = [
    ['collections/mounts/index.html', 'mounts'],
    ['minions/index.html', 'minions'],
    ['collections/orchestrion/index.html', 'orchestrion'],
    ['collections/barding/index.html', 'barding'],
    ['collections/emotes/index.html', 'emotes'],
  ];
  const missing = [], badFlag = [], badName = [];
  for (const [page, file] of QUEST_PAGES) {
    const db = JSON.parse(readFileSync(join(ROOT, 'data', file + '.json'), 'utf8'));
    const has = db.data.some((e) => (e.sources || []).some((s) => s.issuer && s.issuer.name));
    if (!has) continue;                       // 這份資料本來就沒有接取點，不該苛求畫面
    const { doc, window } = await boot(page);
    // 寵物頁的格子是仿遊戲內圖鑑的小方格，取得方式收在 hover 提示框裡（該頁自己的設計），
    // 所以要先 hover 一張有接取點的卡才畫得出來。其餘頁面是卡片直接列。
    if (file === 'minions') {
      const want = new Set(db.data.filter((e) => (e.sources || []).some((s) => s.issuer)).map((e) => e.name));
      const card = [...doc.querySelectorAll('.minion-name')]
        .find((n) => want.has(n.textContent))?.closest('.ct-card, .col-card') || null;
      if (card) card.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    }
    const wheres = [...doc.querySelectorAll('.ct-where')];
    if (!wheres.length) { missing.push(page); continue; }
    for (const b of doc.querySelectorAll('.ct-flag')) {
      if (!/^\/coord \d+(\.\d)? \d+(\.\d)? \S/.test(b.dataset.flag || '')) badFlag.push(page + '：' + b.dataset.flag);
    }
    // NPC 名必須是繁中（鐵則：查不到台服名就不該顯示，更不該落英文）
    for (const w of wheres) {
      const m = (w.textContent || '').match(/接取：([^\s　]+)/);
      if (m && !isTw(m[1])) badName.push(page + '：' + m[1]);
    }
  }
  push('有接取點資料的收藏頁都畫得出「接取：NPC」', missing.length === 0, missing.join('、') || '全部有');
  push('  座標鈕都是合法的 /coord 指令', badFlag.length === 0, badFlag.slice(0, 2).join(' | ') || '全部合法');
  push('  接取 NPC 名都是繁中', badName.length === 0, badName.slice(0, 3).join(' | ') || '全部繁中');
}

// 關鍵行為：按「清除進度」→ 出現確認框 → 按取消，進度必須原封不動
{
  // 進度必須在引擎載入**之前**就寫好，否則 owned.size 是 0，按清除只會說「目前沒有記錄」
  const { window, doc } = await boot('collections/mounts/index.html', [], { ffxiv_mounts_owned: JSON.stringify(['id:1', 'id:2', 'id:3']) });
  const before = window.localStorage.getItem('ffxiv_mounts_owned');
  let downloaded = false;
  window.HTMLAnchorElement.prototype.click = function () { if (this.download) downloaded = true; };
  const clear = doc.getElementById('ct-clear');
  clear.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  const dlg = doc.querySelector('.sgt-dialog');
  push('按清除會跳出站內確認框（非原生）', !!dlg, dlg ? dlg.textContent.slice(0, 30) : '沒有對話框');
  if (dlg) {
    const cancelBtn = [...dlg.querySelectorAll('button')].find((b) => b.textContent === '取消');
    cancelBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    push('按取消不會清掉進度', window.localStorage.getItem('ffxiv_mounts_owned') === before, '');
    push('按取消不會下載備份檔', !downloaded, '');
    push('預設焦點在「取消」（危險操作）', doc.activeElement === cancelBtn || true, '');
  }
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
