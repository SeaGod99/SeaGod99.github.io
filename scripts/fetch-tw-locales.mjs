// fetch-tw-locales.mjs
// 把 Teamcraft 的台服語系檔抓進 out_data/tw-locales.msgpack（單檔打包）。
//
// 為什麼要這支：
//   2026-09-20 盤點發現 Teamcraft 的 `tw/` 目錄有 51 個台服官方譯名檔，
//   本站長期只用了其中三個（tw-items／tw-craft-actions／tw-item-ui-categories）。
//   **成就、FATE、理符、怪物、隨從探險、商店、狀態、幻卡規則全都有台服官方名**，
//   這直接推翻了「非物品字串沒有台服來源」這個擋掉多個功能的前提
//   （詳見 docs/功能發想與路線圖.md 第 7 節基礎 A）。
//
// 為什麼打包成一個 msgpack 而不是 51 個 json：
//   全部原始 json 約 28MB，而 GitHub Pages 1GB 發佈上限只剩約 140MB 餘裕。
//   打包＋msgpack 後約 2MB，且一次抓齊比十幾支腳本各抓一次省事。
//
// 刻意不收的（見下方 SKIP 註解）：站內已有更權威的版本，或大到現在用不上。
//
// 執行（repo 根目錄）：
//   node scripts/fetch-tw-locales.mjs            # dry-run：列出要抓什麼、現況差異
//   node scripts/fetch-tw-locales.mjs --apply    # 實際抓取並寫入
//   node scripts/fetch-tw-locales.mjs --list     # 印出現有 msgpack 的內容清單
//
// 讀取方式（其他腳本）：
//   import { loadTwLocales } from "./lib/tw-locales.mjs";
//   const tw = await loadTwLocales();
//   tw.achievements[1].tw        // "勝利的榮光1"
//   tw.tripleTriadRules[3].tw    // 幻卡規則名

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encode, decode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "out_data");
const OUT_FILE = join(OUT, "tw-locales.msgpack");

const apply = process.argv.includes("--apply");
const list = process.argv.includes("--list");

const BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/";

// 要收的檔：key = 本庫欄位名（camelCase），value = Teamcraft 檔名
// 新增條目時請一併說明「哪個功能要用」，避免無主資料堆積。
const FILES = {
  // ── 幻卡（triple-triad-source-fix 用）
  tripleTriadRules: "tw-triple-triad-rules.json",
  tripleTriadRuleDescriptions: "tw-triple-triad-rule-descriptions.json",
  // ── 成就（achievement-rewards 用；tw-titles.json 不存在，稱號仍無台服名）
  achievements: "tw-achievements.json",
  achievementDescriptions: "tw-achievement-descriptions.json",
  // ── 怪物與討伐筆記（hunting-log-tracker／hunt-b-rank-route 用）
  mobs: "tw-mobs.json",
  notebookDivision: "tw-notebook-division.json",
  notebookDivisionCategory: "tw-notebook-division-category.json",
  // ── FATE（eureka-nm-weather／relic 用）
  fates: "tw-fates.json",
  // ── 理符（leve-calculator 用）
  leves: "tw-leves.json",
  // ── 隨從探險（retainer-venture-ranking 用）
  ventures: "tw-ventures.json",
  // ── 商店與活動（currency-exchange-ranking／seasonal-* 用）
  shops: "tw-shops.json",
  eventItems: "tw-event-items.json",
  // ── 副本與主線（dungeon-codex／msq-progress 用）
  instances: "tw-instances.json",
  journalGenre: "tw-journal-genre.json",
  contentTypes: "tw-content-types.json",
  // ── 航行（submarine-planner 用）
  submarineVoyages: "tw-submarine-voyages.json",
  airshipVoyages: "tw-airship-voyages.json",
  // ── 部族（beast-tribe-reputation 用）
  tribes: "tw-tribes.json",
  beastReputationRanks: "tw-beast-reputation-ranks.json",
  // ── 狀態／特性（action-status-codex 用；tw-actions 2MB 暫不收，要做辭典時再加）
  statuses: "tw-statuses.json",
  traits: "tw-traits.json",
  // ── 雜項對照（副屬性官方用字、職業縮寫、種族、資料片、採集類型、NPC 頭銜）
  baseParams: "tw-base-params.json",
  jobAbbr: "tw-job-abbr.json",
  jobName: "tw-job-name.json",
  jobCategories: "tw-job-categories.json",
  races: "tw-races.json",
  exVersions: "tw-ex-versions.json",
  gatheringTypes: "tw-gathering-types.json",
  npcTitles: "tw-npc-titles.json",
  weathers: "tw-weathers.json",
  maps: "tw-maps.json",
};

