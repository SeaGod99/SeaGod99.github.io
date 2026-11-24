// build-npc-shops.mjs — 產生 data/npc-shops.json（NPC 商店目錄）
//
// 回答的問題：「我人在這張圖，附近有哪些店、賣什麼？」
// 站內查得到「這個東西跟誰買」（vendor-prices），但反方向查不到——
// 而玩家在遊戲裡的實際動線是「先到某張圖，再看這裡能辦什麼事」。
//
// ── 收錄條件 ────────────────────────────────────────────────────────
//   · 至少一個有台服繁中名的 NPC（查不到就講不出「去找誰」）
//   · NPC 有座標（沒有座標的「去哪找」等於沒說）
// 同一個 NPC 常常開好幾間店（一般雜貨／特殊兌換分開），全部掛在同一個 NPC 底下。
//
// ── 客戶端沒有店名的店（2026-11-24 起收，第四輪 §5-6，站主決定）──────────
// 2,253 間裡 360 間在台服客戶端沒有店名（SpecialShop／GilShop 的 Name 是空的），其中 229 間的 NPC 有台服名與座標。
// 先前整間略過，於是廣域交易商（雙色寶石）、喬納森（成就幣）、深層迷宮、軍票補給負責人…的 3,225 筆交易、
// **1,634 件只在這些店換得到的物品**在目錄裡查不到。
// 遊戲內它們多半不是「一間有名字的店」：金幣店是對 NPC 一講話就直接開（沒有選單），其餘由 NPC 的對話腳本
// （CustomTalk）開——選單文字在客戶端的 custom/ 文字表裡（例如喬納森的「成就幣交易」），但**哪一句對應哪一間店
// 寫在腳本邏輯裡，解包讀不到**，硬接就是自己編。所以：
//   · 店名留 null（`n` 不寫），另存 `p`＝這間店收的代價依筆數排序的前 2 種 itemId、`pn`＝總共幾種；
//     前端標成「無店名・付 ○○」——那是用官方物品名組成的標示，不是店名。
//   · 同一位 NPC 名下、`p` 相同的無名店合併成一間（軍票補給負責人有 11 間、喬納森 4 間，標題全一樣，
//     分開列只是重複的標題），交易完全相同的去重。
//   · **NPC 是活動圖層（Teamcraft npcs.json 的 `festival`）的無名店不收**。無名店裡這種有 110 個 NPC，
//     幾乎全是往年季節活動的攤位（2019／2020／2021 年的瓦倫提昂家的女僕、南瓜餅乾 2018 的奇怪的店員…，
//     付的是早就過期的活動貨幣）——平常根本不在那張圖上，列進「我人在這張圖，附近有哪些店」會叫人白跑。
//     ⚠ 不能反過來把有店名的活動 NPC 也一併拿掉：`festival` 不等於季節活動，渴望灣的梅蘇艾東克（宇宙信用點數
//     交易）也在活動圖層上。有店名的照收，但標出來（下一段）。
//
// ── 季節活動期間才出現的 NPC：`ev: 1`（2026-11-24，第四輪 §5-8，站主決定「標示、不拿掉」）──────────
// 判別只用台服官方字串，不自己列名單。NPC 在活動圖層上，而且下列任一成立：
//   · 它的官方頭銜（客戶端 ENpcResident.Title）含「季節」（季節商店／季節商鋪，34 個）；
//   · 同一個活動圖層上有任何 NPC 的頭銜含「季節」（可疑的占卜師沒有頭銜，但與瓦倫提昂家的女僕同圖層）；
//   · 它開的店的官方店名含「季節活動」（金碟遊樂園的特別紀念品兌換員：沒頭銜、圖層上也沒別人，店名是「季節活動報酬1」）。
// 渴望灣的梅蘇艾東克／歌吉斯（頭銜「貿易人員」「購物&修理」，宇宙探索常駐）三條都不成立，不標。
// 前端在卡片上標「季節活動期間限定」並連到季節活動商店頁；同一張圖裡排在常駐 NPC 後面。
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
import { loadTcSheet } from "./lib/tc-datamining.mjs";

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
  const festival = await loadFestivalNpcs();
  // 季節活動判別（見檔頭）：官方頭銜含「季節」的 NPC 所在的活動圖層
  const npcTitle = new Map((await loadTcSheet("ENpcResident", { offline, require: ["Title"] })).map((r) => [r.id, r.Title || ""]));
  const seasonalLayer = new Set();
  for (const [id, f] of festival) if (/季節/.test(npcTitle.get(id) || "")) seasonalLayer.add(f);
  if (seasonalLayer.size < 50) throw new Error(`頭銜含「季節」的活動圖層只有 ${seasonalLayer.size} 個（2026-11 是 97）——ENpcResident.Title 可能位移了`);
  const stat = { shops: 0, anon: 0, anonMerged: 0, anonFestival: 0, noNpc: 0, noCoord: 0, trades: 0, dropTrade: 0 };

  /* 代價依筆數排序（同數依 id），無名店的標示與合併鍵都用它 */
  const payOf = (trades) => {
    const cnt = new Map();
    for (const t of trades) for (const [id] of new Map(t.c)) cnt.set(id, (cnt.get(id) || 0) + 1);
    return [...cnt].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
  };

  for (const shop of S.shops) {
    let npcs = shop.npcs.filter((n) => n.at && n.at.mapId != null);
    if (!shop.name && npcs.length) {
      const before = npcs.length;
      npcs = npcs.filter((n) => !festival.has(n.id));
      if (!npcs.length) { stat.anonFestival++; continue; }
      if (npcs.length < before) stat.anonFestival++;
    }
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
    if (!shop.name) stat.anon++;

    for (const n of npcs) {
      const mid = n.at.mapId;
      if (!byMap.has(mid)) byMap.set(mid, new Map());
      const m = byMap.get(mid);
      if (!m.has(n.id)) m.set(n.id, { id: n.id, n: n.name, x: n.at.x, y: n.at.y, s: [] });
      const list = m.get(n.id).s;
      if (shop.name) { list.push({ id: shop.id, n: shop.name, t: shop.type, tr: trades }); continue; }
      // 無名店：同一位 NPC 名下代價前 2 種相同的併成一間（見檔頭）
      const pay = payOf(trades);
      const key = pay.slice(0, 2).join(",");
      const same = list.find((s) => !s.n && s._k === key);
      if (!same) { list.push({ id: shop.id, t: shop.type, _k: key, tr: trades.slice() }); continue; }
      stat.anonMerged++;
      const seen = new Set(same.tr.map((t) => JSON.stringify(t)));
      for (const t of trades) { const k = JSON.stringify(t); if (!seen.has(k)) { seen.add(k); same.tr.push(t); } }
    }
  }
  // 無名店的標示在合併完才算（合併後的交易才是畫面上那一間的內容）；有名的店排在無名店前面
  for (const m of byMap.values()) for (const npc of m.values()) {
    for (const s of npc.s) if (!s.n) { const pay = payOf(s.tr); s.p = pay.slice(0, 2); s.pn = pay.length; delete s._k; }
    npc.s.sort((a, b) => (a.n ? 0 : 1) - (b.n ? 0 : 1));
    const f = festival.get(npc.id);
    if (f && (seasonalLayer.has(f) || /季節/.test(npcTitle.get(npc.id) || "") || npc.s.some((s) => /季節活動/.test(s.n || "")))) { npc.ev = 1; stat.ev = (stat.ev || 0) + 1; }
    else if (f) (stat.festivalKept ||= []).push(`${npc.n}（${npcTitle.get(npc.id) || "無頭銜"}）`);
  }

  const out = [];
  for (const [mid, npcMap] of byMap) {
    const map = mapById.get(mid);
    if (!map || !map.name) continue;                 // 地名查不到就不收（鐵則）
    // 季節活動期間才出現的排在常駐的後面（「我人在這張圖，附近有哪些店」先看常駐的）
    const npcs = [...npcMap.values()].sort((a, b) => (a.ev || 0) - (b.ev || 0) || a.n.localeCompare(b.n, "zh-Hant"));
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
    source: "Teamcraft shops.json（經 scripts/lib/shops.mjs）＋ data/npcs.json ＋ data/maps.json ＋ Teamcraft npcs.json 的 festival（活動圖層）；店名為台服客戶端 SpecialShop／GilShop（tw-locales 後備），客戶端沒有店名的不寫",
    note: "檔名 <mapId>.json。品項只存 id 與數量，名字由前端查 items-market.json。金幣（id 1）在 items.json 裡名為 \"Gil\"，是刻意豁免的，前端顯示「金幣」。客戶端沒有店名的店不寫 n，改帶 p（代價依筆數排序的前 2 種 itemId）與 pn（共幾種），前端標成「無店名・付 ○○」。",
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
  console.log(`  其中客戶端沒有店名的 ${stat.anon} 間（同一位 NPC 名下代價相同的合併了 ${stat.anonMerged} 次；` +
    `NPC 在活動圖層而略過的 ${stat.anonFestival} 間）`);
  console.log(`  略過：無 NPC ${stat.noNpc}、NPC 無座標 ${stat.noCoord}`);
  console.log(`  標「季節活動期間限定」的 NPC ${stat.ev || 0} 個；在活動圖層上但不標的 ${(stat.festivalKept || []).length} 個：` +
    [...new Set(stat.festivalKept || [])].join("、"));
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

/* Teamcraft npcs.json 裡帶 `festival` 的 NPC id（活動圖層才出現的 NPC）。
   那份 17MB，只取這一欄；快取在 out_data/cache/tc-npcs.json（不進 git）。--offline 而快取不在就中止——
   安靜地當成「沒有活動 NPC」會把 110 個往年活動攤位放進目錄。 */
async function loadFestivalNpcs() {
  const cache = join(ROOT, "out_data/cache/tc-npcs.json");
  let raw;
  if (existsSync(cache)) raw = JSON.parse(await readFile(cache, "utf8"));
  else if (offline) throw new Error(`--offline 但找不到 ${cache}（先不帶 --offline 跑一次）`);
  else {
    const r = await fetch("https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/npcs.json");
    if (!r.ok) throw new Error(`Teamcraft npcs.json HTTP ${r.status}`);
    const t = await r.text();
    await mkdir(join(ROOT, "out_data/cache"), { recursive: true });
    await writeFile(cache, t);
    raw = JSON.parse(t);
  }
  const map = new Map(Object.entries(raw).filter(([, v]) => v && v.festival).map(([id, v]) => [Number(id), v.festival]));
  if (map.size < 1000) throw new Error(`Teamcraft npcs.json 的活動 NPC 只有 ${map.size} 個（2026-11 是 4,154）——欄位可能改名了`);
  return map;   // NPC id → 活動圖層 id
}

main().catch((e) => { console.error(e); process.exit(1); });
