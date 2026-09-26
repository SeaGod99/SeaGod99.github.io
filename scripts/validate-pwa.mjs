// PWA 可安裝性回歸 — 改完 manifest.json、assets/icons/ 或 theme.js 的注入區必跑。
//
// 這一類錯誤**完全不報錯**，而且有兩層：
//   1. `manifest.json` 存在、內容也對，但沒有任何一頁 `<link rel="manifest">`
//      的話瀏覽器根本不會去讀它。本站是由 `theme.js` 在執行期注入（HTML 裡找不到），
//      所以這支驗的是「跑完 theme.js 之後頁面上真的有那個 link」。
//   2. link 有了、manifest 也讀到了，但圖示不符規格一樣裝不起來——
//      Android 要 192／512 的 PNG，iOS 的 apple-touch-icon 不吃 SVG。
//      2026-09-26 之前就是第二種：manifest 只掛一張 SVG，apple-touch-icon 也指向 SVG。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-pwa.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const MF = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

// ── manifest 本身 ──────────────────────────────────────────
{
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
    push(`manifest 有 ${k}`, MF[k] != null && String(MF[k]).length > 0, k === 'icons' ? MF.icons.length + ' 張' : String(MF[k]));
  }
  push('display 是 standalone（裝起來沒有網址列）', MF.display === 'standalone', MF.display);

  const png = MF.icons.filter((i) => i.type === 'image/png');
  const sizes = new Set(png.map((i) => i.sizes));
  /* Android 的安裝橫幅硬性要求至少一張 192 與一張 512 的點陣圖。
     只有 SVG（sizes:"any"）時 Chrome 桌面吃得下，但手機上安裝提示不會出現。 */
  push('有 192×192 的 PNG（Android 安裝橫幅的最低要求）', sizes.has('192x192'), [...sizes].join('、'));
  push('有 512×512 的 PNG（安裝／啟動畫面）', sizes.has('512x512'), [...sizes].join('、'));

  const maskable = MF.icons.filter((i) => String(i.purpose || '').split(/\s+/).includes('maskable'));
  push('有專門的 maskable 圖示', maskable.length > 0, maskable.map((i) => i.sizes).join('、') || '(無)');
  /* ⚠ 同一張圖不要同時標 any 與 maskable：Android 會把 maskable 裁掉外圈 20%，
     原圖的圓角背景被裁一圈會變成「圓角裡再一個圓角」。要分開畫。 */
  const both = MF.icons.filter((i) => {
    const p = String(i.purpose || '').split(/\s+/);
    return p.includes('any') && p.includes('maskable');
  });
  push('  沒有同一張圖兼任 any 與 maskable', both.length === 0,
    both.map((i) => i.src).join('、') || '都分開了');

  const missing = MF.icons.filter((i) => !existsSync(join(ROOT, i.src.replace(/^\//, ''))));
  push('每張 icon 的檔案都在', missing.length === 0, missing.map((i) => i.src).join('、') || MF.icons.length + ' 張全在');
  for (const i of MF.icons) {
    const f = join(ROOT, i.src.replace(/^\//, ''));
    if (!existsSync(f)) continue;
    if (statSync(f).size === 0) push(`  ${i.src} 不是空檔`, false, '0 bytes');
  }

  push('有 shortcuts（長按圖示的快捷選單）', Array.isArray(MF.shortcuts) && MF.shortcuts.length > 0,
    (MF.shortcuts || []).map((s) => s.short_name).join('、'));
  const badShortcut = (MF.shortcuts || []).filter((s) => !s.url || !s.url.startsWith('/'));
  push('  shortcuts 的 url 都是站根絕對路徑', badShortcut.length === 0,
    badShortcut.map((s) => s.url).join('、') || '全部正確');
  const shortcutDirs = (MF.shortcuts || []).filter((s) => !existsSync(join(ROOT, s.url.replace(/^\//, ''), 'index.html')));
  push('  shortcuts 指到的頁面都存在', shortcutDirs.length === 0,
    shortcutDirs.map((s) => s.url).join('、') || '全部存在');
}

// ── apple-touch-icon（iOS 不吃 manifest 的 icons）──────────
push('有 apple-touch-icon.png（iOS 只認這個）',
  existsSync(join(ROOT, 'assets/icons/apple-touch-icon.png')), '');

// ── 前端：頁面真的引用得到 manifest 嗎 ──────────────────────
for (const page of ['index.html', 'tools/market/index.html', 'collections/mounts/index.html']) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  const html = readFileSync(join(ROOT, page), 'utf8');
  const depth = page.split('/').length - 1;
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://seagod99.github.io/' + page.replace(/index\.html$/, ''),
    virtualConsole: vc,
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  // theme.js 靠自己的 <script src> 推站根相對路徑，jsdom 下要有那個 script 標籤才推得出來
  window.eval(readFileSync(join(ROOT, 'assets/js/theme.js'), 'utf8'));
  const doc = window.document;
  const mf = doc.querySelector('link[rel="manifest"]');
  const ai = doc.querySelector('link[rel="apple-touch-icon"]');
  const label = page.replace(/\/index\.html$/, '/') || '首頁';
  push(`${label} 注入了 <link rel="manifest">`, !!mf, mf ? mf.getAttribute('href') : '(沒有)');
  push(`  ${label} 的 manifest 路徑指得到檔案`,
    !!mf && existsSync(join(ROOT, mf.getAttribute('href').replace(/^\.\.\//g, '').replace(/^\.\//, ''))),
    mf ? mf.getAttribute('href') + '（深度 ' + depth + '）' : '');
  const aiHref = ai ? ai.getAttribute('href') : '';
  // iOS 會直接忽略 SVG 的 apple-touch-icon，「加入主畫面」就變成網頁截圖
  push(`  ${label} 的 apple-touch-icon 是 PNG`, /\.png$/i.test(aiHref), aiHref || '(沒有)');
}

// ── sw.js 有被註冊，且快取版本是最新的 ──────────────────────
{
  const theme = readFileSync(join(ROOT, 'assets/js/theme.js'), 'utf8');
  push('theme.js 會註冊 service worker', /serviceWorker[\s\S]{0,200}register\(/.test(theme), '');
  push('  只在 https／localhost 註冊（file:// 開檔不會炸）',
    /location\.protocol === 'https:'|localhost/.test(theme), '');
}

// ── 安裝鈕：只有瀏覽器願意安裝時才長出來 ────────────────────
{
  const vc = new VirtualConsole();
  const dom = new JSDOM(readFileSync(join(ROOT, 'index.html'), 'utf8'), {
    runScripts: 'outside-only', url: 'https://seagod99.github.io/', virtualConsole: vc,
  });
  const { window } = dom, doc = window.document;
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
  });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.eval(readFileSync(join(ROOT, 'assets/js/nav.js'), 'utf8'));
  await new Promise((r) => setTimeout(r, 300));

  push('沒有 beforeinstallprompt 時不長安裝鈕', !doc.getElementById('sgt-tb-install'), '');

  // 模擬瀏覽器判定「這站可以安裝」
  let prompted = false, prevented = false;
  const ev = new window.Event('beforeinstallprompt');
  ev.preventDefault = () => { prevented = true; };
  ev.prompt = () => { prompted = true; };
  ev.userChoice = Promise.resolve({ outcome: 'dismissed' });
  window.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 200));

  const btn = doc.getElementById('sgt-tb-install');
  push('事件觸發後長出安裝鈕', !!btn, btn ? btn.textContent.trim() : '(沒有)');
  push('  有擋掉瀏覽器自己的迷你橫幅', prevented, '');
  push('  鈕在頂列裡（不是浮在畫面上擋東西）', !!btn && !!btn.closest('.sgt-tb-inner'), '');
  push('  是真的 <button> 且有 title', !!btn && btn.tagName === 'BUTTON' && !!btn.title, btn ? btn.title : '');

  if (btn) {
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    push('按下去會叫原生安裝流程', prompted, '');
    push('  使用者拒絕後鈕收起來', !doc.getElementById('sgt-tb-install'), '');
    push('  並記下不再打擾（ffxiv_ 開頭，首頁備份掃得到）', store.ffxiv_pwa_dismissed === '1',
      Object.keys(store).join('、') || '(沒存)');
  }

  // 記過之後再觸發一次也不該長出來
  const ev2 = new window.Event('beforeinstallprompt');
  ev2.preventDefault = () => {};
  window.dispatchEvent(ev2);
  await new Promise((r) => setTimeout(r, 150));
  push('  拒絕過就不再出現', !doc.getElementById('sgt-tb-install'), '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
