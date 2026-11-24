// validate-item-uses.mjs — 「會用掉它的地方」（市場頁物品詳情）回歸
//
// 改完 scripts/build-item-uses.mjs、data/item-uses/ 或 tools/market/market.js 的用途區（renderUses／loadUses）必跑。
// 會安靜出錯、畫面上看不出來的地方：
//   ① 片號：前端 USES_SHARD_BITS 與建置端 SHARD_BITS 不一致時，每件都會抓錯片——查不到就顯示「查不到」，不報錯。
//   ② 連結目標：NPC 商店目錄的 ?m= 那張圖要真的有這位 NPC、而且他真的收這件；任務 id 要在任務查詢的索引裡；
//      軍需品的 job 序號＝貨幣變現排行「軍票怎麼賺」的職業序（頁面會濾掉沒有交納品的職業，濾掉一個就全部錯位）；
//      貨幣連結的 ?c= 要是變現排行真的有的貨幣（不然頁面會安靜地退回第一種）。
//   ③ 「查不到」與「載入失敗」要分開講：這區的結論會被拿來決定要不要丟東西。
//      片不存在（404）＝那段 id 都沒有紀錄＝查不到；網路錯誤＝載入失敗，不可以說成查不到。
//   ④ 查不到時要講清楚查了什麼、**沒查什麼**（分解、精選、專家交納本站沒有資料）。
//   ⑤ 兩個入口都要有：節點視窗（搜尋結果點進去）與單品詳情（?item=／#item= 深連結）。
//      單品詳情遇到不可交易的物品先前只印一行「無法交易」，站內連過來是空頁——現在要有取得管道＋用途。
//
// 相依：jsdom（npm i jsdom --no-save）
// 執行（repo 根目錄）：node scripts/validate-item-uses.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTw, isTranslated } from "./lib/tw-text.mjs";
import { COLLECTIONS, TRIAD } from "./lib/collection-owners.mjs";

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch { console.error("需要 jsdom：npm i jsdom --no-save"); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const rj = (p) => JSON.parse(read(p));
const results = [];
const push = (n, ok, d = "") => results.push([n, !!ok, d]);

// ── 資料層 ─────────────────────────────────────────────
const IDX = rj("data/item-uses/_index.json");
const USES = new Map();
for (const f of readdirSync(join(ROOT, "data/item-uses")).filter((f) => /^\d+\.json$/.test(f))) {
  const sh = rj(`data/item-uses/${f}`);
  for (const [id, u] of Object.entries(sh.data)) USES.set(Number(id), { u, shard: sh.shard });
}
const items = new Map(rj("data/items.json").data.map((x) => [x.id, x]));
const byName = (n) => [...items.values()].find((x) => x.name === n)?.id;
const JS = read("tools/market/market.js");

{
  const feBits = Number(JS.match(/var USES_SHARD_BITS = (\d+);/)?.[1]);
  const beBits = Number(read("scripts/build-item-uses.mjs").match(/const SHARD_BITS = (\d+);/)?.[1]);
  push("① 前端與建置端的片號位數一致", feBits && feBits === beBits && feBits === IDX.shardBits, `前端 ${feBits}／建置 ${beBits}／索引 ${IDX.shardBits}`);
  const misplaced = [...USES].filter(([id, v]) => (id >> IDX.shardBits) !== v.shard);
  push("  每件都在 id >> 位數 那一片", misplaced.length === 0, misplaced.slice(0, 3).map(([id]) => id).join("、"));
  push("  索引的件數與各片加總一致", IDX.count === USES.size && IDX.shards.reduce((s, x) => s + x.count, 0) === USES.size, `${IDX.count}／${USES.size}`);
  push("  金幣（id 1）不收", !USES.has(1));
  const noTw = [...USES.keys()].filter((id) => !items.get(id)?.name || !isTw(items.get(id).name));
  push("  收的物品都有台服名", noTw.length === 0, noTw.slice(0, 5).join("、"));
}

{
  // NPC 兌換：換到的物品有台服名；每一處地點都是「目錄裡那張圖真的有這位 NPC、他真的收這件」
  const shopCache = new Map();
  const shop = (m) => { if (!shopCache.has(m)) shopCache.set(m, existsSync(join(ROOT, `data/npc-shops/${m}.json`)) ? rj(`data/npc-shops/${m}.json`) : null); return shopCache.get(m); };
  /* 2026-11-23b 起兌換列改吃完整商店表（目錄會略過客戶端沒有店名的店，成就幣就在那裡），每一處地點帶「目錄有沒有」旗標。
     兩個方向都要對：標 1 的，目錄那張圖真的有這位 NPC 收它換這件（連過去才不會是空的）；
     標 0 的，目錄真的沒有這位 NPC 收這件（不然就是該連卻沒連）。 */
  let n = 0, on = 0, off = 0;
  const bad = [], badOff = [];
  for (const [id, { u }] of USES) for (const r of u.x || []) {
    n++;
    if (!items.get(r[0])?.name || !isTw(items.get(r[0]).name)) bad.push(`${id}→${r[0]} 無台服名`);
    for (const [npc, mapId, mapName, inCat] of r[4]) {
      const sh = shop(mapId);
      if (inCat === 1) {
        on++;
        const ok = sh && sh.map === mapName && sh.npcs.some((p) => p.n === npc && p.s.some((s) => s.tr.some((t) => t.c.some(([c]) => c === id) && t.g.some(([g]) => g === r[0]))));
        if (!ok) bad.push(`${items.get(id)?.name}@${npc}/${mapId}`);
      } else if (inCat === 0) {
        off++;
        if (sh && sh.npcs.some((p) => p.n === npc && p.s.some((s) => s.tr.some((t) => t.c.some(([c]) => c === id))))) badOff.push(`${items.get(id)?.name}@${npc}/${mapId}`);
        if (!isTranslated(npc) || !isTranslated(mapName)) badOff.push(`${npc}／${mapName} 沒過守門`);
      } else bad.push(`${items.get(id)?.name}@${npc} 沒有目錄旗標`);
    }
  }
  push("② NPC 兌換中標「目錄有」的地點都對得到 NPC 商店目錄（那位 NPC 真的收它換這件）", n > 8000 && on > 12000 && bad.length === 0,
    bad.length ? bad.slice(0, 3).join("、") : `${n} 筆、可連 ${on} 處`);
  push("  標「目錄沒有」的地點目錄裡真的沒有（不是該連沒連）、NPC 名與地名過守門", off > 100 && badOff.length === 0,
    badOff.length ? badOff.slice(0, 3).join("、") : `只印字 ${off} 處`);
  const placed = [...USES.values()].every(({ u }) => (u.x || []).every((r) => r[4].every((p, i, a) => i === 0 || a[i - 1][3] >= p[3])));
  push("  連得到目錄的地點排在前面", placed);
  const sorted = [...USES.values()].every(({ u }) => !u.x || u.x.every((r, i, a) => i === 0 || a[i - 1][0] <= r[0]));
  push("  兌換清單依換到的物品 id 排（固定順序）", sorted);
}

{
  const qIdx = new Set(rj("data/quests/_index.json").data.map((r) => r[0]));
  const qBad = [...USES.values()].flatMap(({ u }) => (u.q || []).filter((r) => !qIdx.has(r[0]) || !isTw(r[1])));
  const qN = [...USES.values()].reduce((s, { u }) => s + (u.q || []).length, 0);
  push("② 任務交付的任務 id 都在任務查詢的索引裡、名稱過守門", qN > 500 && qBad.length === 0, qBad.length ? JSON.stringify(qBad.slice(0, 2)) : `${qN} 筆`);

  const leves = new Map(rj("data/craft-leves.json").data.map((l) => [l.id, l]));
  const levesHtml = read("tools/leves/index.html");
  const lBad = [...USES.values()].flatMap(({ u }) => (u.l || []).filter((r) => !leves.has(r[0]) || leves.get(r[0]).job !== r[2] || leves.get(r[0]).level !== r[3]));
  push("② 製作理符的 id、職業、等級與 craft-leves.json 一致（連結 ?job=&lv= 用的就是這兩個）", lBad.length === 0, JSON.stringify(lBad.slice(0, 2)));
  push("  理符頁的 ?job= 吃職業名（不是代號）", /p\.get\('job'\) && jobs\.indexOf\(p\.get\('job'\)\)/.test(levesHtml));

  const sup = rj("data/gc-supply.json").data.jobs;
  const gBad = [...USES.values()].flatMap(({ u }) => (u.g || []).filter((r) => sup[r[0]]?.name !== r[1]));
  push("② 軍需品的 job 序號對得到 gc-supply.json 的職業", gBad.length === 0, JSON.stringify(gBad.slice(0, 2)));
  // 貨幣變現排行會濾掉「過版本閘門後沒有交納品」的職業——濾掉一個，後面的序號就全部錯位
  const gp = rj("data/_meta.json").gamePatch;
  const pn = (p) => { const m = p == null ? null : String(p).match(/^(\d+)\.(\d+)/); return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : null; };
  const rel = (p) => { const v = pn(p), g = pn(gp); return v == null || g == null || v <= g; };
  const emptyJobs = sup.filter((j) => !j.items.some((i) => rel(i.patch))).map((j) => j.name);
  push("  每個職業都有已開放的交納品（頁面的職業序＝資料的職業序）", emptyJobs.length === 0, emptyJobs.join("、"));

  // 部隊工房列連到 /tools/fc-workshop/?id=<成品 id>——那一頁只認 fc-workshop.json 裡有的成品
  const fcIds = new Set(rj("data/fc-workshop.json").data.map((d) => d.itemId));
  const wBad = [...USES.values()].flatMap(({ u }) => (u.w || []).filter((r) => !fcIds.has(r[0])));
  const wN = [...USES.values()].reduce((s, { u }) => s + (u.w || []).length, 0);
  push("② 部隊工房的成品 id 都是部隊工房頁 ?id= 找得到的", wN > 1000 && wBad.length === 0, wBad.length ? JSON.stringify(wBad.slice(0, 2)) : `${wN} 筆`);

  const CS = rj("data/currency-shop.json");
  const csIds = new Set(CS.data.map((c) => c.id));
  const cBad = [...USES].filter(([, { u }]) => u.cur && !(u.cur[0] === "gs" ? ["mgp", "reputation"].includes(u.cur[1]) : csIds.has(u.cur[1])));
  const curN = [...USES.values()].filter(({ u }) => u.cur).length;
  push("② 貨幣連結：?c= 是變現排行真的有的貨幣、金碟只分兩種", curN >= 50 && cBad.length === 0, cBad.length ? cBad.slice(0, 3).map(([id]) => id).join("、") : `${curN} 種`);
  const gcSeals = [20, 21, 22].map((id) => USES.get(id)?.u.cur);
  push("  三團軍票都連到 ?c=20（頁面把三團合併成一種）", gcSeals.every((c) => c && c[0] === "gc" && c[1] === 20), JSON.stringify(gcSeals));
}

{
  // 釘幾個看得到的案例
  const purple = USES.get(33913)?.u;
  push("案例：巧手紫票 → 連到貨幣變現排行，不展開上千筆", purple?.cur?.[1] === 33913 && !purple.x);
  const crystal = byName("戰利水晶");
  push("案例：戰利水晶 → NPC 兌換 300 筆以上", (USES.get(crystal)?.u.x || []).length >= 300, String((USES.get(crystal)?.u.x || []).length));
  push("案例：楓樹樹汁（5498）→ 任務交付含任務 65540", (USES.get(5498)?.u.q || []).some((r) => r[0] === 65540));
  push("案例：獸骨漁槍（1820）→ 製作理符 21", (USES.get(1820)?.u.l || []).some((r) => r[0] === 21));
}

{
  // ⑥ 收藏缺口（第四輪 §5-1）：兌換列的 r[6] 是收藏對應，存檔鍵與格子鍵要真的對得到那本圖鑑（錯了不報錯，只會把已有的算成還缺）
  const keysOf = new Map();
  for (const c of COLLECTIONS) {
    const s = keysOf.get(c.storageKey) || new Set();
    for (const e of rj(`data/${c.file}.json`).data) s.add(String(c.keyOf(e)));
    keysOf.set(c.storageKey, s);
  }
  keysOf.set(TRIAD.storageKey, new Set(rj("data/triple-triad.json").data.map((e) => String(TRIAD.keyOf(e)))));
  const colRows = [...USES].flatMap(([id, { u }]) => (u.x || []).filter((r) => r[6]).map((r) => [id, r]));
  const badOwn = colRows.filter(([, r]) => !keysOf.get(r[6].sk)?.has(String(r[6].k)) || !r[6].path || !r[6].label);
  push("⑥ 兌換列的收藏對應都對得到那本圖鑑真的有的一格", colRows.length >= 150 && badOwn.length === 0,
    badOwn.length ? badOwn.slice(0, 3).map(([id, r]) => `${id}→${r[0]}(${r[6].sk}/${r[6].k})`).join("、") : `${colRows.length} 筆`);
  const notCol = [...USES.values()].flatMap(({ u }) => u.x || []).filter((r) => !r[6]).length;
  push("  不是收藏品的兌換列收藏欄是 0（不是 undefined）", [...USES.values()].every(({ u }) => (u.x || []).every((r) => r.length === 7 && (r[6] === 0 || typeof r[6] === "object"))), `${notCol} 筆非收藏`);
  const cert = USES.get(21172)?.u;
  const certCol = new Set((cert?.x || []).filter((r) => r[6]).map((r) => r[0]));
  /* 2026-11-24 起 NPC 商店目錄也收客戶端沒有店名的店（第四輪 §5-6），喬納森從「目錄沒有」翻成「目錄有」。
     「目錄沒有」那一支改由往年活動的攤位當案例：活動圖層上的無名店目錄刻意不收（build-npc-shops.mjs 檔頭）。 */
  push("案例：成就幣 → 28 件收藏品，喬納森標「目錄有」（11-24 起目錄收無店名的店）", certCol.size === 28 && cert.x.every((r) => r[4].some((p) => p[0] === "喬納森" && p[3] === 1)),
    `${certCol.size} 件`);
  const choc = USES.get(28650)?.u;
  push("案例：戀人巧克力2021（往年活動攤位的無名店）→ 地點全標「目錄沒有」", choc && choc.x.length > 30 && choc.x.every((r) => r[4].every((p) => p[3] === 0)),
    choc ? `${choc.x.length} 筆` : "沒有這件的兌換資料");
}

// ── 頁面（jsdom）─────────────────────────────────────────
const HTML = read("tools/market/index.html");
async function boot(hash, { failUses = false, ls = {} } = {}) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on("jsdomError", (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: "outside-only", url: "https://seagod99.github.io/tools/market/" + hash, virtualConsole: vc });
  const { window } = dom;
  const store = { ...ls };
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    key: () => null, get length() { return 0; } } });
  const fetched = [];
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, "$1/");
    fetched.push(rel);
    if (failUses && rel.startsWith("data/item-uses/")) throw new TypeError("Failed to fetch");
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.scrollTo = () => {};
  const proto = window.HTMLElement.prototype;
  if (!proto.showModal) { proto.showModal = function () {}; proto.close = function () {}; }
  window.Universalis = {
    WORLDS: { 4028: "伊弗利特" }, worldName: String, fmtGil: String, fmtAge: () => "剛剛", homeWorld: () => null, TAX_RATE: 0.05,
    clearCache() {}, fetchListings: async () => ({ items: {} }), fetchHistory: async () => ({ items: {} }),
    fetchAggregated: async () => ({ items: {}, fetched: Date.now() }), fillQuote: () => null,
  };
  for (const f of ["assets/js/patch-gate.js", "assets/js/toast.js", "assets/js/item-sources.js"]) {
    try { window.eval(read(f)); } catch { /* 非必要 */ }
  }
  window.eval(JS);
  await new Promise((r) => setTimeout(r, 2500));
  return { window, doc: window.document, errs, fetched };
}
const usesFold = (doc, sel) => doc.querySelector(sel + ' details.fold[data-fold="uses"]');
const sumOf = (f) => f?.querySelector(".fold-s")?.textContent || "";

