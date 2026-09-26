// 幻卡「缺卡跑圖」回歸 — 改完 collections/triple-triad/ 或 data/triple-triad.json 必跑。
//
// 這個檢視最容易錯、而且錯了看不出來的地方是**把 NPC牌組 當成取得管道**：
// 牌組只代表對手手上有這張卡，打贏不見得拿得到。混進來的話清單會變長、看起來更「有用」，
// 但使用者會照著跑一堆白跑的路。2026-09-23 拆開這兩種語意之前，938 筆「NPC對戰」
// 有 99.6% 其實是牌組——所以這裡逐筆驗。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-triad-route.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);
const unhandled = [];
process.on('unhandledRejection', (e) => unhandled.push(String((e && e.message) || e)));

const DB = JSON.parse(readFileSync(join(ROOT, 'data/triple-triad.json'), 'utf8'));

// ── 資料面：兩種 NPC 來源必須是分開的 ──────────────────────────
{
  const battle = [], deck = [];
  for (const c of DB.data) {
    for (const s of c.sources || []) {
      if (s.type === 'NPC對戰') battle.push([c, s]);
      if (s.type === 'NPC牌組') deck.push([c, s]);
    }
  }
  push('NPC對戰與NPC牌組是分開的兩種來源', battle.length > 0 && deck.length > 0,
    `對戰 ${battle.length} 筆／牌組 ${deck.length} 筆`);
  push('  對戰筆數遠少於牌組（拆開前 99.6% 是牌組）', battle.length < deck.length / 2,
    `${battle.length} vs ${deck.length}`);
  push('  對戰帶得出 NPC 名與座標', battle.every(([, s]) => s.npcName && s.location && s.location.mapId != null), '');
  push('  對戰帶入場費或規則（牌組沒有）', battle.some(([, s]) => s.fee != null || (s.rules || []).length),
    `有 fee 的 ${battle.filter(([, s]) => s.fee != null).length} 筆`);
  push('  牌組有 slot、對戰沒有', deck.every(([, s]) => 'slot' in s) && battle.every(([, s]) => !('slot' in s)), '');
}

// ── 前端層 ──────────────────────────────────────────────
const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const html = readFileSync(join(ROOT, 'collections/triple-triad/index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://seagod99.github.io/collections/triple-triad/',
  virtualConsole: vc,
});
const { window } = dom;
const doc = window.document;
const store = {};
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
window.fetch = async (url) => {
  const rel = String(url).replace(/^.*\/(data|assets)\//, '$1/');
  if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
};
window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
const proto = window.HTMLElement.prototype;
if (!proto.showModal) { proto.showModal = function () { this.setAttribute('open', ''); }; proto.close = function () { this.removeAttribute('open'); }; }
if (!proto.scrollIntoView) proto.scrollIntoView = function () {};

for (const f of ['assets/js/patch-gate.js', 'assets/js/toast.js', 'assets/js/collection-tracker.js']) {
  window.eval(readFileSync(join(ROOT, f), 'utf8'));
}
// type="module" 的那塊是 map-modal 的 import，jsdom 的 eval 吃不下 → 跳過
window.eval([...doc.querySelectorAll('script:not([src])')]
  .filter((s) => (s.getAttribute('type') || '') !== 'module')
  .map((s) => s.textContent).join(';\n'));
await new Promise((r) => setTimeout(r, 1600));

push('預設是手帳檢視', !doc.body.classList.contains('tt-route-mode'), '');
push('  有兩顆檢視切換鈕', !!doc.getElementById('ttViewAlbum') && !!doc.getElementById('ttViewRoute'), '');

doc.getElementById('ttViewRoute').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 400));

push('切到缺卡跑圖', doc.body.classList.contains('tt-route-mode'), '');
push('  aria-pressed 跟著切', doc.getElementById('ttViewRoute').getAttribute('aria-pressed') === 'true'
  && doc.getElementById('ttViewAlbum').getAttribute('aria-pressed') === 'false', '');

