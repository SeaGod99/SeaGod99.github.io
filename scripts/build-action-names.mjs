// build-action-names.mjs — 產生 data/action-names/（技能／狀態／特性的四語查詢分片）
//
// 解決的問題：攻略、國際服影片、Discord 貼的巨集都是英文或日文技能名，
// 台服玩家複製進遊戲會整段失效——`/ac "Raging Strikes"` 在台服要寫 `/ac "猛者的擊打"`。
// 手動一個一個對照是最勸退的一步。
//
// ── 與 build-item-names.mjs 的關係 ─────────────────────────────────
// **同一套分片規則**（`FNV-1a(正規化鍵) % 256`），只是換一組資料與輸出目錄。
// 正規化與雜湊的實作**直接 import 那支**，不另外抄一份——抄一份就會有兩份會漂的規則。
// 前端也共用 `assets/js/item-names.js` 的 NameLookup 工廠。
//
// ── 收錄什麼，以及為什麼要分「玩家技能」 ─────────────────────────
//   tw-actions   38,490 筆裡**只有 1,373 個是玩家技能**（XIVAPI v2 的 `Action.IsPlayerAction`），
//                其餘五萬筆是敵人／NPC 技能。
//   tw-statuses   4,161（狀態效果，`/statusoff` 用得到）
//   tw-traits       668（特性，巨集不會用但辭典查得到）
//
// ⚠ **一定要優先玩家技能**。第一版全部一起收，撞出 3,106 個同名衝突，而且都是
//    「玩家技能 vs 同名的敵人技能」：英文 `Infuriate` 同時是戰士的「戰嚎」與某敵人的
//    「勃然大怒」、`Attack` 同時是「攻擊」與「防衛反應」。先到先贏的話，
//    巨集翻譯會把玩家技能翻成敵人技能的名字——**而且完全看不出來**。
//    現在玩家技能先寫、敵人技能只在該鍵還空著時才補。
//
// 只收**有台服繁中名**的；查不到台服名的不收（鐵則）。
//
// ── 型別分開存 ──────────────────────────────────────────────────────
// 同一個名字可能同時是技能與狀態（「疾風」既是技能也是 DoT）。
// 分成 a／s／t 三個子物件，前端可以依巨集指令決定先查哪一種
// （`/ac` 先查技能、`/statusoff` 先查狀態）。
//
// 執行（repo 根目錄）：
//   node scripts/build-action-names.mjs            # dry-run，印報告
//   node scripts/build-action-names.mjs --apply    # 寫入 data/action-names/

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { normalizeName, shardOf } from "./build-item-names.mjs";
import { xiv } from "./lib/xivapi.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OUT = join(DATA, "action-names");
const CACHE = join(ROOT, "out_data", "cache");
const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const SHARDS = 256;      // 必須與 build-item-names.mjs 一致（共用 shardOf）
const TC = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/";

