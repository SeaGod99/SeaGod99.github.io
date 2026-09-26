// build-relic-note.mjs — 產生 data/relic-note.json（文書的討伐目標）
//
// ── 這份涵蓋到哪裡（先講清楚，免得日後以為是漏掉的） ───────────────────
// 遺產武器那條線的**階段鏈不在遊戲資料表裡**。實測：
//   `Relic` 整張表只有一個 `Icon` 欄、`RelicItem` 連欄位都沒有（兩張都是空殼），
//   `EventItem.Quest` 對九本書全是 0。
// 也就是說「哪把武器要幾本書、書從哪個 NPC 拿、下一階段要什麼」查不到依據，
// **一律不寫**。查得到的只有 `RelicNote`——九本書各自的 16 個討伐目標，
// 而那正好是整條線裡最花時間、最需要跑圖的一段。
//
// ── 資料來源 ────────────────────────────────────────────────────────
//   XIVAPI v2 RelicNote          九本書（EventItem）＋四類目標
//   XIVAPI v2 MonsterNoteTarget  目標列 → BNpcName ＋ 出沒地（Zone／Location 各 3 組）
//   XIVAPI v2 Leve               理符等級、發布地、接取地
//   Teamcraft fates.json         FATE 座標（XIVAPI 的 `Fate.Location` **不是 Level 的 row id**，
//                                實測拿 4258340 去取 Level 直接 404，別走那條路）
//   data/monsters.json           BNpcName **對 `baseId` 不是 `id`**（§4.14）→ 拿座標
//   out_data/tw-locales.msgpack  台服怪名／FATE 名／理符名／道具名
//   out_data/places.msgpack      twPlaces 台服地名（**不可用 OpenCC 簡轉繁**）
//
// ── 四類目標 ────────────────────────────────────────────────────────
//   MonsterNoteTargetCommon ×10  一般怪，各 `MonsterCount` 隻
//   MonsterNoteTargetNM      ×3  首領級目標（實測是主宰者加爾梵斯這類，不是 FATE 王）
//   Fate                     ×3
//   Leve                     ×3
// `RelicNoteCategory` 有 5 列（0 ＋ 4 類），與上面對得起來，但那張表**沒有任何欄位**，
// 類別名只能由我們自己給。
//
// 執行（repo 根目錄）：
//   node scripts/build-relic-note.mjs            # dry-run，印覆蓋率
//   node scripts/build-relic-note.mjs --apply    # 寫入
//   node scripts/build-relic-note.mjs --offline  # 只用快取

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { xiv } from "./lib/xivapi.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache");

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const TC_FATES = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/fates.json";

async function fateCoords() {
  const cache = join(CACHE, "tc-fates.json");
  if (offline) return JSON.parse(await readFile(cache, "utf8"));
  try {
    const res = await fetch(TC_FATES);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    await writeFile(cache, JSON.stringify(j));
    return j;
  } catch (e) {
    console.log(`  ⚠ Teamcraft fates.json 抓不到（${e.message}），改用快取`);
    return JSON.parse(await readFile(cache, "utf8"));
  }
}