// 找案例：不可交易＋有兌換用途；沒有任何用途的（也不是配方材料）；存在於某個沒有檔案的片
const mk = rj("data/items-market.json").data;                 // [id, name, cat, icon, marketable, patch]
const ingr = new Set();
for (const r of rj("data/recipes.json").data) for (const g of r.ingredients || []) ingr.add(g.itemId ?? g.id ?? g[0]);
const old = (p) => p && /^[2-6]\./.test(p);
const untradableX = mk.find((r) => !r[4] && old(r[5]) && (USES.get(r[0])?.u.x || []).length > 40);
const noUse = mk.find((r) => !r[4] && old(r[5]) && isTw(r[1]) && !USES.has(r[0]) && !ingr.has(r[0]));
const shardSet = new Set(IDX.shards.map((s) => s.shard));
const inMissingShard = mk.find((r) => isTw(r[1]) && old(r[5]) && !shardSet.has(r[0] >> IDX.shardBits));

{
  const { doc, errs } = await boot("#item=" + untradableX[0]);
  // 取得管道區：有資料就是預設展開的摺疊區；站內查不到時是一行「不可交易，站內也查不到取得管道」——兩種都要講出不可交易
  const srcEl = doc.getElementById("dSrc");
  const src = srcEl && srcEl.querySelector('details.fold[data-fold="src"]');
  const f = usesFold(doc, "#dUses");
  push("⑤ 單品詳情（#item=）不可交易：有取得管道區（不再只印一行就結束）與用途區",
    errs.length === 0 && srcEl && /不可交易/.test(srcEl.textContent) && (!src || src.open) && !!f,
    `${untradableX[1]}：${srcEl ? srcEl.textContent.trim().slice(0, 30) : "沒有 #dSrc"}`);
  // 有取得管道的不可交易物品：摺疊區要預設展開
  const srcShard = new Map();
  const hasSrc = (id) => {
    const s = id >> 10;
    if (!srcShard.has(s)) srcShard.set(s, existsSync(join(ROOT, `data/item-sources/${s}.json`)) ? rj(`data/item-sources/${s}.json`).data : {});
    return !!(srcShard.get(s)[id] || []).length;
  };
  const withSrc = mk.find((r) => !r[4] && old(r[5]) && isTw(r[1]) && USES.has(r[0]) && hasSrc(r[0]));
  if (withSrc) {
    const { doc: d2 } = await boot("#item=" + withSrc[0]);
    const s2 = d2.querySelector('#dSrc details.fold[data-fold="src"]');
    push("  查得到取得管道的不可交易物品：取得管道區預設展開", s2 && s2.open, `${withSrc[1]}：${s2 ? s2.querySelector(".fold-s").textContent : "沒有"}`);
  }
  push("  摘要寫出兌換幾種", /兌換 \d+ 種/.test(sumOf(f)), sumOf(f));
  const rows = f.querySelectorAll(".use-cell .nav-chip").length;
  push("  兌換最多列 30 筆，其餘給數量與搜尋提示", rows === 30 && /另有 \d+ 項/.test(f.textContent), `${rows} 列`);
  // 地點依「在哪幾位 NPC 換」分組只講一次：地點列數不可以跟兌換筆數一樣多
  const whereN = f.querySelectorAll(".use-where").length;
  push("  地點依 NPC 分組只講一次（不逐列重複）", whereN >= 1 && whereN < rows, `${whereN} 組／${rows} 筆`);
  const a = f.querySelector('a.use-link[href^="../npc-shops/?m="]');
  push("  地點連到 NPC 商店目錄，帶 m 與這件物品的名字", a && a.getAttribute("href").includes("q=" + encodeURIComponent(untradableX[1])), a && a.getAttribute("href"));
  push("④ 頁尾講出沒收錄的用途（分解、精選、專家交納…）", /沒收錄的用途：分解、精選、專家交納/.test(f.textContent));
}

