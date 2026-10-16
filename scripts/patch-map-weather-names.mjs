// patch-map-weather-names.mjs — 天氣名一律換成台服官方（依 Weather row id，不靠英文名翻譯）
//
// 為什麼需要（2026-10-11）：maps.json 的 weatherRates 是 fix-mapkeys.mjs 用 XIVAPI 的**英文**天氣名
// 經手寫表 WEATHER_TC 翻出來的，那張表有三種錯，而且都不報錯：
//   ① 4 個不是台服官方名：陰天→陰雲、降雪→小雪、放電現象→靈電、星磁暴→磁暴（客戶端與 Teamcraft 一致）
//   ② 兩個英文名翻成同一個字：Hot Spells（高溫）與 Heat Waves（熱浪）都寫成「熱浪」——事後分不出來，
//      只能回頭用 row id 重取
//   ③ 表裡沒有的就原樣留英文：Vacuity、Pandæmonium、Transcendence… 7 種特殊天氣直接上了天氣頁
// 這支走台服客戶端解包：Map.TerritoryType → TerritoryType.WeatherRate → WeatherRate 的 Weather[i]／Rate[i]
// → Weather.Name。**先驗槽位**：客戶端那一列「機率 > 0 的槽位」的機率序列要與 maps.json 逐格相同才換名，
// 不同就整張圖不動、列出來（天氣演算法靠槽位順序累加區間，§4.4 鐵則：不合併、不重排）。
//
// 另外三份資料的天氣是**名字**（沒有 row id 可對）：無人島珍稀動物的出現天氣（island-animals.json、
// 人工表 island-names-tw.json）、停用的 fishing.json——依 data/official-terms.json 的 alias 換成官方名。
// ⚠ 無人島頁（tools/island/）拿這些字串直接比 eorzea-weather.js 的 WEATHER_INFO 顯示名，兩邊要一起換，
//   只換一邊的話動物的天氣條件永遠不成立，畫面上只是「不會出現」。
//
// 執行：node scripts/patch-map-weather-names.mjs [--apply] [--offline]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { cleanName, usable } from "./lib/client-names.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const APPLY = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const readJson = (f) => { const raw = readFileSync(join(DATA, f), "utf8"); return { raw, db: JSON.parse(raw) }; };
const writeJson = (f, raw, db) => writeFile(join(DATA, f), raw.includes('\n  "') || raw.includes('\n "') ? JSON.stringify(db, null, raw.includes('\n  "') ? 2 : 1) + "\n" : JSON.stringify(db) + "\n");

