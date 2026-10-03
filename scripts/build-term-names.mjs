// build-term-names.mjs — 產生 data/term-names/（副本／地名／怪物／任務的四語查詢分片）
//
// 第二輪路線圖 `translator-more-categories`：名稱翻譯原本只認物品。攻略與國際服影片講的副本、
// 地名、怪物、任務也都是英文／日文，台服玩家要自己猜。
//
// ── 與 build-item-names.mjs 的關係 ─────────────────────────────────
// **同一套分片規則**（`FNV-1a(正規化鍵) % 256`），正規化與雜湊**直接 import 那支**。
// 前端共用 `assets/js/item-names.js` 的 NameLookup 工廠（TermNames）。
//
// ── 一對多：全部列出，不挑一個 ───────────────────────────────────────
// 怪物有 163 個英文名對到多個台服名、任務 69 組同英文名（路線圖驗證者量的）。
// 物品與技能是「先到先贏」（衝突少、而且有優先序可依）；這裡**沒有可靠的優先序**——
// 同一個英文怪物名在不同副本可能是不同的台服譯名，只回第一筆會安靜給錯名。
// 所以同一個鍵對到多個不同的台服名時，**值存成陣列、前端全部列出**並標「N 個候選」。
//
// ── 資料來源（台服名查不到的整筆不收）─────────────────────────────
//   d 副本  tw-locales.instances（InstanceContent id）＋ Teamcraft instances.json（en／ja）
//   p 地名  out_data/places.msgpack 的 twPlaces ＋ places（en／ja，同一個 PlaceName id）
//   m 怪物  tw-locales.mobs（BNpcName id）＋ Teamcraft mobs.json（en／ja）
//   q 任務  out_data/tw-quests.json ＋ Teamcraft quests.json（en／ja）
// 台服名一律過 tw-text 的守門（上游 mobs 有 89 筆是未翻譯的日文）。
//
// 執行（repo 根目錄）：
//   node scripts/build-term-names.mjs            # dry-run，印覆蓋率與一對多的筆數
//   node scripts/build-term-names.mjs --apply    # 寫入 data/term-names/
//   node scripts/build-term-names.mjs --offline  # Teamcraft 多語檔只用快取

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";
import { normalizeName, shardOf } from "./build-item-names.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "term-names");
const CACHE = join(ROOT, "out_data", "cache");
const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");
const SHARDS = 256;      // 必須與 build-item-names.mjs 一致（共用 shardOf）
const TC = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/";
export const KINDS = { d: "副本", p: "地名", m: "怪物", q: "任務" };

async function grab(name) {
  const file = join(CACHE, "tc-" + name.replace(/[/]/g, "-"));
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  if (offline) throw new Error(`--offline 但找不到快取 ${file}`);
  const r = await fetch(TC + name);
  if (!r.ok) throw new Error(`${name} HTTP ${r.status}`);
  const j = await r.json();
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(j));
  return j;
}

