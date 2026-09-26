// build-item-sources.mjs — 產生 data/item-sources/ 分片層（全站的「這東西去哪拿」）
//
// 解決的問題：`data/obtainable-methods.json` 有 36,336 件物品的取得管道，但它 7.7MB，
// 前端載不動，所以目前只有 `data/market-sources.json` 用到一小片——而那片的收錄範圍是
// 「配方會用到的物品」，於是家具只收到 191/2,560、裝備幾乎沒有。
// 「這件家具去哪買」「這件練級裝去哪換」站內答不出來，不是因為沒資料，是因為沒有切法。
//
// 切法：**依 `itemId >> 10` 分片**（每片 1,024 個 id）。
//   · 物品 id 在同一個資料片／同一類裝備裡大致連號，所以一次查詢通常只落在 1–2 片。
//   · 每片都很小（多數 < 40KB），前端按需要抓，抓過就快取。
//   · 片號可由 id 直接算出，不需要先載索引才知道去哪抓。
// `_index.json` 只是給「有哪些片、各片多大」用的，不在查詢路徑上。
//
// 收錄範圍：**所有有取得管道且有台服繁中名的物品**（實測 36,335 / 36,336，
// 唯一沒繁中名的那件是台服未開放）。轉換規則走 `scripts/lib/obtainable.mjs`，
// 與 `build-market-sources.mjs` 完全同一份——七個提案都要這層，各抄一份就會漂。
//
// 與 market-sources 的分工（**不要合併**）：
//   market-sources  配方相關物品，額外接了採集點座標與軍票價，市場頁整份載入
//   item-sources    全部物品，只有取得管道摘要，按片載入
// 前者是「湊材料」的視角（要座標要價格），後者是「這是什麼、哪來的」的視角。
//
// 執行（repo 根目錄）：
//   node scripts/build-item-sources.mjs            # dry-run，印報告
//   node scripts/build-item-sources.mjs --apply    # 寫入 data/item-sources/

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { convertOm, normalizeEntries, SKIP_CATALOG } from "./lib/obtainable.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OUT = join(DATA, "item-sources");
const apply = process.argv.includes("--apply");

const SHARD_BITS = 10;                 // 1,024 個 id 一片
const shardOf = (id) => id >> SHARD_BITS;

