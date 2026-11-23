// build-item-uses.mjs — 產生 data/item-uses/（物品 → 「會用掉它的地方」分片層）
//
// 回答的問題：「背包裡這個東西還有沒有用、能不能丟？」
// 市場頁原本只答得出「是不是配方材料」，而有 2,354 種物品不在任何配方裡、卻是 NPC 兌換的成本
// （巧手紫票、詩學神典石、狩獵任務的戰利品、白銀陸行鳥的羽毛…），彈窗照樣寫「無已知用途」。
// 這一層把站內已有的「消耗它」的資料反過來索引：
//
//   x  NPC 兌換的成本     data/npc-shops/（只收地圖上有 NPC、有台服名的店；與 NPC 商店目錄同一份）
//   q  任務交付           data/quests/ 細節分片的 t（Quest 腳本 RITEMn 的參數；**沒有數量欄**）
//   l  製作理符交付       data/craft-leves.json 的 turnIn
//   g  軍需品調達         data/gc-supply.json（依職業列「可能的交納品」，不是今天輪到的那組）
//   w  部隊工房建造素材   data/fc-workshop.json
//   c  可當收藏品交納     data/collectable-items.json（Item.IsCollectable；**換哪種票不寫**——
//                         票券身分要站主遊戲內確認，第三輪路線圖 §7-8）
//   cur 這件本身是有專頁的貨幣 → 連過去，不在這裡展開上千筆兌換（變現排行 49 種＋金碟幣／金碟聲譽）
//
// 配方用途（usedInByItem）市場頁本來就有，不收在這裡。
// **沒收的**：分解、精選、專家交納（資格規則不在資料裡）、雇員、無人島、園藝配種——頁面要講出來。
//
// 分片：與 data/item-sources/ 相同，片號 = itemId >> 10，前端由 id 直接算出要抓哪一片。
// 只寫有資料的片；前端查到不存在的片就當成空的。
//
// 執行（repo 根目錄）：
//   node scripts/build-item-uses.mjs            # dry-run，印統計
//   node scripts/build-item-uses.mjs --apply    # 寫入 data/item-uses/
// 上游任一份重建後要重跑（npc-shops、quests、craft-leves、gc-supply、fc-workshop、collectable-items、currency-shop）。

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTw, isTranslated } from "./lib/tw-text.mjs";
import { loadShops } from "./lib/shops.mjs";
import { loadCollectionOwners, ownField } from "./lib/collection-owners.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OUT = join(DATA, "item-uses");
const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const SHARD_BITS = 10;                 // 必須與 tools/market/market.js 的 USES_SHARD_BITS 一致
const shardOf = (id) => id >> SHARD_BITS;
const MAX_PLACES = 3;                  // 同一筆兌換在幾個 NPC 那裡都有時，列前 3 處＋其餘數量

const rd = async (p) => JSON.parse(await readFile(join(DATA, p), "utf8"));

const items = new Map((await rd("items.json")).data.map((x) => [x.id, x]));
const twItem = (id) => { const it = items.get(id); return !!(it && it.name && isTw(it.name)); };

const uses = new Map();                // itemId → { x, q, l, g, w, c, cur }
const U = (id) => { if (!uses.has(id)) uses.set(id, {}); return uses.get(id); };
const push = (id, k, v) => { const u = U(id); (u[k] = u[k] || []).push(v); };
const stat = {};
const bump = (k, n = 1) => { stat[k] = (stat[k] || 0) + n; };

/* ── cur：有專頁的貨幣 ── */
const CS = await rd("currency-shop.json");
const curLink = new Map();             // 貨幣 itemId → ["gc", 頁面 ?c= 的值] / ["gs", "mgp"|"reputation"]
for (const c of CS.data) for (const id of c.ids || [c.id]) curLink.set(id, ["gc", c.id]);
curLink.set(29, ["gs", "mgp"]);
curLink.set(41629, ["gs", "reputation"]);
for (const [id, link] of curLink) { U(id).cur = link; bump("cur"); }

/* ── x：NPC 兌換的成本 ──
   2026-11-23b 起改吃完整商店表（scripts/lib/shops.mjs），不再只吃 NPC 商店目錄：目錄會把「客戶端沒有店名」的店
   整間略過（360 間），成就幣（喬納森）、庫洛獎狀、未知的魔導組件…的兌換全在裡面——有 61 件收藏品只在這些店換得到。
   這裡只要求 **NPC 有台服名且有座標**（鐵則：不落英文、不編地名）。每一處地點另標「NPC 商店目錄裡有沒有這位 NPC
   收這件」：有才給連結，沒有就只印字（點過去是空的，比不連更糟）。 */
