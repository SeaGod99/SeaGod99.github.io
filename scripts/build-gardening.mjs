// 產生 data/gardening.json — 園藝的「種什麼、怎麼配、什麼時候收、花要什麼顏色」資料庫。
//
// 為什麼要這支（2026-08-12 補寫）：
// `data/gardening.json` 原本**沒有任何腳本產它**——違反知識庫 §4.19（每個 kind 都要有腳本
// 產生，否則重跑 build 會安靜洗掉手工資料，或反過來讓錯誤永遠留在檔裡沒人敢碰）。
// 補寫時順手發現三個實際的錯：
//   ① 向日葵的種子寫成 `4817 葵花籽`（食材、2.0），正解是 `43962 向日葵種子`（栽培用品、7.0）。
//      **上游 Teamcraft 就是錯的**，因為兩者英文都叫 Sunflower Seeds。見 SEED_OVERRIDE。
//   ② 野洋蔥(4777) 帶著 3 組上游沒有的配方，內容與庫爾札斯胡蘿蔔(4778) 一字不差，
//      是先前人工複製留下的。改成一律以上游為準，本檔不再手工加配方。
//   ③ 24 種花每種只收 1 個顏色（原色），但遊戲裡每種有 9 色、各是獨立道具（共 216 件），
//      而顏色是**施油粕**決定的。缺這塊等於整個花卉玩法查不到。
//
// 資料來源：
//   配方／時數      ← ffxiv-teamcraft/libs/data/src/lib/json/seeds.json（唯一連外，會快取）
//   繁中名／圖示／分類 ← data/items.json（台服官方物品名，權威）
//   英文名          ← out_data/en-items.msgpack（給人複製去查國際服攻略）
//   種子取得管道     ← scripts/lib/game-sources.mjs（與染劑／時尚品鑑同一套規則）
//   作物用途         ← data/recipes.json（哪些配方吃這個作物）
//   遊戲機制常數     ← 社群來源，出處與原文記在 docs/gardening-rules.md
//
// ⚠️ 台服未開放的條目**照收不誤**，name 留 `#<id>` 佔位——這是 gardening 既有慣例，
//    `patch-tw-names.mjs` 靠它在升版後補名。過濾是前端的事（`e.name` 非佔位 + PatchGate）。
// ⚠️ 本檔直接寫 **minified**（既有檔就是一行），所以 `minify-data.mjs` 對它是 no-op。
//    要看改了什麼請看本腳本印出的摘要，不要指望 git diff。
//
// 執行：
//   node scripts/build-gardening.mjs              # dry-run，只印摘要與差異
//   node scripts/build-gardening.mjs --apply      # 寫入 data/gardening.json
//   node scripts/build-gardening.mjs --offline    # 不連網，用 out_data/cache 的 seeds.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode } from "@msgpack/msgpack";
import { loadIndexes, resolveSources, describeSource } from "./lib/game-sources.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const D = (f) => join(ROOT, "data", f);
const O = (f) => join(ROOT, "out_data", f);
const CACHE_DIR = join(ROOT, "out_data", "cache");
const SEEDS_CACHE = join(CACHE_DIR, "tc-seeds.json");
const OUT = D("gardening.json");
const SEEDS_URL =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/seeds.json";

const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");

/* ── 上游修正表 ───────────────────────────────────────────────────────────
   Teamcraft 的 seeds.json 把「紅色向日葵」的種子指到 4817 葵花籽。葵花籽是 2.0 的**食材**，
   不是栽培用品；7.0 隨向日葵一起加的 43962 向日葵種子才是真的種子（其餘 23 種花也都是
   「種子 id ＝ 原色花 id − 1」的排法，43962 → 43963 完全吻合）。英文兩者同名 Sunflower
   Seeds，上游應是名稱對映時撞到舊道具。改這裡就好，不要去改 data/gardening.json。 */
const SEED_OVERRIDE = { 43963: 43962 };

