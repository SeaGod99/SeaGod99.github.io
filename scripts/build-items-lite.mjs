// 由 data/items.json 產生精簡版 data/items-lite.json（只有 id → 繁中名）。
//
// 為什麼要這支：items.json 是 9.2MB（43748 筆 × 9 欄），但採集節點查詢與採集紀錄
// 追蹤兩頁只用到 id→name 一件事，卻要整包載完才能畫第一格。精簡後 0.73MB，
// 省 92% 傳輸量（手機／行動網路差很多）。需要 marketable／ilvl／icon／category
// 的頁面（市場查價）仍讀完整版 items.json。
//
// 格式：信封 + data 為 [[id, name], ...] 配對陣列（不用物件：JSON 物件的 key 只能是
// 字串，前端 new Map(Object.entries(...)) 會把 id 變成字串，害 Map.get(數字 id) 落空）。
// 前端用法：
//   const ITEMS = new Map((await (await fetch('.../items-lite.json')).json()).data);
//
// id 集合與 items.json 完全一致（items.json 本身即由 tw-items 產出，收錄者＝台服已開放），
// 因此「查不到 id ＝ 台服未開放 → 前端不顯示」這條規則在精簡版上完全等價。
//
// 另產 data/items-gathering.json：只含採集兩頁真的會查到的 id（gathering.json 的
// items[] ∪ hiddenItems[]），約 1,400 筆／12KB。那兩頁原本整份載 1.4MB 的 items-lite，
// 但它們**只查採集產物**，其餘四萬多筆是純浪費。
// ⚠ 等價性只在「採集 id 空間」內成立：這份查不到的 id 不代表台服未開放，
//   只代表它不是採集產物。要做全站物品查名的頁面**必須用 items-lite.json**。
//
// 執行：node scripts/build-items-lite.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "data", "items.json");
const OUT = join(__dirname, "..", "data", "items-lite.json");
const GATHER_SRC = join(__dirname, "..", "data", "gathering.json");
const GATHER_OUT = join(__dirname, "..", "data", "items-gathering.json");

const src = JSON.parse(readFileSync(SRC, "utf8"));
const rows = [];
let noName = 0;
for (const it of src.data) {
  if (!it.name) { noName++; continue; }   // 無繁中名＝台服未開放，本就不該被查到
  rows.push([it.id, it.name]);
}

const out = {
  schema: "items-lite",
  patch: src.patch,
  updated: new Date().toISOString().slice(0, 10),
  source: "data/items.json（scripts/build-items-lite.mjs 精簡）",
  count: rows.length,
  data: rows
};

writeFileSync(OUT, JSON.stringify(out) + "\n");

/* ── 採集兩頁專用子集 ── */
const gathering = JSON.parse(readFileSync(GATHER_SRC, "utf8"));
const wanted = new Set();
for (const n of gathering.data) {
  for (const id of n.items || []) wanted.add(id);
  for (const id of n.hiddenItems || []) wanted.add(id);
}
const gatherRows = rows.filter(([id]) => wanted.has(id));
const outGather = {
  schema: "items-gathering",
  patch: src.patch,
  updated: new Date().toISOString().slice(0, 10),
  source: "data/items.json ∩ data/gathering.json 的 items/hiddenItems（scripts/build-items-lite.mjs）",
  note: "採集節點查詢／採集紀錄追蹤兩頁專用子集。查不到 id 只代表「非採集產物」，不代表台服未開放——全站查名請用 items-lite.json",
  count: gatherRows.length,
  data: gatherRows,
};
writeFileSync(GATHER_OUT, JSON.stringify(outGather) + "\n");

const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`items.json       ${src.data.length} 筆 / ${kb(readFileSync(SRC).length)}`);
console.log(`items-lite       ${rows.length} 筆 / ${kb(readFileSync(OUT).length)}（略過無名 ${noName} 筆）`);
console.log(`items-gathering  ${gatherRows.length} 筆 / ${kb(readFileSync(GATHER_OUT).length)}（採集產物 ${wanted.size} 個 id，其中 ${wanted.size - gatherRows.length} 個無繁中名）`);
console.log("✅ 已寫入 data/items-lite.json、data/items-gathering.json");
