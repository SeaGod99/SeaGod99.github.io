#!/usr/bin/env node
/**
 * build-market-sources.mjs — 產生 data/market-sources.json
 *
 * 為什麼需要這一份：市場查價頁遇到「不可交易」的素材時，原本只能說一句
 * 「需自行取得」——診斷有了，處方沒有。站內明明躺著採集點座標、軍票價目、
 * 兌換 NPC 等一整套繁中資料，接上去就能直接回答「那我要去哪弄」。
 *
 * 為什麼不直接讀 data/obtainable-methods.json：那份 7.7MB，前端載不動。
 * 這支只挑「會出現在配方裡的物品」（材料 ∪ 成品），欄位也砍到剩顯示需要的，
 * 產出約數百 KB，前端可以延遲載入。
 *
 * 來源：
 *   data/obtainable-methods.json  取得管道摘要（兌換／副本／任務／雇員…）
 *   data/gathering.json           採集點座標、職業、等級、限時
 *   data/gc-shop.json             軍票兌換價
 *   data/maps.json                mapId → 地名（繁中）
 *   data/recipes.json             決定要收哪些物品
 *   data/items.json               物品名稱與 marketable（判斷是否真的需要）
 *
 * 用法：node scripts/build-market-sources.mjs [--stdout]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertOm, normalizeEntries } from './lib/obtainable.mjs';
import { loadTwLocales, twName } from './lib/tw-locales.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const recipes = read('recipes.json');
const items = read('items.json');
const om = read('obtainable-methods.json');
const gathering = read('gathering.json');
const gcShop = read('gc-shop.json');
// NPC 販售者：om 的 vendor 型幾乎都沒有可用的 NPC 名，補這份才講得出「跟誰買」
const vendorPrices = read('vendor-prices.json').data;
// 理符報酬與收藏品交納：obtainable-methods 沒有這兩型，由 build-extra-sources.mjs 補
const extra = read('extra-sources.json').data;
const maps = read('maps.json');

// ── 索引 ────────────────────────────────────────────────────────────────
const itemName = new Map();
const itemMarketable = new Map();
for (const it of items.data) { itemName.set(it.id, it.name); itemMarketable.set(it.id, !!it.marketable); }

// 店名解析器（同 build-item-sources.mjs）：om 的 shopName 有英文殘留，用 tw-locales 補
const twLocales = await loadTwLocales();
const twShop = (id) => twName(twLocales.shops, id);

const mapName = new Map();
for (const m of maps.data) mapName.set(m.id, m.name);

// 收哪些物品：配方會用到的一切（材料與成品）。市場頁只在這個範圍內查詢。
const wanted = new Set();
for (const r of recipes.data) {
  wanted.add(r.itemId);
  for (const g of r.ingredients) wanted.add(g.itemId);
}

// ── 採集點：itemId → 節點清單 ───────────────────────────────────────────
const gatherByItem = new Map();
for (const node of gathering.data) {
  const ids = [...(node.items || []), ...(node.hiddenItems || [])];
  for (const id of ids) {
    if (!wanted.has(id)) continue;
    if (!gatherByItem.has(id)) gatherByItem.set(id, []);
    gatherByItem.get(id).push(node);
  }
}

// ── 軍票 ────────────────────────────────────────────────────────────────
const sealByItem = new Map();
for (const row of (gcShop.data?.seals || [])) {
  if (wanted.has(row.id)) sealByItem.set(row.id, row);
}

// ── 轉換 ──────────────────────────────────────────────────────────────
// 轉換規則（類型翻譯、優先序、要略過哪幾種、去重與上限）抽在 scripts/lib/obtainable.mjs，
// 與分片層 build-item-sources.mjs 共用同一份——七個提案都要這層，
// 各抄一份就會長出七種「兌換」的寫法與七種優先序。

function gatherEntries(id) {
  const nodes = gatherByItem.get(id) || [];
  if (!nodes.length) return [];
  // 同一個素材常常散在十幾個點；只留最有代表性的幾個（等級低的先，限時的獨立標）
  const sorted = nodes.slice().sort((a, b) => (a.level || 0) - (b.level || 0));
  const out = [];
  const seen = new Set();
  for (const n of sorted) {
    const place = mapName.get(n.coords?.mapId) || null;
    const key = `${n.job}|${place}|${n.level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const co = n.coords && n.coords.x != null ? ` X:${n.coords.x.toFixed(1)} Y:${n.coords.y.toFixed(1)}` : '';
    const tags = [];
    if (n.limited) tags.push('限時');
    if (n.legendary) tags.push('傳說');
    if (n.ephemeral) tags.push('未知');
    out.push({
      t: '採集',
      d: `${n.job || '採集'} Lv.${n.level || '?'}${n.typeName ? `（${n.typeName}）` : ''}${tags.length ? ` [${tags.join('・')}]` : ''}`,
      w: place ? `${place}${co}` : null,
      // 地名對不回來時 mapId 也沒有用（前端拿它做不了事），別留一個 map:0 誤導
      map: place ? (n.coords?.mapId ?? null) : null
    });
    if (out.length >= 4) break;
  }
  return out;
}

// ── 產生 ────────────────────────────────────────────────────────────────
const data = {};
let nItems = 0, nEntries = 0;

for (const id of wanted) {
  const list = [];

  list.push(...gatherEntries(id));

  const seal = sealByItem.get(id);
  if (seal) list.push({ t: '軍票兌換', d: `${seal.seals} 軍票${seal.rank ? `（軍階 ${seal.rank}）` : ''}` });

  const oms = om.data[String(id)] || [];
  const hasGatherDetail = list.some((x) => x.t === '採集' && x.w);
  for (const m of oms) {
    const c = convertOm(m, { twShop, vendor: vendorPrices[id] || null, itemId: id });
    if (!c) continue;
    // 已經有帶座標的採集資料，就不要再塞一筆沒座標的「採集獲得」
    if (c.t === '採集' && hasGatherDetail) continue;
    list.push(c);
  }

  /* 理符報酬／收藏品交納。這兩型在 ORDER 裡排在後面，所以「去採」「去買」
     這些確定的管道會先佔掉 max 的額度——是刻意的，見 obtainable.mjs 的註解。 */
  for (const e of extra[String(id)] || []) list.push(e);

  // 去重、排序、砍到 8 筆上限——規則在共用層，市場頁與分片層完全一致
  const entries = normalizeEntries(list, { max: 8 });
  if (!entries.length) continue;
  data[id] = entries;

  nItems++;
  nEntries += data[id].length;
}

const out = {
  schema: 'market-sources',
  patch: recipes.patch || null,
  updated: new Date().toISOString().slice(0, 10),
  source: 'obtainable-methods.json + gathering.json + gc-shop.json + maps.json + extra-sources.json（皆為本庫既有資料）',
  note: '只收配方會用到的物品（材料 ∪ 成品）。供市場查價頁回答「不可交易的素材要去哪弄」。',
  count: nItems,
  data
};

if (process.argv.includes('--stdout')) {
  console.log(JSON.stringify(out).slice(0, 2000));
} else {
  const file = path.join(ROOT, 'data', 'market-sources.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`✅ data/market-sources.json — ${nItems} 個物品／${nEntries} 筆管道／${kb} KB`);
  console.log(`   配方涉及物品 ${wanted.size} 個，其中 ${wanted.size - nItems} 個查不到任何非製作管道`);
}