{
  const { doc } = await boot("#item=" + noUse[0]);
  const f = usesFold(doc, "#dUses");
  push("③④ 什麼用途都沒有：摘要「本站資料裡查不到」、內文列出查過哪些與沒查哪些", f && sumOf(f) === "本站資料裡查不到" &&
    /都沒有用到它/.test(f.textContent) && /沒收錄的用途/.test(f.textContent), `${noUse[1]}：${sumOf(f)}`);
}

if (inMissingShard) {
  const { doc, errs } = await boot("#item=" + inMissingShard[0]);
  const f = usesFold(doc, "#dUses");
  push("③ 沒有檔案的片（404）＝查不到，不是載入失敗", f && !/載入失敗/.test(sumOf(f)) && errs.length === 0, `${inMissingShard[1]}（片 ${inMissingShard[0] >> IDX.shardBits}）：${sumOf(f)}`);
} else push("③ 沒有檔案的片（404）＝查不到，不是載入失敗", true, "目前每一片都有資料，略過");

{
  const { doc } = await boot("#item=" + untradableX[0], { failUses: true });
  const f = usesFold(doc, "#dUses");
  push("③ 網路錯誤 → 寫「載入失敗」，不可以說成查不到", f && sumOf(f) === "載入失敗" && !/查不到/.test(f.textContent), sumOf(f));
}

