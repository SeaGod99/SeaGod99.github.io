// 幻化圖鑑「🗓️ 活動」分類回歸 — 改完 tools/glamour/scripts/build_item_sources.py
// 或 tools/glamour/index.html 的 `stOfKey`／`eventKeys` 必跑。
//
// ── 為什麼需要這支 ────────────────────────────────────────────────────
// `KEY_EMOJI_ST` 一直有 `🗓️→event`，看起來分類是做好的。
// 但 2026-09-27 量測發現 **`item_sources.js` 裡 🗓️／💒 開頭的鍵是 0 個**——
// 活動貨幣在建置時全都變成 `🪙<貨幣名>`，所以那條規則對來源鍵**永遠不會命中**。
// 實測社群 7,081 套的「🗓️ 活動」篩選是 **0 筆**，而那是站內最大的一份資料。
// 篩選回 0 筆時畫面只是「沒有符合的套裝」，**完全看不出規則壞了**。
//
// 三個會安靜出錯的地方：
//   ① `ev` 沒產出來（分類名改了、或用了 `k[2:]` 那個 Python 切片錯誤）→ 整條規則失效。
//   ② 前端在頂層就把集合算好 → `item_sources.js` 是動態載入的，頂層時還不存在，
//      得到空集合，且不報錯。
//   ③ 白名單寫死在頁面裡 → 新版加了季節貨幣會安靜地漏掉。
//
// 執行（repo 根目錄）：node scripts/validate-glamour-event.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const G = join(ROOT, 'tools/glamour');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const HTML = readFileSync(join(G, 'index.html'), 'utf8');
const PY = readFileSync(join(G, 'scripts/build_item_sources.py'), 'utf8');

/** 讀 `const _X = <JSON>;` 形式的前端資料檔 */
function loadJsValue(file, name) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(G, file), 'utf8') + `;globalThis.__v=${name};`, ctx);
  return ctx.__v;
}

const IS = loadJsValue('item_sources.js', '_ITEM_SOURCES');
const CUR = loadJsValue('curated_outfits.js', '_CURATED_RAW');
const SETS = loadJsValue('official_sets.js', '_SETS_RAW');
const MIRA = loadJsValue('mirapri_outfits.js', '_MIRAPRI_RAW');
const ITEMS = JSON.parse(readFileSync(join(ROOT, 'data/items.json'), 'utf8')).data;

