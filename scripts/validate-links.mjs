// 全資料庫連結驗證（固化 2026-06-10 的全量檢查；對應 docs/地圖ID統一修正計畫.md 第 1 步）
//
// 用途：每次 build 完跑一次，輸出各庫外鍵的斷鏈計數。
//   node scripts/validate-links.mjs
//
// 驗證項目：
//   mapId 類  ：npcs / monsters.positions / gathering / fishing-spots → maps.id
//   itemId 類 ：recipes 成品+材料、gathering items/hiddenItems、fishes itemId/bait、
//               obtainable-methods key 與 currency → items.id
//   npcId 類  ：triple-triad.sources、obtainable-methods.npcs → npcs.id
//   其他      ：fishes.spotId → fishing-spots、fishing-spots.fishes → fishes.itemId
//
// 備註：台服未開放（tw-items 對不到）造成的斷鏈屬預期內，前端過濾即可；
//       gathering 的 EventItem 偽 id（≥2000000）已於 build 時過濾，此處仍計數以防回歸。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");

async function loadDB(name) {
  const j = JSON.parse(await readFile(join(DATA, `${name}.json`), "utf8"));
  return j.data;
}

const rows = [];
function report(link, broken, total, note = "") {
  rows.push({ link, broken, total, note });
}

const maps = await loadDB("maps");
const items = await loadDB("items");
const npcs = await loadDB("npcs");
const monsters = await loadDB("monsters");
const gathering = await loadDB("gathering");
const fishingSpots = await loadDB("fishing-spots");
const fishes = await loadDB("fishes");
const recipes = await loadDB("recipes");
const tripleTriad = await loadDB("triple-triad");
const omData = await loadDB("obtainable-methods"); // data 是 { itemId: [methods] } 物件

const mapIds = new Set(maps.map((m) => m.id));
const itemIds = new Set(items.map((i) => i.id));
const npcIds = new Set(npcs.map((n) => n.id));
const spotIds = new Set(fishingSpots.map((s) => s.id));
const fishItemIds = new Set(fishes.map((f) => f.itemId));

// ---------- mapId 類 ----------
{
  let broken = 0;
  for (const n of npcs) if (n.coords?.mapId && !mapIds.has(n.coords.mapId)) broken++;
  report("npcs.coords.mapId → maps", broken, npcs.length);
}
{
  let broken = 0, total = 0;
  for (const m of monsters)
    for (const p of m.positions || []) {
      total++;
      if (p.mapId && !mapIds.has(p.mapId)) broken++;
    }
  report("monsters.positions[].mapId → maps", broken, total);
}
{
  let broken = 0, zero = 0;
  for (const g of gathering) {
    const id = g.coords?.mapId;
    if (id === 0) { zero++; continue; }
    if (id && !mapIds.has(id)) broken++;
  }
  report("gathering.coords.mapId → maps", broken, gathering.length, `另 mapId=0 共 ${zero} 筆（無地圖資訊，不計斷鏈）`);
}
{
  let broken = 0, missing = 0;
  for (const s of fishingSpots) {
    const id = s.coords?.mapId;
    if (id == null) { missing++; continue; }
    if (!mapIds.has(id)) broken++;
  }
  report("fishing-spots.coords.mapId → maps", broken, fishingSpots.length, missing ? `另 ${missing} 筆完全沒有 mapId 欄位` : "");
}

// ---------- itemId 類 ----------
{
  let broken = 0;
  for (const r of recipes) if (!itemIds.has(r.itemId)) broken++;
  report("recipes.itemId → items", broken, recipes.length, "台服未開放成品屬預期內");
}
{
  let broken = 0, total = 0;
  for (const r of recipes)
    for (const ing of r.ingredients || []) {
      total++;
      if (!itemIds.has(ing.itemId)) broken++;
    }
  report("recipes.ingredients[].itemId → items", broken, total, "台服未開放素材屬預期內");
}
{
  let broken = 0, eventItem = 0, total = 0;
  const seen = new Set();
  for (const g of gathering)
    for (const id of [...(g.items || []), ...(g.hiddenItems || [])]) {
      total++;
      if (!itemIds.has(id)) {
        broken++;
        if (id >= 2000000 && !seen.has(id)) { seen.add(id); eventItem++; }
      }
    }
  report("gathering items/hiddenItems → items", broken, total, eventItem ? `含 ${eventItem} 個 EventItem 偽 id（≥2000000，應為 0）` : "");
}
{
  let broken = 0;
  for (const f of fishes) if (!itemIds.has(f.itemId)) broken++;
  report("fishes.itemId → items", broken, fishes.length, "台服未開放魚屬預期內");
}
{
  let broken = 0, total = 0;
  for (const f of fishes)
    for (const b of f.bait || []) {
      total++;
      if (!itemIds.has(b.itemId)) broken++;
    }
  report("fishes.bait[].itemId → items", broken, total, "台服未開放餌屬預期內");
}
{
  let broken = 0, nullSpot = 0;
  for (const f of fishes) {
    if (f.spotId == null) { nullSpot++; continue; }
    if (!spotIds.has(f.spotId)) broken++;
  }
  report("fishes.spotId → fishing-spots", broken, fishes.length, `spots 只收有繁中資料者；另 spotId=null ${nullSpot} 筆`);
}

// ---------- obtainable-methods ----------
{
  const keys = Object.keys(omData);
  let keyBroken = 0, curBroken = 0, curTotal = 0, npcBroken = 0, npcTotal = 0;
  for (const k of keys) {
    if (!itemIds.has(Number(k))) keyBroken++;
    for (const m of omData[k]) {
      if (m.currency?.itemId != null) {
        curTotal++;
        if (!itemIds.has(m.currency.itemId)) curBroken++;
      }
      for (const n of m.npcs || []) {
        npcTotal++;
        if (!npcIds.has(n.id)) npcBroken++;
      }
    }
  }
  report("obtainable-methods key → items", keyBroken, keys.length);
  report("obtainable-methods currency.itemId → items", curBroken, curTotal, "台服未開放貨幣屬預期內");
  report("obtainable-methods npcs[].id → npcs", npcBroken, npcTotal, "npcs 只收有繁中名+座標者");
}

// ---------- 其他 ----------
{
  let broken = 0, total = 0;
  for (const t of tripleTriad)
    for (const s of t.sources || []) {
      if (s.npcId == null) continue;
      total++;
      if (!npcIds.has(s.npcId)) broken++;
    }
  report("triple-triad.sources[].npcId → npcs", broken, total, "npcs 只收有繁中名+座標者");
}
{
  let broken = 0, total = 0;
  for (const s of fishingSpots)
    for (const fid of s.fishes || []) {
      total++;
      if (!fishItemIds.has(fid)) broken++;
    }
  report("fishing-spots.fishes[] → fishes.itemId", broken, total);
}

// ---------- 輸出 ----------
console.log(`連結驗證報告（${new Date().toISOString().slice(0, 10)}）`);
console.log("".padEnd(78, "─"));
let anyBroken = false;
for (const r of rows) {
  const flag = r.broken > 0 ? "✗" : "✓";
  if (r.broken > 0) anyBroken = true;
  console.log(`${flag} ${r.link.padEnd(46)} ${String(r.broken).padStart(6)} / ${r.total}${r.note ? `　（${r.note}）` : ""}`);
}
console.log("".padEnd(78, "─"));
console.log(anyBroken ? "存在斷鏈：mapId 類應歸零；itemId/npcId 類多為台服未開放（預期內）。" : "全部連結通過。");