async function main() {
  const [map, tt, wr, we] = await Promise.all(["Map", "TerritoryType", "WeatherRate", "Weather"].map((n) => loadTcSheet(n, { offline })));
  const mapById = new Map(map.map((r) => [r.id, r]));
  const ttById = new Map(tt.map((r) => [r.id, r]));
  const wrById = new Map(wr.map((r) => [r.id, r]));
  const wName = new Map(we.map((r) => [r.id, cleanName(r.Name)]));

  // ── maps.json：依 row id ──
  const { raw, db } = readJson("maps.json");
  const renamed = new Map();        // "舊→新" → 次數
  const skipped = [];
  let maps = 0;
  for (const m of db.data) {
    if (!Array.isArray(m.weatherRates) || !m.weatherRates.length) continue;
    const t = ttById.get(Number(mapById.get(m.id)?.TerritoryType));
    const row = wrById.get(Number(t?.WeatherRate));
    if (!row) { skipped.push(`${m.id} ${m.name}：客戶端查不到 WeatherRate`); continue; }
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const wid = Number(row[`Weather[${i}]`]), rate = Number(row[`Rate[${i}]`]);
      if (wid > 0 && rate > 0) slots.push({ wid, rate });
    }
    const same = slots.length === m.weatherRates.length && slots.every((s, i) => s.rate === m.weatherRates[i].rate);
    if (!same) {
      skipped.push(`${m.id} ${m.name}：槽位不一致（站上 ${m.weatherRates.map((w) => w.rate).join("/")}，客戶端 ${slots.map((s) => s.rate).join("/")}）`);
      continue;
    }
    const names = slots.map((s) => wName.get(s.wid));
    if (!names.every(usable)) { skipped.push(`${m.id} ${m.name}：有天氣沒有台服名（${slots.filter((s, i) => !usable(names[i])).map((s) => s.wid).join(",")}）`); continue; }
    let changed = false;
    m.weatherRates.forEach((w, i) => {
      if (w.weather === names[i]) return;
      const k = `${w.weather}→${names[i]}`;
      renamed.set(k, (renamed.get(k) || 0) + 1);
      w.weather = names[i];
      changed = true;
    });
    if (changed) maps++;
  }
  console.log(`maps.json：${maps} 張圖的天氣名換成官方`);
  for (const [k, n] of [...renamed].sort((a, b) => b[1] - a[1])) console.log(`    ${k}（${n} 格）`);
  if (skipped.length) { console.log(`  略過 ${skipped.length} 張：`); for (const s of skipped) console.log(`    ${s}`); }

  // ── 名字型的天氣欄位：依 official-terms.json 的 alias ──
  const terms = JSON.parse(readFileSync(join(DATA, "official-terms.json"), "utf8"));
  const official = new Map();
  for (const w of Object.values(terms.weather)) for (const a of w.alias || []) official.set(a, w.name);
  const fixName = (s) => (typeof s === "string" && official.has(s) ? official.get(s) : s);
  const others = [];
  const walkWeather = (node, hits) => {
    if (Array.isArray(node)) { node.forEach((x) => walkWeather(x, hits)); return; }
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (k === "weather" && Array.isArray(v)) {
        v.forEach((w, i) => { const n = fixName(w); if (n !== w) { hits.push(`${w}→${n}`); v[i] = n; } });
      } else if (k === "weather" && typeof v === "string") {
        const n = fixName(v); if (n !== v) { hits.push(`${v}→${n}`); node[k] = n; }
      } else walkWeather(v, hits);
    }
  };
  for (const f of ["island-animals.json", "island-names-tw.json", "fishing.json"]) {
    const o = readJson(f);
    const hits = [];
    walkWeather(o.db, hits);
    /* island-names-tw.json 的說明字串（「天氣代碼 1碧空/2晴朗/3陰天(阴云)…」）也跟著改，免得下次有人照抄舊名 */
    let note = 0;
    if (f === "island-names-tw.json") {
      const fixText = (s) => { let t = s; for (const [a, n] of official) if (/[一-鿿]/.test(a)) t = t.split(a).join(n); return t; };
      // 只動說明（底線開頭的鍵底下的字串，例：_animalSource2.verified[3]），資料欄位上面已經處理過
      const walkText = (node, inDoc) => {
        if (!node || typeof node !== "object") return;
        for (const [k, v] of Object.entries(node)) {
          const doc = inDoc || k.startsWith("_");
          if (typeof v === "string" && doc) { const t = fixText(v); if (t !== v) { node[k] = t; note++; } }
          else if (v && typeof v === "object") walkText(v, doc);
        }
      };
      walkText(o.db, false);
    }
    if (hits.length || note) others.push([f, o, hits, note]);
    console.log(`${f}：${hits.length} 處${note ? `（另說明字串 ${note} 處）` : ""}${hits.length ? "　" + [...new Set(hits)].join("、") : ""}`);
  }

  if (!APPLY) { console.log("\n（dry-run，未寫入；加 --apply 套用）"); return; }
  if (maps) await writeJson("maps.json", raw, db);
  for (const [f, o] of others) await writeJson(f, o.raw, o.db);
  console.log(`\n✓ 已寫入 ${(maps ? 1 : 0) + others.length} 個檔`);
}

main().catch((e) => { console.error("錯誤：", e.message); process.exit(1); });
