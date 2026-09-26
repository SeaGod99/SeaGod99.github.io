// build-hunting-log.mjs — 產生 data/hunting-log.json（討伐筆記追蹤頁的資料層）
//
// 討伐筆記＝遊戲內每個職業的「打夠 N 隻某種怪」清單，打完整階有經驗獎勵。
// 站內原本沒有任何一頁回答「我還差哪幾隻、牠在哪」。
//
// 資料來源：
//   XIVAPI v2 MonsterNote        每一條討伐項目（怪的目標列 ×4、各自要打幾隻、獎勵經驗）
//   XIVAPI v2 MonsterNoteTarget  目標列 → BNpcName ＋ 出沒地（PlaceNameZone／Location 各 3 組）
//   data/monsters.json           BNpcName **對 `baseId` 不是 `id`**（§4.14）→ 拿座標
//   out_data/tw-locales.msgpack  tw-mobs 台服怪名（實測 362/362 全中）
//   out_data/places.msgpack      twPlaces 台服地名（**不可用 OpenCC 簡轉繁**）
//   data/equip.json 的 names     職業台服名（ACN→巴術士…）
//
// 實測（2026-09-23）：MonsterNote 600 列（9 職業＋3 大國防聯軍各 50）、被引用的目標列 362，
// BNpcName→baseId 362/362、台服怪名 362/362。座標是加分項（monsters.json 只有 1,424 隻有
// positions），沒有就只顯示地名。
//
// 執行（repo 根目錄）：
//   node scripts/build-hunting-log.mjs            # dry-run，印覆蓋率
//   node scripts/build-hunting-log.mjs --apply    # 寫入
//   node scripts/build-hunting-log.mjs --offline  # 用 out_data/cache 的快取

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache");
const CACHE_FILE = join(CACHE, "monster-note.json");
const V2 = "https://v2.xivapi.com/api/sheet";
const F = (s) => encodeURIComponent(s);

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.json(); };
async function fetchAll(sheet, fields) {
  const rows = []; let after = null;
  for (;;) {
    const d = await getJson(`${V2}/${sheet}?limit=500&fields=${F(fields)}` + (after ? `&after=${after}` : ""));
    if (!d.rows?.length) break;
    rows.push(...d.rows);
    after = d.rows[d.rows.length - 1].row_id;
    if (d.rows.length < 500) break;
  }
  return rows;
}

// MonsterNote 的 row_id 高位＝職業／大國防聯軍；低位＝第幾條（01–50）。
// 職業用 equip.json 的 names 代碼查台服名；大國防聯軍三團的討伐筆記內容不同（各自的怪不同）。
const GROUPS = {
  1: { key: "gladiator", code: "GLA", kind: "class" },
  2: { key: "pugilist", code: "PGL", kind: "class" },
  3: { key: "marauder", code: "MRD", kind: "class" },
  4: { key: "lancer", code: "LNC", kind: "class" },
  5: { key: "archer", code: "ARC", kind: "class" },
  6: { key: "conjurer", code: "CNJ", kind: "class" },
  7: { key: "thaumaturge", code: "THM", kind: "class" },
  26: { key: "arcanist", code: "ACN", kind: "class" },
  29: { key: "rogue", code: "ROG", kind: "class" },
  // 大國防聯軍的討伐筆記：equip.json 沒有這三個代碼，名稱取自 data/system-unlocks.json
  // 的「大國防聯軍」任務所在地並非可靠來源 → 直接用台服官方團名（來自 items.json 的軍票名）
  100: { key: "maelstrom", gcItem: 20, kind: "gc" },
  200: { key: "twin-adder", gcItem: 21, kind: "gc" },
  300: { key: "immortal-flames", gcItem: 22, kind: "gc" },
};

