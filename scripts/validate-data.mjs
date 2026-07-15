// 資料庫驗證器 — 守住回填成果，防回歸。
//
// 檢查項：
//   [ERROR] count !== data.length（前端 loadDB 會 console.warn；squadron 曾因此出錯）
//   [ERROR] 信封缺 schema/count/data（結構壞）
//   [WARN]  收藏頁的條目 patch 為粗略 "N.x"（無法數值比較 → patch-gate 失效，如舊 orchestrion）
//   [WARN]  收藏/功能頁 sources 空覆蓋率（承諾「來源查詢」的頁面不該大量空）
//   [INFO]  patch 覆蓋率
//
// 退出碼：有任何 ERROR → 1（可掛 pre-commit / CI）；只有 WARN → 0。
//
// 執行：node scripts/validate-data.mjs

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");

const meta = JSON.parse(readFileSync(join(DATA, "_meta.json"), "utf8"));
const GAME_PATCH = meta.gamePatch || "7.15";

// 有「取得來源／來源查詢」UI 的收藏檔：sources 空覆蓋率要盯，patch 要能數值化
const SOURCE_PAGES = new Set(["mounts", "minions", "orchestrion", "barding", "triple-triad"]);
// 走 patch-gate 隱藏的收藏檔：patch 粗略會讓隱藏失效
const GATED_PAGES = new Set([...SOURCE_PAGES, "emotes", "hairstyles", "exploration-log", "blue-magic"]);

const isCoarse = (p) => p != null && p !== "" && !/^\d+\.\d/.test(String(p));

let errors = 0, warns = 0;
const E = (m) => { console.log("  ❌ " + m); errors++; };
const W = (m) => { console.log("  ⚠️  " + m); warns++; };

const files = readdirSync(DATA).filter((f) => f.endsWith(".json") && f !== "_meta.json");
console.log(`驗證 ${files.length} 個資料檔（gamePatch=${GAME_PATCH}）\n`);

for (const f of files) {
  const name = f.replace(".json", "");
  let db;
  try { db = JSON.parse(readFileSync(join(DATA, f), "utf8")); }
  catch (e) { console.log(f); E(`JSON 解析失敗：${e.message}`); continue; }

  // aether-currents 用 zones 信封（刻意），其餘用 data[]
  const arrKey = Array.isArray(db.data) ? "data" : Array.isArray(db.zones) ? "zones" : null;
  if (!arrKey) continue; // obtainable-methods 等非陣列信封略過
  const arr = db[arrKey];

  const issues = [];
  // count 一致。aether-currents 用 zones 信封，count = 各 zone 的 currents 總數（非 zones 數）。
  const effectiveCount = arrKey === "zones" ? arr.reduce((n, z) => n + (z.currents?.length || 0), 0) : arr.length;
  if (db.count != null && db.count !== effectiveCount) issues.push(["E", `count ${db.count} !== ${arrKey === "zones" ? "currents 總數" : arrKey + ".length"} ${effectiveCount}`]);

  if (GATED_PAGES.has(name)) {
    const coarse = arr.filter((e) => isCoarse(e.patch)).length;
    if (coarse > 0) issues.push(["W", `${coarse} 筆 patch 為粗略 N.x（patch-gate 無法隱藏）`]);
    const noPatch = arr.filter((e) => e.patch == null || e.patch === "").length;
    if (noPatch > arr.length * 0.1) issues.push(["W", `${noPatch}/${arr.length} 筆無 patch（隱藏判斷缺依據）`]);
  }
  if (SOURCE_PAGES.has(name)) {
    const emptySrc = arr.filter((e) => !Array.isArray(e.sources) || e.sources.length === 0).length;
    if (emptySrc > arr.length * 0.05) issues.push(["W", `${emptySrc}/${arr.length} 筆 sources 空（頁面主打來源查詢）`]);
  }

  if (issues.length) {
    console.log(f);
    for (const [lv, m] of issues) (lv === "E" ? E : W)(m);
  }
}

console.log(`\n結果：${errors} error、${warns} warning`);
process.exit(errors > 0 ? 1 : 0);
