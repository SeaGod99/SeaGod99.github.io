// 地圖 ID 統一修正計畫 第 2 步：maps.json 重 key 成遊戲 Map sheet row id + 擴充收錄
//
// 離線執行（XIVAPI Map sheet 列已預先抓到 out_data/tmp-map-rows-*.json）：
//   node scripts/rekey-maps.mjs
//
// 輸入：
//   data/maps.json                  既有 67 張（自編連號 id，待重 key）
//   out_data/tmp-map-rows-*.json    XIVAPI Map sheet 的 210 個被引用列
//                                   （fields: Id/PlaceName/PlaceNameRegion@as(raw)/SizeFactor/OffsetX/OffsetY）
//   out_data/places.msgpack         台服官方地名（twPlaces，PlaceName id 為 key）
//   data/npcs.json / monsters.json / gathering.json  收集被引用的 mapId
//
// 規則：
//   - 既有條目用 image.key（mapKey）比對 → id 換成 row_id，其餘欄位保留
//   - 引用到但缺的地圖新增條目；名稱優先序：tw-places → nameEn + nameMissing:true
//   - 新條目 type 由 mapKey 第 3 碼推斷：t=city f=field(第4碼為字母則 instance)
//     h=housing d/r/o=dungeon 其他=instance
//   - 新條目不含 weatherRates / patch（XIVAPI 此批未抓，之後需要再補）

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "out_data");

// ---- 載入 XIVAPI Map sheet 列 ----
const rows = [];
for (const f of readdirSync(OUT).filter((f) => /^tmp-map-rows-\d+\.json$/.test(f))) {
  rows.push(...JSON.parse(readFileSync(join(OUT, f), "utf8")).rows);
}
const byRowId = new Map(rows.map((r) => [r.row_id, r]));
const byKey = new Map(rows.map((r) => [r.fields.Id, r]));
console.log(`Map sheet 列：${rows.length}`);

// ---- 台服地名 ----
const twPlaces = decode(readFileSync(join(OUT, "places.msgpack"))).twPlaces;
const tw = (placeId) => twPlaces[placeId]?.tw || null;

// ---- 收集被引用的 mapId ----
const refIds = new Set();
const npcs = JSON.parse(readFileSync(join(DATA, "npcs.json"), "utf8")).data;
for (const n of npcs) if (n.coords?.mapId) refIds.add(n.coords.mapId);
const monsters = JSON.parse(readFileSync(join(DATA, "monsters.json"), "utf8")).data;
for (const m of monsters) for (const p of m.positions || []) if (p.mapId) refIds.add(p.mapId);
const gathering = JSON.parse(readFileSync(join(DATA, "gathering.json"), "utf8")).data;
for (const g of gathering) if (g.coords?.mapId) refIds.add(g.coords.mapId);
refIds.delete(0);
console.log(`被引用 mapId：${refIds.size}`);

function mkImage(key) {
  return {
    key,
    local: `/assets/maps/${key.replace("/", "_")}.jpg`,
    url: `https://v2.xivapi.com/api/asset/map/${key}`,
  };
}

function inferType(key) {
  const c3 = key[2];
  const c4 = key[3];
  if (c3 === "t") return "city";
  if (c3 === "h") return "housing";
  if (c3 === "f") return /\d/.test(c4) ? "field" : "instance";
  if (c3 === "d" || c3 === "r" || c3 === "o") return "dungeon";
  return "instance";
}

// ---- 1. 既有條目重 key ----
const db = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8"));
const usedRowIds = new Set();
const oldToNew = new Map();
for (const entry of db.data) {
  const hit = byKey.get(entry.image?.key);
  if (!hit) throw new Error(`mapKey 比對不到：[${entry.id}] ${entry.name} ${entry.image?.key}`);
  if (usedRowIds.has(hit.row_id)) throw new Error(`row_id 重複：${hit.row_id}`);
  usedRowIds.add(hit.row_id);
  oldToNew.set(entry.id, hit.row_id);
  entry.id = hit.row_id;
}
console.log(`重 key 既有條目：${db.data.length}`);

// ---- 2. 擴充缺的地圖 ----
let added = 0;
for (const id of [...refIds].sort((a, b) => a - b)) {
  if (usedRowIds.has(id)) continue;
  const r = byRowId.get(id);
  if (!r) throw new Error(`被引用的 mapId ${id} 不在已抓取的 Map sheet 列中`);
  const f = r.fields;
  const placeId = f.PlaceName.value;
  const nameEn = f.PlaceName.fields.Name || "";
  const twName = tw(placeId);
  const regionTw = tw(f["PlaceNameRegion@as(raw)"]);
  const entry = {
    id,
    name: twName || nameEn,
    nameEn,
    region: regionTw || null,
    type: inferType(f.Id),
    sizeFactor: f.SizeFactor,
    offsetX: f.OffsetX,
    offsetY: f.OffsetY,
    image: mkImage(f.Id),
  };
  if (!twName) entry.nameMissing = true;
  db.data.push(entry);
  usedRowIds.add(id);
  added++;
}
console.log(`新增地圖：${added}`);

// ---- 3. 輸出 ----
db.data.sort((a, b) => a.id - b.id);
db.count = db.data.length;
db.updated = new Date().toISOString().slice(0, 10);
db.source = "xivapi+tw-places";
await writeFile(join(DATA, "maps.json"), JSON.stringify(db, null, 2));
console.log(`maps.json 完成：共 ${db.count} 張`);

// 舊 id → 新 id 對照（除錯用）
console.log("舊→新 id 對照（前 10）：", [...oldToNew].slice(0, 10).map(([o, n]) => `${o}→${n}`).join(" "));

// 待補底圖清單（野外/主城）
const missingImg = db.data.filter((m) => (m.type === "field" || m.type === "city") && m.image);
console.log(`\n待確認底圖（field/city 共 ${missingImg.length} 張，已有檔案的 download-maps.mjs 會自動略過）`);