// [輸出鍵, 台服檔, 多語檔]
const SETS = [
  ["a", "tw/tw-actions.json", "actions.json"],
  ["s", "tw/tw-statuses.json", "statuses.json"],
  ["t", "tw/tw-traits.json", "traits.json"],
];

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
  // 哪些 Action 是玩家技能。全表 51,501 筆、只有 1,373 個是——快取起來不必每次重抓。
  const actionRows = await xiv.sheet("Action", "IsPlayerAction", {
    limit: 500, cache: join(CACHE, "actions-v2.json"), offline, label: "  Action：",
  });
  const isPlayer = new Set(actionRows.filter((r) => r.f.IsPlayerAction).map((r) => r.id));
  console.log(`  玩家技能 ${isPlayer.size} / ${actionRows.length}`);

  const shards = new Map();
  const stat = { keys: 0, noTw: 0, collide: 0, collidePlayer: 0, byKind: {}, byLang: { en: 0, ja: 0, cn: 0, tw: 0 } };
  const collisions = [];

  for (const [kind, twFile, mlFile] of SETS) {
    const tw = await grab(twFile);
    let ml = {};
    try { ml = await grab(mlFile); } catch { /* 多語檔缺就只收繁中（至少查得到自己） */ }
    let n = 0;
    // 兩輪：玩家技能先佔位，敵人技能只補空的（見檔頭的衝突說明）
    const ids = Object.keys(tw);
    const ordered = kind === "a"
      ? [...ids.filter((id) => isPlayer.has(Number(id))), ...ids.filter((id) => !isPlayer.has(Number(id)))]
      : ids;

    for (const id of ordered) {
      const t = tw[id]?.tw;
      if (!t || !isTw(t)) { stat.noTw++; continue; }
      n++;
      const m = ml[id] || {};
      const entries = [["tw", t], ["en", m.en], ["ja", m.ja], ["cn", m.zh || m.cn]];
      for (const [lang, name] of entries) {
        if (!name) continue;
        const key = normalizeName(name);
        if (!key) continue;
        if (lang === "cn" && normalizeName(t) === key) continue;      // 簡繁同字不另存
        const sh = shardOf(key);
        if (!shards.has(sh)) {
          shards.set(sh, {
            a: { en: {}, ja: {}, cn: {}, tw: {} },
            s: { en: {}, ja: {}, cn: {}, tw: {} },
            t: { en: {}, ja: {}, cn: {}, tw: {} },
          });
        }
        // ⚠ 語言要再分一層。第一版寫成扁平表（k.a[key]），而前端 NameLookup 預期
        //    k.a[lang][key]——**查詢一律回 null，而且兩邊都不報錯**，是回歸測到的。
        const bucket = shards.get(sh)[kind][lang];
        if (bucket[key] !== undefined) {
          // 同型別同語言撞名。玩家技能之間撞名才是真問題——
          // 玩家技能 vs 敵人技能撞名是預期的（上面已經讓玩家技能先佔位）。
          if (bucket[key] !== t) {
            const bothPlayer = kind === "a" && isPlayer.has(Number(id));
            if (bothPlayer) {
              stat.collidePlayer++;
              if (collisions.length < 8) collisions.push(`⚠ 玩家技能撞名 ${lang}「${key}」：「${bucket[key]}」vs「${t}」`);
            } else stat.collide++;
          }
          continue;
        }
        bucket[key] = t;
        stat.keys++;
        stat.byLang[lang]++;
      }
    }
    stat.byKind[kind] = n;
    if (kind === "a") stat.playerActions = ordered.filter((id) => isPlayer.has(Number(id)) && tw[id]?.tw).length;
  }

  const files = [];
  for (const [sh, b] of [...shards].sort((a, x) => a[0] - x[0])) {
    const count = Object.values(b).reduce((a2, kindObj) =>
      a2 + Object.values(kindObj).reduce((a3, langObj) => a3 + Object.keys(langObj).length, 0), 0);
    const json = JSON.stringify({ schema: "action-names", shard: sh, count, k: b });
    files.push({ shard: sh, name: `${sh}.json`, json, gz: gzipSync(json).length, count });
  }
  const totalGz = files.reduce((a, f) => a + f.gz, 0);
  const biggest = files.slice().sort((a, b) => b.gz - a.gz)[0];

  console.log(`技能 ${stat.byKind.a}／狀態 ${stat.byKind.s}／特性 ${stat.byKind.t}，共 ${stat.keys} 個查詢鍵，切成 ${files.length} 片`);
  console.log(`  各語言鍵數：英 ${stat.byLang.en}、日 ${stat.byLang.ja}、簡 ${stat.byLang.cn}、繁 ${stat.byLang.tw}`);
  console.log(`  略過無台服名 ${stat.noTw}；玩家↔敵人同名 ${stat.collide}（玩家優先，預期內）；**玩家技能互撞 ${stat.collidePlayer}**`);
  if (collisions.length) console.log(`    ` + collisions.join("\n    "));
  console.log(`  合計 gzip ${(totalGz / 1024).toFixed(0)}KB；單片平均 ${(totalGz / files.length / 1024).toFixed(1)}KB、最大 ${(biggest.gz / 1024).toFixed(1)}KB`);

  const over = files.filter((f) => f.gz > 30 * 1024);
  if (over.length) {
    console.error(`\n✗ 有 ${over.length} 片 gzip 超過 30KB——SHARDS 要跟 build-item-names.mjs 一起調（兩邊共用 shardOf）`);
    process.exit(1);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  if (existsSync(OUT)) for (const f of await readdir(OUT)) if (f.endsWith(".json")) await rm(join(OUT, f));
  await mkdir(OUT, { recursive: true });
  for (const f of files) await writeFile(join(OUT, f.name), f.json);
  await writeFile(join(OUT, "_index.json"), JSON.stringify({
    schema: "action-names-index",
    updated: new Date().toISOString().slice(0, 10),
    source: "Teamcraft tw/tw-{actions,statuses,traits}.json ＋ {actions,statuses,traits}.json（多語）",
    note: `片號 = FNV-1a(正規化鍵) % ${SHARDS}，與 data/item-names/ 同一套規則（共用 scripts/build-item-names.mjs 的 shardOf）。k 分 a=技能／s=狀態／t=特性。`,
    shards: SHARDS,
    kinds: stat.byKind,
    keys: stat.keys,
  }));
  console.log(`\n✓ data/action-names/（${files.length} 片＋_index.json）`);
  console.log("  這個目錄刻意不進 minify-data.mjs；跑完必接 node scripts/validate-item-names.mjs");
}

main().catch((e) => { console.error(e); process.exit(1); });