{
  // 節點視窗：秘銀錠是配方材料——配方那一列指向上方的「上下游配方」
  const { doc, errs } = await boot("#node=5065");
  const f = usesFold(doc, "#nmUses");
  push("⑤ 節點視窗（#node=）也有用途區，配方那列指向上方的上下游配方", errs.length === 0 && f && /配方 \d+ 項/.test(sumOf(f)) && /見上方「🔗 上下游配方」/.test(f.textContent), sumOf(f));
}

{
  // 單品詳情的配方列是一顆鈕，點了開節點視窗
  const { doc, window } = await boot("#item=5065");
  const f = usesFold(doc, "#dUses");
  const btn = f && f.querySelector('button.use-btn[data-nm="nav"]');
  push("⑤ 單品詳情（可交易）的用途區有「看是哪些配方」鈕", !!btn, sumOf(f));
  if (btn) {
    btn.click();
    await new Promise((r) => setTimeout(r, 300));
    push("  點了開節點視窗（同搜尋結果卡片）", doc.getElementById("nodeModal").classList.contains("open") && window.location.hash === "#node=5065", window.location.hash);
  }
}

{
  const { doc } = await boot("#item=33913");
  const f = usesFold(doc, "#dUses");
  push("案例頁面：巧手紫票的用途區連到 ../gc-exchange/?c=33913", !!f?.querySelector('a[href="../gc-exchange/?c=33913"]'), sumOf(f));
  const { doc: d2 } = await boot("#item=29");
  push("案例頁面：金碟幣連到金碟獎品價目表", !!usesFold(d2, "#dUses")?.querySelector('a[href="../gold-saucer/"]'));
}