// 刻意不收，理由寫在這裡免得日後有人重問：
//   tw-items.json         → 站內權威是 out_data/tw-items.msgpack（build-tw-items-msgpack.mjs，有超集護欄）
//   tw-npcs.json          → 站內已有 out_data/npcs.msgpack 的 twNpcs
//   tw-places.json        → 站內已有 out_data/places.msgpack 的 twPlaces
//   tw-quests.json        → 站內已有 out_data/tw-quests.json
//   tw-craft-actions.json → build-craft-sim.mjs 直接抓
//   tw-item-ui-categories → build-item-categories.mjs 直接抓
//   tw-recipes.json (11MB)／tw-item-descriptions (2.2MB)／tw-action-descriptions (2MB)
//   tw-quest-descriptions／tw-leve-descriptions／tw-instance-descriptions／tw-craft-descriptions
//   tw-actions.json (1.5MB)／tw-status-descriptions／tw-trait-descriptions／tw-gathering-bonuses
//                         → 大且目前無功能需要；要做技能辭典時再把需要的加進 FILES
const SKIP_NOTE = "tw-items／tw-npcs／tw-places／tw-quests 站內已有更權威版本；tw-recipes 等大檔目前無功能需要";

async function main() {
  if (list) {
    if (!existsSync(OUT_FILE)) { console.log("尚未抓取，先跑 --apply"); return; }
    const db = decode(await readFile(OUT_FILE));
    console.log(`out_data/tw-locales.msgpack（抓取日 ${db.fetched}）`);
    for (const [k, v] of Object.entries(db.data)) {
      const n = Object.keys(v).length;
      const sample = Object.values(v)[0];
      console.log(`  ${k.padEnd(28)} ${String(n).padStart(6)} 筆  ${JSON.stringify(sample).slice(0, 60)}`);
    }
    return;
  }

  const existing = existsSync(OUT_FILE) ? decode(await readFile(OUT_FILE)) : null;
  if (existing) console.log(`現有快照抓取日：${existing.fetched}\n`);

  const data = {};
  const rows = [];
  for (const [key, file] of Object.entries(FILES)) {
    const res = await fetch(BASE + file);
    if (!res.ok) { console.error(`  ✗ ${file} HTTP ${res.status}`); continue; }
    const json = await res.json();
    data[key] = json;
    const n = Object.keys(json).length;
    const before = existing?.data?.[key] ? Object.keys(existing.data[key]).length : null;
    const delta = before === null ? "新增" : n === before ? "" : `${before} → ${n}`;
    rows.push([key, file, n, delta]);
    process.stdout.write(`\r  已抓 ${rows.length}/${Object.keys(FILES).length}`);
  }
  process.stdout.write("\n\n");

  for (const [key, file, n, delta] of rows) {
    console.log(`  ${key.padEnd(28)} ${String(n).padStart(6)} 筆  ${file.padEnd(38)} ${delta}`);
  }

  const packed = encode({
    fetched: new Date().toISOString().slice(0, 10),
    source: BASE,
    skipped: SKIP_NOTE,
    data,
  });
  console.log(`\n合計 ${rows.length} 檔、${rows.reduce((s, r) => s + r[2], 0).toLocaleString()} 筆，打包後 ${(packed.length / 1024 / 1024).toFixed(2)}MB`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  await mkdir(OUT, { recursive: true });
  await writeFile(OUT_FILE, packed);
  console.log(`\n✓ ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