const npcCards = () => doc.querySelectorAll('#ttRoute .tt-npc');
const mapHeads = () => doc.querySelectorAll('#ttRoute .tt-map-head');
push('列出了對手', npcCards().length > 0, npcCards().length + ' 個');
push('  依地圖分組', mapHeads().length > 0, mapHeads().length + ' 張圖');

// ── 核心：列出來的每一張缺卡，都必須真的有 NPC對戰 來源（不能是牌組）──
{
  const byId = new Map(DB.data.map((c) => [c.name, c]));
  const battleNpcOf = (card) => new Set((card.sources || [])
    .filter((s) => s.type === 'NPC對戰').map((s) => s.npcName));
  let checked = 0;
  const bad = [];
  for (const npc of npcCards()) {
    const npcName = npc.querySelector('.tt-npc-name').textContent;
    for (const mini of npc.querySelectorAll('.tt-mini')) {
      // 卡名＝文字節點（去掉星星）
      const cardName = [...mini.childNodes]
        .filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      const card = byId.get(cardName);
      checked++;
      if (!card) { bad.push(cardName + '（查無此卡）'); continue; }
      if (!battleNpcOf(card).has(npcName)) bad.push(npcName + ' → ' + cardName);
      if (bad.length > 3) break;
    }
    if (bad.length > 3) break;
  }
  push('每一筆「這個對手給這張卡」都是 NPC對戰（不是牌組）', bad.length === 0,
    bad.slice(0, 3).join('｜') || checked + ' 筆全對');
}

