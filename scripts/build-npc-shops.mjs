// build-npc-shops.mjs — 產生 data/npc-shops.json（NPC 商店目錄）
//
// 回答的問題：「我人在這張圖，附近有哪些店、賣什麼？」
// 站內查得到「這個東西跟誰買」（vendor-prices），但反方向查不到——
// 而玩家在遊戲裡的實際動線是「先到某張圖，再看這裡能辦什麼事」。
//
// ── 收錄條件 ────────────────────────────────────────────────────────
//   · 商店有台服官方店名（tw-locales 的 shops）
//   · 至少一個有台服繁中名的 NPC（查不到就講不出「去找誰」）
//   · NPC 有座標（沒有座標的「去哪找」等於沒說）
// 同一個 NPC 常常開好幾間店（一般雜貨／特殊兌換分開），全部掛在同一個 NPC 底下。
//
// ── 品項只存 id 與價格，不存名字 ───────────────────────────────────
// 39,000 筆交易若每筆都帶物品名，檔案會爆。前端本來就有 `items-market.json`
// （45,548 筆 id→名），直接查那份即可。**這份只負責「誰、在哪、賣什麼 id、多少錢」。**
//
// ── 刻意不做的事 ────────────────────────────────────────────────────
// 不做「NPC 套利掃描」（哪間店的東西拿去市場板轉賣有利可圖）——
// 那會鼓勵洗版式掛單，而且 NPC 價與市價的差幾乎都被交易稅吃掉。
//
// 執行（repo 根目錄）：
//   node scripts/build-npc-shops.mjs            # dry-run，印報告
//   node scripts/build-npc-shops.mjs --apply    # 寫入
//   node scripts/build-npc-shops.mjs --offline  # 商店表只用快取

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { loadShops, describeShops } from "./lib/shops.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OUT = join(DATA, "npc-shops");
const apply = process.argv.includes("--apply");
const GIL = 1;                       // 金幣。items.json 裡它的名字是 "Gil"，見下方豁免說明
const offline = process.argv.includes("--offline");

