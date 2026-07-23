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
// 執行：node scripts/build-items-lite.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "data", "items.json");
const OUT = join(__dirname, "..", "data", "items-lite.json");

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

const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`items.json  ${src.data.length} 筆 / ${kb(readFileSync(SRC).length)}`);
console.log(`items-lite  ${rows.length} 筆 / ${kb(readFileSync(OUT).length)}（略過無名 ${noName} 筆）`);
console.log("✅ 已寫入 data/items-lite.json");
