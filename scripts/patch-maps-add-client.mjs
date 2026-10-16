// patch-maps-add-client.mjs — data/maps.json 補「站上資料有引用、maps.json 沒收」的地圖，並補空白地名
//
// 為什麼需要：maps.json 210 張停在 06-23，之後的新區域沒進來。2026-10-10 升 7.25 時，收藏頁有 17 筆兌換來源
// 落在新月島南部（Map 967）、渴望灣（Map 1003），因為 maps.json 沒有這兩張，接取點的 mapId 只能記 null
// （開不了地圖）。另有 274、356 兩張的 name 是空字串（nameMissing），被 npcs.json 引用 32 筆。
//
// 各欄位的來源（不憑印象）：
//   SizeFactor／OffsetX／OffsetY／Id（底圖鍵）／PlaceName／TerritoryType.WeatherRate   XIVAPI v2 Map
//   name、region                 台服客戶端 PlaceName（依 XIVAPI 給的 row id；scripts/lib/tc-datamining.mjs）
//   nameEn                       XIVAPI 的 PlaceName.Name（英文）
//   weatherRates                 WeatherRate 的 Rate[]（v2 已是各段機率）＋Weather[] 的 row id → 台服客戶端 Weather.Name。
//                                **保留槽位順序、不合併同名天氣**（天氣演算法靠順序累加區間，知識庫 §4.4 鐵則）。
//   patch                        地名在這一版台服客戶端才有台服名 → 台服版本清單的版號（7.25）；
//                                否則 Teamcraft patch-content 的 placename
//   type                         instance（與優雷卡、博茲雅同類：自己的入口、不是一般野外）
//
// 執行：node scripts/patch-maps-add-client.mjs [--apply] [--ids 967,1003]
// 跑完：node scripts/download-maps.mjs --id 967,1003 → node scripts/patch-collection-client-shops.mjs --apply（把 17 筆的 mapId 補回）

import { readFileSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { xiv } from "./lib/xivapi.mjs";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { TW_RELEASES } from "./lib/tw-releases.mjs";
import { isTranslated } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data", "maps.json");
const APPLY = process.argv.includes("--apply");
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ADD = (argOf("--ids") || "967,1003").split(",").map(Number).filter(Boolean);
const ok = (s) => typeof s === "string" && s.trim() !== "" && isTranslated(s);

async function main() {
  const raw = readFileSync(FILE, "utf8");
  const db = JSON.parse(raw);
  const have = new Map(db.data.map((m) => [m.id, m]));
  const blank = db.data.filter((m) => !m.name).map((m) => m.id);
  const want = [...new Set([...ADD.filter((id) => !have.has(id)), ...blank])];
  if (!want.length) { console.log("沒有要補的地圖。"); return; }

  const rel = TW_RELEASES[TW_RELEASES.length - 1];
  const [place, placePrev, weather] = await Promise.all([
    loadTcSheet("PlaceName", {}), loadTcSheet("PlaceName", { sha: rel.prev.sha }), loadTcSheet("Weather", {}),
  ]);
  const placeName = new Map(place.map((r) => [r.id, String(r.Name || "").trim()]));
  const prevNamed = new Set(placePrev.filter((r) => ok(String(r.Name || "").trim())).map((r) => r.id));
  const weatherName = new Map(weather.map((r) => [r.id, String(r.Name || "").trim()]));
  const pcFile = join(ROOT, "out_data", "cache", "tc-patch-content.json"), pnFile = join(ROOT, "out_data", "cache", "tc-patch-names.json");
  const placePatch = new Map();
  if (existsSync(pcFile) && existsSync(pnFile)) {
    const pc = JSON.parse(readFileSync(pcFile, "utf8")), pn = JSON.parse(readFileSync(pnFile, "utf8"));
    for (const [pid, types] of Object.entries(pc)) for (const id of types.placename || []) if (!placePatch.has(id)) placePatch.set(id, pn[pid]?.version);
  }

  const rows = await xiv.rows("Map", want, [
    "Id", "SizeFactor", "OffsetX", "OffsetY", "PlaceName.Name", "PlaceName@as(raw)", "PlaceNameRegion@as(raw)",
    "TerritoryType.WeatherRate.Rate", "TerritoryType.WeatherRate.Weather@as(raw)",
  ].join(","), { label: "Map：" });            // → Map(id → 欄位)

  const changes = [];
  for (const [rid, fields] of rows) {
    const r = { id: Number(rid) };
    const f = fields || {};
    const pid = f["PlaceName@as(raw)"];
    const name = placeName.get(pid);
    if (!ok(name)) { console.log(`  ✗ Map ${r.id}：PlaceName ${pid} 沒有台服名，不補（鐵則：查不到就不顯示）`); continue; }
    if (have.has(r.id)) {                       // 既有的空白地名：只補名稱
      const m = have.get(r.id);
      changes.push(`補名 ${r.id}：「${m.name}」→「${name}」`);
      m.name = name; delete m.nameMissing;
      if (!m.nameEn && f["PlaceName"]?.fields?.Name) m.nameEn = f["PlaceName"].fields.Name;
      continue;
    }
    const wr = f.TerritoryType?.fields?.WeatherRate?.fields || {};
    const rates = wr.Rate || [], wids = wr["Weather@as(raw)"] || wr.Weather || [];
    const weatherRates = [];
    for (let i = 0; i < rates.length; i++) {
      const wid = typeof wids[i] === "object" ? wids[i]?.row_id : wids[i];
      const wn = weatherName.get(Number(wid));
      if (rates[i] > 0 && ok(wn)) weatherRates.push({ weather: wn, rate: rates[i] });
    }
    const region = placeName.get(f["PlaceNameRegion@as(raw)"]);
    const key = f.Id;
    const entry = {
      id: r.id, name, nameEn: f["PlaceName"]?.fields?.Name ?? f["PlaceName.Name"] ?? null,
      region: ok(region) ? region : null, type: "instance",
      sizeFactor: f.SizeFactor ?? 100, offsetX: f.OffsetX ?? 0, offsetY: f.OffsetY ?? 0,
      ...(weatherRates.length ? { weatherRates } : {}),
      image: { key, local: `/assets/maps/${String(key).replace("/", "_")}.jpg`, url: `https://v2.xivapi.com/api/asset/map/${key}` },
      patch: prevNamed.has(pid) ? (placePatch.get(pid) ?? null) : rel.version,
    };
    db.data.push(entry);
    changes.push(`新增 ${r.id} ${name}（${entry.nameEn}）｜${entry.region ?? "-"}｜size ${entry.sizeFactor}｜天氣 ${weatherRates.map((w) => `${w.weather}${w.rate}`).join("／") || "（無）"}｜底圖 ${key}｜patch ${entry.patch}`);
  }
  for (const c of changes) console.log("  " + c);
  if (!APPLY) { console.log("\n（dry-run，未寫入；加 --apply 寫回 data/maps.json）"); return; }
  if (!changes.length) return;
  db.data.sort((a, b) => a.id - b.id);
  db.count = db.data.length;
  db.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FILE, raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
  console.log(`\n✓ data/maps.json（${db.count} 張）`);
}

main().catch((e) => { console.error("錯誤：", e.message); process.exit(1); });
