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
// 執行（repo 根目錄）：
//   node scripts/build-collectable-items.mjs            ← 產生／更新
//   node scripts/build-collectable-items.mjs --check    ← 只比對，不寫入（CI／驗收用）
// 需求：Node 18+（內建 fetch）。重建 items.json 後建議重跑一次。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ITEMS_JSON = join(ROOT, "data", "items.json");
const OUT_JSON = join(ROOT, "data", "collectable-items.json");
const API = "https://v2.xivapi.com/api/sheet/Item";

async function fetchCollectableIds() {
  const ids = new Set();
  let after = 0, pages = 0;
  while (true) {
    const url = `${API}?fields=IsCollectable&limit=500&after=${after}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Item sheet HTTP ${res.status} @ after=${after}`);
    const rows = (await res.json()).rows || [];
    if (!rows.length) break;
    for (const r of rows) if (r.fields?.IsCollectable) ids.add(r.row_id);
    after = rows[rows.length - 1].row_id;
    pages++;
    process.stdout.write(`  已掃 ${pages} 頁（至 row ${after}），累計收藏品 ${ids.size}\r`);
  }
  console.log("");
  return ids;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const itemsDb = JSON.parse(await readFile(ITEMS_JSON, "utf8"));
  const known = new Set(itemsDb.data.map((i) => i.id));

  console.log("向 XIVAPI 掃 Item sheet 的 IsCollectable…");
  const all = await fetchCollectableIds();

  // 只留 items.json 有的（＝台服有繁中名的物品），與全站「查不到＝未開放」規則一致
  const ids = [...all].filter((id) => known.has(id)).sort((a, b) => a - b);
  console.log(`XIVAPI 收藏品共 ${all.size} 種，其中 ${ids.length} 種在 items.json 內`);

  const out = {
    schema: "collectable-items",
    patch: itemsDb.patch,
    updated: new Date().toISOString().slice(0, 10),
    source: "xivapi Item.IsCollectable",
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
