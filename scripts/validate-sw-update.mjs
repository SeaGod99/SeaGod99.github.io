// 「資料已更新 ↻」回歸 — 改完 sw.js 的快取策略、theme.js 的 SW 區、或 toast.js 必跑。
//
// 這條路徑整個是「不報錯的沉默」：
//   ① `data/*.json` 走 stale-while-revalidate，**這一次的畫面用的是舊資料**，
//      而且畫面上完全看不出來。提示沒長出來的話，使用者會拿舊數字做決定。
//   ② 反過來，**比對太寬鬆就會每次進站都喊一次狼來了**。三個版本標頭都拿不到時
//      必須當成「沒變」，不是「變了」。
//   ③ `Toast.action()` 忘了 `key` 去重的話，一個頁面載 20 份資料就疊 20 條提示。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-sw-update.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const SW = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const THEME = readFileSync(join(ROOT, 'assets/js/theme.js'), 'utf8');
const TOAST = readFileSync(join(ROOT, 'assets/js/toast.js'), 'utf8');

// ── ① SW 端：sameVersion 的判斷 ─────────────────────────
{
  /* 把 sw.js 裡的 sameVersion 原封不動取出來執行（不要在測試裡重寫一份，
     重寫的話改了 sw.js 這支還會過）。 */
  const m = SW.match(/function sameVersion\(a, b\) \{[\s\S]*?\n\}/);
  push('sw.js 有 sameVersion()', !!m, m ? '取出成功' : '找不到');
  if (m) {
    const sameVersion = new Function('return ' + m[0])();
    const mk = (h) => ({ headers: { get: (k) => (h[k] === undefined ? null : h[k]) } });

    push('  ETAg 不同＝變了', !sameVersion(mk({ etag: '"a"' }), mk({ etag: '"b"' })), '');
    push('  ETag 相同＝沒變', sameVersion(mk({ etag: '"a"' }), mk({ etag: '"a"' })), '');
    /* ETag 優先：GitHub Pages 兩者都給，而 Last-Modified 只有秒級解析度。
       先看 Last-Modified 的話，同一秒內的兩次部署會被當成沒變。 */
    push('  ETag 優先於 Last-Modified',
      !sameVersion(mk({ etag: '"a"', 'last-modified': 'X' }), mk({ etag: '"b"', 'last-modified': 'X' })), '');
    push('  沒有 ETag 時退到 Last-Modified',
      !sameVersion(mk({ 'last-modified': 'X' }), mk({ 'last-modified': 'Y' })), '');
    push('  再退到 Content-Length',
      !sameVersion(mk({ 'content-length': '10' }), mk({ 'content-length': '11' })), '');
    /* **三個都拿不到時當成「沒變」。** 反過來做的話每次進站都會跳一次提示，
       而使用者無從判斷真假，兩三次之後就再也不看了。 */
    push('  三個標頭都拿不到時當成沒變（不要喊狼來了）', sameVersion(mk({}), mk({})), '');
    push('  只有一邊有標頭時也當成沒變', sameVersion(mk({ etag: '"a"' }), mk({})), '');
  }

  push('只通報 /data/ 底下的變化（圖示換了不影響任何數字）',
    /\/\^\\\/data\\\//.test(SW) || /test\(url\.pathname\)/.test(SW) && /\^\\\/data\\\//.test(SW), '');
  push('  沒有快取時不通報（第一次載入本來就是最新的）',
    /if \(cached && /.test(SW), '');
  push('  通報用 postMessage 給開著的視窗', /clients\.matchAll\(\{ type: 'window' \}\)/.test(SW), '');
  push('  訊息型別是 sgt-data-updated', /type: 'sgt-data-updated'/.test(SW), '');
  /* HTML 與 css/js 是 network-first，本來就拿得到最新的——
     那兩條路徑不該也發通報，不然每次改版都會跳提示。 */
  const swrBlock = SW.slice(SW.indexOf('stale-while-revalidate'));
  push('  通報只掛在 SWR 那條路徑上',
    (SW.match(/notifyIfChanged\(/g) || []).length === 2 && swrBlock.indexOf('notifyIfChanged(cached') >= 0,
    (SW.match(/notifyIfChanged\(/g) || []).length + ' 處（1 個定義＋1 個呼叫）');
}

// ── ② theme.js 端：接線與一次只講一次 ───────────────────
{
  push('theme.js 聽 SW 的 message', /navigator\.serviceWorker\.addEventListener\('message'/.test(THEME), '');
  push('  只認 sgt-data-updated', /d\.type !== 'sgt-data-updated'/.test(THEME), '');
  push('  一次進站只提示一次（20 份資料不會疊 20 條）', /if \(notified\) return;/.test(THEME), '');
  push('  用 Toast.action 而不是自己做浮層', /window\.Toast\.action\(/.test(THEME), '');
  push('  帶 key 去重', /key: 'sgt-data-updated'/.test(THEME), '');
  /* **不可以自動重整。** 正在填表、正在看清單的人被重整會很惱人，
     而且這頁的資料本來就還能用（只是不是最新的）。 */
  const blk = THEME.slice(THEME.indexOf('sgt-data-updated'));
  push('  不自動重整（要使用者自己按）',
    /onClick: function \(\) \{ location\.reload\(\); \}/.test(blk) &&
    !/^\s*location\.reload\(\);/m.test(blk.replace(/onClick[\s\S]*?\},/, '')), '');
  /* Toast 還沒載好時什麼都不做——退回原生對話框會凍住整個分頁
     （ET 時鐘、鬧鐘倒數全停），代價比不提示高。
     ⚠ **要先把註解拿掉再掃**：theme.js 的說明文字本身就寫著那個函式名，
     直接掃原始碼會被自己的註解騙過去（第一版就是這樣，看起來像真的有呼叫）。 */
  const blkCode = blk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  push('  Toast 沒載好時不退回原生對話框（那會凍住分頁）',
    !/\balert\s*\(/.test(blkCode), '');
}

// ── ③ Toast.action() 的行為 ─────────────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM('<!doctype html><body>', { runScripts: 'outside-only', url: 'https://x/', virtualConsole: vc });
  const { window } = dom, doc = window.document;
  window.eval(TOAST);
  push('Toast 有 action()', typeof window.Toast.action === 'function', '');
  push('  原有的 show()／confirm() 還在',
    typeof window.Toast.show === 'function' && typeof window.Toast.confirm === 'function', '');

  let clicked = 0;
  const el = window.Toast.action('資料已更新', { label: '↻ 重新整理', key: 'k', onClick: () => { clicked++; } });
  push('  長出來了', !!el && !!doc.querySelector('.sgt-sticky'), '');
  push('  訊息與動作鈕都在', doc.querySelector('.sgt-sticky-msg').textContent === '資料已更新' &&
    /重新整理/.test(doc.querySelector('.sgt-sticky .sgt-btn.primary').textContent), '');
  push('  有 role="status"（讀得出來但不搶焦點）',
    doc.querySelector('.sgt-sticky').getAttribute('role') === 'status', '');
  push('  ✕ 有 aria-label（圖示鈕不能只有符號）',
    !!doc.querySelector('.sgt-sticky button[aria-label]'), '');

  // 同 key 不疊第二條
  const again = window.Toast.action('資料已更新', { label: '↻', key: 'k', onClick: () => {} });
  push('  同 key 只存在一則', again === null && doc.querySelectorAll('.sgt-sticky').length === 1,
    doc.querySelectorAll('.sgt-sticky').length + ' 條');

  /* **不會自動消失**：show() 3.2 秒就走，這則是「非做不可但不急」的事，
     走掉了使用者就永遠不知道自己在看舊資料。 */
  const before = doc.querySelectorAll('.sgt-sticky').length;
  await new Promise((r) => setTimeout(r, 400));
  push('  不會自動消失（show() 會，action() 不能）',
    doc.querySelectorAll('.sgt-sticky').length === before, '');

  // 按動作鈕：先關閉再呼叫 onClick
  doc.querySelector('.sgt-sticky .sgt-btn.primary').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  push('  按動作鈕會呼叫 onClick', clicked === 1, 'clicked=' + clicked);
  await new Promise((r) => setTimeout(r, 300));
  push('  按完就收起來', doc.querySelectorAll('.sgt-sticky').length === 0, '');

  // ✕ 只關閉、不呼叫 onClick
  let c2 = 0;
  window.Toast.action('m', { label: 'L', key: 'k2', onClick: () => { c2++; } });
  doc.querySelector('.sgt-sticky button[aria-label]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  push('  按 ✕ 只關閉、不執行動作', c2 === 0 && doc.querySelectorAll('.sgt-sticky').length === 0, 'c2=' + c2);

  // onClick 丟例外不可以讓提示留在畫面上
  window.Toast.action('m', { label: 'L', key: 'k3', onClick: () => { throw new Error('boom'); } });
  doc.querySelector('.sgt-sticky .sgt-btn.primary').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  push('  onClick 丟例外時提示仍然收起來', doc.querySelectorAll('.sgt-sticky').length === 0, '');

  push('  觸控裝置上動作鈕有 44px（沿用 .sgt-btn 的規則）',
    /@media \(pointer: coarse\)\{\.sgt-btn\{min-height:44px\}\}/.test(TOAST), '');
  push('  尊重 prefers-reduced-motion（沿用既有 keyframes 規則）',
    /prefers-reduced-motion: reduce\)\{\.sgt-toast/.test(TOAST), '');
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

// ── ④ SW 版本號有跟著 assets 走 ─────────────────────────
{
  const m = SW.match(/CACHE_VERSION = '([^']+)'/);
  push('sw.js 的 CACHE_VERSION 是自動產生的', !!m && /AUTO-BUMP/.test(SW), m ? m[1] : '');
  push('  提醒：改完 assets/ 的 css/js 要跑 bump-sw-version.mjs',
    /bump-sw-version\.mjs/.test(SW), '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