async function main() {
  const S = await loadShops({ root: ROOT, offline });
  console.log(describeShops(S));

  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const byId = new Map(items.map((i) => [i.id, i]));
  const maps = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8")).data;
  const mapById = new Map(maps.map((m) => [m.id, m]));

  // mapId → NPC id → { name, x, y, shops: [] }
  const byMap = new Map();
  const stat = { shops: 0, noName: 0, noNpc: 0, noCoord: 0, trades: 0, dropTrade: 0 };

  for (const shop of S.shops) {
    if (!shop.name) { stat.noName++; continue; }
    const npcs = shop.npcs.filter((n) => n.at && n.at.mapId != null);
    if (!npcs.length) {
      if (shop.npcs.length) stat.noCoord++; else stat.noNpc++;
      continue;
    }

    // 交易：只留「付得出來的東西都有台服名」的
    const trades = [];
    for (const t of shop.trades) {
      stat.trades++;
      const cost = t.cost.filter((c) => c.itemId && c.amount);
      const gives = t.gives.filter((g) => g.itemId);
      if (!cost.length || !gives.length) { stat.dropTrade++; continue; }
      /* ⚠ **金幣（id 1）要豁免**。`items.json` 裡它的名字是 "Gil"（台服的物品表本身就這樣存，
         實測 `tw-items.msgpack` 的 id 1 也是 "Gil"），沒有中日韓字，所以「查不到台服名就不收」
         的鐵則會把它擋掉——而金幣是全遊戲最常見的成本，第一版因此丟掉 **16,237 筆**交易
         （佔被濾掉的 46% 裡的絕大多數）。前端顯示成「金幣」。
         這不是破例：鐵則要擋的是「把英文名放行到畫面上」，金幣的顯示字串是我們自己給的 UI 標籤。 */
      const ok = [...cost, ...gives].every((x) => {
        if (x.itemId === GIL) return true;
        const it = byId.get(x.itemId);
        return it && it.name && isTw(it.name);
      });
      if (!ok) { stat.dropTrade++; continue; }
      trades.push({
        c: cost.map((x) => [x.itemId, x.amount]),
        g: gives.map((x) => [x.itemId, x.amount]),
        ...(t.requiredGCRank ? { r: t.requiredGCRank } : {}),
      });
    }
    if (!trades.length) continue;
    stat.shops++;

    for (const n of npcs) {
      const mid = n.at.mapId;
      if (!byMap.has(mid)) byMap.set(mid, new Map());
      const m = byMap.get(mid);
      if (!m.has(n.id)) m.set(n.id, { id: n.id, n: n.name, x: n.at.x, y: n.at.y, s: [] });
      m.get(n.id).s.push({ id: shop.id, n: shop.name, t: shop.type, tr: trades });
    }
  }

  const out = [];
  for (const [mid, npcMap] of byMap) {
    const map = mapById.get(mid);
    if (!map || !map.name) continue;                 // 地名查不到就不收（鐵則）
    const npcs = [...npcMap.values()].sort((a, b) => a.n.localeCompare(b.n, "zh-Hant"));
    out.push({
      mapId: mid,
      map: map.name,
      npcCount: npcs.length,
      shopCount: npcs.reduce((a, n) => a + n.s.length, 0),
      npcs,
    });
  }
  out.sort((a, b) => b.npcCount - a.npcCount || a.mapId - b.mapId);

  /* 依 mapId 分片。整份 gzip 272KB，但**使用者一次只會看一張圖**，
     整份載等於為了看烏爾達哈而下載全世界。索引只帶「哪張圖有幾個店家」，
     選了才抓那張圖的檔（多數 < 10KB）。 */
  const index = {
    schema: "npc-shops-index",
    updated: new Date().toISOString().slice(0, 10),
    source: "Teamcraft shops.json（經 scripts/lib/shops.mjs）＋ data/npcs.json ＋ data/maps.json；店名為 tw-locales 的台服官方名",
    note: "檔名 <mapId>.json。品項只存 id 與數量，名字由前端查 items-market.json。金幣（id 1）在 items.json 裡名為 \"Gil\"，是刻意豁免的，前端顯示「金幣」。",
    count: out.length,
    maps: out.map((m) => ({ mapId: m.mapId, map: m.map, npcCount: m.npcCount, shopCount: m.shopCount })),
  };
  const files = out.map((m) => {
    const j = JSON.stringify({ schema: "npc-shops", mapId: m.mapId, map: m.map, npcs: m.npcs });
    return { name: `${m.mapId}.json`, json: j, gz: gzipSync(j).length, map: m.map };
  });
  const totalGz = files.reduce((a, f) => a + f.gz, 0);
  const biggest = files.slice().sort((a, b) => b.gz - a.gz)[0];

  console.log(`
地圖 ${out.length} 張、NPC ${out.reduce((a, m) => a + m.npcCount, 0)} 個、商店 ${stat.shops} 間`);
  console.log(`  略過：無台服店名 ${stat.noName}、無 NPC ${stat.noNpc}、NPC 無座標 ${stat.noCoord}`);
  console.log(`  交易 ${stat.trades} 筆，其中有品項無台服名而略過 ${stat.dropTrade} 筆`);
  console.log(`  合計 gzip ${(totalGz / 1024).toFixed(0)}KB；索引 ${(gzipSync(JSON.stringify(index)).length / 1024).toFixed(1)}KB；最大一張 ${biggest.map} ${(biggest.gz / 1024).toFixed(0)}KB`);
  console.log(`
店最多的五張圖：` + out.slice(0, 5).map((m) => `${m.map} ${m.npcCount} 人/${m.shopCount} 店`).join("、"));

  if (biggest.gz > 80 * 1024) {
    console.error(`
✗ 最大的一張圖 gzip 超過 80KB（${biggest.map}）——單張圖是一次載入的單位，太大就要再切`);
    process.exit(1);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  // 重建前清掉舊片：地圖被移除後舊檔留著會給出過期答案
  if (existsSync(OUT)) for (const f of await readdir(OUT)) if (f.endsWith(".json")) await rm(join(OUT, f));
  await mkdir(OUT, { recursive: true });
  for (const f of files) await writeFile(join(OUT, f.name), f.json);
  await writeFile(join(OUT, "_index.json"), JSON.stringify(index));
  console.log(`
✓ data/npc-shops/（${files.length} 張圖＋_index.json）`);
  console.log("  這個目錄刻意不進 minify-data.mjs——它本來就是壓過的形狀");
}

main().catch((e) => { console.error(e); process.exit(1); });