// ── ① 建置側：ev 真的產出來了 ───────────────────────────
{
  push('item_sources.js 有 ev（活動貨幣的來源鍵索引）', Array.isArray(IS.ev), typeof IS.ev);
  push('  ev 不是空的（空的話整條分類規則失效且不報錯）',
    (IS.ev || []).length > 0, (IS.ev || []).length + ' 個');
  const keys = IS.k || [];
  push('  每個索引都指得到鍵', (IS.ev || []).every((i) => typeof keys[i] === 'string'), '');
  push('  指到的都是 🪙 開頭（活動貨幣在建置時就是這個形狀）',
    (IS.ev || []).every((i) => keys[i].startsWith('🪙')),
    (IS.ev || []).map((i) => keys[i]).filter((k) => !k.startsWith('🪙')).join('、') || '全部符合');

  /* 白名單必須來自主庫的分類，不是寫死的名單。
     逐一對回 items.json 的「雜貨（季節活動）」——對不上就代表名單飄了。 */
  const seasonal = new Set(ITEMS.filter((i) => i.category === '雜貨（季節活動）').map((i) => i.name));
  push('  季節活動貨幣的分類在主庫裡存在', seasonal.size > 0, seasonal.size + ' 種');
  push('  ev 指到的鍵都對得回主庫的季節活動貨幣',
    (IS.ev || []).every((i) => seasonal.has(keys[i].slice(2).trim())),
    (IS.ev || []).map((i) => keys[i]).filter((k) => !seasonal.has(k.slice(2).trim())).join('、') || '全部對得上');

  /* ⚠ 這一條是為了擋一個實際犯過的錯：Python 的切片以 code point 計數，
     砍掉「前兩個字元」會連名稱第一個字一起砍掉（🪙 只佔 1 個），
     結果一個都對不上而且不報錯。
     **要先把註解拿掉再掃**（§4.90）——說明文字本身就寫著那個錯誤寫法。 */
  const PY_CODE = PY.replace(/"""[\s\S]*?"""/g, '').replace(/^\s*#[^\n]*/gm, '');
  push('  建置腳本沒有用「砍兩個字元」切 emoji（Python 會多砍一個字）',
    !/k\[2:\]/.test(PY_CODE) && /k\[len\("🪙"\):\]/.test(PY_CODE), '');
  push('  建置腳本會在一個都沒對上時警告',
    /一個都沒對上/.test(PY), '');
  push('  分類名是常數而不是散在程式裡', /SEASONAL_CATEGORY = /.test(PY), '');
}

// ── ② 前端：延遲建立，不在頂層算 ────────────────────────
{
  push('前端有 eventKeys() 而不是頂層的常數集合',
    /function eventKeys\(\)/.test(HTML), '');
  push('  stOfKey 第一條就查它', /function stOfKey\(k\) \{\s*\n\s*if \(eventKeys\(\)\.has\(k\)\) return "event";/.test(HTML), '');
  /* 頂層算好的話 `item_sources.js`（動態載入）還不存在 → 空集合、不報錯。
     照 SK_GEN 重算才會在載完之後生效。 */
  push('  依 SK_GEN 重算（item_sources.js 是動態載入的）',
    /_evGen === SK_GEN/.test(HTML) && /_evGen = SK_GEN/.test(HTML), '');
  push('  沒有把 EVENT_KEYS 寫成頂層 new Set(...) 立即求值',
    !/const EVENT_KEYS = new Set\(/.test(HTML), '');
  /* 白名單不可以寫死在頁面裡。用實際的貨幣名抽檢：頁面不該出現它們。 */
  const sample = (IS.ev || []).slice(0, 6).map((i) => (IS.k || [])[i].slice(2).trim());
  push('  頁面沒有寫死貨幣名（新版加了會自動流過來）',
    sample.length > 0 && !sample.some((n) => HTML.indexOf(n) >= 0),
    sample.filter((n) => HTML.indexOf(n) >= 0).join('、') || '抽檢 ' + sample.length + ' 個都沒寫死');
  push('  註解留下了「為什麼需要這條」', /🗓️／💒 開頭的鍵是 0 個/.test(HTML), '');
}

// ── ③ 實際效果：改判後篩得到東西 ────────────────────────
{
  /* 把頁面的分類規則抄出來跑一遍（`stOfKey` 的三段規則），
     確認「🗓️ 活動」不再是 0 筆。**這一條才是真正的驗收**——
     前兩段只證明程式碼長得對。 */
  const KW = [['寶圖', 'other'], ['伊修加德重建', 'special'], ['無人島', 'special'],
    ['宇宙探索', 'special'], ['友好部族', 'special'], ['友好部落', 'special'], ['成就', 'other'],
    ['橙票', 'scrip'], ['紫票', 'scrip'], ['白票', 'scrip'], ['黃票', 'scrip'], ['綠票', 'scrip'],
    ['幻化套裝箱', 'other']];
  const EM = [['🗡️', 'raid'], ['🗺️', 'raid'], ['🎯', 'raid'], ['📋', 'quest'], ['🛒', 'npc'],
    ['🪙', 'token'], ['🔶', 'scrip'], ['🟣', 'scrip'], ['🔨', 'craft'], ['🎲', 'gs'],
    ['⚔️', 'pvp'], ['💎', 'store'], ['🗓️', 'event'], ['💒', 'event'], ['🛡️', 'other'],
    ['🚢', 'other'], ['🎁', 'other'], ['🏆', 'other']];
  const keys = IS.k || [];
  const ev = new Set((IS.ev || []).map((i) => keys[i]).filter(Boolean));
  const stOf = (k) => {
    if (ev.has(k)) return 'event';
    for (const [kw, st] of KW) if (k.includes(kw)) return st;
    for (const [e, st] of EM) if (k.startsWith(e)) return st;
    return 'other';
  };
  const srcKeys = (pieces) => {
    const out = new Set();
    for (const p of pieces || []) {
      const iid = p && (p.iid || p.id);
      if (!iid) continue;
      for (const ki of IS.i[String(iid)] || []) out.add(keys[ki]);
    }
    return out;
  };

  // 社群：緊湊編碼，裝備 id 在 q[i][0]
  let miraEvent = 0, miraTotal = 0;
  for (const row of MIRA.o || []) {
    miraTotal++;
    const ks = new Set();
    for (const p of row.q || []) {
      if (!Array.isArray(p)) continue;
      const iid = p[0] || 0;
      if (!iid) continue;
      for (const ki of IS.i[String(iid)] || []) ks.add(keys[ki]);
    }
    if ([...ks].some((k) => stOf(k) === 'event')) miraEvent++;
  }
  /* **這一條是這支腳本的重點。** 修之前是 0 筆——而 0 筆在畫面上只是
     「沒有符合的套裝」，完全看不出規則壞了。 */
  push('社群配裝的「🗓️ 活動」不是 0 筆（修之前就是 0）',
    miraEvent > 0, miraEvent + ' / ' + miraTotal + ' 套');
  push('  數量在合理範圍（不是把整份資料都歸成活動）',
    miraEvent > 100 && miraEvent < miraTotal * 0.2,
    (miraEvent / miraTotal * 100).toFixed(1) + '%');

  let curEvent = 0;
  for (const e of [...CUR, ...SETS]) {
    const sts = new Set([...srcKeys(e.pieces)].map(stOf));
    if (e.st) sts.add(e.st);
    for (const t of e.tags || []) sts.add(t);
    if (sts.has('event')) curEvent++;
  }
  push('  精選＋官方也有活動套（原本 65 筆全靠整套層級的退路）',
    curEvent >= 65, curEvent + ' / ' + (CUR.length + SETS.length) + ' 套');

  // 改判不可以把 🪙 代幣兌換整個清空
  let tokenCount = 0;
  for (const row of MIRA.o || []) {
    const ks = new Set();
    for (const p of row.q || []) {
      if (!Array.isArray(p)) continue;
      const iid = p[0] || 0;
      if (!iid) continue;
      for (const ki of IS.i[String(iid)] || []) ks.add(keys[ki]);
    }
    if ([...ks].some((k) => stOf(k) === 'token')) tokenCount++;
  }
  push('  「🪙 代幣兌換」沒有被改判清空（只動 21 個活動貨幣鍵）',
    tokenCount > miraEvent, 'token ' + tokenCount + ' 套 vs event ' + miraEvent + ' 套');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
