// build-fishing.mjs
// 建立釣魚資料庫：data/fishing-spots.json + data/fishes.json
//
// 來源：
//   Fish Tracker App data.js    FISH / FISHING_SPOTS / ITEMS / WEATHER_TYPES / ZONES
//   thewakingsands PlaceName.csv placeNameId → 簡中地名 → OpenCC 繁中
//   data/items.json              itemId → 繁中名（魚名 + 餌料名）
//
// 輸出：
//   data/fishing-spots.json
//     id, name(繁中), nameEn, nameJa, mapId, territoryId, coords{x,y}, fishes[]
//
//   data/fishes.json
//     itemId, name(繁中), nameEn
//     spotId, spotName(繁中)
//     startHour, endHour          （0-24，startHour===0 && endHour===24 表示全時段）
//     weatherSet[]                （天氣繁中名陣列，空=無限制）
//     previousWeatherSet[]        （前置天氣）
//     bait[]                      （最佳釣餌路徑，item ID + 繁中名）
//     predators[]                 （以小釣大前置魚，item ID）
//     intuitionLength             （直覺持續秒數，null=一般釣法）
//     hookset                     （"Precision"/"Powerful"/null）
//     tug                         （"light"/"medium"/"heavy"/null）
//     bigFish                     （boolean）
//     fishEyes                    （boolean，需魚眼藥水）
//     folklore                    （需要哪冊傳說圖鑑，null=不需要）
//     patch                       （版本）
//
// 注意：Cowork 沙箱擋外網，需在本機執行。
// 執行（repo 根目錄）：node scripts/build-fishing.mjs
// 需求：Node 18+（內建 fetch）

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const ITEMS_FILE = join(DATA_DIR, "items.json");
const OUT_SPOTS = join(DATA_DIR, "fishing-spots.json");
const OUT_FISHES = join(DATA_DIR, "fishes.json");

const FISH_TRACKER_URL =
  "https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js";
const CN_BASE =
  "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master";

const converter = OpenCC.Converter({ from: "cn", to: "tw" });

// ---------- 工具 ----------

