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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const recipes = read('recipes.json');
const items = read('items.json');
const om = read('obtainable-methods.json');
const gathering = read('gathering.json');
const gcShop = read('gc-shop.json');
const maps = read('maps.json');

// ── 索引 ────────────────────────────────────────────────────────────────
const itemName = new Map();
const itemMarketable = new Map();
for (const it of items.data) { itemName.set(it.id, it.name); itemMarketable.set(it.id, !!it.marketable); }

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

// ── 轉換 ────────────────────────────────────────────────────────────────
// 顯示優先序：能自己去拿的排前面，靠運氣或已淘汰的排後面。
const ORDER = ['採集', '軍票兌換', '兌換', 'NPC商店', '無人島', '園藝', '副本', '危命任務',
  '任務獎勵', '雇員探險', '遠航探索', '寶箱/容器', '怪物掉落', '精製獲得', '分解獲得', '成就獎勵'];

// 這幾種對「我現在要湊材料」沒有行動意義，或前端本來就知道：
//   craft      前端自己有 recipes.json，會畫成配方樹
//   masterbook 秘籍是製作的前置，不是取得管道
//   mogstation 商城，與素材無關
//   requirement/alarm 語意含糊（前者是「被什麼需要」，後者無座標）
const SKIP = new Set(['craft', 'masterbook', 'mogstation', 'requirement', 'alarm']);

function npcNames(m) {
  if (!Array.isArray(m.npcs) || !m.npcs.length) return null;
  const uniq = [...new Set(m.npcs.map((n) => n?.name).filter(Boolean))];
  return uniq.length ? uniq.slice(0, 3).join('、') : null;
}

function convertOm(m) {
  if (SKIP.has(m.type)) return null;
  switch (m.type) {
    case 'specialshop': {
      const cur = m.currency ? `${m.currency.name} ×${m.currency.amount}` : null;
      // 商店名常常就是貨幣名（「白鋼刀幣」的商店也叫「白鋼刀幣」），別印兩次
      const parts = [];
      if (m.shopName) parts.push(m.shopName);
      if (cur && m.currency.name !== m.shopName) parts.push(cur);
      else if (cur && m.currency.amount) parts.push(`×${m.currency.amount}`);
      return { t: '兌換', d: parts.join(' · ') || '特殊商店', w: npcNames(m) };
    }
    case 'vendor':
      return { t: 'NPC商店', d: npcNames(m) ? 'NPC 販售' : 'NPC 販售（未記錄販售者）', w: npcNames(m) };
    case 'instance':
      return { t: '副本', d: `${m.totalInstances || 1} 個副本可產出` };
    case 'quest':
      return { t: '任務獎勵', d: m.questName || '任務獎勵' };
    case 'gathering':
      // 詳細座標另外由 gathering.json 補；這裡只當「確實是採集品」的佐證
      return { t: '採集', d: m.level ? `採集 Lv.${m.level}` : '採集獲得' };
    case 'venture':
      return { t: '雇員探險', d: '派遣雇員可帶回' };
    case 'voyage':
      return { t: '遠航探索', d: `${m.totalVoyages || 1} 條航線可產出` };
    case 'treasure':
      return { t: '寶箱/容器', d: `${m.count || 1} 種寶箱／容器開得到` };
    case 'drop':
      return { t: '怪物掉落', d: '怪物掉落' };
    case 'desynth':
      return { t: '精製獲得', d: `${m.count || 1} 種物品精製得到` };
    case 'reduction':
      return { t: '分解獲得', d: `${m.count || 1} 種靈砂分解得到` };
    case 'gardening':
      return { t: '園藝', d: m.seedName ? `種 ${m.seedName}（${m.duration || '?'} 小時）` : '園藝栽培' };
    case 'islandcrop':
      return { t: '無人島', d: m.seedName ? `無人島農作：${m.seedName}` : '無人島農作' };
    case 'islandpasture':
      return { t: '無人島', d: '無人島牧場產出' };
    case 'fate':
      return { t: '危命任務', d: m.fateName ? `${m.fateName}（Lv.${m.level || '?'}）` : `危命任務 Lv.${m.level || '?'}` };
    case 'achievement':
      return { t: '成就獎勵', d: '成就獎勵' };
    default:
      return { t: m.typeName || m.type, d: m.typeName || m.type };
  }
}

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
    const c = convertOm(m);
    if (!c) continue;
    // 已經有帶座標的採集資料，就不要再塞一筆沒座標的「採集獲得」
    if (c.t === '採集' && hasGatherDetail) continue;
    list.push(c);
  }

  // 去重（同類同說明）
  const uniq = [];
  const seen = new Set();
  for (const e of list) {
    const k = `${e.t}|${e.d}|${e.w || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }
  uniq.sort((a, b) => {
    const ia = ORDER.indexOf(a.t), ib = ORDER.indexOf(b.t);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  if (!uniq.length) continue;
  // 一個物品最多留 8 筆，避免熱門素材塞爆（前端也顯示不下）；
  // 順手拿掉空的 w／map，前端本來就用 falsy 判斷，留著只是佔體積
  data[id] = uniq.slice(0, 8).map((e) => {
    const o = { t: e.t, d: e.d };
    if (e.w) o.w = e.w;
    if (e.map != null) o.map = e.map;
    return o;
  });
  nItems++;
  nEntries += data[id].length;
}

const out = {
  schema: 'market-sources',
  patch: recipes.patch || null,
  updated: new Date().toISOString().slice(0, 10),
  source: 'obtainable-methods.json + gathering.json + gc-shop.json + maps.json（皆為本庫既有資料）',
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