async function main() {
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const om = JSON.parse(await readFile(join(DATA, "obtainable-methods.json"), "utf8")).data;
  // NPC 販售者：om 的 vendor 型幾乎都沒有可用的 NPC 名，補這份才講得出「跟誰買」
  const vendors = JSON.parse(await readFile(join(DATA, "vendor-prices.json"), "utf8")).data;
  // 理符報酬與收藏品交納：om 沒有這兩型，由 build-extra-sources.mjs 補
  const extra = JSON.parse(await readFile(join(DATA, "extra-sources.json"), "utf8")).data;
  const byId = new Map(items.map((i) => [i.id, i]));
  // 店名解析器：om 自帶的 shopName 有 2,062 處是英文（Immortal Flames…），
  // 用 tw-locales 的台服官方店名補；補不到就整個不印（鐵則：不落英文）
  const tw = await loadTwLocales();
  const twShop = (id) => twName(tw.shops, id);

  // 台服未開放（沒有繁中名）的一律不收——前端也不會顯示它，收了只是佔體積
  const hasTw = (id) => {
    const it = byId.get(id);
    return !!(it && it.name && isTw(it.name));
  };

  const shards = new Map();            // 片號 → { id: entries }
  const stat = { items: 0, entries: 0, noTw: 0, empty: 0, byType: {} };

  /* **要走 om 與 extra 的聯集**，不能只走 om 的 key。
     收藏品交納那 127 件裡多數在 om 裡根本沒有任何條目（所以先前顯示成「查無取得方式」），
     只跑 om 的話它們永遠補不進來，而且不會報錯。 */
  const allKeys = new Set([...Object.keys(om), ...Object.keys(extra)]);
  for (const key of allKeys) {
    const id = Number(key);
    if (!hasTw(id)) { stat.noTw++; continue; }
    // 這一層用 SKIP_CATALOG：製作與商城**是**有效答案（房屋家具有 701 件只能製作、
    // 154 件只在商城，濾掉的話那些物品會顯示成「查無取得方式」，那是錯的）。
    const entries = normalizeEntries([
      ...(om[key] || []).map((m) => convertOm(m, { skip: SKIP_CATALOG, twShop, vendor: vendors[key] || null })),
      ...(extra[key] || []),
    ], { max: 8 });
    if (!entries.length) { stat.empty++; continue; }   // 只有 requirement／alarm 這種無行動意義的
    const s = shardOf(id);
    if (!shards.has(s)) shards.set(s, {});
    shards.get(s)[id] = entries;
    stat.items++;
    stat.entries += entries.length;
    for (const e of entries) stat.byType[e.t] = (stat.byType[e.t] || 0) + 1;
  }

  // 每片一個檔，另產一份索引
  const files = [];
  for (const [s, obj] of [...shards].sort((a, b) => a[0] - b[0])) {
    const json = JSON.stringify({ schema: "item-sources", shard: s, count: Object.keys(obj).length, data: obj });
    files.push({ shard: s, name: `${s}.json`, bytes: json.length, gz: gzipSync(json).length, count: Object.keys(obj).length, json });
  }

  const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
  const totalGz = files.reduce((a, f) => a + f.gz, 0);
  const biggest = files.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 3);

  console.log(`收錄 ${stat.items} 件物品／${stat.entries} 筆管道，切成 ${files.length} 片`);
  console.log(`  略過：無台服名 ${stat.noTw}、只有製作/秘籍等不顯示的管道 ${stat.empty}`);
  console.log(`  合計 ${(totalBytes / 1024).toFixed(0)}KB（gzip ${(totalGz / 1024).toFixed(0)}KB）`);
  console.log(`  單片平均 ${(totalBytes / files.length / 1024).toFixed(1)}KB；最大三片：` +
    biggest.map((f) => `${f.name} ${(f.bytes / 1024).toFixed(0)}KB/${f.count} 件`).join("、"));
  console.log(`  管道類型：` + Object.entries(stat.byType).sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} ${n}`).join("、"));

  // 單片太大前端就會卡——這裡設一道閘門，超過就要重新考慮分片位元數
  const over = files.filter((f) => f.bytes > 300 * 1024);
  if (over.length) {
    console.error(`\n✗ 有 ${over.length} 片超過 300KB（${over.map((f) => f.name).join("、")}）——` +
      `調大 SHARD_BITS 只會更糟，要調小（每片更少 id）`);
    process.exit(1);
  }

  // 對照：市場頁那份收了多少，這份補了多少
  if (existsSync(join(DATA, "market-sources.json"))) {
    const ms = JSON.parse(await readFile(join(DATA, "market-sources.json"), "utf8")).data;
    const msIds = new Set(Object.keys(ms).map(Number));
    const mine = new Set();
    for (const obj of shards.values()) for (const k of Object.keys(obj)) mine.add(Number(k));
    const added = [...mine].filter((id) => !msIds.has(id)).length;
    console.log(`\n相對 market-sources.json（${msIds.size} 件）：多收 ${added} 件`);
    // 家具是這層最直接受惠的類別，單獨報一次
    const furn = items.filter((i) => /家具|庭具|桌上|壁掛|地毯|屋頂|外牆|窗/.test(i.category || ""));
    const furnCovered = furn.filter((i) => mine.has(i.id)).length;
    const furnMs = furn.filter((i) => msIds.has(i.id)).length;
    const noOm = furn.filter((i) => !om[String(i.id)]).length;
    console.log(`  房屋類物品 ${furn.length} 件：market-sources 收 ${furnMs} → 分片層收 ${furnCovered}` +
      `（其餘 ${furn.length - furnCovered} 件中，${noOm} 件上游根本沒收取得管道）`);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  // 重建前先清掉舊片，否則物品搬片之後舊片會留著給出過期答案
  if (existsSync(OUT)) {
    for (const f of await readdir(OUT)) if (f.endsWith(".json")) await rm(join(OUT, f));
  }
  await mkdir(OUT, { recursive: true });
  for (const f of files) await writeFile(join(OUT, f.name), f.json);

  /* 取得方式索引：itemId → 類型位元遮罩。
     分片層回答「這一件哪來的」，但答不了「哪些家具是 NPC 直接買得到的」——
     那要把 36,335 件全部掃一遍，而分片是按需載入的。
     單獨產一份輕量索引：類型只有 17 種，一個位元一種；id 用差分存。
     實測物件形式 gzip 96KB、差分陣列 **gzip 14KB**，差六倍多，所以用後者。 */
  const typeList = [];
  const typeIdx = new Map();
  const maskOf = new Map();
  for (const obj of shards.values()) {
    for (const [id, rows] of Object.entries(obj)) {
      let m = 0;
      for (const r of rows) {
        if (!typeIdx.has(r.t)) { typeIdx.set(r.t, typeList.length); typeList.push(r.t); }
        m |= (1 << typeIdx.get(r.t));
      }
      maskOf.set(Number(id), m);
    }
  }
  const sortedIds = [...maskOf.keys()].sort((a, b) => a - b);
  const packed = [];
  let prevId = 0;
  for (const id of sortedIds) { packed.push(id - prevId, maskOf.get(id)); prevId = id; }
  await writeFile(join(DATA, "item-source-types.json"), JSON.stringify({
    schema: "item-source-types",
    updated: new Date().toISOString().slice(0, 10),
    source: "data/item-sources/ 的類型彙總（同一支腳本產生，保證同步）",
    note: "d 是差分陣列：[id 差值, 位元遮罩, id 差值, 位元遮罩…]。遮罩的第 n 個位元對應 types[n]。",
    types: typeList,
    count: sortedIds.length,
    d: packed,
  }));
  console.log(`✓ data/item-source-types.json（${sortedIds.length} 件／${typeList.length} 種類型）`);
  await writeFile(join(OUT, "_index.json"), JSON.stringify({
    schema: "item-sources-index",
    updated: new Date().toISOString().slice(0, 10),
    source: "data/obtainable-methods.json ＋ data/extra-sources.json（轉換規則 scripts/lib/obtainable.mjs）",
    note: `片號 = itemId >> ${SHARD_BITS}；檔名 <片號>.json。片號可由 id 直接算出，查詢不需要先載這份索引。`,
    shardBits: SHARD_BITS,
    count: stat.items,
    shards: files.map((f) => ({ shard: f.shard, count: f.count, bytes: f.bytes })),
  }));
  console.log(`\n✓ data/item-sources/（${files.length} 片＋_index.json）`);
  console.log("  這個目錄刻意不進 minify-data.mjs——它本來就是壓過的形狀（單字母欄位、無縮排）");
}

main().catch((e) => { console.error(e); process.exit(1); });
