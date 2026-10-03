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

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isTranslated, mayContainUntranslated } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");

const meta = JSON.parse(readFileSync(join(DATA, "_meta.json"), "utf8"));
const GAME_PATCH = meta.gamePatch || "7.21";

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

/* ── _meta.json 是否與各資料檔同步 ──────────────────────────────────────────
   `_meta.databases[].updated/count` 以前純手動維護，結果從 2026-06-23 之後就沒人更新，
   23 個庫有 14 個的日期停在 6 月。與其「記得去更新」，不如讓這支（改完資料必跑的那支）
   自己抓出來——不同步就報 warning，跑 `node scripts/sync-meta.mjs --apply` 即可修好。 */
{
  const stale = [];
  for (const d of meta.databases || []) {
    if (!d.file) continue;
    const p = join(DATA, d.file);
    if (!existsSync(p)) continue;
    let j;
    try { j = JSON.parse(readFileSync(p, "utf8")); } catch (e) { continue; }
    const arr = Array.isArray(j.data) ? j.data : (Array.isArray(j.zones) ? j.zones : null);
    const count = j.count ?? (arr ? arr.length : null);
    if ((j.updated && d.updated !== j.updated) || (count != null && d.count !== count)) stale.push(d.file);
  }
  if (stale.length) {
    console.log("_meta.json");
    W(`${stale.length} 個資料庫的 updated/count 與實際檔案不符 → 跑 node scripts/sync-meta.mjs --apply`
      + `（${stale.slice(0, 5).join("、")}${stale.length > 5 ? "…" : ""}）`);
  }
}


/* ── 日文原文／內部佔位列有沒有漏到前端資料裡 ─────────────────────────────
   站內的台服名守門以前是 **19 份各自手寫的 `/[一-鿿]/`**，語意是「有漢字就當台服名」。
   那個判斷只要字串裡任何一處有漢字就整串放行，所以混了假名的日文原文會直接上畫面：
   「シーズナルイベント報酬の交換」（有 報酬／交換）、「コメンデーションクリスタルの取引」（有 取引）。
   實測漏了 7 個日文店名到 NPC 商店目錄、25 條日文取得方式到市場頁、834 個日文技能名到巨集轉譯。
   守門已收斂到 `scripts/lib/tw-text.mjs` 一份；這裡是**產出面**的防回歸——
   守門再被繞過（或哪個腳本又自己寫一份）時，這支會直接把字串指出來。 */
{
  /* 白名單：每條都要講得出「為什麼這份可以有日文」。
     欄名以 Ja／_ja 結尾的一律放行——那是**刻意**的日文欄（對照上游用），已確認前端不 render。 */
  const ALLOW = [
    ["monsters.json", "建置用檔，前端不載；日文的是遊戲內部佔位列（ラベル削除予定、（仮）…）"],
    ["npcs.json", "建置用檔，前端不載；消費端一律過 isTw()"],
    ["bluemage-sources-tc.json", "抓取中繼檔，spell_ja 是刻意的日文欄"],
    ["obtainable-methods.json", "上游 dump 原樣保存；顯示端一律過 lib/obtainable.mjs 的 convertOm()"],
    ["mounts.json", "只有 id 419（patch 7.5，台服未開放），_noTwName + patch-gate 雙重隱藏"],
  ];
  const allowOf = (rel) => ALLOW.find(([f]) => rel === f || rel.endsWith("/" + f));

  const leaks = [];
  const walk = (dir, rel) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) { walk(join(dir, d.name), rel + d.name + "/"); continue; }
      if (!d.name.endsWith(".json")) continue;
      const relPath = rel + d.name;
      if (allowOf(relPath)) continue;
      let raw;
      try { raw = readFileSync(join(dir, d.name), "utf8"); } catch { continue; }
      if (!mayContainUntranslated(raw)) continue;                 // 便宜的前置篩
      let j;
      try { j = JSON.parse(raw); } catch { continue; }
      const seen = new Map();
      const rec = (v, path) => {
        if (typeof v === "string") {
          if (/(?:Ja|_ja)$/.test(path.split(".").pop() || "")) return;   // 刻意的日文欄
          if (!isTranslated(v)) seen.set(path, v);
        } else if (Array.isArray(v)) v.forEach((x) => rec(x, path + "[]"));
        else if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) rec(x, path ? path + "." + (/^\d+$/.test(k) ? "*" : k) : k);
        }
      };
      rec(j, "");
      for (const [p, sample] of seen) leaks.push([relPath, p, sample]);
    }
  };
  walk(DATA, "");

  if (leaks.length) {
    // 同一份檔的同一個欄位只報一次（分片目錄會有 256 份長一樣的）
    const uniq = new Map();
    for (const [f, p, s] of leaks) {
      const key = f.replace(/\/\d+\.json$/, "/*.json") + "  " + p;
      if (!uniq.has(key)) uniq.set(key, s);
    }
    console.log("台服名守門");
    for (const [key, s] of [...uniq].slice(0, 8)) E(`日文原文漏到前端資料：${key} 例「${s}」`);
    if (uniq.size > 8) E(`…另有 ${uniq.size - 8} 處（跑 node scripts/validate-data.mjs 看完整清單）`);
    E("守門在 scripts/lib/tw-text.mjs 的 isTw()／isTranslated()，別在各腳本自己寫一份");
  }
}

/* ── 收藏頁取得方式的英文（2026-10-03）──────────────────────────────────────
   上面那道守門只擋日文假名，**不擋英文**：「製作：Craftable」「Unknown Shop」「Gil x120000, at 南薩納蘭」
   這類字串在樂譜頁可見條目裡有 124 首，一直沒被抓到。規則與白名單只有一份，在
   scripts/patch-collection-source-text.mjs（normalize／badLatin）；這裡報錯時就跑那支 --apply。 */
{
  const { normalize, badLatin } = await import("./patch-collection-source-text.mjs");
  const hits = [];
  for (const f of ["mounts", "minions", "orchestrion", "barding", "emotes", "triple-triad", "hairstyles", "ornaments"]) {
    const d = JSON.parse(readFileSync(join(DATA, f + ".json"), "utf8")).data;
    for (const e of d) for (const s of e.sources || []) {
      for (const k of ["detail", "where", "condition"]) {
        if (badLatin(s[k], e.name || "").length || (k === "detail" && normalize(s[k])[1])) hits.push(`${f}｜${e.name}｜${s[k]}`);
      }
    }
  }
  if (hits.length) {
    console.log("收藏頁取得方式的英文");
    for (const h of hits.slice(0, 6)) E(`英文漏到收藏頁：${h}`);
    if (hits.length > 6) E(`…另有 ${hits.length - 6} 筆`);
    E("跑 node scripts/patch-collection-source-text.mjs --apply（規則與白名單都在那支）");
  }
}

console.log(`\n結果：${errors} error、${warns} warning`);
process.exit(errors > 0 ? 1 : 0);