// ── 只有牌組來源的卡不可以出現在跑圖清單裡 ──────────────────
{
  const deckOnly = DB.data.filter((c) => {
    const t = new Set((c.sources || []).map((s) => s.type));
    return t.has('NPC牌組') && !t.has('NPC對戰');
  }).map((c) => c.name);
  const shown = new Set([...doc.querySelectorAll('#ttRoute .tt-mini')]
    .map((m) => [...m.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
  const leaked = deckOnly.filter((n) => shown.has(n));
  push('只出現在對手牌組裡的卡沒有被當成可取得', leaked.length === 0,
    leaked.slice(0, 3).join('、') || `只有牌組來源的 ${deckOnly.length} 張全被排除`);
}

// ── 摘要的帳要算得對 ──────────────────────────────────────
{
  const sum = doc.querySelector('#ttRoute .tt-route-sum');
  const nums = (sum.textContent.match(/\d[\d,]*/g) || []).map((s) => +s.replace(/,/g, ''));
  push('有摘要', !!sum && nums.length >= 3, sum ? nums.slice(0, 4).join(' / ') : '(無)');
  // 「打得到」的張數 = 清單裡相異卡名數
  const shown = new Set([...doc.querySelectorAll('#ttRoute .tt-mini')]
    .map((m) => [...m.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
  push('  「打得到」的數字＝清單裡的相異卡數', nums[1] === shown.size, nums[1] + ' vs ' + shown.size);
  push('  對手數＝畫面上的對手卡片數', nums[3] === npcCards().length, nums[3] + ' vs ' + npcCards().length);
  push('  說清楚是機率掉落', /可能|機率/.test(sum.textContent), '');
}

// ── 標記取得後，那張卡要從跑圖清單消失 ──────────────────────
{
  const firstMini = doc.querySelector('#ttRoute .tt-mini');
  const cardName = [...firstMini.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const before = doc.querySelectorAll('#ttRoute .tt-mini').length;
  const card = DB.data.find((c) => c.name === cardName);
  // 直接走引擎的 API（等同按下卡片右上的 ✓）
  window.TTRoute.tracker().toggle(card);
  await new Promise((r) => setTimeout(r, 400));
  const shown = new Set([...doc.querySelectorAll('#ttRoute .tt-mini')]
    .map((m) => [...m.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
  push('標記取得後該卡從跑圖清單消失', !shown.has(cardName), '「' + cardName + '」');
  push('  清單有跟著變短', doc.querySelectorAll('#ttRoute .tt-mini').length < before,
    before + ' → ' + doc.querySelectorAll('#ttRoute .tt-mini').length);
  window.TTRoute.tracker().toggle(card);   // 還原
  await new Promise((r) => setTimeout(r, 300));
}

// ── 排序鍵必須是固定值（§3.19）──────────────────────────────
// 這頁的使用情境就是「站在 NPC 前面一邊打一邊標記」。依缺卡數排的話，標記一張那個對手
// 的數字就掉一格、整份清單當場重排，剛在看的那列跑掉了。
{
  const order = () => [...doc.querySelectorAll('#ttRoute .tt-npc-name')].map((e) => e.textContent);
  const before = order();
  const firstMini = doc.querySelector('#ttRoute .tt-mini');
  const cardName = [...firstMini.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const card = DB.data.find((c) => c.name === cardName);
  window.TTRoute.tracker().toggle(card);
  await new Promise((r) => setTimeout(r, 400));
  const after = order();
  // 收齊那個對手的最後一張卡時他會整個消失，那是對的；驗的是「剩下的相對順序沒變」
  const kept = before.filter((n) => after.indexOf(n) >= 0);
  push('標記取得不會讓清單重排', JSON.stringify(kept) === JSON.stringify(after),
    kept.length === after.length ? '順序一致（' + after.length + ' 個對手）' :
      '前：' + kept.slice(0, 3).join('、') + ' / 後：' + after.slice(0, 3).join('、'));
  window.TTRoute.tracker().toggle(card);
  await new Promise((r) => setTimeout(r, 300));
  push('  還原後也回到原順序', JSON.stringify(order()) === JSON.stringify(before), '');
}

// ── 地圖篩選 ──────────────────────────────────────────────
{
  doc.getElementById('ttViewRoute').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const sel = doc.getElementById('ttRouteMap');
  push('有地圖選單（63 張圖捲不完）', !!sel && sel.options.length > 10,
    sel ? sel.options.length + ' 個選項' : '(無)');
  const allMaps = doc.querySelectorAll('#ttRoute .tt-map-head').length;
  const target = sel.options[1].value;
  sel.value = target;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const heads = [...doc.querySelectorAll('#ttRoute .tt-map-name')].map((e) => e.textContent);
  push('  選一張圖只剩那一張', heads.length === 1 && heads[0] === target, heads.join('、') || '(空)');
  push('  選單選擇有保留', doc.getElementById('ttRouteMap').value === target, doc.getElementById('ttRouteMap').value);
  // 篩選後摘要的總數不能跟著縮（那是「我還缺幾張」，與看哪張圖無關）
  const sum = doc.querySelector('#ttRoute .tt-route-sum').textContent;
  push('  摘要仍講全局（不隨地圖篩選變動）', /63/.test(sum), sum.slice(0, 40));
  doc.getElementById('ttRouteMap').value = '';
  doc.getElementById('ttRouteMap').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  push('  選回全部恢復', doc.querySelectorAll('#ttRoute .tt-map-head').length === allMaps,
    doc.querySelectorAll('#ttRoute .tt-map-head').length + ' / ' + allMaps);
}

// ── 切回手帳 ────────────────────────────────────────────
doc.getElementById('ttViewAlbum').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 300));
push('切得回手帳', !doc.body.classList.contains('tt-route-mode'), '');
push('  檢視偏好有記下來', store.ffxiv_triad_view === 'album', JSON.stringify(store.ffxiv_triad_view));
push('  偏好 key 是 ffxiv_ 開頭（首頁備份掃得到）', Object.keys(store).every((k) => k.startsWith('ffxiv_')),
  Object.keys(store).join('、'));

push('無 console error', errors.length === 0, errors.slice(0, 1).join('') || '乾淨');
push('沒有未捕捉的 rejection', unhandled.length === 0, unhandled.slice(0, 2).join(' | ') || '乾淨');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
