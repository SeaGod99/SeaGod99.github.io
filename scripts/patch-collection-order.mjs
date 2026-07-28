/**
 * patch-collection-order.mjs
 *
 * 替 data/mounts.json 與 data/minions.json 補上遊戲手冊排序欄 `order`
 * （XIVAPI `Mount.Order` / `Companion.Order`），讓前端能濾掉「玩家拿不到的內部列」。
 *
 * ── 為什麼需要 ──────────────────────────────────────────────────────────────
 *
 * 坐騎頁原本會顯示 4 筆玩家永遠拿不到的東西，其中 3 筆還是既有坐騎的**重複列**：
 *
 *   id 103 尼祿專用魔導裝甲（Red Baron）  ← 與 id 69 完全同名同英文名
 *   id 147 力氣大的魔象（marid）          ← 與 id 146 魔象 同一隻
 *   id 149 真獅鷲（true griffin）         ← 與 id 148 真獅鷲 同名，頁面上出現兩次
 *   id 128 捕獲的魔導裝甲                 ← 劇情用、不進手冊
 *
 * 這幾筆的共同特徵是 **`Mount.Order === -1`**：遊戲的坐騎手冊是照 `Order` 排的，
 * -1 代表「不在手冊裡」。它們的 `sources` 是空的（先前被當成「取得方式待補」的資料
 * 缺口），但真相不是缺資料——**它們本來就不該出現在收藏頁**，補 sources 是補錯方向。
 *
 * 判別依據不是「TC 收藏站沒收」也不是「sources 是空的」，那些都只是症狀；
 * `Order === -1` 才是遊戲客戶端自己的答案。
 *
 * ※ 名稱本身沒有錯位問題：本地 `nameEn` 與 XIVAPI `Singular` 比對過 **0 筆不符**，
 *   TC 收藏站的 287 筆也是 **287/287 同 id 同名**。PROGRESS 舊註記的「手動名大量錯位」
 *   已經在 06-11 的 patch-mounts-tc 修掉了。
 *
 * 執行：
 *   node scripts/patch-collection-order.mjs            # dry-run
 *   node scripts/patch-collection-order.mjs --apply    # 寫入
 *   node scripts/patch-collection-order.mjs --offline  # 只用 out_data/ 快取
 * 改完記得跑：node scripts/validate-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const OFFLINE = process.argv.includes('--offline');

const V2 = 'https://v2.xivapi.com/api/sheet';
const CACHE = path.join(ROOT, 'out_data', 'collection-order.json');

const TARGETS = [
  { file: 'data/mounts.json',  sheet: 'Mount',     label: '坐騎' },
  { file: 'data/minions.json', sheet: 'Companion', label: '寵物' },
];

const readData = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 前端顯示規則（與 collection-tracker.js 的 include 預設一致）
const pnum = (p) => {
  if (p == null || p === '') return null;
  const m = String(p).match(/^(\d+)\.(\d+)/);
  return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, '0')}`) : null;
};
const released = (patch, gp) => {
  const v = pnum(patch), g = pnum(gp);
  return v == null || g == null ? true : v <= g;
};

async function fetchOrders(sheet, ids, cache) {
  const key = (id) => `${sheet}:${id}`;
  const missing = ids.filter((id) => cache[key(id)] === undefined);
  if (missing.length && OFFLINE) {
    console.warn(`  ⚠ --offline：快取缺 ${missing.length} 筆`);
    return;
  }
  if (!missing.length) return;
  console.log(`  從 XIVAPI 抓 ${missing.length} 列 ${sheet}（快取命中 ${ids.length - missing.length}）…`);
  for (let s = 0; s < missing.length; s += 100) {
    const batch = missing.slice(s, s + 100);
    const res = await fetch(`${V2}/${sheet}?rows=${batch.join(',')}&fields=Singular,Order`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    for (const row of j.rows || []) {
      cache[key(row.row_id)] = { en: row.fields?.Singular ?? null, order: row.fields?.Order ?? null };
    }
    for (const id of batch) if (cache[key(id)] === undefined) cache[key(id)] = null;
    await sleep(150);
  }
}

async function main() {
  const gp = readData('data/_meta.json').gamePatch;
  console.log(`gamePatch = ${gp}`);
  let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

  const summary = [];
  for (const t of TARGETS) {
    console.log(`\n━━ ${t.label}（${t.file}）━━`);
    const db = readData(t.file);
    const rows = db.data;
    await fetchOrders(t.sheet, rows.map((r) => r.id), cache);

    // 護欄：英文名對位。對不上代表 id 空間有問題，寧可中止也不要寫錯的 order。
    let checked = 0, bad = [];
    for (const e of rows) {
      const c = cache[`${t.sheet}:${e.id}`];
      if (!c || !c.en || !e.nameEn) continue;
      checked++;
      if (c.en.toLowerCase() !== e.nameEn.toLowerCase()) bad.push({ e, got: c.en });
    }
    console.log(`  護欄 英文名對位：比對 ${checked} 筆，不符 ${bad.length} 筆`);
    bad.slice(0, 5).forEach((b) => console.log(`    ✗ ${b.e.id}：本地「${b.e.nameEn}」vs XIVAPI「${b.got}」`));
    if (checked && bad.length / checked > 0.02) {
      console.error(`  ✗ 不符比例過高，中止不寫入。`);
      process.exit(1);
    }

    const shown = rows.filter((e) => e.name && e.name !== e.nameEn && released(e.patch, gp));
    const phantom = shown.filter((e) => {
      const c = cache[`${t.sheet}:${e.id}`];
      return c && c.order === -1;
    });
    let written = 0, noOrder = 0;
    for (const e of rows) {
      const c = cache[`${t.sheet}:${e.id}`];
      if (!c || c.order == null) { noOrder++; continue; }
      if (e.order !== c.order) written++;
      if (APPLY) e.order = c.order;
    }
    console.log(`  資料 ${rows.length} 筆｜目前前端顯示 ${shown.length} 筆`);
    console.log(`  order 可填 ${rows.length - noOrder} 筆（要更新 ${written}）`);
    console.log(`  ★ 顯示中但 order = -1（遊戲手冊沒有，應隱藏）：${phantom.length} 筆`);
    phantom.forEach((e) => console.log(`      ${e.id} ${e.name}（${e.nameEn}）sources ${(e.sources || []).length} 筆`));
    console.log(`  → 前端加上 order 條件後會顯示 ${shown.length - phantom.length} 筆`);
    summary.push({ label: t.label, before: shown.length, after: shown.length - phantom.length });

    if (APPLY) {
      db.updated = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(path.join(ROOT, t.file), JSON.stringify(db, null, 2) + '\n', 'utf8');
      console.log(`  ✓ 已寫入 ${t.file}`);
    }
  }

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n', 'utf8');

  console.log('\n━━ 結算 ━━');
  summary.forEach((s) => console.log(`  ${s.label}：${s.before} → ${s.after} 筆`));
  if (!APPLY) console.log('\n（dry-run，未寫入。加 --apply 才會寫檔）');
  else console.log('\n記得讓前端 include 加上 order !== -1，並跑 node scripts/validate-data.mjs');
}

main().catch((e) => { console.error(e); process.exit(1); });
