// 產生 data/collectable-items.json —— 「這件物品可以當收藏品採集／交付」的權威清單
//
// 為什麼需要這支：
//   前端是純靜態頁，不能即時打 XIVAPI；而 `data/items.json` 沒有任何收藏品欄位
//   （只有 category／rarity／marketable／ilvl…，收藏品的 category 一律是「雜貨」）。
//
// 為什麼不能用名稱判斷（踩過的雷，2026-07-26）：
//   台服收藏品**不一定**叫「收藏用○○」。實查限時採集節點的 325 種產物，
//   有 48 種 `IsCollectable=true` 卻沒有「收藏用」前綴——火砂礫、雷砂礫、強火性岩、
//   赤玉土、腐殖土、水薄荷、梅茵菲娜月桂、不定性結晶花…。
//   用前綴判斷會把 76 個收藏品節點少算成 38 個。反向則不會錯（有前綴的必定是收藏品）。
//
// 為什麼用 IsCollectable 而不是 AlwaysCollectable：
//   `AlwaysCollectable` 不是「專屬收藏品」的意思——64 個「收藏用○○」裡有 48 個是 false。
//   要判斷「這件東西能不能當收藏品」，`IsCollectable` 才是對的旗標。
//
// 來源（2026-10-10 改）：**台服客戶端解包 Item.IsCollectable**（scripts/lib/tc-datamining.mjs，讀快取不連網）。
//   原本逐頁掃 XIVAPI（106 次請求），而且 07-26 之後沒人重跑——7.15／7.21 的 268 件收藏品一直不在清單裡，
//   採集頁的「收藏品」篩選因此漏了 4 個 Lv95 節點。客戶端的旗標與 XIVAPI 是同一欄，現有 1,023 件全在其中。
//
// 執行（repo 根目錄）：
//   node scripts/build-collectable-items.mjs            ← 產生／更新
//   node scripts/build-collectable-items.mjs --check    ← 只比對，不寫入（CI／驗收用）
//   node scripts/build-collectable-items.mjs --refresh  ← 重抓客戶端 Item.csv（升版時）
// 重建 items.json 後要重跑一次（只收 items.json 有的＝台服已開放），接著 build-fish-uses.mjs。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTcSheet } from "./lib/tc-datamining.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ITEMS_JSON = join(ROOT, "data", "items.json");
const OUT_JSON = join(ROOT, "data", "collectable-items.json");

async function fetchCollectableIds() {
  const rows = await loadTcSheet("Item", { refresh: process.argv.includes("--refresh") });
  if (!rows.length || !("IsCollectable" in rows[1])) throw new Error("客戶端 Item.csv 找不到 IsCollectable 欄，欄名可能改了，中止");
  return new Set(rows.filter((r) => r.IsCollectable === "True").map((r) => r.id));
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const itemsDb = JSON.parse(await readFile(ITEMS_JSON, "utf8"));
  const known = new Set(itemsDb.data.map((i) => i.id));

  console.log("讀台服客戶端 Item.IsCollectable…");
  const all = await fetchCollectableIds();

  // 只留 items.json 有的（＝台服有繁中名的物品），與全站「查不到＝未開放」規則一致
  const ids = [...all].filter((id) => known.has(id)).sort((a, b) => a - b);
  console.log(`客戶端收藏品共 ${all.size} 種，其中 ${ids.length} 種在 items.json 內`);

  const out = {
    schema: "collectable-items",
    patch: itemsDb.patch,
    updated: new Date().toISOString().slice(0, 10),
    source: "台服客戶端解包 Item.IsCollectable（scripts/lib/tc-datamining.mjs）",
    note: "可當收藏品採集／交付的物品 id。名稱不一定有「收藏用」前綴，勿用名稱判斷。",
    count: ids.length,
    data: ids,
  };

  if (checkOnly) {
    let prev = null;
    try { prev = JSON.parse(await readFile(OUT_JSON, "utf8")); } catch (e) {}
    if (!prev) { console.log("✗ 尚未產生 data/collectable-items.json"); process.exit(1); }
    const same = prev.count === out.count && JSON.stringify(prev.data) === JSON.stringify(out.data);
    console.log(same ? "✓ 與現有檔一致" : `✗ 不一致（現有 ${prev.count} vs 應為 ${out.count}）`);
    process.exit(same ? 0 : 1);
  }

  await writeFile(OUT_JSON, JSON.stringify(out));
  console.log(`✅ 已寫入 data/collectable-items.json（${ids.length} 筆）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