{
  // ⑥ 收藏缺口（第四輪 §5-1）：成就幣——變現排行沒有的貨幣（店在客戶端沒有店名，NPC 商店目錄 11-24 起才收）
  // 期望值照頁面同一條規則算：兌換品要有名字、且過版本閘門（visibleItem）
  const gp = rj("data/_meta.json").gamePatch;
  const pnum = (p) => { const m = p == null ? null : String(p).match(/^(\d+)\.(\d+)/); return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : null; };
  const released = (p) => { const v = pnum(p), g = pnum(gp); return v == null || g == null || v <= g; };
  const cert = USES.get(21172).u;
  const best = new Map();
  for (const r of cert.x) {
    const it = items.get(r[0]);
    if (!r[6] || !it || !it.name || !released(it.patch)) continue;
    const b = best.get(r[0]); if (!b || r[2] < b[2]) best.set(r[0], r);
  }
  const want = [...best.values()].reduce((s, r) => s + r[2], 0);
  let { doc } = await boot("#item=21172");
  let f = usesFold(doc, "#dUses");
  const gap = () => (f?.querySelector(".use-gap")?.textContent || "").replace(/,/g, "");
  const n = (re) => Number((gap().match(re) || [])[1]);
  push("⑥ 成就幣的用途區有收藏缺口：換得到幾件、還缺幾件、全換要幾個成就幣", n(/換得到的收藏品 (\d+) 件/) === best.size && n(/你還缺 (\d+) 件/) === best.size &&
    n(/全換要 (\d+) 個/) === want && /收藏缺 \d+ 件/.test(sumOf(f)), gap());
  const chips = [...f.querySelectorAll("a.use-gap-chip")];
  const r0 = [...best.values()].sort((a, b) => a[2] - b[2] || a[0] - b[0])[0];
  push("  還缺的每一件都列成連結、連到收藏頁那一格（?id=），不受兌換清單 30 筆的限制", chips.length === best.size &&
    chips[0].getAttribute("href") === "../../" + r0[6].path + "?id=" + encodeURIComponent(r0[6].k), chips[0] && chips[0].getAttribute("href"));
  const more = f.querySelector("details.use-gap-more");
  push("  缺超過 6 件時連結收在「看是哪 N 件」裡（預設收合，摘要行照樣有數字）", more && !more.open && more.contains(chips[0]) &&
    more.querySelector("summary").textContent === `看是哪 ${best.size} 件`, more && more.querySelector("summary").textContent);
  push("  沒讀到進度的圖鑑點名講出來", /沒有讀到「/.test(f.textContent));
  const jon = [...f.querySelectorAll('a.use-link[href^="../npc-shops/"]')].find((a) => /喬納森/.test(a.textContent));
  push("  喬納森（無店名的店，11-24 起目錄有收）連到 NPC 商店目錄，帶 m 與成就幣的名字", jon && /[?&]m=3(&|$)/.test(jon.getAttribute("href")) &&
    jon.getAttribute("href").includes("q=" + encodeURIComponent(items.get(21172).name)), jon && jon.getAttribute("href"));
  const certVisible = cert.x.filter((r) => { const it = items.get(r[0]); return it && it.name && released(it.patch); }).length;
  push("  目錄收了的兌換店：超過 30 筆截 30 筆、叫人去目錄搜", certVisible > 30 && f.querySelectorAll(".use-cell").length === 30 &&
    /到 NPC 商店目錄搜/.test(f.textContent), `${f.querySelectorAll(".use-cell").length}／${certVisible} 筆`);
  // 逐格驗：顯示出來的格子是收藏品就要有圖鑑標籤、不是就不能有（清單只列前 30 筆，收藏品不一定都在裡面）
  const colIds = new Set(cert.x.filter((r) => r[6]).map((r) => r[0]));
  const cells = [...f.querySelectorAll(".use-cell")];
  const wrongTag = cells.filter((c) => colIds.has(Number(c.querySelector(".nav-chip").getAttribute("data-id"))) !== !!c.querySelector(".use-col"));
  push("  兌換格：是收藏品的才標圖鑑名（逐格對）", cells.length > 0 && wrongTag.length === 0 && cells.some((c) => c.querySelector(".use-col")),
    `${cells.length} 格、標了 ${cells.filter((c) => c.querySelector(".use-col")).length} 格`);

  // 標了一件：少一件、總價扣掉它的單價、格子打勾
  ({ doc } = await boot("#item=21172", { ls: { [r0[6].sk]: JSON.stringify([r0[6].k]) } }));
  f = usesFold(doc, "#dUses");
  push("⑥ 在收藏頁標了一件 → 少一件、總價扣掉它的單價、格子標「✓」", n(/你還缺 (\d+) 件/) === best.size - 1 && n(/全換要 (\d+) 個/) === want - r0[2] &&
    f.querySelectorAll(".use-col.have").length >= 1 && f.querySelectorAll("a.use-gap-chip").length === best.size - 1, gap());

  // 全部都有 → 「你都有了」、不列連結
  const ls = {};
  for (const r of best.values()) { const s = ls[r[6].sk] ? JSON.parse(ls[r[6].sk]) : []; s.push(r[6].k); ls[r[6].sk] = JSON.stringify(s); }
  ({ doc } = await boot("#item=21172", { ls }));
  f = usesFold(doc, "#dUses");
  push("  全部都有 → 摘要寫「你都有了」、摘要行寫「收藏已收齊」、不列缺件連結", /你都有了/.test(gap()) && /收藏已收齊/.test(sumOf(f)) && !f.querySelector("a.use-gap-chip"));

  // 寵物頁存純數字也要認得
  const petRow = [...USES.values()].flatMap(({ u }) => u.x || []).find((r) => r[6] && r[6].c === "minions");
  push("  收藏對應裡寵物的鍵是純數字（寵物頁 keyOf 回傳 m.id）", petRow && /^\d+$/.test(String(petRow[6].k)), petRow && String(petRow[6].k));
}