async function fetchText(url, label) {
  process.stdout.write(`  抓取 ${label}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  const text = await res.text();
  console.log(` OK (${(text.length / 1024).toFixed(0)}KB)`);
  return text;
}

// 從 data.js 提取指定 section 的 JSON 物件
// 格式：  SECTION_NAME: { ... },\n  NEXT_SECTION:
function extractSection(js, sectionName) {
  const start = js.indexOf(`  ${sectionName}: `);
  if (start === -1) throw new Error(`Section ${sectionName} not found`);
  const objStart = js.indexOf("{", start);
  if (objStart === -1) throw new Error(`Section ${sectionName} no opening brace`);

  // 找對應的結束括號
  let depth = 0, i = objStart;
  while (i < js.length) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  const objStr = js.slice(objStart, i + 1);
  return JSON.parse(objStr);
}

// ---------- CSV 解析 ----------

function parseCSVLine(line) {
  const fields = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { fields.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function fetchCnPlaceNames() {
  const csv = await fetchText(`${CN_BASE}/PlaceName.csv`, "PlaceName.csv(cn)");
  const map = new Map();
  for (const line of csv.split("\n").slice(3)) {
    const f = parseCSVLine(line.trim());
    const rowId = parseInt(f[0]);
    const cn = f[1] || "";
    if (!cn || isNaN(rowId)) continue;
    map.set(rowId, converter(cn));
  }
  console.log(`  PlaceName(cn→tw) 共 ${map.size} 筆`);
  return map;
}

// FishingSpot.csv：spotId → placeNameId（欄位 24 = PlaceName 欄）
async function fetchFishingSpotPlaceIds() {
  const csv = await fetchText(`${CN_BASE}/FishingSpot.csv`, "FishingSpot.csv");
  const map = new Map(); // spotId → placeNameId
  for (const line of csv.split("\n").slice(3)) {
    const f = parseCSVLine(line.trim());
    if (f.length < 25) continue;
    const spotId = parseInt(f[0]);
    const placeNameId = parseInt(f[24]);
    if (!isNaN(spotId) && !isNaN(placeNameId) && placeNameId > 0) {
      map.set(spotId, placeNameId);
    }
  }
  console.log(`  FishingSpot placeId 共 ${map.size} 筆`);
  return map;
}

// ---------- 主程式 ----------

async function main() {
  console.log("=== build-fishing.mjs ===\n");

  // 1. 讀本地 items.json
  console.log("讀取 items.json…");
  const itemsFile = JSON.parse(await readFile(ITEMS_FILE, "utf8"));
  const itemMap = new Map(); // itemId → 繁中名
  for (const item of itemsFile.data) itemMap.set(item.id, item.name);
  console.log(`  items 共 ${itemMap.size} 筆\n`);

  // 2. 抓遠端資料
  console.log("抓取遠端資料…");
  const [dataJs, placeNames, fishingSpotPlaceIds] = await Promise.all([
    fetchText(FISH_TRACKER_URL, "Fish Tracker data.js"),
    fetchCnPlaceNames(),
    fetchFishingSpotPlaceIds(),
  ]);
  console.log();

  // 3. 解析 data.js
  console.log("解析 data.js…");
  const FISH_DATA = extractSection(dataJs, "FISH");
  const SPOTS_DATA = extractSection(dataJs, "FISHING_SPOTS");
  const ITEMS_DATA = extractSection(dataJs, "ITEMS");
  const WEATHER_DATA = extractSection(dataJs, "WEATHER_TYPES");
  console.log(`  FISH: ${Object.keys(FISH_DATA).length} 筆`);
  console.log(`  FISHING_SPOTS: ${Object.keys(SPOTS_DATA).length} 筆`);
  console.log(`  ITEMS: ${Object.keys(ITEMS_DATA).length} 筆`);
  console.log(`  WEATHER_TYPES: ${Object.keys(WEATHER_DATA).length} 筆\n`);

  // 天氣 ID → 繁中名（用英文 fallback）
  const weatherName = (id) => {
    const w = WEATHER_DATA[id];
    if (!w) return String(id);
    // 天氣名稱目前無繁中來源，用英文
    return w.name_en || String(id);
  };

  // 餌料/物品 繁中名（優先 items.json，fallback ITEMS_DATA 英文）
  const baitName = (id) => {
    return itemMap.get(id) || ITEMS_DATA[id]?.name_en || String(id);
  };

  // 釣點繁中名：優先用 FishingSpot.csv PlaceName → PlaceName.csv 簡中轉繁中
  // fallback 用 name_ja 套 OpenCC（純假名時轉換無效但至少有日文）
  const spotName = (spotId, ja) => {
    const placeId = fishingSpotPlaceIds.get(spotId);
    if (placeId) {
      const tw = placeNames.get(placeId);
      if (tw) return tw;
    }
    return ja ? converter(ja) : null;
  };

  // ---------- 建立釣點資料 ----------
  console.log("建立釣點資料…");
  const spotsOut = [];

  for (const [idStr, spot] of Object.entries(SPOTS_DATA)) {
    const spotId = Number(idStr);
    // 哪些魚在這個釣點
    const fishes = Object.values(FISH_DATA)
      .filter((f) => f.location === spotId)
      .map((f) => f._id);

    spotsOut.push({
      id: spotId,
      name: spotName(spotId, spot.name_ja),
      nameEn: spot.name_en || "",
      nameJa: spot.name_ja || "",
      territoryId: spot.territory_id ?? null,
      coords: spot.map_coords
        ? { x: spot.map_coords[0], y: spot.map_coords[1] }
        : null,
      fishes,
    });
  }

  spotsOut.sort((a, b) => a.id - b.id);
  console.log(`  釣點共 ${spotsOut.length} 筆`);

  // ---------- 建立魚的資料 ----------
  console.log("建立魚的資料…");
  const fishesOut = [];
  let noTwName = 0;

  for (const [idStr, fish] of Object.entries(FISH_DATA)) {
    const itemId = Number(idStr);
    const nameTw = itemMap.get(itemId) ?? null;
    const nameEn = ITEMS_DATA[itemId]?.name_en || "";

    if (!nameTw) noTwName++;

    // 餌料路徑（bestCatchPath）
    const bait = (fish.bestCatchPath || []).map((id) => ({
      itemId: id,
      name: baitName(id),
    }));

    // 以小釣大前置魚（predators）
    const predators = (fish.predators || []).map((id) => ({
      itemId: id,
      name: itemMap.get(id) || ITEMS_DATA[id]?.name_en || String(id),
    }));

    const spotId = fish.location ?? null;
    const spot = spotId != null ? SPOTS_DATA[spotId] : null;

    fishesOut.push({
      itemId,
      name: nameTw,
      nameEn,
      spotId,
      spotName: spotName(spotId, spot?.name_ja ?? null),
      spotNameEn: spot?.name_en ?? null,
      spotNameJa: spot?.name_ja ?? null,
      startHour: fish.startHour ?? 0,
      endHour: fish.endHour ?? 24,
      weatherSet: (fish.weatherSet || []).map((id) => ({
        id,
        name: weatherName(id),
      })),
      previousWeatherSet: (fish.previousWeatherSet || []).map((id) => ({
        id,
        name: weatherName(id),
      })),
      bait,
      predators,
      intuitionLength: fish.intuitionLength ?? null,
      hookset: fish.hookset ?? null,
      tug: fish.tug ?? null,
      bigFish: fish.bigFish ?? false,
      fishEyes: fish.fishEyes ?? false,
      snagging: fish.snagging ?? null,
      folklore: fish.folklore ?? null,
      patch: fish.patch ?? null,
    });
  }

  fishesOut.sort((a, b) => a.itemId - b.itemId);
  console.log(`  魚共 ${fishesOut.length} 筆`);
  console.log(`  有繁中名：${fishesOut.length - noTwName} 筆`);
  console.log(`  無繁中名（台服未開放）：${noTwName} 筆`);

  // ---------- 寫出 ----------
  const now = new Date().toISOString().slice(0, 10);

  await writeFile(
    OUT_SPOTS,
    JSON.stringify(
      {
        schema: "fishing-spots",
        patch: "7.2",
        updated: now,
        source: "fish-tracker+items",
        count: spotsOut.length,
        data: spotsOut,
      },
      null,
      2
    )
  );

  await writeFile(
    OUT_FISHES,
    JSON.stringify(
      {
        schema: "fishes",
        patch: "7.2",
        updated: now,
        source: "fish-tracker+items",
        count: fishesOut.length,
        data: fishesOut,
      },
      null,
      2
    )
  );

  console.log(`\n✓ 寫入 ${OUT_SPOTS}`);
  console.log(`✓ 寫入 ${OUT_FISHES}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
