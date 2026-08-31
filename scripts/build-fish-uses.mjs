// build-fish-uses.mjs
// 產生 data/fish-uses.json —— 釣魚頁的「這條魚是什麼、有什麼用」資料層。
//
// 釣魚頁原本只回答「怎麼釣」，不回答「釣來幹嘛」，而且是全站唯一一個沒有任何圖片的圖鑑頁
//（grep -c "<img" tools/fishing/index.html ＝ 0，但 1422/1449 條魚在 items.json 都有 icon）。
//
// 來源（全部是本機主庫，不連外）：
//   data/fishes.json             要哪些 itemId
//   data/items.json              icon / 是否可上市場板 / 繁中名
//   data/collectable-items.json  是否可當收藏品交付
//   data/recipes.json            哪些配方用得到這條魚
//
// 輸出：data/fish-uses.json
//   { data: { "<itemId>": { ic, nm?, col?, use? } } }
//     ic   icon 路徑（前端接 https://xivapi.com 前綴，與 market 頁的 ICON_CDN 一致）
//     nm   1 ＝**不可**上市場板（只寫例外，1449 條裡大多數都可以，寫 mk 反而佔空間）
//     col  1 ＝可當收藏品交付
//     use  [{ i: 產物 itemId, n: 繁中名, j: 職業 }] ——用得到這條魚的配方
//
// 用法（repo 根目錄）：
//   node scripts/build-fish-uses.mjs            # dry-run，只印統計
//   node scripts/build-fish-uses.mjs --apply    # 寫入
//
// 改完 data/items.json 或 data/recipes.json 後重跑。

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const OUT = join(DATA_DIR, "fish-uses.json");
const APPLY = process.argv.includes("--apply");

const readJson = async (f) => JSON.parse(await readFile(join(DATA_DIR, f), "utf8"));

async function main() {
  console.log(`建立魚的用途資料${APPLY ? "（寫入）" : "（dry-run）"}\n`);

  const fishes = await readJson("fishes.json");
  const items = await readJson("items.json");
  const collectables = await readJson("collectable-items.json");
  const recipes = await readJson("recipes.json");

  const ITEM = new Map(items.data.map((i) => [i.id, i]));
  const COLLECTABLE = new Set(collectables.data);
  const fishIds = new Set(fishes.data.map((f) => f.itemId));

  // 哪些配方用得到魚（依產物聚合，同一產物只記一次）
  const uses = new Map(); // 魚 itemId → Map(產物 itemId → {n, j})
  let recipeHits = 0;
  for (const r of recipes.data) {
    const ings = r.ingredients || [];
    const hit = new Set();
    for (const g of ings) if (fishIds.has(g.itemId)) hit.add(g.itemId);
    if (!hit.size) continue;
    recipeHits++;
    const product = ITEM.get(r.itemId);
    if (!product?.name) continue;                 // 產物沒有繁中名＝台服未開放 → 不列
    for (const fid of hit) {
      if (!uses.has(fid)) uses.set(fid, new Map());
      uses.get(fid).set(r.itemId, { n: product.name, j: r.job || null });
    }
  }

  const out = {};
  let noIcon = 0, nonMarketable = 0, collectableCount = 0, withUse = 0, notInItems = 0;
  for (const f of fishes.data) {
    const it = ITEM.get(f.itemId);
    if (!it) { notInItems++; continue; }           // 台服未開放（27 條），前端本來就不顯示
    const row = {};
    if (it.icon) row.ic = it.icon; else noIcon++;
    if (!it.marketable) { row.nm = 1; nonMarketable++; }
    if (COLLECTABLE.has(f.itemId)) { row.col = 1; collectableCount++; }
    const u = uses.get(f.itemId);
    if (u?.size) {
      // 產物 id 遞增排序：順序永遠一樣，不會因為重跑而洗牌
      row.use = [...u.entries()].sort((a, b) => a[0] - b[0]).map(([i, v]) => ({ i, n: v.n, j: v.j }));
      withUse++;
    }
    out[f.itemId] = row;
  }

  const doc = {
    schema: "fish-uses",
    patch: items.patch ?? null,
    updated: new Date().toISOString().slice(0, 10),
    source: "items+collectable-items+recipes",
    note: "釣魚頁的「這條魚是什麼、有什麼用」：ic=icon 路徑（接 https://xivapi.com）、nm=1 不可上市場板、col=1 收藏品、use=用得到它的配方",
    count: Object.keys(out).length,
    data: out,
  };

  const json = JSON.stringify(doc);
  console.log(`魚 ${fishes.data.length} 條，收錄 ${doc.count} 條（${notInItems} 條不在 items.json＝台服未開放）`);
  console.log(`  有 icon：${doc.count - noIcon}`);
  console.log(`  不可上市場板：${nonMarketable}`);
  console.log(`  可當收藏品交付：${collectableCount}`);
  console.log(`  有配方用得到：${withUse} 條魚（涉及 ${recipeHits} 個配方）`);
  console.log(`  檔案大小：${(json.length / 1024).toFixed(0)}KB`);

  if (!APPLY) { console.log("\n（dry-run，未寫入。加 --apply 才會寫）"); return; }
  await writeFile(OUT, json, "utf8");
  console.log(`\n已寫入 data/fish-uses.json`);
  console.log("接著跑：node scripts/validate-data.mjs → node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
