// 取得來源（sources）回填：orchestrion / mounts / minions / barding
//
// 只填「sources 為空」的條目（backfill = 補缺口，不覆蓋既有策展來源）。
// 來源：ffxivcollect 各端點的 sources（type + text，英文）。
//   type → 繁中 SOURCE_TYPES（對照表，100%）
//   detail → 繁中 where 可推：Premium→商城購買、副本類比對 dungeons.json nameEn 轉繁；
//            其餘留空（查不到留空，與既有風格一致、不混英文）。
//
// join：orchestrion=itemId、mounts=id、minions=id、barding=nameEn→item_id。
//
// 執行：node scripts/backfill-sources.mjs [--apply]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const APPLY = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);
const lc = (s) => (s == null ? "" : String(s)).toLowerCase().trim();
const FC = "https://ffxivcollect.com/api";
const j = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };

function readDB(file) {
  const raw = readFileSync(join(DATA, file), "utf8");
  return { db: JSON.parse(raw), minified: !raw.includes('\n  "') };
}
const serialize = (db, m) => (m ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n");

// ffxivcollect 英文 type → 繁中分類
const TYPE_TW = {
  Achievement: "成就", Quest: "任務", Crafting: "製作", Gathering: "採集",
  Purchase: "商店", "Gold Saucer": "金碟", PvP: "PvP", Hunts: "狩獵",
  "Treasure Hunt": "藏寶圖", FATE: "危命任務", Event: "節慶活動",
  Premium: "商城", Voyages: "探索航行", Tribal: "部族任務", Venture: "雇員探險",
  "Island Sanctuary": "無人島", Skybuilders: "伊修加德重建", Bozja: "博茲雅",
  Eureka: "尤雷卡", "Deep Dungeon": "深層迷宮", Dungeon: "副本掉落",
  Trial: "高難度副本", Raid: "副本掉落", "Chaotic Raid": "副本掉落",
  "V&C Dungeon": "異聞副本", "Wondrous Tails": "天書奇談",
  "Cosmic Exploration": "宇宙探索", "Occult Crescent": "新月島", Other: "其他",
};
const DUTY = new Set(["Dungeon", "Trial", "Raid", "Deep Dungeon", "V&C Dungeon", "Chaotic Raid"]);

async function run() {
  process.stderr.write("抓 ffxivcollect orchestrions/mounts/minions/bardings …\n");
  const [orc, mt, mn, bard] = await Promise.all(
    ["orchestrions", "mounts", "minions", "bardings"].map((t) => j(`${FC}/${t}?limit=9999`).then((d) => d.results || []))
  );

  // dungeons nameEn → 繁中（副本類 detail 轉繁）
  const dungeons = JSON.parse(readFileSync(join(DATA, "dungeons.json"), "utf8")).data;
  const dunMap = new Map(dungeons.filter((d) => d.nameEn && d.name).map((d) => [lc(d.nameEn), d.name]));

  const mkDetail = (typeEn, text) => {
    if (typeEn === "Premium") return "商城購買";
    if (DUTY.has(typeEn) && text) {
      const tw = dunMap.get(lc(text));
      if (tw) return tw;
    }
    return null; // 查不到留空
  };
  const toSources = (fcSources) =>
    (fcSources || []).map((s) => {
      const type = TYPE_TW[s.type] || "其他";
      const detail = mkDetail(s.type, s.text);
      return detail ? { type, detail } : { type, detail: null };
    });

  // 各檔 join 索引
  const orcByItem = new Map(orc.filter((o) => o.item_id).map((o) => [o.item_id, o]));
  const mtById = new Map(mt.map((x) => [x.id, x]));
  const mnById = new Map(mn.map((x) => [x.id, x]));
  const bardByName = new Map(bard.map((x) => [lc(x.name), x]));
  const bardByItem = new Map(bard.filter((x) => x.item_id).map((x) => [x.item_id, x]));

  const jobs = [
    { file: "orchestrion.json", find: (e) => orcByItem.get(e.itemId) },
    { file: "mounts.json", find: (e) => mtById.get(e.id) },
    { file: "minions.json", find: (e) => mnById.get(e.id) },
    { file: "barding.json", find: (e) => (e.nameEn && bardByName.get(lc(e.nameEn))) || (e.itemId && bardByItem.get(e.itemId)) },
  ];

  const rows = [];
  for (const job of jobs) {
    const { db, minified } = readDB(job.file);
    const data = db.data || [];
    let filled = 0, noMatch = 0, withDetail = 0;
    for (const e of data) {
      if (Array.isArray(e.sources) && e.sources.length > 0) continue; // 只填空的
      const fc = job.find(e);
      if (!fc || !(fc.sources && fc.sources.length)) { noMatch++; continue; }
      const src = toSources(fc.sources);
      filled++;
      withDetail += src.filter((s) => s.detail).length;
      if (APPLY) e.sources = src;
    }
    rows.push({ file: job.file, total: data.length, filled, noMatch, withDetail });
    if (APPLY && filled > 0) { db.updated = today; await writeFile(join(DATA, job.file), serialize(db, minified)); }
  }

  console.log("\n檔案              總數   本次填source  無對應  其中有繁中detail");
  for (const r of rows)
    console.log(`${r.file.padEnd(17)} ${String(r.total).padEnd(6)} ${String(r.filled).padEnd(13)} ${String(r.noMatch).padEnd(7)} ${r.withDetail}`);
  console.log(APPLY ? "\n✅ 已寫入" : "\n（dry-run，未寫入；加 --apply）");
}

run().catch((e) => { console.error("錯誤：", e.message); process.exit(1); });