/* ── 花色 ────────────────────────────────────────────────────────────────
   機制：施油粕染色，不是配種也不是土壤。每現實小時 1 次、只對未成熟的花有效、
   與施放順序無關；花自己的原色在染色過程中視為無色。三色全施＝隨機出稀有色或退回原色。
   出處見 docs/gardening-rules.md。 */
const POMACE = [
  { key: "crimson", id: 14011, short: "紅", hex: "#c0392b" },
  { key: "cerulean", id: 14012, short: "藍", hex: "#2c72b8" },
  { key: "golden", id: 14013, short: "黃", hex: "#c99a1e" },
];

/** 顏色 → 需要的油粕。rng＝三色全施後隨機（也可能退回原色）。 */
const COLOR_RECIPE = {
  紅色: { pomace: ["crimson"], rng: false },
  藍色: { pomace: ["cerulean"], rng: false },
  黃色: { pomace: ["golden"], rng: false },
  紫色: { pomace: ["crimson", "cerulean"], rng: false },
  橙色: { pomace: ["crimson", "golden"], rng: false },
  綠色: { pomace: ["cerulean", "golden"], rng: false },
  白色: { pomace: ["crimson", "cerulean", "golden"], rng: true },
  黑色: { pomace: ["crimson", "cerulean", "golden"], rng: true },
  混色: { pomace: ["crimson", "cerulean", "golden"], rng: true },
  粉色: { pomace: ["crimson", "cerulean", "golden"], rng: true }, // 櫻花的第 9 色用「粉色」不是「混色」
};
/** 花色在遊戲道具表裡的固定排序（種子 id + 1..9 就是這個順序）。 */
const COLOR_ORDER = ["紅色", "藍色", "黃色", "綠色", "橙色", "紫色", "白色", "黑色", "混色", "粉色"];
/** 前端色塊用。純顯示，不是遊戲數值。 */
const COLOR_HEX = {
  紅色: "#d0453b", 藍色: "#3d7fc4", 黃色: "#d8b13a", 綠色: "#4e9d5b", 橙色: "#e08a3c",
  紫色: "#9163c4", 白色: "#e8e6e1", 黑色: "#3a3a42", 混色: "linear", 粉色: "#e58fae",
};

/* ── 土壤 ──────────────────────────────────────────────────────────────── */
const SOILS = [
  { family: "薩納蘭土壤", base: 7764, effect: "提高配種機率", useFor: "cross" },
  { family: "黑衣森林土壤", base: 7761, effect: "提高收穫量（作物與種子）", useFor: "yield" },
  { family: "拉諾西亞土壤", base: 7758, effect: "提高 HQ 率——6.0 移除採集品 HQ 後已無實質作用", useFor: "hq" },
];
const PLAIN_SOIL = 16026; // 園藝土壤：無任何加成

/* ── 花圃／花盆 ─────────────────────────────────────────────────────────── */
const PATCHES = [
  { id: 7128, beds: 4 },
  { id: 7129, beds: 6 },
  { id: 7130, beds: 8 },
];
const POTS = [6488, 6489, 14055, 14056, 14057];

/* ── 作物大類。晶草(碎晶)自成一類，其餘依 items.json 的分類歸「花卉／作物」。 */
const CRYSTAL_IDS = new Set([2, 3, 4, 5, 6, 7]);

// ──────────────────────────────────────────────────────────────────────────

async function loadSeeds() {
  if (OFFLINE) {
    if (!existsSync(SEEDS_CACHE)) throw new Error(`--offline 但沒有快取：${SEEDS_CACHE}`);
    return JSON.parse(readFileSync(SEEDS_CACHE, "utf8"));
  }
  const res = await fetch(SEEDS_URL);
  if (!res.ok) throw new Error(`Teamcraft seeds.json HTTP ${res.status}`);
  const json = await res.json();
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(SEEDS_CACHE, JSON.stringify(json), "utf8");
  return json;
}

const ix = loadIndexes();
const enItems = decode(readFileSync(O("en-items.msgpack")));
const meta = JSON.parse(readFileSync(D("_meta.json"), "utf8"));
const gamePatch = meta.gamePatch || "7.21";
const recipes = JSON.parse(readFileSync(D("recipes.json"), "utf8")).data;
const seeds = await loadSeeds();

