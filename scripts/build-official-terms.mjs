// build-official-terms.mjs — 術語單一來源：職業名、資料片名、天氣名、種族名（台服客戶端官方）
//
// 為什麼需要：這幾類詞散在前端 9 張手寫對照表與幾支建置腳本裡，第三輪盤點（10-09）量到 4 張出錯——
// 製作採集職 10 個是陸服名轉繁（刻木匠…捕魚人）、資料片 5 個不是台服名（原初之地…金曦之遺輝）、
// 天氣 4 個（陰天／降雪／放電現象／星磁暴）、種族 1 個（維埃拉族）。站主 2026-10-10 拍板：一律改台服官方，
// **舊名留作別名**（搜尋、舊分享連結 ?job=／?f_patch= 不能因此失效）。
//
// 來源（台服客戶端解包，scripts/lib/tc-datamining.mjs）：
//   ClassJob.Name／Abbreviation   → jobs（站內鍵＝職業縮寫，與 data/equip.json 的 names 相同）
//   ExVersion.Name（row 0..5）    → expansions（major＝row＋2：0 新生艾奧傑亞＝2.x … 5 黃金遺產＝7.x）
//   Weather.Name（指定 row）      → weather（站內鍵＝assets/js/eorzea-weather.js 的 WEATHER_INFO 鍵）
//   Race.Masculine                → races
// 別名（alias）＝站上目前／過去用的非官方寫法，只在跟官方不同時才收，給前端做「舊名也認得」。
//
// 輸出：
//   data/official-terms.json      給建置腳本與回歸用
//   assets/js/official-terms.js   前端用（classic script，載入即同步可用：window.OfficialTerms）。
//     **刻意不做成 fetch JSON**：collection-tracker.js 的篩選在引擎載入時就要用、eorzea-weather.js
//     是 ES module——改成非同步就是「重構後該響沒響」的雷區（知識庫 §4.58）。
// ES module 與 Node 腳本（eorzea-weather.js、fix-mapkeys.mjs）不吃這支，**由 validate-official-terms.mjs
// 比對它們的手寫表與這份 JSON 一致**，改任一邊不同步就會紅。
//
// 執行：node scripts/build-official-terms.mjs [--apply] [--offline]

import { readFileSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { isTranslated } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");
const OUT_JSON = join(ROOT, "data", "official-terms.json");
const OUT_JS = join(ROOT, "assets", "js", "official-terms.js");

/* 站上用過的非官方寫法（別名）。只列跟官方不同的；來源是 10-09 盤點量到的現況。
   職業的舊名直接讀 data/equip.json 的 names（建置時它還是舊值；之後改成官方也不影響——
   別名只在與官方不同時才收，所以這裡另外寫死一份舊名，免得 equip.json 改完後別名消失）。 */
const JOB_ALIASES = {
  CRP: ["刻木匠"], BSM: ["鍛鐵匠"], ARM: ["鑄甲匠"], GSM: ["雕金匠"], LTW: ["製革匠"], WVR: ["裁衣匠"],
  ALC: ["煉金術士"], MIN: ["採礦工"], BTN: ["園藝工"], FSH: ["捕魚人"],
  // 小隊頁曾寫的基礎職名（tools/squadron/index.html 的 JOB_NAME，10-09 盤點）
  MRD: ["斧術師"], GLA: ["劍術師"], ARC: ["弓箭手"], ROG: ["雙劍師"], LNC: ["槍術師"], PGL: ["格鬥家"],
  CNJ: ["幻術師"], THM: ["咒術師"], ACN: ["秘術師"],
};
const EXPANSION_ALIASES = ["原初之地", "蒼天之禁地", "紅蓮之狂潮", "暗影之逆焰", "曉月之終途", "金曦之遺輝"];
// WEATHER_INFO 的鍵 → 客戶端 Weather row（英文名對過 XIVAPI：1 Clear Skies … 149 Astromagnetic Storm）
const WEATHER_ROWS = {
  clearSkies: 1, fairSkies: 2, clouds: 3, fog: 4, wind: 5, gales: 6, rain: 7, showers: 8, thunder: 9,
  thunderstorms: 10, dustStorms: 11, sandstorms: 12, heatWaves: 14, snow: 15, blizzards: 16, gloom: 17,
  umbralWind: 49, umbralStatic: 50, moonDust: 148, astromagneticStorms: 149,
  hotSpells: 13,
  /* 特殊天氣（副本／特殊場景，2026-10-11 加）：maps.json 以前直接存英文名（fix-mapkeys.mjs 的 WEATHER_TC 沒收），
     天氣頁就把 Vacuity、Pandæmonium 印出來。同一種天氣在客戶端有好幾列（Transcendence 162–169…），名字相同，取最小的 row。 */
  dimensionalDisruption: 77, everlastingLight: 118, polarization: 151, pandaemonium: 157, transcendence: 162,
  vacuity: 171, liminality: 181, atmosphericPhantasms: 190, illusoryDisturbances: 191,
  /* 英文同名、台服另譯的兩列（只出現在副本圖）：row 28 英文也是 Gales 但台服叫「暴風」（呼嘯眼）、
     row 125 英文 Brilliance、台服「光天」（完璧王座）。不收的話 maps.json 有兩格對不到鍵。 */
  violentGales: 28, brilliance: 125,
};
/* 別名：站上用過的非官方寫法。特殊天氣站上用過的是英文名，一併收（給 weatherKeyOf()／舊資料認得用，不是顯示用）。
   Hot Spells 以前被 WEATHER_TC 譯成「熱浪」（與 Heat Waves 撞名），那個「熱浪」不能當別名——它是 Heat Waves 的官方名。 */
const WEATHER_ALIASES = {
  clouds: ["陰天"], snow: ["降雪"], umbralStatic: ["放電現象"], astromagneticStorms: ["星磁暴", "星磁暴雨"],
  hotSpells: ["Hot Spells"],
  dimensionalDisruption: ["Dimensional Disruption"], everlastingLight: ["Everlasting Light"], polarization: ["Polarization"],
  pandaemonium: ["Pandæmonium"], transcendence: ["Transcendence"], vacuity: ["Vacuity"], liminality: ["Liminality"],
  atmosphericPhantasms: ["Atmospheric Phantasms"], illusoryDisturbances: ["Illusory Disturbances"],
  brilliance: ["Brilliance"],
};
const RACE_ALIASES = { 8: ["維埃拉族"] };

const ok = (s) => typeof s === "string" && s.trim() !== "" && isTranslated(s);
const uniq = (a) => [...new Set(a)];

async function main() {
  const [cj, ex, we, ra] = await Promise.all(["ClassJob", "ExVersion", "Weather", "Race"].map((n) => loadTcSheet(n, { offline: OFFLINE })));

  // ── 職業 ──
  const equip = JSON.parse(readFileSync(join(ROOT, "data", "equip.json"), "utf8"));
  const jobs = {};
  for (const r of cj) {
    const abbr = (r.Abbreviation || "").trim();
    const name = (r.Name || "").trim();
    if (!abbr || !ok(name)) continue;
    const site = equip.names?.[abbr];
    const alias = uniq([...(JOB_ALIASES[abbr] || []), ...(site && site !== name ? [site] : [])]).filter((a) => a !== name);
    jobs[abbr] = { id: r.id, name, ...(alias.length ? { alias } : {}) };
  }
  // 冒險者（row 0）客戶端沒有名字，站上沿用 equip.json 的寫法
  if (!jobs.ADV && equip.names?.ADV) jobs.ADV = { id: 0, name: equip.names.ADV };
  if (Object.keys(jobs).length < 42) throw new Error(`客戶端 ClassJob 只讀到 ${Object.keys(jobs).length} 個職業，欄位可能位移，中止`);

  // ── 資料片 ──
  const expansions = ex.filter((r) => ok(r.Name)).sort((a, b) => a.id - b.id).map((r) => {
    const alias = EXPANSION_ALIASES[r.id] && EXPANSION_ALIASES[r.id] !== r.Name.trim() ? [EXPANSION_ALIASES[r.id]] : [];
    return { ex: r.id, major: r.id + 2, name: r.Name.trim(), short: `${r.id + 2}.x`, ...(alias.length ? { alias } : {}) };
  });
  if (expansions.length !== 6 || expansions[0].name !== "新生艾奧傑亞") throw new Error("ExVersion 不是預期的 6 列（新生艾奧傑亞起），中止");

  // ── 天氣 ──
  const weatherById = new Map(we.map((r) => [r.id, (r.Name || "").trim()]));
  const weather = {};
  for (const [key, row] of Object.entries(WEATHER_ROWS)) {
    const name = weatherById.get(row);
    if (!ok(name)) throw new Error(`客戶端 Weather ${row}（${key}）沒有台服名，中止`);
    const alias = (WEATHER_ALIASES[key] || []).filter((a) => a !== name);
    weather[key] = { id: row, name, ...(alias.length ? { alias } : {}) };
  }

  // ── 種族 ──
  const races = {};
  for (const r of ra) {
    const name = (r.Masculine || "").trim();
    if (!ok(name)) continue;
    const alias = (RACE_ALIASES[r.id] || []).filter((a) => a !== name);
    races[r.id] = { name, ...(alias.length ? { alias } : {}) };
  }

  const today = new Date().toISOString().slice(0, 10);
  const meta = JSON.parse(readFileSync(join(ROOT, "data", "_meta.json"), "utf8"));
  const out = {
    schema: "official-terms",
    updated: today,
    source: `台服客戶端解包 ClassJob／ExVersion／Weather／Race（客戶端 ${meta.twClient?.version ?? "?"}）；alias＝站上用過的非官方寫法`,
    jobs, expansions, weather, races,
  };

  // 報表：有別名的＝改官方後畫面上會變的字
  console.log(`職業 ${Object.keys(jobs).length}（有別名 ${Object.values(jobs).filter((j) => j.alias).length}）`);
  for (const [k, j] of Object.entries(jobs)) if (j.alias) console.log(`   ${k} ${j.name} ← ${j.alias.join("／")}`);
  console.log(`資料片 ${expansions.length}：${expansions.map((e) => e.name + (e.alias ? `（舊 ${e.alias[0]}）` : "")).join("、")}`);
  console.log(`天氣 ${Object.keys(weather).length}（改名 ${Object.values(weather).filter((w) => w.alias).length}）：${Object.values(weather).filter((w) => w.alias).map((w) => `${w.alias[0]}→${w.name}`).join("、")}`);
  console.log(`種族 ${Object.keys(races).length}：${Object.values(races).map((r) => r.name).join("、")}`);

  const json = JSON.stringify(out, null, 1) + "\n";
  const js = renderJs(out);
  const same = existsSync(OUT_JSON) && readFileSync(OUT_JSON, "utf8") === json && existsSync(OUT_JS) && readFileSync(OUT_JS, "utf8") === js;
  if (same) { console.log("\n內容沒變，不寫檔"); return; }
  if (!APPLY) { console.log("\n（dry-run，未寫入；加 --apply 寫 data/official-terms.json 與 assets/js/official-terms.js）"); return; }
  await writeFile(OUT_JSON, json);
  await writeFile(OUT_JS, js);
  console.log("\n✓ data/official-terms.json\n✓ assets/js/official-terms.js");
}

/** 前端版：資料原樣嵌入＋幾個查詢函式（舊名也認得） */
function renderJs(out) {
  const data = JSON.stringify({ jobs: out.jobs, expansions: out.expansions, weather: out.weather, races: out.races });
  return `/* official-terms.js — 台服官方術語（職業／資料片／天氣／種族）
   由 scripts/build-official-terms.mjs 從台服客戶端解包產生，**不要手改**（改了會被 validate-official-terms.mjs 抓到）。
   classic script：載入即同步可用 window.OfficialTerms。alias＝站上用過的非官方寫法，查詢時一律認得。 */
(function () {
  'use strict';
  var T = ${data};
  var byName = {};          // 任何寫法 → 職業縮寫
  Object.keys(T.jobs).forEach(function (k) {
    var j = T.jobs[k];
    byName[j.name] = k;
    (j.alias || []).forEach(function (a) { byName[a] = k; });
  });
  var exByName = {};        // 任何寫法（含「2.x 原初之地」這種舊標籤）→ 資料片
  T.expansions.forEach(function (e) {
    [e.name].concat(e.alias || []).forEach(function (n) { exByName[n] = e; exByName[e.short + ' ' + n] = e; });
  });
  var wByName = {};         // 任何寫法 → 天氣鍵
  Object.keys(T.weather).forEach(function (k) {
    var w = T.weather[k];
    wByName[w.name] = k;
    (w.alias || []).forEach(function (a) { wByName[a] = k; });
  });
  function major(patch) { var m = String(patch == null ? '' : patch).match(/^(\\d+)/); return m ? +m[1] : null; }
  T.jobName = function (abbr) { var j = T.jobs[abbr]; return j ? j.name : null; };
  T.jobAbbrOf = function (name) { return byName[String(name || '').trim()] || null; };
  /** 2..7 或 '7.25' → 資料片物件 */
  T.expansion = function (majorOrPatch) {
    var n = typeof majorOrPatch === 'number' ? majorOrPatch : major(majorOrPatch);
    for (var i = 0; i < T.expansions.length; i++) if (T.expansions[i].major === n) return T.expansions[i];
    return null;
  };
  /** 「2.x 新生艾奧傑亞」這種版本篩選標籤 */
  T.expansionLabel = function (majorOrPatch) { var e = T.expansion(majorOrPatch); return e ? e.short + ' ' + e.name : null; };
  /** 舊名、舊標籤、官方名都認得 → 資料片物件 */
  T.expansionByName = function (name) { return exByName[String(name || '').trim()] || null; };
  T.weatherName = function (key) { var w = T.weather[key]; return w ? w.name : null; };
  T.weatherKeyOf = function (name) { return wByName[String(name || '').trim()] || null; };
  window.OfficialTerms = T;
})();
`;
}

main().catch((e) => { console.error("錯誤：", e.message); process.exit(1); });