async function main() {
  const monsters = JSON.parse(await readFile(join(DATA, "monsters.json"), "utf8")).data;
  const maps = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8")).data;
  const equip = JSON.parse(await readFile(join(DATA, "equip.json"), "utf8"));
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const tw = await loadTwLocales();
  const twPlaces = decode(await readFile(join(ROOT, "out_data", "places.msgpack"))).twPlaces;

  const mapById = new Map(maps.map((m) => [m.id, m]));
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  // BNpcName → monsters.json：**用 baseId**（§4.14：monsters.id 是逐隻實例，baseId 才是種類）
  const byBase = new Map();
  for (const m of monsters) if (m.baseId != null && !byBase.has(m.baseId)) byBase.set(m.baseId, m);

  let notes, targets;
  if (offline) {
    if (!existsSync(CACHE_FILE)) throw new Error(`--offline 但找不到 ${CACHE_FILE}`);
    ({ notes, targets } = JSON.parse(await readFile(CACHE_FILE, "utf8")));
    console.log(`用快取：MonsterNote ${notes.length}／Target ${targets.length}`);
  } else {
    console.log("抓取 MonsterNote／MonsterNoteTarget…");
    notes = await fetchAll("MonsterNote", "Name,Count,MonsterNoteTarget@as(raw),Reward@as(raw)");
    targets = await fetchAll("MonsterNoteTarget", "BNpcName@as(raw),PlaceNameLocation@as(raw),PlaceNameZone@as(raw),Town@as(raw)");
    await mkdir(CACHE, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify({ notes, targets }));
    console.log(`MonsterNote ${notes.length}／Target ${targets.length}（快取已寫入）`);
  }
  const tById = new Map(targets.map((t) => [t.row_id, t.fields]));

  const place = (id) => (id ? twName(twPlaces, id) : null);

  // 注意分母：`targetRows` 是**相異目標列**（同一隻怪會被多條討伐項目引用），
  // `occurrences` 才是「畫面上總共會出現幾列目標」。覆蓋率一律用相異數當分母，
  // 否則會印出 666/362 = 184% 這種看起來很怪的數字。
  const stats = { entries: 0, targetRows: 0, occurrences: 0, mobTw: 0, mobMiss: [], zone: 0, coords: 0, noTarget: 0 };
  const seenTargets = new Set();

  function buildTarget(targetId, count) {
    const f = tById.get(targetId);
    if (!f) return null;
    const baseId = f["BNpcName@as(raw)"];
    const name = twName(tw.mobs, baseId);
    if (!name) { stats.mobMiss.push(baseId); return null; }   // 無台服名＝不顯示（鐵則）
    stats.occurrences++;
    const firstTime = !seenTargets.has(targetId);
    if (firstTime) { seenTargets.add(targetId); stats.targetRows++; stats.mobTw++; }

    // 出沒地：PlaceNameZone／Location 是 3 組一列（同一種怪可能出現在多個區域）
    const zones = [];
    const zs = f["PlaceNameZone@as(raw)"] || [], ls = f["PlaceNameLocation@as(raw)"] || [];
    for (let i = 0; i < Math.max(zs.length, ls.length); i++) {
      const zoneName = place(zs[i]);
      if (!zoneName) continue;
      zones.push({ zone: zoneName, spot: place(ls[i]) || null });
    }
    if (zones.length && firstTime) stats.zone++;

    // 座標：monsters.json 只有 1,424 隻有 positions，沒有就只給地名（不猜）
    const mon = byBase.get(baseId);
    let at = null;
    if (mon?.positions?.length) {
      const p = mon.positions[0];
      if (mapById.has(p.mapId)) {
        at = { mapId: p.mapId, mapName: mapById.get(p.mapId).name, x: p.x, y: p.y, level: p.level ?? null };
        if (firstTime) stats.coords++;
      }
    }
    return { baseId, name, count, zones, ...(at ? { at } : {}) };
  }

  const out = [];
  for (const [prefix, g] of Object.entries(GROUPS)) {
    const rows = notes.filter((n) => Math.floor(n.row_id / 10000) === Number(prefix)).sort((a, b) => a.row_id - b.row_id);
    if (!rows.length) continue;
    const jobName = g.kind === "class" ? equip.names[g.code] : itemName.get(g.gcItem)?.replace("軍票", "");
    if (!jobName) { console.log(`  ⚠ ${g.key} 查不到台服名，整組跳過`); continue; }

    const entries = [];
    for (const r of rows) {
      const counts = r.fields.Count || [];
      const tids = r.fields["MonsterNoteTarget@as(raw)"] || [];
      const tgts = [];
      for (let i = 0; i < tids.length; i++) {
        if (!tids[i]) continue;
        const t = buildTarget(tids[i], counts[i] || 1);
        if (t) tgts.push(t);
      }
      if (!tgts.length) { stats.noTarget++; continue; }
      stats.entries++;
      // 一階 10 條：rank 由序號推（遊戲內就是每 10 條一階）
      const idx = r.row_id % 10000;
      entries.push({ id: r.row_id, no: idx, rank: Math.ceil(idx / 10), targets: tgts, exp: r.fields["Reward@as(raw)"] || null });
    }
    out.push({ key: g.key, name: jobName, kind: g.kind, entries });
  }

  const pct = (n, d) => `${n}/${d}（${((n / d) * 100).toFixed(0)}%）`;
  console.log(`\n產出 ${out.length} 組、${stats.entries} 條討伐項目、${stats.occurrences} 列目標（${stats.targetRows} 隻相異怪）`);
  console.log(`  台服怪名   ${pct(stats.mobTw, stats.targetRows)}`);
  console.log(`  有出沒地名 ${pct(stats.zone, stats.targetRows)}`);
  console.log(`  有座標     ${pct(stats.coords, stats.targetRows)}（monsters.json 只有部分怪有 positions，缺的只顯示地名）`);
  if (stats.noTarget) console.log(`  無目標而略過的列：${stats.noTarget}`);
  if (stats.mobMiss.length) console.log(`  無台服名的 BNpcName：${[...new Set(stats.mobMiss)].join(", ")}`);
  console.log("\n各組：");
  for (const g of out) {
    const n = g.entries.reduce((s, e) => s + e.targets.length, 0);
    console.log(`  ${g.name.padEnd(8)} ${String(g.entries.length).padStart(2)} 條／${n} 個目標／${Math.max(...g.entries.map((e) => e.rank))} 階`);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  const envelope = {
    schema: "hunting-log",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 MonsterNote/MonsterNoteTarget + monsters.json(baseId) + tw-locales(tw-mobs) + places.msgpack(twPlaces) + equip.json",
    count: out.length,
    data: out,
  };
  await writeFile(join(DATA, "hunting-log.json"), JSON.stringify(envelope));
  console.log(`\n✓ data/hunting-log.json（${out.length} 組）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