const nameOf = (id) => ix.byId.get(id)?.name ?? `#${id}`;
const iconOf = (id) => ix.byId.get(id)?.icon ?? null;
const enOf = (id) => enItems[id]?.en ?? null;
const patchOf = (id) => ix.byId.get(id)?.patch ?? null;

/** 這個作物被哪些配方吃掉（前端的「拿來做什麼」）。 */
const usedInIndex = new Map();
for (const r of recipes) {
  for (const g of r.ingredients || []) {
    if (!usedInIndex.has(g.itemId)) usedInIndex.set(g.itemId, new Set());
    usedInIndex.get(g.itemId).add(r.itemId);
  }
}
function usedIn(productId) {
  const set = usedInIndex.get(productId);
  if (!set || !set.size) return null;
  const top = [...set]
    .map((id) => ({ id, name: ix.byId.get(id)?.name ?? null }))
    .filter((x) => x.name)
    .slice(0, 4);
  return { count: set.size, top };
}

/* 採集點種類 → 職業與地形。對照見 data/SCHEMA.md：0=礦脈 1=岩脈（採礦工）／2=良材 3=草場（園藝工）。
   `resolveSources` 只回「採集」兩個字，但種子有沒有標等級差很多——沒有等級的「採集」等於沒說。 */
const GATHER_KIND = {
  0: ["採礦工", "礦脈"], 1: ["採礦工", "岩脈"],
  2: ["園藝工", "良材"], 3: ["園藝工", "草場"],
};
/** 把 obtainable-methods 的採集細節接回來（職業／等級／地形）。 */
function gatherDetail(seedId) {
  const m = (ix.obtain[String(seedId)] || []).find((x) => x.type === "gathering");
  if (!m) return null;
  const [job, terrain] = GATHER_KIND[m.gatheringType] ?? [null, null];
  if (!job) return m.level ? `採集 Lv.${m.level}` : null;
  return `${job} Lv.${m.level ?? "?"}（${terrain}）`;
}

/** 種子怎麼拿到。市場板單獨標記——它「永遠有」，會把「這東西只能配種」的事實蓋掉。 */
function seedSourceOf(seedId) {
  const all = resolveSources(seedId, ix).filter((s) => s.released !== false);
  const direct = all.filter((s) => s.type !== "market");
  return {
    // 最多留 3 筆，前端只顯示最上面 1～2 筆
    sources: direct.slice(0, 3).map((s) => ({
      type: s.type,
      text: s.type === "gather" ? (gatherDetail(seedId) ?? describeSource(s)) : describeSource(s),
      gate: s.gate ? s.gate.label : null,
      npc: s.npcs?.[0] ? `${s.npcs[0].name}（${s.npcs[0].map} X:${s.npcs[0].x} Y:${s.npcs[0].y}）` : null,
    })),
    marketable: all.some((s) => s.type === "market"),
    // true＝除了市場板與配種之外沒別的管道，也就是「真的得自己配」
    crossOnly: direct.length === 0,
  };
}

/* ── 花卉：找出同種的 9 個顏色 ───────────────────────────────────────────
   不能用「種子 id + 1..9」——櫻花的幼苗(17546) 和花色(17048–17056) 不連號。
   改用名稱：原色花名去掉顏色前綴＝品種名，再回 items.json 撈同名的各色（分類必為「雜貨」）。 */
const COLOR_RX = new RegExp(`^(${COLOR_ORDER.join("|")})`);
function flowerColorsOf(productId) {
  const nm = ix.byId.get(productId)?.name;
  if (!nm) return null;
  const m = nm.match(COLOR_RX);
  if (!m) return null;
  const species = nm.slice(m[1].length);
  if (!species) return null;
  const found = [];
  for (const c of COLOR_ORDER) {
    const it = ix.items.data.find((i) => i.name === c + species && i.category === "雜貨");
    if (it) found.push({ color: c, item: it });
  }
  if (found.length !== 9) return null; // 湊不滿 9 色就不是花卉，寧可不收
  return { species, defaultColor: m[1], list: found };
}

