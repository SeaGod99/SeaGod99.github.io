// build-quests.mjs — 任務查詢（/tools/quest-finder/）的資料層：data/quests/
//
// 回答的問題：「這個任務在哪接、幾級、前面卡著什麼、給什麼？」——用台服任務名查。
// 第二輪路線圖 `quest-finder`。
//
// 輸出兩層（同 item-sources 的思路：先載小的、點開才載細節）：
//   data/quests/_index.json   搜尋用：[id, 名稱, 等級, 資料片序, 手帳章節序, 區域序, 旗標]（5,132 筆）
//   data/quests/<資料片>.json  細節：接取 NPC＋座標、前置任務、物品報酬、金幣
//
// 資料來源（全部是台服官方字串，查不到就留空、前端整行不顯示）：
//   任務名     out_data/tw-quests.json（**沒有台服名的任務整筆不收**＝台服未開放）
//   等級／章節／區域／前置／接取 NPC／接取點   XIVAPI v2 Quest（快取 out_data/cache/quests-v2.json，
//              build-system-unlocks.mjs 建的）＋ Level（快取 out_data/cache/levels-all.json）
//   報酬       XIVAPI v2 Quest 的 Reward／OptionalItemReward（快取 out_data/cache/quest-finder-rewards.json）。
//              **只收 sheet 是 Item 的**——Reward 是多型欄位，可能指向別張表，照 id 去查 items.json
//              會對到毫不相干的物品（同 §4.10 的坑）。物品名一律取 data/items.json 的台服名。
//   章節名     tw-locales 的 journalGenre
//   區域名     out_data/places.msgpack 的 twPlaces（Quest.PlaceName）
//   NPC 名     data/npcs.json → out_data/npcs.msgpack 的 twNpcs
//   座標       data/maps.json（Level 的 X/Z 換算，公式同 build-system-unlocks.mjs）
//   資料片名   data/dungeons.json 的 expansionId → expansion（站內既有的官方名）
//
// 同名任務 70 組（各城市各一份之類的）：**一律以 id 為鍵**，前端列表會把區域印出來讓人分得開。
//
// 執行（repo 根目錄）：
//   node scripts/build-quests.mjs             # dry-run，印覆蓋率與大小
//   node scripts/build-quests.mjs --apply     # 寫入 data/quests/
//   node scripts/build-quests.mjs --offline   # 報酬快取不在就中止，不連網

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";
import { xiv } from "./lib/xivapi.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw, isTranslated } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "out_data");
const CACHE = join(OUT, "cache");
const DEST = join(DATA, "quests");
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const offline = argv.includes("--offline");
const today = new Date().toISOString().slice(0, 10);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

