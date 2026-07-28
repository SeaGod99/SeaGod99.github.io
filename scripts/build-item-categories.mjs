// 建立 item-categories.json —— ItemUICategory row id ↔ 台服繁中分類名
//
// 為什麼要這份：
//   data/items.json 的 `category` 只存繁中「名稱」（省空間），沒有 categoryId。
//   幻化配裝圖鑑（tools/glamour/）需要數字 id 才能判斷「這件是不是裝備」
//   （ItemUICategory 1–49 = 武器/防具/飾品）與推導部位，所以另存這張對照表。
//
// 來源：Teamcraft tw-item-ui-categories.json —— 與 build-items.mjs 產生
//       items.json `category` 欄用的是同一份，所以 id↔名稱保證對得起來。
//
// 執行：
//   node scripts/build-item-categories.mjs            # 抓線上最新
//   node scripts/build-item-categories.mjs --offline  # 不連網，只驗證既有檔案
//
// 改版後若出現新分類，重跑本支即可；validate-data.mjs 會檢查 items.json 用到的
// 分類名是否都在這張表裡。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "item-categories.json");

const TC_URL =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-item-ui-categories.json";

const offline = process.argv.includes("--offline");

async function fetchCategories() {
  const res = await fetch(TC_URL);
  if (!res.ok) throw new Error(`tw-item-ui-categories HTTP ${res.status}`);
  const json = await res.json();
  const map = {};
  for (const [id, val] of Object.entries(json)) {
    if (val?.tw) map[String(Number(id))] = val.tw;
  }
  return map;
}

async function readExisting() {
  const raw = JSON.parse(await readFile(OUT, "utf8"));
  return raw.data;
}

async function main() {
  const data = offline ? await readExisting() : await fetchCategories();
  const n = Object.keys(data).length;
  console.log(`分類對照表：${n} 筆${offline ? "（離線，用既有檔）" : ""}`);

  // 驗收：items.json 用到的每個分類名都要能反查到 id
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8"));
  const byName = new Map(Object.entries(data).map(([id, name]) => [name, Number(id)]));
  const used = new Set(items.data.map((x) => x.category).filter(Boolean));
  const missing = [...used].filter((name) => !byName.has(name));
  console.log(`  items.json 用到 ${used.size} 種分類，對得到 id 的 ${used.size - missing.length} 種`);
  if (missing.length) {
    console.error(`  ✗ 對不到 id 的分類（Teamcraft 表需更新）：${missing.join("、")}`);
    process.exitCode = 1;
  }

  // 名稱重複會讓「名稱→id」反查不唯一，必須是 0
  const dupes = new Map();
  for (const [id, name] of Object.entries(data)) {
    dupes.set(name, (dupes.get(name) || 0) + 1);
  }
  const dup = [...dupes].filter(([, c]) => c > 1);
  if (dup.length) {
    console.error(`  ✗ 分類名重複（反查會不唯一）：${dup.map(([n, c]) => `${n}×${c}`).join("、")}`);
    process.exitCode = 1;
  }

  if (offline) return;

  const payload = {
    schema: "item-categories",
    patch: items.patch,
    updated: new Date().toISOString().slice(0, 10),
    source: "teamcraft/tw-item-ui-categories.json",
    count: n,
    data,
  };
  await writeFile(OUT, JSON.stringify(payload), "utf8");
  console.log(`寫出 data/item-categories.json（${n} 筆）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
