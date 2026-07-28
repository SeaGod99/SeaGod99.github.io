// 由 data/items.json 產生 data/items-market.json（市場查價頁專用的精簡表）。
//
// 為什麼要這支：`tools/market/` 開頁時 `await fetch('data/items.json')`，
// **整包 10MB 下載並 JSON.parse 完之前，整頁不能動**。但實查那頁只用到六個欄位
// （id／name／category／icon／marketable／patch），沒碰 ilvl／rarity／stackSize。
//
// 三段瘦身，成果 10.0MB → 2.0MB（gzip 836KB → 471KB），解析成本同步降到 1/5：
//   1. 只留那六欄，並改成陣列列（省掉 43748 份重複的 key 名）
//   2. category 換成 `categories[]` 字典的索引（113 種，原本每筆都存整串中文）
//   3. icon 只存 6 位數編號——路徑格式固定是 `/i/<編號/1000*1000>/<編號>.png`，
//      **已對 43748 筆全數驗證資料夾都推得回來（0 筆例外）**，所以前端自己組即可
//
// 與 items-lite.json 的分工：lite 是「只要 id→名稱」的頁面用（採集兩頁），
// 這支是市場頁用。**兩支都得在改完 items.json 後重跑。**
//
// 列格式：[id, name, categoryIndex, iconNo, marketable(0/1), patch]
// 前端用法見 tools/market/index.html 的 `expandMarketItems()`。
//
// 執行：node scripts/build-items-market.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "data", "items.json");
const OUT = join(__dirname, "..", "data", "items-market.json");

const src = JSON.parse(readFileSync(SRC, "utf8"));

// icon 路徑必須真的能由編號推回，否則前端組出來的圖會 404 而且不會有人發現
let iconBad = 0;
for (const it of src.data) {
  if (!it.icon) continue;
  const m = String(it.icon).match(/^\/i\/(\d{6})\/(\d{6})\.png$/);
  if (!m) { iconBad++; continue; }
  const folder = String(Math.floor(Number(m[2]) / 1000) * 1000).padStart(6, "0");
  if (folder !== m[1]) iconBad++;
}
if (iconBad > 0) {
  console.error(`✗ 有 ${iconBad} 筆的 icon 路徑不符「資料夾 = 編號/1000*1000」的規則，`
    + `前端無法由編號組回路徑 → 請改回直接存路徑，中止。`);
  process.exit(1);
}

const categories = [...new Set(src.data.map((i) => i.category || ""))];
const catIndex = new Map(categories.map((c, i) => [c, i]));

const rows = [];
let noName = 0;
for (const it of src.data) {
  if (!it.name) { noName++; continue; }   // 無繁中名＝台服未開放，本就不該被查到
  const m = it.icon && String(it.icon).match(/(\d{6})\.png$/);
  rows.push([
    it.id,
    it.name,
    catIndex.get(it.category || ""),
    // 缺 icon 用 -1，不能用 0——**編號 0 是真的存在的**（`/i/000000/000000.png`，
    // 目前 1 筆：24225 演技教材·神典石），拿 0 當「沒有」會把它的圖示弄丟
    m ? Number(m[1]) : -1,
    it.marketable ? 1 : 0,
    it.patch || "",
  ]);
}

const out = {
  schema: "items-market",
  patch: src.patch,
  updated: new Date().toISOString().slice(0, 10),
  source: "data/items.json（scripts/build-items-market.mjs 精簡）",
  count: rows.length,
  categories,
  data: rows,
};
writeFileSync(OUT, JSON.stringify(out) + "\n");

const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";
console.log(`items.json    ${src.data.length} 筆 / ${mb(readFileSync(SRC).length)}`);
console.log(`items-market  ${rows.length} 筆 / ${mb(readFileSync(OUT).length)}（略過無名 ${noName} 筆、${categories.length} 種分類）`);
console.log("✅ 已寫入 data/items-market.json");