// ──────────────────────────────────────────────────────────────────────────
// 組資料

const entries = [];
for (const [pid, t] of Object.entries(seeds)) {
  const productId = Number(pid);
  const seedId = SEED_OVERRIDE[productId] ?? t.seedItemId;
  const fl = flowerColorsOf(productId);

  entries.push({
    productId,
    name: nameOf(productId),
    nameEn: enOf(productId),
    icon: iconOf(productId),
    kind: CRYSTAL_IDS.has(productId) ? "crystal" : fl ? "flower" : "crop",
    category: ix.byId.get(productId)?.category ?? null,
    seedId,
    seedName: nameOf(seedId),
    seedNameEn: enOf(seedId),
    seedIcon: iconOf(seedId),
    seed: seedSourceOf(seedId),
    duration: t.duration,
    crossBreeds: (t.crossBreeds || []).map((c) => ({
      baseSeedId: c.baseSeed,
      baseSeedName: nameOf(c.baseSeed),
      adjacentSeedId: c.adjacentSeed,
      adjacentSeedName: nameOf(c.adjacentSeed),
    })),
    flower: fl
      ? {
          species: fl.species,
          defaultColor: fl.defaultColor,
          colors: fl.list.map(({ color, item }) => {
            const isDefault = color === fl.defaultColor;
            const rec = COLOR_RECIPE[color] ?? { pomace: [], rng: false };
            return {
              color,
              id: item.id,
              name: item.name,
              icon: item.icon,
              hex: COLOR_HEX[color] ?? null,
              pomace: isDefault ? [] : rec.pomace,
              rng: isDefault ? false : rec.rng,
              isDefault,
            };
          }),
        }
      : null,
    usedIn: usedIn(productId),
    patch: patchOf(productId) ?? t.patch ?? null,
  });
}
entries.sort((a, b) => a.productId - b.productId);

/* 同一組（本株×鄰株）可能配出不只一種東西——遊戲是隨機挑一個。標出來，
   否則使用者會以為配方是確定的，等了 5 天才發現拿到另一種。
   注意：其中好幾組的「另一個結果」就是本株自己的作物，也就是「這次沒配到」。 */
const comboIndex = new Map();
for (const e of entries) {
  for (const c of e.crossBreeds) {
    const k = `${c.baseSeedId}x${c.adjacentSeedId}`;
    if (!comboIndex.has(k)) comboIndex.set(k, []);
    comboIndex.get(k).push(e.productId);
  }
}
for (const e of entries) {
  for (const c of e.crossBreeds) {
    const others = comboIndex.get(`${c.baseSeedId}x${c.adjacentSeedId}`).filter((id) => id !== e.productId);
    if (others.length) c.alsoYields = others.map((id) => ({ id, name: nameOf(id) }));
  }
}

const rules = {
  // 花色：施油粕，不是配種。順序無關、每現實小時 1 次、只對未成熟的花有效。
  pomace: POMACE.map((p) => ({ ...p, id: p.id, name: nameOf(p.id), icon: iconOf(p.id) })),
  colorOrder: COLOR_ORDER.slice(0, 9),
  colorHex: COLOR_HEX,
  pomacePerHour: 1,
  // 土壤
  soils: SOILS.map((s) => ({
    family: s.family,
    effect: s.effect,
    useFor: s.useFor,
    grades: [0, 1, 2].map((k) => ({ grade: k + 1, id: s.base + k, name: nameOf(s.base + k) })),
  })),
  plainSoil: { id: PLAIN_SOIL, name: nameOf(PLAIN_SOIL), effect: "無任何加成" },
  // 配種機制
  crossbreed: {
    decidedAt: "planting",          // 種下的瞬間就判定，不是收成時
    adjacencyOrder: ["右", "下", "上", "左"], // 取第一個能配的鄰床
    yields: "seed",                 // 收成時額外掉「目標種子」，本株田仍長本株自己的作物
    needsNonEmptyNeighbour: true,   // 旁邊是空床就不會配種
    potsCanCross: false,            // 花盆不能配種
    patches: PATCHES.map((p) => ({ id: p.id, name: nameOf(p.id), beds: p.beds })),
    pots: POTS.map((id) => ({ id, name: nameOf(id) })),
  },
  // 照料
  care: { wiltHours: 48, witherHours: 24, fertilizerPercentPerUse: 1, safeAfterRipe: true },
};

