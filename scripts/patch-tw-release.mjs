// 把「台服已開放、但全球版本標籤比較晚」的條目重標回台服版號
//
// 背景見 scripts/lib/tw-releases.mjs 檔頭：Teamcraft 的全球版本表沒有 7.25，台服 7.25 的新物品在那邊
// 全被標成 7.3；只改 gamePatch 放不出來，改成 7.3 又會連國際服 7.3 獨有的內容一起放出。
// 這支用「台服客戶端這一版有名字、上一版沒有」的 id 清單，只重標那些條目。
//
// 兩種模式：
//   node scripts/patch-tw-release.mjs --build    # 由兩版客戶端解包（以 commit SHA 釘住）產生清單檔
//                                                #   scripts/lib/tw-release-<版本>.json（items／achievements）
//   node scripts/patch-tw-release.mjs            # dry-run：列出會被重標的條目
//   node scripts/patch-tw-release.mjs --apply    # 寫回 data/*.json（保留各檔原本的 minified／pretty 格式）
//
// 規則：條目的鍵在清單裡，而且它的 patch 是空的、或比清單的台服版號晚 → 改成台服版號。
//       patch 本來就 ≤ 台服版號的不動（不會把舊條目改成新版）。冪等。
//
// 涵蓋（鍵）：items(id)、recipes／fishes／mounts／minions／emotes／barding／orchestrion／ornaments(itemId)、
//   gardening(productId 或 seedId)、hairstyles(id＝解鎖道具 id)、achievements(id，用成就清單)、
//   fishing-spots(該釣場有魚被重標時)。幻卡由 patch-triple-triad-new-cards.mjs 自己處理（卡片沒有 itemId 欄）。
//
// 升版 SOP 的位置：build-tw-items-msgpack → build-items → patch-backfill → patch-backfill-all
//   → **patch-tw-release --apply** → backfill-sources → patch-tw-names → …（見 CLAUDE.md「升台服版本」）

import { readFileSync, existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCsv, TC_REPO } from "./lib/tc-datamining.mjs";
import { TW_RELEASES, pnum } from "./lib/tw-releases.mjs";
import { isTranslated } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const LIB = join(__dirname, "lib");
const CACHE = join(ROOT, "out_data", "cache", "tc-datamining");
const APPLY = process.argv.includes("--apply");
const BUILD = process.argv.includes("--build");
const today = new Date().toISOString().slice(0, 10);

