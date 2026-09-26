// build-vendor-prices.mjs — 產生 data/vendor-prices.json（NPC 金幣直購價）
//
// 解決的問題：市場頁算「湊這些材料要多少錢」時**只看市場板**，
// 但有 4,641 種可交易物品是 NPC 就直接賣金幣的。市場板上那些東西常常比 NPC 貴
// （有人掛高價等新手），於是成本被系統性高估，「買 vs 做」的結論跟著錯。
//
// ── 收錄條件（三道都要過）────────────────────────────────────────────
//   ① 商店只收金幣（`cost` 只有 id 1）——付東西換東西的不是「直購」
//   ② 該商店**至少有一個沒有門檻的 NPC**（門檻表在 lib/game-sources.mjs 的 VENDOR_GATES）
//   ③ 那個 NPC 查得到台服繁中名（鐵則：查不到就不顯示，也就不該拿來當答案）
// 沒有 NPC 的商店（2,070 間）一律不收——講不出「去找誰買」的價錢沒有行動價值。
//
// ── 為什麼同一件只留一筆 ────────────────────────────────────────────
// 同一件東西常常好幾個城市的雜貨商都賣，價錢一樣。全部列出來是雜訊，
// 所以**取最低價**，同價時優先選查得到座標的 NPC（使用者要的是「去哪買」）。
//
// ── 這份數字會怎麼被用 ─────────────────────────────────────────────
// 市場頁用它**對材料成本封頂**：買得到的話成本不該超過 NPC 價。
// 但 `VENDOR_GATES` 只列了 5 個部族 NPC，**其他形式的門檻（軍階、主線進度、城市解鎖）
// 沒有建模**，所以市場頁一律把 NPC 價與賣家**顯示出來**讓使用者自己判斷，
// 不是偷偷把數字換掉。
//
// 執行（repo 根目錄）：
//   node scripts/build-vendor-prices.mjs            # dry-run，印報告
//   node scripts/build-vendor-prices.mjs --apply    # 寫入
//   node scripts/build-vendor-prices.mjs --offline  # 商店表只用快取

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { loadShops, describeShops } from "./lib/shops.mjs";
import { VENDOR_GATES } from "./lib/game-sources.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

async function main() {
  const S = await loadShops({ root: ROOT, offline });
  console.log(describeShops(S));

  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const byId = new Map(items.map((i) => [i.id, i]));

  const best = new Map();     // itemId → { price, npc, shop }
  const stat = { trades: 0, noNpc: 0, allGated: 0, noTwNpc: 0, notMarketable: 0, noTwItem: 0 };

  for (const shop of S.shops) {
    for (const t of shop.trades) {
      // ① 只收金幣
      if (t.cost.length !== 1 || t.cost[0].itemId !== 1 || !t.cost[0].amount) continue;
      const g = t.gives[0];
      if (!g || !g.itemId) continue;
      stat.trades++;

      // ② 至少一個沒有門檻的 NPC；③ 而且那個 NPC 有台服名（shop.npcs 已經先過濾過）
      if (!shop.npcIds.length) { stat.noNpc++; continue; }
      const open = shop.npcs.filter((n) => !VENDOR_GATES[n.id]);
      if (!open.length) {
        if (shop.npcIds.some((id) => !VENDOR_GATES[id])) stat.noTwNpc++;   // 有無門檻 NPC 但沒繁中名
        else stat.allGated++;
        continue;
      }

      const price = Math.round(t.cost[0].amount / (g.amount || 1));
      const prev = best.get(g.itemId);
      // 同價時優先挑查得到座標的——使用者要的是「去哪買」不只是「多少錢」
      const npc = open.find((n) => n.at) || open[0];
      if (!prev || price < prev.price || (price === prev.price && !prev.npc.at && npc.at)) {
        best.set(g.itemId, { price, npc, shop: shop.name });
      }
    }
  }

  const out = {};
  for (const [id, b] of best) {
    const it = byId.get(id);
    if (!it) continue;
    // 市場頁只拿它跟市場價比，不可交易的東西沒有市場價可比
    if (!it.marketable) { stat.notMarketable++; continue; }
    if (!it.name || !isTw(it.name)) { stat.noTwItem++; continue; }
    out[id] = {
      p: b.price,
      n: b.npc.name,
      ...(b.npc.at ? { m: b.npc.at.mapName, x: b.npc.at.x, y: b.npc.at.y, mi: b.npc.at.mapId } : {}),
    };
  }

  const json = JSON.stringify({
    schema: "vendor-prices",
    updated: new Date().toISOString().slice(0, 10),
    source: "Teamcraft shops.json（經 scripts/lib/shops.mjs）的純金幣商店；賣家門檻表 scripts/lib/game-sources.mjs 的 VENDOR_GATES",
    note: "只收「賣家無已知門檻＋有台服名」的最低價。VENDOR_GATES 只涵蓋 5 個部族 NPC，其他門檻未建模，所以前端一律把價錢與賣家顯示出來讓使用者判斷，不偷偷換數字。",
    count: Object.keys(out).length,
    data: out,
  });

  const withAt = Object.values(out).filter((v) => v.m).length;
  console.log(`\n純金幣交易 ${stat.trades} 筆 → 可交易且有繁中名的 ${Object.keys(out).length} 種`);
  console.log(`  略過：商店無 NPC ${stat.noNpc}、賣家全有門檻 ${stat.allGated}、賣家無台服名 ${stat.noTwNpc}、不可交易 ${stat.notMarketable}、物品無台服名 ${stat.noTwItem}`);
  console.log(`  其中有座標 ${withAt}／${Object.keys(out).length}`);
  console.log(`  檔案 ${(json.length / 1024).toFixed(0)}KB／gzip ${(gzipSync(json).length / 1024).toFixed(0)}KB`);

  const sorted = Object.entries(out).sort((a, b) => b[1].p - a[1].p);
  console.log(`\n最貴五件：` + sorted.slice(0, 5).map(([id, v]) => `${byId.get(+id).name} ${v.p.toLocaleString()}g`).join("、"));
  console.log(`最便宜五件：` + sorted.slice(-5).reverse().map(([id, v]) => `${byId.get(+id).name} ${v.p}g`).join("、"));

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  await writeFile(join(DATA, "vendor-prices.json"), json);
  console.log(`\n✓ data/vendor-prices.json（${Object.keys(out).length} 種）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