async function main() {
  const notes = await xiv.sheet(
    "RelicNote",
    "EventItem@as(raw),MonsterNoteTargetCommon@as(raw),MonsterNoteTargetNM@as(raw),MonsterCount,Fate@as(raw),Leve@as(raw),PlaceNameFate@as(raw)",
    { limit: 500, cache: "out_data/cache/relic-note.json", offline, label: "  RelicNote：" }
  );
  const targets = await xiv.sheet(
    "MonsterNoteTarget",
    "BNpcName@as(raw),PlaceNameZone@as(raw),PlaceNameLocation@as(raw)",
    { limit: 500, cache: "out_data/cache/monster-note-target2.json", offline, label: "  Target：" }
  );
  const leves = await xiv.sheet(
    "Leve",
    "ClassJobLevel,PlaceNameIssued@as(raw),PlaceNameStart@as(raw)",
    { limit: 500, cache: "out_data/cache/leve-relic.json", offline, label: "  Leve：" }
  );
  const fatesXiv = await xiv.sheet(
    "Fate",
    "ClassJobLevel",
    { limit: 500, cache: "out_data/cache/fate-lv.json", offline, label: "  Fate：" }
  );

  const tw = await loadTwLocales();
  const twPlaces = decode(await readFile(join(ROOT, "out_data", "places.msgpack"))).twPlaces;
  const monsters = JSON.parse(await readFile(join(DATA, "monsters.json"), "utf8")).data;
  const maps = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8")).data;
  const tcFates = await fateCoords();

  /* 首領的 `PlaceNameLocation` 就是副本名（實測 20/20 與 `dungeons.json` 的 `name` 逐字相同）。
     ⚠ 但有 3 個是**同名兩筆**（一般／高難度），而資料分不出首領在哪一個
     （`dungeons.json` 的 `bosses` 是空的、`MonsterNoteTarget` 只給地名）。
     副本圖鑑的深連結是 `?id=duty:<名稱>`，名字撞了就會連到錯的那本——
     所以**只對唯一解的給連結**，同名的留純文字。寧可少一個連結，不要送人去打錯副本。 */
  const dungeons = JSON.parse(await readFile(join(DATA, "dungeons.json"), "utf8")).data;
  const dutyCount = {};
  for (const d of dungeons) dutyCount[d.name] = (dutyCount[d.name] || 0) + 1;

  const tById = new Map(targets.map((t) => [t.id, t.f]));
  const leveById = new Map(leves.map((l) => [l.id, l.f]));
  const fateLv = new Map(fatesXiv.map((f) => [f.id, f.f.ClassJobLevel]));
  const mapById = new Map(maps.map((m) => [m.id, m]));
  // BNpcName → monsters.json：**用 baseId**（§4.14：monsters.id 是逐隻實例，baseId 才是種類）
  const byBase = new Map();
  for (const m of monsters) if (m.baseId != null && !byBase.has(m.baseId)) byBase.set(m.baseId, m);

  const place = (id) => (id ? twName(twPlaces, id) : null);
  const stat = { mob: 0, mobAll: 0, mobZone: 0, mobCoord: 0, nm: 0, nmAll: 0, nmDuty: 0, nmDutyDup: 0,
                 fate: 0, fateAll: 0, fateCoord: 0, leve: 0, leveAll: 0, miss: [] };

  function mkMob(targetId, count) {
    const f = tById.get(targetId);
    if (!f) return null;
    const baseId = f["BNpcName@as(raw)"];
    const name = twName(tw.mobs, baseId);
    if (!isTw(name)) { stat.miss.push("mob:" + baseId); return null; }  // 無台服名＝不顯示（鐵則）

    // 出沒地：Zone／Location 是 3 組一列（同一種怪可能出現在多個區域）
    const zones = [];
    const zs = f["PlaceNameZone@as(raw)"] || [], ls = f["PlaceNameLocation@as(raw)"] || [];
    for (let i = 0; i < Math.max(zs.length, ls.length); i++) {
      const zone = place(zs[i]);
      if (!zone) continue;
      zones.push({ zone, spot: place(ls[i]) || null });
    }

    // 座標是加分項：monsters.json 只有部分怪有 positions，沒有就只給地名（不猜）
    const mon = byBase.get(baseId);
    let at = null;
    const p = mon && mon.positions && mon.positions[0];
    if (p && mapById.has(p.mapId)) {
      at = { mapId: p.mapId, mapName: mapById.get(p.mapId).name, x: p.x, y: p.y };
    }
    return { baseId, name, ...(count ? { count } : {}), zones, ...(at ? { at } : {}) };
  }

  const books = [];
  for (const n of notes) {
    const ev = n.f["EventItem@as(raw)"];
    if (!ev) continue;                                   // 第 0 列是空殼
    const bookName = twName(tw.eventItems, ev);
    if (!isTw(bookName)) { stat.miss.push("book:" + ev); continue; }

    const counts = n.f.MonsterCount || [];
    const mobs = [];
    (n.f["MonsterNoteTargetCommon@as(raw)"] || []).forEach((tid, i) => {
      if (!tid) return;
      stat.mobAll++;
      const m = mkMob(tid, counts[i] || 1);
      if (!m) return;
      stat.mob++;
      if (m.zones.length) stat.mobZone++;
      if (m.at) stat.mobCoord++;
      mobs.push(m);
    });

    const nms = [];
    for (const tid of n.f["MonsterNoteTargetNM@as(raw)"] || []) {
      if (!tid) continue;
      stat.nmAll++;
      const m = mkMob(tid, 0);
      if (!m) continue;
      stat.nm++;
      const spot = m.zones[0] && m.zones[0].spot;
      if (spot && dutyCount[spot] === 1) { m.duty = spot; stat.nmDuty++; }
      else if (spot && dutyCount[spot] > 1) stat.nmDutyDup++;
      nms.push(m);
    }

    const fates = [];
    const pnf = n.f["PlaceNameFate@as(raw)"] || [];
    (n.f["Fate@as(raw)"] || []).forEach((fid, i) => {
      if (!fid) return;
      stat.fateAll++;
      const name = twName(tw.fates, fid);
      if (!isTw(name)) { stat.miss.push("fate:" + fid); return; }
      stat.fate++;
      const tc = tcFates[String(fid)];
      const pos = tc && tc.position;
      let at = null;
      if (pos && mapById.has(pos.map)) {
        at = { mapId: pos.map, mapName: mapById.get(pos.map).name, x: pos.x, y: pos.y };
        stat.fateCoord++;
      }
      fates.push({ id: fid, name, lv: fateLv.get(fid) || null, zone: place(pnf[i]) || null, ...(at ? { at } : {}) });
    });

    const lvs = [];
    for (const lid of n.f["Leve@as(raw)"] || []) {
      if (!lid) continue;
      stat.leveAll++;
      const name = twName(tw.leves, lid);
      if (!isTw(name)) { stat.miss.push("leve:" + lid); continue; }
      stat.leve++;
      const lf = leveById.get(lid) || {};
      lvs.push({
        id: lid, name, lv: lf.ClassJobLevel || null,
        issued: place(lf["PlaceNameIssued@as(raw)"]) || null,
        zone: place(lf["PlaceNameStart@as(raw)"]) || null,
      });
    }

    books.push({ id: n.id, eventItem: ev, name: bookName, mobs, nms, fates, leves: lvs });
  }

  const pct = (a, b) => `${a}/${b}（${b ? ((a / b) * 100).toFixed(0) : 0}%）`;
  console.log(`\n文書 ${books.length} 本`);
  console.log(`  一般怪   ${pct(stat.mob, stat.mobAll)}　有出沒地 ${pct(stat.mobZone, stat.mob)}　有座標 ${pct(stat.mobCoord, stat.mob)}`);
  console.log(`  首領     ${pct(stat.nm, stat.nmAll)}　對得到副本圖鑑 ${pct(stat.nmDuty, stat.nm)}（同名兩筆而不給連結的 ${stat.nmDutyDup} 個）`);
  console.log(`  FATE     ${pct(stat.fate, stat.fateAll)}　有座標 ${pct(stat.fateCoord, stat.fate)}`);
  console.log(`  理符     ${pct(stat.leve, stat.leveAll)}`);
  if (stat.miss.length) console.log(`  無台服名而略過：${[...new Set(stat.miss)].join(", ")}`);
  console.log("\n各本：");
  for (const b of books) {
    console.log(`  ${b.name.padEnd(16)} 怪 ${b.mobs.length}／首領 ${b.nms.length}／FATE ${b.fates.length}／理符 ${b.leves.length}`);
  }
  console.log(`\n樣本（${books[0].name}）：`);
  console.log(`  怪　　 ${books[0].mobs.slice(0, 2).map((m) => `${m.name}×${m.count}＠${m.zones[0] ? m.zones[0].zone : "?"}`).join("、")}`);
  console.log(`  首領　 ${books[0].nms.map((m) => m.name).join("、")}`);
  console.log(`  FATE　 ${books[0].fates.map((f) => `${f.name}(Lv${f.lv})`).join("、")}`);
  console.log(`  理符　 ${books[0].leves.map((l) => `${l.name}(Lv${l.lv}＠${l.issued})`).join("、")}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "relic-note",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 RelicNote／MonsterNoteTarget／Leve／Fate ＋ Teamcraft fates.json（座標）＋ monsters.json(baseId) ＋ tw-locales ＋ places.msgpack(twPlaces)",
    note: "只涵蓋「文書」這一階段。遺產武器的階段鏈不在遊戲資料表裡（Relic／RelicItem 兩張表是空殼、EventItem.Quest 全是 0），所以不寫「哪把武器要幾本書」「書從哪拿」「下一階段要什麼」。",
    count: books.length,
    data: books,
  };
  await writeFile(join(DATA, "relic-note.json"), JSON.stringify(db));
  console.log(`\n✓ data/relic-note.json（${books.length} 本）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