async function main() {
  const tw = await loadTwLocales();
  const places = decode(await readFile(join(ROOT, "out_data", "places.msgpack")));
  const twQuests = JSON.parse(await readFile(join(ROOT, "out_data", "tw-quests.json"), "utf8"));
  const sets = {
    d: { tw: (id) => twName(tw.instances, id), ids: Object.keys(tw.instances || {}), ml: await grab("instances.json") },
    p: { tw: (id) => twName(places.twPlaces, id), ids: Object.keys(places.twPlaces || {}), ml: places.places },
    m: { tw: (id) => twName(tw.mobs, id), ids: Object.keys(tw.mobs || {}), ml: await grab("mobs.json") },
    q: { tw: (id) => twQuests[id]?.tw || null, ids: Object.keys(twQuests), ml: await grab("quests.json") },
  };

  // kind → lang → key → Set(台服名)
  const table = {};
  const stat = {};
  for (const [kind, s] of Object.entries(sets)) {
    table[kind] = { en: new Map(), ja: new Map(), tw: new Map() };
    const st = stat[kind] = { tw: 0, en: 0, ja: 0, noTw: 0 };
    for (const id of s.ids) {
      const t = s.tw(id);
      if (!t || !isTw(t)) { st.noTw++; continue; }
      st.tw++;
      const raw = s.ml?.[id] || {};
      const m = raw.name && typeof raw.name === "object" ? raw.name : raw;     // quests.json 多包一層 name
      for (const [lang, name] of [["tw", t], ["en", m.en], ["ja", m.ja]]) {
        if (!name || typeof name !== "string") continue;
        const key = normalizeName(name);
        if (!key) continue;
        if (lang !== "tw") st[lang]++;
        const b = table[kind][lang];
        if (!b.has(key)) b.set(key, new Set());
        b.get(key).add(t);
      }
    }
  }

  // 一對多的統計＋寫成分片
  const shards = new Map();
  const multi = {};
  let keys = 0;
  for (const [kind, langs] of Object.entries(table)) {
    multi[kind] = { en: 0, ja: 0, examples: [] };
    for (const [lang, b] of Object.entries(langs)) {
      for (const [key, set] of b) {
        const vals = [...set];
        if (vals.length > 1 && lang !== "tw") {
          multi[kind][lang]++;
          if (multi[kind].examples.length < 3) multi[kind].examples.push(`${key} → ${vals.slice(0, 3).join("／")}`);
        }
        const sh = shardOf(key);
        if (!shards.has(sh)) shards.set(sh, Object.fromEntries(Object.keys(KINDS).map((k) => [k, { en: {}, ja: {}, tw: {} }])));
        shards.get(sh)[kind][lang][key] = vals.length === 1 ? vals[0] : vals.sort((a, c) => a.localeCompare(c, "zh-Hant"));
        keys++;
      }
    }
  }

  for (const [k, st] of Object.entries(stat)) {
    const mm = multi[k];
    console.log(`${KINDS[k]}　台服 ${st.tw}（略過無台服名 ${st.noTw}）　英 ${st.en}（${(st.en / st.tw * 100).toFixed(1)}%）　日 ${st.ja}　一對多：英 ${mm.en}、日 ${mm.ja}`);
    if (mm.examples.length) console.log(`    例：${mm.examples.join("　|　")}`);
  }
  const files = [];
  for (const [sh, k] of [...shards].sort((a, b) => a[0] - b[0])) {
    const json = JSON.stringify({ schema: "term-names", shard: sh, k });
    files.push({ name: `${sh}.json`, json, gz: gzipSync(json).length });
  }
  const totalGz = files.reduce((a, f) => a + f.gz, 0);
  const biggest = Math.max(...files.map((f) => f.gz));
  console.log(`\n共 ${keys} 個查詢鍵、${files.length} 片；合計 gzip ${(totalGz / 1024).toFixed(0)}KB，單片最大 ${(biggest / 1024).toFixed(1)}KB`);

  const fatal = [];
  if (files.some((f) => f.gz > 30 * 1024)) fatal.push("有分片 gzip 超過 30KB");
  for (const [k, st] of Object.entries(stat)) if (st.en / st.tw < 0.9) fatal.push(`${KINDS[k]}的英文覆蓋率只有 ${(st.en / st.tw * 100).toFixed(1)}%（多語檔可能壞了）`);
  if (fatal.length) { console.error("\n✗ 中止：\n   " + fatal.join("\n   ")); process.exit(1); }
  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  if (existsSync(OUT)) for (const f of await readdir(OUT)) if (f.endsWith(".json")) await rm(join(OUT, f));
  await mkdir(OUT, { recursive: true });
  for (const f of files) await writeFile(join(OUT, f.name), f.json);
  await writeFile(join(OUT, "_index.json"), JSON.stringify({
    schema: "term-names-index",
    updated: new Date().toISOString().slice(0, 10),
    source: "tw-locales（instances／mobs）＋ places.msgpack ＋ out_data/tw-quests.json ＋ Teamcraft {instances,mobs,quests}.json（en／ja）",
    note: `片號 = FNV-1a(正規化鍵) % ${SHARDS}，與 data/item-names/ 同一套規則。k 分 d=副本／p=地名／m=怪物／q=任務，各自再依語言（en／ja／tw）。值是字串，或一個鍵對到多個台服名時的**陣列**（全部列出，不挑一個）。`,
    shards: SHARDS,
    kinds: Object.fromEntries(Object.entries(stat).map(([k, s]) => [k, s.tw])),
    multi: Object.fromEntries(Object.entries(multi).map(([k, m]) => [k, { en: m.en, ja: m.ja }])),
    keys,
  }));
  console.log(`\n✓ data/term-names/（${files.length} 片＋_index.json）`);
}

if ((process.argv[1] || "").endsWith("build-term-names.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