const owner = await loadCollectionOwners({ root: ROOT, offline });
{
  const S = await loadShops({ root: ROOT, offline });
  // 目錄裡「這張圖的這位 NPC 收這件當代價」的集合，用來標地點可不可以連
  const inCatalog = new Set();
  for (const m of (await rd("npc-shops/_index.json")).maps) {
    const sh = await rd(`npc-shops/${m.mapId}.json`);
    for (const n of sh.npcs) for (const s of n.s) for (const t of s.tr) for (const [c] of t.c) inCatalog.add(`${sh.mapId}|${n.n}|${c}`);
  }
  // 同一筆兌換（換到什麼×幾個、這件要付幾個、另外還要付什麼）常常在好幾個 NPC 那裡都有，合併成一筆、地點另列
  const agg = new Map();               // `${cost}|${give}|${gAmt}|${amt}|${others}` → { cost, give, gAmt, amt, others, places: Map }
  for (const shop of S.shops) {
    // NPC 名與地名用寬鬆版 isTranslated()（只擋假名與內部佔位列）：台服真的有拉丁字母的官方名，
    // 例如奧密克戎族的兌換商「N-0598」——用 isTw() 會把它連同 12 筆兌換一起丟掉（第一版就是這樣）
    const npcs = shop.npcs.filter((n) => n.name && isTranslated(n.name) && n.at && n.at.mapName && isTranslated(n.at.mapName) && n.at.mapId != null);
    if (!npcs.length) { bump("x 店沒有可用的 NPC"); continue; }
    for (const t of shop.trades) {
      const cost = t.cost.filter((c) => c && c.itemId && c.amount);
      for (const c of cost) {
        if (c.itemId === 1 || curLink.has(c.itemId)) continue;   // 金幣不算「用途」；有專頁的貨幣連過去
        const others = cost.filter((o) => o !== c).map((o) => [o.itemId, o.amount]);
        for (const g of t.gives) {
          if (!g || !g.itemId) continue;
          const gAmt = g.amount || 1;
          const key = `${c.itemId}|${g.itemId}|${gAmt}|${c.amount}|${others.map((o) => o.join("x")).join(",")}`;
          let a = agg.get(key);
          if (!a) { a = { costId: c.itemId, give: g.itemId, gAmt, amt: c.amount, others, places: new Map() }; agg.set(key, a); }
          for (const n of npcs) {
            const pk = n.name + "@" + n.at.mapId;
            if (!a.places.has(pk)) a.places.set(pk, [n.name, n.at.mapId, n.at.mapName, inCatalog.has(`${n.at.mapId}|${n.name}|${c.itemId}`) ? 1 : 0]);
          }
        }
      }
    }
  }
  let linked = 0, unlinked = 0;
  for (const a of agg.values()) {
    if (!twItem(a.give) || !twItem(a.costId) || a.others.some(([id]) => id !== 1 && !twItem(id))) { bump("x 無台服名略過"); continue; }
    // 目錄連得到的地點排前面，再依 mapId／NPC 名（固定順序）
    const pl = [...a.places.values()].sort((p, q) => q[3] - p[3] || p[1] - q[1] || (p[0] < q[0] ? -1 : 1));
    for (const p of pl.slice(0, MAX_PLACES)) p[3] ? linked++ : unlinked++;
    const own = owner.get(a.give);
    // [換到的物品 id, 換到幾個, 這件要付幾個, 另外要付的 [[id, 數量]…]（沒有就 0）,
    //  地點 [[NPC, mapId, 地圖名, 目錄有沒有(1/0)]…], 其餘地點數, 收藏對應 own（不是收藏品就 0）]
    push(a.costId, "x", [a.give, a.gAmt, a.amt, a.others.length ? a.others : 0, pl.slice(0, MAX_PLACES), Math.max(0, pl.length - MAX_PLACES), own ? ownField(own) : 0]);
    bump("x 筆");
    if (own) bump("x 收藏品筆");
  }
  bump("x 地點連得到目錄", linked);
  bump("x 地點目錄沒收（只印字）", unlinked);
}

/* ── q：任務交付 ── */
{
  const qi = await rd("quests/_index.json");
  const qName = new Map(qi.data.map((r) => [r[0], r[1]]));
  for (const f of (await readdir(join(DATA, "quests"))).filter((f) => /^\d+\.json$/.test(f))) {
    const sh = await rd(`quests/${f}`);
    for (const [qid, d] of Object.entries(sh.data)) for (const [itemId] of d.t || []) {
      const name = qName.get(Number(qid));
      if (!name) { bump("q 任務不在索引略過"); continue; }
      push(itemId, "q", [Number(qid), name]);
      bump("q 筆");
    }
  }
}

/* ── l：製作理符 ── */
for (const lv of (await rd("craft-leves.json")).data) {
  for (const t of lv.turnIn || []) { push(t.itemId, "l", [lv.id, lv.name, lv.job, lv.level, t.count]); bump("l 筆"); }
}

/* ── g：軍需品調達（jobIdx＝data.jobs 的位置，貨幣變現排行的 ?m=earn&job= 吃這個）── */
(await rd("gc-supply.json")).data.jobs.forEach((j, ji) => {
  for (const it of j.items) { push(it.id, "g", [ji, j.name, it.count, it.seals]); bump("g 筆"); }
});

/* ── w：部隊工房 ── */
for (const p of (await rd("fc-workshop.json")).data) {
  const tot = new Map();
  for (const ph of p.phases) for (const m of ph.mats) tot.set(m.itemId, (tot.get(m.itemId) || 0) + m.qty);
  for (const [itemId, qty] of tot) { push(itemId, "w", [p.itemId, p.name, p.type || null, qty]); bump("w 筆"); }
}

