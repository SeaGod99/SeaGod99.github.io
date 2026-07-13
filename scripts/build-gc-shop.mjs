// 建立 data/gc-shop.json — 軍票變現排行／雙色寶石兌換效益 資料來源
//
// 來源：
//   XIVAPI v2  GCScripShopItem（軍票商店品項：物品、軍票價、軍階需求）
//     https://v2.xivapi.com/api/sheet/GCScripShopItem?fields=Item@as(raw),CostGCSeals,RequiredGrandCompanyRank@as(raw)
//   XIVAPI v2  SpecialShop（掃描成本含「雙色寶石」26807 的兌換項）
//     https://v2.xivapi.com/api/sheet/SpecialShop?fields=Item[].Item@as(raw),Item[].ItemCost@as(raw),Item[].CurrencyCost,Item[].ReceiveCount
//   data/items.json（台服繁中名稱權威 + marketable 旗標）——無繁中名或不可上市集板者剔除
//
// 執行（repo 根目錄）： node scripts/build-gc-shop.mjs
//
// 前端（/tools/gc-exchange/）讀本檔後即時向 Universalis 查市價，計算每軍票/每寶石可變現 gil。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://v2.xivapi.com/api";
const BICOLOR_ID = 26807; // 雙色寶石

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// 依 row_id 分頁抓整張表（子列表以 row:sub 鍵去重）
async function fetchAll(sheet, fields, limit = 500) {
  const rows = [];
  const seen = new Set();
  let after = null;
  for (;;) {
    const url = `${API}/sheet/${sheet}?limit=${limit}&fields=${encodeURIComponent(fields)}` +
      (after != null ? `&after=${after}` : "");
    const j = await getJSON(url);
    if (!j.rows || !j.rows.length) break;
    let added = 0;
    for (const r of j.rows) {
      const key = `${r.row_id}:${r.subrow_id ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(r);
      added++;
    }
    after = j.rows[j.rows.length - 1].row_id;
    if (j.rows.length < limit && added === 0) break;
    if (j.rows.length < limit) {
      // 尾頁仍可能有同 row 的後續子列，多抓一輪直到無新增
      if (added === 0) break;
      if (j.rows.length === 0) break;
    }
    if (added === 0) break;
  }
  return rows;
}

const items = JSON.parse(await readFile(join(ROOT, "data/items.json"), "utf8")).data;
const byId = new Map(items.map((x) => [x.id, x]));
const usable = (id) => {
  const it = byId.get(id);
  return it && it.marketable && it.name && /[一-鿿]/.test(it.name) ? it : null;
};

/* ── 軍票商店 ── */
console.log("抓取 GCScripShopItem…");
const gcRows = await fetchAll(
  "GCScripShopItem",
  "Item@as(raw),CostGCSeals,RequiredGrandCompanyRank@as(raw)"
);
const sealMap = new Map(); // itemId -> { seals, rank }（同物品取最低軍票價）
for (const r of gcRows) {
  const f = r.fields;
  const itemId = f["Item@as(raw)"];
  const seals = f.CostGCSeals;
  if (!itemId || !seals) continue;
  const prev = sealMap.get(itemId);
  if (!prev || seals < prev.seals) {
    sealMap.set(itemId, { seals, rank: f["RequiredGrandCompanyRank@as(raw)"] || 0 });
  }
}
const seals = [];
for (const [id, v] of sealMap) {
  const it = usable(id);
  if (!it) continue;
  seals.push({ id, name: it.name, category: it.category, patch: it.patch, seals: v.seals, rank: v.rank });
}
seals.sort((a, b) => a.seals - b.seals);
console.log(`軍票商店可上市品項：${seals.length}（原始 ${sealMap.size}）`);

/* ── 雙色寶石（SpecialShop 掃描）── */
console.log("抓取 SpecialShop…（掃描雙色寶石兌換）");
const shopRows = await fetchAll(
  "SpecialShop",
  "Item[].Item@as(raw),Item[].ItemCost@as(raw),Item[].CurrencyCost,Item[].ReceiveCount"
);
const gemMap = new Map(); // itemId -> { gems, count }（同物品取每寶石最多顆）
for (const r of shopRows) {
  for (const e of r.fields.Item || []) {
    const costs = e["ItemCost@as(raw)"] || [];
    const gi = costs.indexOf(BICOLOR_ID);
    if (gi === -1) continue;
    const gems = (e.CurrencyCost || [])[gi];
    const recv = (e["Item@as(raw)"] || [])[0];
    const count = (e.ReceiveCount || [])[0] || 1;
    if (!recv || !gems) continue;
    const prev = gemMap.get(recv);
    if (!prev || count / gems > prev.count / prev.gems) gemMap.set(recv, { gems, count });
  }
}
const bicolor = [];
for (const [id, v] of gemMap) {
  const it = usable(id);
  if (!it) continue;
  bicolor.push({ id, name: it.name, category: it.category, patch: it.patch, gems: v.gems, count: v.count });
}
bicolor.sort((a, b) => a.gems - b.gems);
console.log(`雙色寶石可上市品項：${bicolor.length}（原始 ${gemMap.size}）`);

const out = {
  schema: "gc-shop@1",
  updated: new Date().toISOString().slice(0, 10),
  source: "XIVAPI v2 GCScripShopItem / SpecialShop；名稱與可上市旗標取自 data/items.json",
  data: { seals, bicolor },
};
await writeFile(join(ROOT, "data/gc-shop.json"), JSON.stringify(out, null, 1), "utf8");
console.log(`已寫入 data/gc-shop.json（軍票 ${seals.length}、雙色寶石 ${bicolor.length}）`);