const out = {
  schema: "gardening",
  patch: gamePatch,
  updated: new Date().toISOString().slice(0, 10),
  source:
    "ffxiv-teamcraft/seeds.json（配方與時數）；data/items.json（台服官方物品名／圖示／分類）；" +
    "out_data/en-items.msgpack（英文名）；scripts/lib/game-sources.mjs（種子取得管道）；" +
    "data/recipes.json（用途）；遊戲機制常數見 docs/gardening-rules.md",
  count: entries.length,
  rules,
  data: entries,
};

// ── 摘要 ──────────────────────────────────────────────────────────────────
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
const flowers = entries.filter((e) => e.flower);
const noTwName = entries.filter((e) => /^#\d+$/.test(e.name));
const ambiguous = [...comboIndex.values()].filter((v) => v.length > 1).length;
const crossOnly = entries.filter((e) => e.seed.crossOnly);

console.log(`園藝資料　台服版本 ${gamePatch}`);
console.log(`  作物條目      ${entries.length}（花卉 ${flowers.length}／晶草 ${entries.filter((e) => e.kind === "crystal").length}／其餘 ${entries.filter((e) => e.kind === "crop").length}）`);
console.log(`  花色道具      ${flowers.reduce((n, e) => n + e.flower.colors.length, 0)} 件（${flowers.length} 種 × 9 色）`);
console.log(`  配種組合      ${comboIndex.size}（其中 ${ambiguous} 組會隨機產出多種結果）`);
console.log(`  只能配種取得   ${crossOnly.length} 種種子（除市場板外沒有別的管道）`);
console.log(`  無台服名      ${noTwName.length}${noTwName.length ? `（${noTwName.map((e) => e.productId).join("、")}，前端會擋掉）` : ""}`);
if (prev) {
  const prevIds = new Set((prev.data || []).map((e) => e.productId));
  const added = entries.filter((e) => !prevIds.has(e.productId));
  const removed = (prev.data || []).filter((e) => !entries.some((x) => x.productId === e.productId));
  if (added.length) console.log(`  新增          ${added.map((e) => `${e.productId} ${e.name}`).join("、")}`);
  if (removed.length) console.log(`  移除          ${removed.map((e) => `${e.productId} ${e.name}`).join("、")}`);
  const norm = (l) => (l || []).map((c) => `${c.baseSeedId}x${c.adjacentSeedId}`).sort().join(",");
  for (const e of entries) {
    const p = (prev.data || []).find((x) => x.productId === e.productId);
    if (!p) continue;
    if (norm(p.crossBreeds) !== norm(e.crossBreeds)) console.log(`  配方變更      ${e.productId} ${e.name}：「${norm(p.crossBreeds) || "（無）"}」→「${norm(e.crossBreeds) || "（無）"}」`);
    if (p.seedId !== e.seedId) console.log(`  種子變更      ${e.productId} ${e.name}：${p.seedId} ${p.seedName} → ${e.seedId} ${e.seedName}`);
    if (p.duration !== e.duration) console.log(`  時數變更      ${e.productId} ${e.name}：${p.duration}h → ${e.duration}h`);
  }
}

const json = JSON.stringify(out) + "\n";
console.log(`\n  輸出大小      ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB（原 ${prev ? (Buffer.byteLength(readFileSync(OUT, "utf8")) / 1024).toFixed(1) : "—"} KB）`);
if (!APPLY) {
  console.log("\n  dry-run，未寫入。加 --apply 才寫 data/gardening.json");
} else {
  writeFileSync(OUT, json, "utf8");
  console.log(`\n  ✓ 已寫入 ${OUT}`);
}