/* ── c：收藏品 ── */
for (const id of (await rd("collectable-items.json")).data) { U(id).c = 1; bump("c"); }

/* ── 排序（固定順序，不依會變的值，§3.19）── */
for (const u of uses.values()) {
  if (u.x) u.x.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  if (u.q) { const seen = new Set(); u.q = u.q.filter((r) => !seen.has(r[0]) && seen.add(r[0])).sort((a, b) => a[0] - b[0]); }
  if (u.l) u.l.sort((a, b) => a[3] - b[3] || a[0] - b[0]);
  if (u.w) u.w.sort((a, b) => a[0] - b[0]);
}
// 只留台服有名字的物品（前端另套版本閘門）；金幣（id 1）不收——它的「用途」是全部
uses.delete(1);
for (const id of [...uses.keys()]) if (!twItem(id)) { uses.delete(id); bump("物品無台服名略過"); }

/* ── 分片 ── */
const shards = new Map();
for (const [id, u] of uses) {
  const s = shardOf(id);
  if (!shards.has(s)) shards.set(s, {});
  shards.get(s)[id] = u;
}
const files = [];
let raw = 0, gz = 0, maxGz = 0;
for (const [s, obj] of [...shards].sort((a, b) => a[0] - b[0])) {
  const json = JSON.stringify({ schema: "item-uses", shard: s, data: obj });
  const g = gzipSync(json).length;
  raw += json.length; gz += g; maxGz = Math.max(maxGz, g);
  files.push({ shard: s, name: `${s}.json`, json, count: Object.keys(obj).length, bytes: json.length });
}

// ── 報告 ──
const cnt = {};
for (const u of uses.values()) for (const k of Object.keys(u)) cnt[k] = (cnt[k] || 0) + 1;
console.log(`有用途紀錄的物品 ${uses.size} 件；各類（件數）：` +
  Object.entries({ cur: "有專頁的貨幣", x: "NPC 兌換", q: "任務交付", l: "製作理符", g: "軍需品", w: "部隊工房", c: "收藏品" })
    .map(([k, t]) => `${t} ${cnt[k] || 0}`).join("、"));
console.log(`明細：${Object.entries(stat).map(([k, v]) => `${k} ${v}`).join("、")}`);
const topX = [...uses].filter(([, u]) => u.x).sort((a, b) => b[1].x.length - a[1].x.length).slice(0, 6);
console.log(`兌換筆數最多：${topX.map(([id, u]) => `${items.get(id).name}(${u.x.length})`).join("、")}`);
console.log(`${files.length} 片，合計 ${(raw / 1024).toFixed(0)}KB（gzip ${(gz / 1024).toFixed(0)}KB，最大一片 gzip ${(maxGz / 1024).toFixed(1)}KB）`);
if (maxGz > 40 * 1024) { console.error(`✗ 有一片 gzip 超過 40KB——市場頁開一個彈窗就要載它，太重。調小 SHARD_BITS 或收斂 x 的筆數`); process.exit(1); }
for (const k of ["x", "q", "l", "g", "w", "c"]) if (!cnt[k]) { console.error(`✗ ${k} 一筆都沒有——上游資料格式變了？`); process.exit(1); }

if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); process.exit(0); }

if (existsSync(OUT)) for (const f of await readdir(OUT)) if (f.endsWith(".json")) await rm(join(OUT, f));
await mkdir(OUT, { recursive: true });
for (const f of files) await writeFile(join(OUT, f.name), f.json);
await writeFile(join(OUT, "_index.json"), JSON.stringify({
  schema: "item-uses-index",
  updated: new Date().toISOString().slice(0, 10),
  source: "data/npc-shops ＋ data/quests ＋ data/craft-leves.json ＋ data/gc-supply.json ＋ data/fc-workshop.json ＋ data/collectable-items.json ＋ data/currency-shop.json（scripts/build-item-uses.mjs）",
  note: `片號 = itemId >> ${SHARD_BITS}；檔名 <片號>.json，只寫有資料的片。x=NPC 兌換的成本 [換到的 id, 換到幾個, 付幾個, 另付 [[id,數量]]|0, 地點 [[NPC, mapId, 地圖名, NPC 商店目錄有沒有(1/0)]], 其餘地點數, 收藏對應 {c,label,path,sk,k}|0]、q=任務交付 [任務 id, 名稱]、l=製作理符 [理符 id, 名稱, 職業, 等級, 數量]、g=軍需品 [職業序, 職業, 數量, 軍票]、w=部隊工房 [成品 id, 成品名, 類型, 總數]、c=可當收藏品交納、cur=有專頁的貨幣 ["gc", ?c=]／["gs", mgp|reputation]。配方用途不在這裡（市場頁自己有）。`,
  shardBits: SHARD_BITS,
  count: uses.size,
  shards: files.map((f) => ({ shard: f.shard, count: f.count, bytes: f.bytes })),
}));
console.log(`\n✓ data/item-uses/（${files.length} 片＋_index.json）`);
console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs（新目錄要先在 _meta.json 登記一筆）");