// ── --build：兩版客戶端差集 ──────────────────────────────────
async function sheetAt(sha, name) {
  const file = join(CACHE, sha.slice(0, 8), name + ".csv");
  let text;
  if (existsSync(file)) text = await readFile(file, "utf8");
  else {
    const url = `https://raw.githubusercontent.com/${TC_REPO}/${sha}/${name}.csv`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    text = await r.text();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const col = rows[1].indexOf("Name");
  if (col < 0) throw new Error(`${name}.csv@${sha.slice(0, 8)} 找不到 Name 欄`);
  const named = new Set();
  for (const r of rows.slice(3)) {
    const n = (r[col] || "").trim();
    if (r[0] !== "" && n && isTranslated(n)) named.add(Number(r[0]));
  }
  return named;
}

async function build() {
  for (const rel of TW_RELEASES) {
    const out = { version: rel.version, client: rel.client, prev: rel.prev, generated: today };
    for (const [key, sheet] of [["items", "Item"], ["achievements", "Achievement"]]) {
      const [cur, prev] = await Promise.all([sheetAt(rel.client.sha, sheet), sheetAt(rel.prev.sha, sheet)]);
      const added = [...cur].filter((id) => !prev.has(id)).sort((a, b) => a - b);
      const removed = [...prev].filter((id) => !cur.has(id));
      out[key] = added;
      console.log(`${rel.version} ${sheet}：這一版 ${cur.size}、上一版 ${prev.size} → 新開放 ${added.length}` +
        (removed.length ? `（上一版有、這一版沒有 ${removed.length}，不處理）` : ""));
    }
    const file = join(LIB, rel.file);
    await writeFile(file, JSON.stringify(out, null, 1) + "\n");
    console.log(`✅ 已寫入 ${file}`);
  }
}

// ── 套用 ─────────────────────────────────────────────────────
function readDB(file) {
  const raw = readFileSync(join(DATA, file), "utf8");
  const db = JSON.parse(raw);
  return { db, rows: Array.isArray(db) ? db : db.data, minified: !raw.includes('\n  "') };
}
const serialize = (db, minified) => (minified ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n");

function loadReleases() {
  const items = new Map(); // itemId → 台服版號
  const achievements = new Map();
  for (const rel of TW_RELEASES) {
    const file = join(LIB, rel.file);
    if (!existsSync(file)) throw new Error(`找不到 ${file}，先跑 node scripts/patch-tw-release.mjs --build`);
    const j = JSON.parse(readFileSync(file, "utf8"));
    for (const id of j.items) items.set(id, rel.version);
    for (const id of j.achievements) achievements.set(id, rel.version);
  }
  return { items, achievements };
}

/** 該條目要不要重標成 ver：patch 空的或比 ver 晚 */
const needs = (patch, ver) => patch == null || patch === "" || (pnum(patch) ?? Infinity) > pnum(ver);

async function apply() {
  const { items, achievements } = loadReleases();
  console.log(`清單：物品 ${items.size}、成就 ${achievements.size}\n`);

  const JOBS = [
    { file: "items.json", key: (e) => [e.id] },
    { file: "recipes.json", key: (e) => [e.itemId] },
    { file: "fishes.json", key: (e) => [e.itemId] },
    { file: "gardening.json", key: (e) => [e.productId, e.seedId] },
    { file: "mounts.json", key: (e) => [e.itemId] },
    { file: "minions.json", key: (e) => [e.itemId] },
    { file: "emotes.json", key: (e) => [e.itemId] },
    { file: "barding.json", key: (e) => [e.itemId] },
    { file: "orchestrion.json", key: (e) => [e.itemId] },
    { file: "ornaments.json", key: (e) => [e.itemId] },
    { file: "hairstyles.json", key: (e) => [e.id] },
    { file: "achievements.json", key: (e) => [e.id], map: achievements },
  ];

  const releasedSpots = new Map(); // fishing-spots id → 台服版號（該釣場有魚被重標）
  let total = 0;
  for (const job of JOBS) {
    if (!existsSync(join(DATA, job.file))) continue;
    const { db, rows, minified } = readDB(job.file);
    const map = job.map || items;
    const changes = [];
    for (const e of rows) {
      const ver = job.key(e).map((k) => map.get(k)).find(Boolean);
      if (!ver) continue;
      if (job.file === "fishes.json") {
        for (const s of [].concat(e.spotId ?? [], e.spots ?? [])) if (s != null) releasedSpots.set(s, ver);
      }
      if (!needs(e.patch, ver)) continue;
      changes.push(`${e.id ?? e.itemId} ${e.name ?? e.nameEn ?? ""}：${e.patch ?? "（空）"} → ${ver}`);
      e.patch = ver;
    }
    report(job.file, rows.length, changes);
    total += changes.length;
    if (APPLY && changes.length) {
      if (!Array.isArray(db)) db.updated = today;
      await writeFile(join(DATA, job.file), serialize(db, minified));
    }
  }

  // 釣場：proxy 規則是「釣場 patch＝其魚的最早 patch」，魚被重標後釣場跟著重標
  {
    const { db, rows, minified } = readDB("fishing-spots.json");
    const changes = [];
    for (const e of rows) {
      const ver = releasedSpots.get(e.id);
      if (!ver || !needs(e.patch, ver)) continue;
      changes.push(`${e.id} ${e.name ?? ""}：${e.patch ?? "（空）"} → ${ver}`);
      e.patch = ver;
    }
    report("fishing-spots.json", rows.length, changes);
    total += changes.length;
    if (APPLY && changes.length) {
      if (!Array.isArray(db)) db.updated = today;
      await writeFile(join(DATA, "fishing-spots.json"), serialize(db, minified));
    }
  }

  console.log(`\n共 ${total} 筆` + (APPLY ? "，✅ 已寫入" : "（dry-run，未寫入；加 --apply 套用）"));
}

function report(file, n, changes) {
  console.log(`${file.padEnd(20)} ${String(n).padStart(6)} 筆中重標 ${changes.length}`);
  for (const c of changes.slice(0, 8)) console.log(`    ${c}`);
  if (changes.length > 8) console.log(`    …另 ${changes.length - 8} 筆`);
}

(BUILD ? build() : apply()).catch((e) => {
  console.error("錯誤：", e.message);
  process.exit(1);
});
