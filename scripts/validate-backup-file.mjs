// 綁定備份檔回歸 — 改完首頁的進度備份區必跑。
//
// 這段碰的是**使用者電腦上的真實檔案**，錯了會覆寫錯東西或靜默不存，所以驗得嚴：
//   ① **不支援的瀏覽器整顆鈕不可以長出來。** Firefox／Safari 都沒有
//      `showSaveFilePicker`，長一顆按不動的鈕比沒有更糟。
//   ② **`requestPermission()` 必須在使用者手勢裡呼叫。** 放在載入時會直接被瀏覽器
//      擋掉，而且不報錯——徵狀是「每次都說沒有權限」。開頁時只能 `queryPermission`。
//   ③ **handle 只能放 IndexedDB。** `localStorage` 只吃字串，`JSON.stringify(handle)`
//      會得到 `{}`，下次讀回來是個沒有 `createWritable` 的空物件——**執行到寫入那一刻才爆**。
//   ④ **沒有取得權限時要講出來**，不可以靜默失敗（使用者會以為存好了）。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-backup-file.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

// ── 靜態：把規則釘在原始碼上 ────────────────────────────
{
  push('有「綁定備份檔」的入口', /id="pdBindBtn"/.test(HTML) && /id="pdUnbindBtn"/.test(HTML), '');
  push('  兩顆鈕預設 display:none（由能力偵測決定要不要長）',
    /id="pdBindBtn" style="display:none"/.test(HTML) && /id="pdUnbindBtn" style="display:none"/.test(HTML), '');
  push('  用 showSaveFilePicker 是否存在來偵測',
    /typeof window\.showSaveFilePicker === 'function'/.test(HTML), '');
  push('  不支援時直接 return（不長鈕）',
    /if \(!supported\) return;/.test(HTML), '');

  push('handle 存 IndexedDB（localStorage 存不了它）',
    /indexedDB\.open\(/.test(HTML) && /objectStore\(STORE\)\.put\(v, KEY\)/.test(HTML), '');
  push('  檔名另存 localStorage 只為顯示，key 是 ffxiv_ 前綴',
    /NAME_KEY = 'ffxiv_backup_filename'/.test(HTML), '');
  /* 開頁時只 query 不 request——沒有使用者手勢，request 會被擋而且不報錯。 */
  const initBlk = HTML.slice(HTML.indexOf('// 開頁時把上次綁的檔認回來'));
  push('  開頁時只認回 handle，不要權限',
    !/requestPermission/.test(initBlk.slice(0, 400)), '');
  /* ⚠ 先把註解拿掉再數（§4.90）——說明文字裡也寫著這個函式名，
     掃原始碼會把註解算成第二次呼叫。 */
  const CODE = HTML.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
  push('  requestPermission 只出現在 ensurePerm 裡（由 click 呼叫）',
    (CODE.match(/requestPermission/g) || []).length === 1,
    (CODE.match(/requestPermission/g) || []).length + ' 處');
  push('  沒有權限時會講出來（不靜默失敗）',
    /沒有取得寫入權限，這次沒有存到檔案/.test(HTML), '');
  push('  解除綁定會先問，且說明不會刪檔',
    /askConfirm\('解除綁定？那個檔案不會被刪除/.test(HTML), '');
  push('  寫入失敗會報出錯誤訊息', /存回失敗：/.test(HTML), '');
  push('  沒有進度時不寫空檔', /目前沒有任何進度可備份/.test(HTML), '');
  push('  備份內容與「匯出全站進度」同一個 schema',
    /schema: BACKUP_SCHEMA, exported: new Date\(\)\.toISOString\(\), keys: keys/.test(HTML), '');
  push('  只收 ffxiv_ 開頭的 key（與匯出一致）',
    (HTML.match(/k\.indexOf\('ffxiv_'\) === 0/g) || []).length >= 2, '');
}

// ── 動態：不支援的瀏覽器 ────────────────────────────────
function mk({ supported }) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://seagod99.github.io/', virtualConsole: vc });
  const { window } = dom;
  const store = { ffxiv_mounts_owned: '{"1":1}' };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
  });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  window.alert = () => {};
  window.prompt = () => null;

  const picked = { calls: 0, written: [], perm: 'granted', requested: 0 };
  const handle = {
    name: 'my-backup.json',
    queryPermission: async () => picked.perm,
    requestPermission: async () => { picked.requested++; picked.perm = 'granted'; return 'granted'; },
    createWritable: async () => ({
      write: async (t) => { picked.written.push(t); },
      close: async () => {},
    }),
  };
  if (supported) {
    window.showSaveFilePicker = async () => { picked.calls++; return handle; };
  }
  // jsdom 沒有 indexedDB；用一個最小的假實作（只要 open/put/get/delete 的行為對）
  const bag = {};
  window.indexedDB = {
    open: () => {
      const req = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => {
        req.result = {
          createObjectStore: () => {},
          transaction: () => ({
            objectStore: () => ({
              put: (v, k) => { bag[k] = v; },
              get: (k) => { const q = {}; setTimeout(() => { q.result = bag[k]; q.onsuccess && q.onsuccess(); }, 0); return q; },
              delete: (k) => { delete bag[k]; },
            }),
            set oncomplete(fn) { setTimeout(fn, 0); },
            set onerror(fn) {},
          }),
        };
        req.onupgradeneeded && req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      }, 0);
      return req;
    },
  };
  window.eval([...window.document.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  return { window, doc: window.document, store, picked, errs, bag };
}

{
  const { doc, errs } = mk({ supported: false });
  await new Promise((r) => setTimeout(r, 200));
  push('不支援 File System Access 時整顆鈕不顯示',
    doc.getElementById('pdBindBtn').style.display === 'none' &&
    doc.getElementById('pdUnbindBtn').style.display === 'none', '');
  push('  也不會有 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

// ── 動態：支援時的完整流程 ──────────────────────────────
{
  const { window, doc, store, picked, errs, bag } = mk({ supported: true });
  await new Promise((r) => setTimeout(r, 250));
  const bind = doc.getElementById('pdBindBtn');
  push('支援時長出綁定鈕', bind.style.display !== 'none', bind.textContent.trim());
  push('  尚未綁定時文字是「綁定備份檔」', /綁定備份檔/.test(bind.textContent), bind.textContent.trim());
  push('  尚未綁定時不顯示解除鈕', doc.getElementById('pdUnbindBtn').style.display === 'none', '');

  // 第一次按：挑檔 → 存進 IndexedDB → 立刻寫一次
  bind.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  push('按一下會開檔案選擇器', picked.calls === 1, picked.calls + ' 次');
  push('  handle 存進了 IndexedDB', !!bag.file && typeof bag.file.createWritable === 'function', '');
  push('  檔名記在 ffxiv_ 開頭的 key 裡', store.ffxiv_backup_filename === 'my-backup.json',
    String(store.ffxiv_backup_filename));
  push('  綁定後立刻寫一次（不必再按一次才有檔案）', picked.written.length === 1, picked.written.length + ' 次');

  const data = JSON.parse(picked.written[0]);
  push('  寫出去的是備份 schema', data.schema === 'seagod-toolbox-backup', String(data.schema));
  push('  只含 ffxiv_ 開頭的 key',
    Object.keys(data.keys).length > 0 && Object.keys(data.keys).every((k) => k.indexOf('ffxiv_') === 0),
    Object.keys(data.keys).join('、'));

  // 鈕文字改成「存回」，且出現解除鈕
  push('  綁定後鈕文字變成「存回」並帶檔名', /存回.*my-backup\.json/.test(bind.textContent),
    bind.textContent.trim());
  push('  出現解除綁定鈕', doc.getElementById('pdUnbindBtn').style.display !== 'none', '');
  push('  提示說明第一次存回會再問權限', /再問一次寫入權限/.test(doc.getElementById('pdBindHint').textContent), '');

  // 第二次按：不再開選擇器，直接覆寫
  bind.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  push('  再按一次直接覆寫，不再開選擇器', picked.calls === 1 && picked.written.length === 2,
    `選擇器 ${picked.calls} 次／寫 ${picked.written.length} 次`);

  // 權限被拒：不可以靜默失敗
  picked.perm = 'denied';
  const toasts = [];
  window.Toast = { show: (m, k) => toasts.push([m, k]), confirm: () => Promise.resolve(true) };
  handleDeny: {
    // 讓 requestPermission 也回 denied
    bag.file.requestPermission = async () => 'denied';
    bag.file.queryPermission = async () => 'denied';
  }
  bind.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  push('  權限被拒時有講出來（不靜默失敗）',
    toasts.some(([m, k]) => /沒有取得寫入權限/.test(m) && k === 'err'),
    toasts.map(([m]) => m).join(' / ') || '(沒有提示)');
  push('  被拒時沒有寫出檔案', picked.written.length === 2, picked.written.length + ' 次');

  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