{
  // 兌換店目錄全都沒收（往年活動攤位）：不截 30 筆、不叫人去目錄搜（會撲空）、地點只印字
  const gp = rj("data/_meta.json").gamePatch;
  const pnum = (p) => { const m = p == null ? null : String(p).match(/^(\d+)\.(\d+)/); return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : null; };
  const released = (p) => { const v = pnum(p), g = pnum(gp); return v == null || g == null || v <= g; };
  const choc = USES.get(28650).u;
  const vis = choc.x.filter((r) => { const it = items.get(r[0]); return it && it.name && released(it.patch); }).length;
  const { doc } = await boot("#item=28650");
  const f = usesFold(doc, "#dUses");
  push("⑥ 兌換店目錄全都沒收時不截 30 筆、也不叫人去目錄搜（會撲空）、地點不給目錄連結（戀人巧克力2021）",
    vis > 30 && f && f.querySelectorAll(".use-cell").length === vis && !/到 NPC 商店目錄搜/.test(f.textContent) &&
    !f.querySelector('a.use-link[href^="../npc-shops/"]') && /瓦倫提昂家的女僕（格里達尼亞舊街）/.test(f.textContent),
    f ? `${f.querySelectorAll(".use-cell").length}／${vis} 筆` : "沒有用途區");
}

// ── 報告 ──
let fail = 0;
for (const [n, ok, d] of results) {
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${n}${d ? `（${d}）` : ""}`);
}
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