async function main() {
  const twQuests = readJson(join(OUT, "tw-quests.json"));
  const qcache = join(CACHE, "quests-v2.json");
  if (!existsSync(qcache)) throw new Error(`找不到 ${qcache}——先跑 node scripts/build-system-unlocks.mjs（它會建這份快取）`);
  const quests = readJson(qcache);
  const levels = new Map(readJson(join(CACHE, "levels-all.json")).map((r) => [r.id, r.f]));
  const rewardRows = await xiv.sheet(
    "Quest",
    "Reward[].Name,ItemCountReward,OptionalItemReward[].Name,OptionalItemCountReward,GilReward",
    { cache: join(CACHE, "quest-finder-rewards.json"), offline, label: "Quest 報酬：" },
  );
  const rewardById = new Map(rewardRows.map((r) => [r.id, r.f]));

  const items = new Map(readJson(join(DATA, "items.json")).data.map((x) => [x.id, x]));
  const npcs = new Map(readJson(join(DATA, "npcs.json")).data.map((n) => [n.id, n]));
  const npcMsg = decode(readFileSync(join(OUT, "npcs.msgpack")));
  const places = decode(readFileSync(join(OUT, "places.msgpack")));
  const maps = new Map(readJson(join(DATA, "maps.json")).data.map((m) => [m.id, m]));
  const tw = await loadTwLocales();
  const msqIds = new Set(readJson(join(DATA, "msq.json")).data.map((x) => x.id));
  const expName = new Map();
  for (const d of readJson(join(DATA, "dungeons.json")).data) if (d.expansion && d.expansionId != null) expName.set(d.expansionId, d.expansion);

  const npcName = (id) => {
    if (!id) return null;
    const n = npcs.get(id)?.name || twName(npcMsg.twNpcs, id);
    return n && isTw(n) ? n : null;
  };
  const itemName = (id) => {
    const n = items.get(id)?.name;
    return n && isTranslated(n) && n !== "Gil" ? n : null;
  };
  function coordsOf(levelId) {
    const lv = levels.get(levelId);
    if (!lv) return null;
    const m = maps.get(lv["Map@as(raw)"]);
    if (!m) return null;                                    // 副本／室內的實例地圖：沒有底圖，算不出座標
    const c = (m.sizeFactor ?? 100) / 100;
    const conv = (w, o) => Math.round(((41 / c) * ((w + o) * c + 1024) / 2048 + 1) * 10) / 10;
    return { mapId: m.id, mapName: m.name, x: conv(lv.X, m.offsetX ?? 0), y: conv(lv.Z, m.offsetY ?? 0) };
  }

  // 字串表（索引裡存序號，前端一次展開）
  const table = () => { const list = [], pos = new Map(); return { list, idx(s) { if (s == null) return -1; if (!pos.has(s)) { pos.set(s, list.length); list.push(s); } return pos.get(s); } }; };
  const genres = table(), placesT = table(), exps = [];
  const expIdx = new Map();

  const cover = { total: 0, lv: 0, place: 0, npc: 0, at: 0, prev: 0, rwQuests: 0, rwItems: 0, rwItemsTw: 0, otherSheet: 0, gil: 0 };
  const index = [];
  const shards = new Map();      // 資料片序 → { npcs: table, maps: table, data: {} }
  const dupNames = new Map();

  for (const q of quests) {
    const name = twQuests[q.id]?.tw;
    if (!name || !isTw(name)) continue;
    const f = q.f;
    cover.total++;
    dupNames.set(name, (dupNames.get(name) || 0) + 1);

    const lv = f.ClassJobLevel?.[0] || null;
    if (lv) cover.lv++;
    const ex = f["Expansion@as(raw)"] ?? 0;
    if (!expIdx.has(ex)) { expIdx.set(ex, exps.length); exps.push({ id: ex, name: expName.get(ex) || null, n: 0 }); }
    const ei = expIdx.get(ex);
    exps[ei].n++;
    const genre = twName(tw.journalGenre, f["JournalGenre@as(raw)"]);
    const place = twName(places.twPlaces, f["PlaceName@as(raw)"]);
    if (place) cover.place++;
    const flags = msqIds.has(q.id) ? 1 : 0;
    index.push([q.id, name, lv || 0, ei, genres.idx(genre || null), placesT.idx(place || null), flags]);

    // ── 細節 ──
    if (!shards.has(ei)) shards.set(ei, { npcs: table(), maps: table(), data: {} });
    const sh = shards.get(ei);
    const det = {};
    const issuer = npcName(f["IssuerStart@as(raw)"]);
    if (issuer) { cover.npc++; det.n = sh.npcs.idx(issuer); }
    const at = issuer ? coordsOf(f["IssuerLocation@as(raw)"]) : null;    // 沒有 NPC 名就不給座標（只剩一個點，說不出是誰）
    if (at) { cover.at++; det.a = [sh.maps.idx(at.mapId + "|" + at.mapName), at.x, at.y]; }
    const prev = (f["PreviousQuest@as(raw)"] || []).filter((p) => p && twQuests[p]?.tw && isTw(twQuests[p].tw));   // 與收錄條件同一道守門，否則連結點了是空的
    if (prev.length) { cover.prev++; det.p = prev; }
    const rw = rewardById.get(q.id);
    if (rw) {
      const take = (refs, counts) => {
        const out = [];
        (refs || []).forEach((r, i) => {
          if (!r || !r.row_id) return;
          if (r.sheet !== "Item") { cover.otherSheet++; return; }
          cover.rwItems++;
          const nm = itemName(r.row_id);
          if (!nm) return;
          cover.rwItemsTw++;
          const it = items.get(r.row_id);
          out.push([r.row_id, nm, (counts && counts[i]) || 1, it && it.marketable ? 1 : 0]);
        });
        return out;
      };
      const r1 = take(rw.Reward, rw.ItemCountReward);
      const r2 = take(rw.OptionalItemReward, rw.OptionalItemCountReward);
      if (r1.length) det.r = r1;
      if (r2.length) det.o = r2;
      if (r1.length || r2.length) cover.rwQuests++;
      if (rw.GilReward > 0) { det.g = rw.GilReward; cover.gil++; }
    }
    if (Object.keys(det).length) sh.data[q.id] = det;
  }

  // ── 閘門 ──
  const fatal = [];
  if (cover.total < 5000) fatal.push(`有台服名的任務只有 ${cover.total} 筆（預期 5,000 以上），tw-quests 或快取可能壞了`);
  const noExp = exps.filter((e) => !e.name);
  if (noExp.length) fatal.push(`資料片 ${noExp.map((e) => e.id).join(",")} 在 dungeons.json 查不到名稱`);
  for (const s of [...genres.list, ...placesT.list]) if (s != null && !isTw(s)) fatal.push(`字串沒過台服守門：${s}`);

  const pct = (n) => (n / cover.total * 100).toFixed(1) + "%";
  console.log(`\n台服任務 ${cover.total} 筆（Quest 全表 ${quests.length}）`);
  console.log(`  等級        ${cover.lv}（${pct(cover.lv)}）`);
  console.log(`  區域        ${cover.place}（${pct(cover.place)}）`);
  console.log(`  接取 NPC    ${cover.npc}（${pct(cover.npc)}）`);
  console.log(`  NPC＋座標   ${cover.at}（${pct(cover.at)}）——沒有的整行不顯示`);
  console.log(`  前置任務    ${cover.prev}（${pct(cover.prev)}）`);
  console.log(`  物品報酬    ${cover.rwQuests} 個任務；物品 ${cover.rwItems} 件中 ${cover.rwItemsTw} 件有台服名（${(cover.rwItemsTw / cover.rwItems * 100).toFixed(1)}%）；非 Item 表的報酬 ${cover.otherSheet} 筆略過`);
  console.log(`  金幣報酬    ${cover.gil}`);
  console.log(`  同名任務    ${[...dupNames.values()].filter((n) => n > 1).length} 組（以 id 為鍵）`);
  console.log(`  資料片      ${exps.map((e) => `${e.name} ${e.n}`).join("、")}`);

  // ── 輸出 ──
  const files = {};
  files["_index.json"] = {
    schema: "quests-index", updated: today,
    source: "out_data/tw-quests.json ＋ XIVAPI v2 Quest／Level ＋ tw-locales journalGenre ＋ places.msgpack；資料片名取自 data/dungeons.json",
    note: "data: [id, 名稱, 等級, 資料片序, 章節序(-1=無), 區域序(-1=無), 旗標(1=主線)]。細節依資料片分片，檔名 = 資料片的 id（exps[].id）。同名任務以 id 區分。",
    count: index.length,
    exps: exps.map((e) => ({ id: e.id, name: e.name, n: e.n })),
    genres: genres.list, places: placesT.list,
    data: index,
  };
  for (const [ei, sh] of shards) {
    files[exps[ei].id + ".json"] = {
      schema: "quests-detail", exp: exps[ei].id,
      note: "data[id]: n=接取 NPC 序、a=[地圖序, x, y]、p=前置任務 id、r=物品報酬、o=可選報酬（[物品 id, 名稱, 數量, 可交易]）、g=金幣。maps 的值是 \"mapId|地圖名\"。",
      npcs: sh.npcs.list, maps: sh.maps.list, data: sh.data,
    };
  }
  let raw = 0, gz = 0;
  for (const [f, v] of Object.entries(files)) {
    const s = JSON.stringify(v);
    raw += s.length; gz += gzipSync(s).length;
    console.log(`  ${f.padEnd(12)} ${(s.length / 1024).toFixed(0).padStart(5)} KB　gzip ${(gzipSync(s).length / 1024).toFixed(0).padStart(4)} KB`);
  }
  console.log(`  合計 ${(raw / 1024).toFixed(0)} KB　gzip ${(gz / 1024).toFixed(0)} KB`);

  if (fatal.length) { console.error("\n✗ 中止："); fatal.forEach((x) => console.error("   " + x)); process.exit(1); }
  if (!apply) { console.log("\ndry-run（加 --apply 寫入 data/quests/）"); return; }
  mkdirSync(DEST, { recursive: true });
  for (const f of readdirSync(DEST)) if (!(f in files)) rmSync(join(DEST, f));
  for (const [f, v] of Object.entries(files)) writeFileSync(join(DEST, f), JSON.stringify(v));
  console.log(`\n已寫入 data/quests/（${Object.keys(files).length} 檔）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
