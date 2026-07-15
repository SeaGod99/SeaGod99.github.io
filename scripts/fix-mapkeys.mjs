// 從 XIVAPI v2 撈每張地圖的真實 mapKey、SizeFactor、Offset、天氣率，回填 maps.json
//
// 為什麼需要：手動推測的 mapKey（如 f1e1/00）多會 404；SizeFactor 也常猜錯（主城/居住區是 200）。
// XIVAPI 的 Map sheet 有正確的 Id 欄位（形如 "f1t1/00"）與 SizeFactor，連帶可撈天氣率。
//
// 執行（repo 根目錄，需 Node 18+）：
//   node scripts/fix-mapkeys.mjs          # 修正 maps.json
//   node scripts/download-maps.mjs        # 再抓圖（已有的會略過）
//
// 比對方式：用英文地名（PlaceName.Name）對 maps.json 的 nameEn。
// 撈不到的會列出來，請手動到 https://v2.xivapi.com/api/sheet/Map 查。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_JSON = join(__dirname, "..", "data", "maps.json");
const API = "https://v2.xivapi.com/api/sheet/Map";

function mkImage(key) {
  return {
    key,
    local: `/assets/maps/${key.replace("/", "_")}.jpg`,
    url: `https://v2.xivapi.com/api/asset/map/${key}`,
  };
}

const norm = (s) => (s || "").toLowerCase().replace(/['’\-\s.]/g, "");

// 英文天氣 → 繁中（XIVAPI 取的是英文名）
const WEATHER_TC = {
  "Clear Skies": "碧空", "Fair Skies": "晴朗", "Clouds": "陰天", "Fog": "薄霧",
  "Wind": "微風", "Gales": "強風", "Rain": "小雨", "Showers": "暴雨",
  "Thunder": "打雷", "Thunderstorms": "雷雨", "Dust Storms": "揚沙", "Sandstorms": "沙塵暴",
  "Hot Spells": "熱浪", "Heat Waves": "熱浪", "Snow": "降雪", "Blizzards": "暴雪",
  "Gloom": "妖霧", "Umbral Wind": "靈風", "Umbral Static": "放電現象",
  "Moon Dust": "月塵", "Astromagnetic Storm": "星磁暴", "Astromagnetic Storms": "星磁暴",
  "Tension": "緊張",
};
const tcWeather = (en) => WEATHER_TC[en] || en;

// 把 XIVAPI WeatherRate 轉成 [{weather, rate}]
// 注意：v2 API 的 Rate[] 已是「各段機率」（非原始 sheet 的累進上界），直接使用。
// 必須保留原始槽位順序、不可合併同名天氣——天氣種子演算法靠順序累加出區間，
// 合併會位移區間邊界，導致特定 seed 算出錯誤天氣。
function parseWeather(wr) {
  if (!wr?.fields) return [];
  const rates = wr.fields.Rate || [];
  const weathers = wr.fields.Weather || [];
  const out = [];
  for (let i = 0; i < rates.length; i++) {
    const pct = rates[i];
    const en = weathers[i]?.fields?.Name;
    if (en && pct > 0) out.push({ weather: tcWeather(en), rate: pct });
  }
  return out;
}

async function fetchAllMaps() {
  const fields = [
    "Id",
    "SizeFactor",
    "OffsetX",
    "OffsetY",
    "PlaceName.Name",
    "TerritoryType.WeatherRate.Rate",
    "TerritoryType.WeatherRate.Weather[].Name",
  ].join(",");

  const out = [];
  let after = 0; // ← 修正：之前用 -1 會 400。row 0 是空列，從 0 開始 after 會跳過它
  while (true) {
    const url = `${API}?fields=${encodeURIComponent(fields)}&limit=500&after=${after}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Map sheet HTTP ${res.status} @ after=${after}`);
    const json = await res.json();
    const rows = json.rows || [];
    if (!rows.length) break;
    for (const r of rows) {
      const f = r.fields || {};
      out.push({
        rowId: r.row_id,
        id: f.Id,
        place: f.PlaceName?.fields?.Name,
        sizeFactor: f.SizeFactor,
        offsetX: f.OffsetX,
        offsetY: f.OffsetY,
        weather: parseWeather(f.TerritoryType?.fields?.WeatherRate),
      });
    }
    after = rows[rows.length - 1].row_id;
    if (rows.length < 500) break;
  }
  return out.filter((m) => m.id && m.place);
}

async function main() {
  console.log("撈取 XIVAPI Map sheet…");
  const all = await fetchAllMaps();
  console.log(`  取得 ${all.length} 筆有效 Map 列`);

  // 英文地名 → 完整 map 資料（同名取第一個）
  const byPlace = new Map();
  for (const m of all) {
    const k = norm(m.place);
    if (!byPlace.has(k)) byPlace.set(k, m);
  }

  const db = JSON.parse(await readFile(MAPS_JSON, "utf8"));
  let fixed = 0;
  const misses = [];

  for (const entry of db.data) {
    const hit = byPlace.get(norm(entry.nameEn));
    if (!hit) { misses.push(`[${entry.id}] ${entry.name} / ${entry.nameEn}`); continue; }
    entry.image = mkImage(hit.id);
    if (typeof hit.sizeFactor === "number") entry.sizeFactor = hit.sizeFactor;
    if (typeof hit.offsetX === "number") entry.offsetX = hit.offsetX;
    if (typeof hit.offsetY === "number") entry.offsetY = hit.offsetY;
    if (hit.weather.length) entry.weatherRates = hit.weather;
    fixed++;
  }

  await writeFile(MAPS_JSON, JSON.stringify(db, null, 2));
  console.log(`\n回填 ${fixed} 筆（mapKey + SizeFactor + Offset + 天氣率），比對不到 ${misses.length}`);
  if (misses.length) {
    console.log("以下需手動確認（搜該英文地名的 Map.Id）：");
    misses.forEach((m) => console.log("  - " + m));
  }
  console.log("\n完成。接著跑：node scripts/download-maps.mjs");
}

main().catch((e) => { console.error(e); process.exit(1); });
