// build-fishing.mjs
// 建立釣魚資料庫：data/fishing-spots.json + data/fishes.json
//
// 來源：
//   Fish Tracker App data.js    FISH / FISHING_SPOTS / SPEARFISHING_SPOTS / ITEMS / WEATHER_TYPES
//   thewakingsands FishingSpot.csv  spotId → PlaceName row id（第 24 欄）
//   out_data/places.msgpack      PlaceName row id → 台服官方繁中地名（twPlaces）
//   XIVAPI v2 SpearfishingNotebook  魚叉捕魚釣場的 PlaceName / TerritoryType / X / Y / 等級
//   XIVAPI v2 GatheringSubCategory  folklore id → 傳承錄實體書 itemId
//   data/items.json              itemId → 繁中名（魚名 + 餌料名 + 傳承錄書名）
//
// ⚠️ 地名一律走 twPlaces，**不可用 OpenCC 簡轉繁**（專案鐵則）。
//    舊版走「簡中 PlaceName.csv → OpenCC」，307 個釣場裡 25 個是錯的：
//    女巫崖被翻成「落魔崖」、風之節點被翻成「地場節點·風」、白銀市集被翻成「白銀集市」…
//    釣場詳情那顆「📋 /coord X Y 地名」會把錯地名複製進遊戲，不只是顯示問題。
//
// 輸出：
//   data/fishing-spots.json
//     id, name(繁中), nameEn, nameJa, mapId, territoryId, coords{x,y}, fishes[]
//
//   data/fishes.json
//     itemId, name(繁中), nameEn
//     spotId, spotName(繁中)          （主釣場；代表性釣點）
//     spots[]                      （所有可釣釣場 id，主釣場排最前；由 patch-fishing-multispot.mjs 補）
//     gig / aquarium / collectable / lure / dataMissing / folkloreBook
//                                  （值為 null 就不寫這個 key——多數魚都是 null，
//                                    一律寫會讓前端載的 fishes.json 多出約 120KB）
//     startHour, endHour          （0-24，startHour===0 && endHour===24 表示全時段）
//     weatherSet[]                （天氣繁中名陣列，空=無限制）
//     previousWeatherSet[]        （前置天氣）
//     bait[]                      （最佳釣餌路徑，每段 {itemId, name}；A/B 皆可時另有 alts[]）
//     predators[]                 （以小釣大前置魚，item ID）
//     intuitionLength             （直覺持續秒數，null=一般釣法）
//     hookset                     （"Precision"/"Powerful"/null）
//     tug                         （"light"/"medium"/"heavy"/null）
//     bigFish                     （boolean，釣場之王／魚王）
//     legendary                   （boolean，釣場之皇／魚皇；本腳本一律 false，見下方注意）
//     fishEyes                    （boolean，需魚眼藥水）
//     folklore                    （需要哪冊傳說圖鑑，null=不需要）
//     patch                       （版本）
//
// 注意：Cowork 沙箱擋外網，需在本機執行。
// 執行（repo 根目錄）：node scripts/build-fishing.mjs
// ⚠️ 本腳本只產得出上游 FISH 收錄的 1110 條魚；現行 fishes.json 是 1449 條。
//    重建後務必接著跑這三支，否則資料會缺一大角：
//    node scripts/patch-fishing-common.mjs      （補回 ~339 條常駐普通魚，上游 fish-tracker 不收）
//    node scripts/patch-fishing-multispot.mjs   （補多釣場 spots[]；並回填 31 條上游 location=null 的魚的主釣場）
//    node scripts/patch-fish-legendary.mjs --apply （標回 30 隻釣場之皇，上游沒有這個旗標）
//    跑完 validate-links 的「fishes.spotId → fishing-spots」應為 0 斷鏈。
// 需求：Node 18+（內建 fetch）

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const OUT_DATA = join(__dirname, "..", "out_data");
const ITEMS_FILE = join(DATA_DIR, "items.json");
const OUT_SPOTS = join(DATA_DIR, "fishing-spots.json");
const OUT_FISHES = join(DATA_DIR, "fishes.json");

const FISH_TRACKER_URL =
  "https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js";
const CN_BASE =
  "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master";

const XIVAPI = "https://v2.xivapi.com/api/sheet";

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

// 台服官方繁中地名：out_data/places.msgpack 的 twPlaces（key = PlaceName row id）
// ⚠️ 不要改回簡轉繁。這張表是全站地名的唯一權威來源（見 CLAUDE.md 鐵則）。
async function loadTwPlaceNames() {
  const buf = await readFile(join(OUT_DATA, "places.msgpack"));
  const twPlaces = decode(buf).twPlaces || {};
  const map = new Map();
  for (const [id, v] of Object.entries(twPlaces)) {
    if (v && v.tw) map.set(Number(id), v.tw);
  }
  console.log(`  twPlaces（台服官方地名）共 ${map.size} 筆`);
  return map;
}

// 魚叉捕魚釣場：XIVAPI v2 SpearfishingNotebook。
// 上游 SPEARFISHING_SPOTS 的 _id ＝遊戲 GatheringPointBase 的 row id，用它 join。
// X/Y 已經是 0–2048 的地圖空間（非世界座標），換算只需 X/2048*41/c + 1。
async function fetchSpearfishingNotebook() {
  process.stdout.write("  抓取 SpearfishingNotebook…");
  const res = await fetch(
    `${XIVAPI}/SpearfishingNotebook?limit=200&fields=GatheringPointBase,PlaceName,TerritoryType,X,Y,GatheringLevel`,
  );
  if (!res.ok) throw new Error(`SpearfishingNotebook HTTP ${res.status}`);
  const j = await res.json();
  const map = new Map();
  for (const r of j.rows || []) {
    const f = r.fields || {};
    const gpb = f.GatheringPointBase?.row_id ?? f.GatheringPointBase?.value;
    if (!gpb) continue;
    map.set(gpb, {
      placeNameId: f.PlaceName?.row_id ?? f.PlaceName?.value ?? null,
      territoryId: f.TerritoryType?.row_id ?? f.TerritoryType?.value ?? null,
      x: f.X, y: f.Y,
      level: f.GatheringLevel ?? null,
    });
  }
  console.log(` OK（${map.size} 筆）`);
  return map;
}

// 傳承錄：fishes.folklore 是 GatheringSubCategory 的 row id → 該冊實體書的 itemId
async function fetchFolkloreBooks(ids) {
  process.stdout.write(`  抓取 GatheringSubCategory ×${ids.length}…`);
  const out = new Map();
  for (const id of ids) {
    const res = await fetch(`${XIVAPI}/GatheringSubCategory/${id}?fields=Item`);
    if (!res.ok) throw new Error(`GatheringSubCategory/${id} HTTP ${res.status}`);
    const j = await res.json();
    const itemId = j.fields?.Item?.row_id ?? j.fields?.Item?.value ?? null;
    if (itemId) out.set(id, itemId);
  }
  console.log(` OK（${out.size} 本）`);
  return out;
}

// 0–2048 地圖空間 → 遊戲座標（與 build-island.mjs 的 frac→gameCoord 同式）
function toGameCoord(v, sizeFactor) {
  const c = (sizeFactor || 100) / 100;
  return Math.round(((v / 2048) * 41 / c + 1) * 10) / 10;
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
  const [dataJs, placeNames, fishingSpotPlaceIds, spearNotebook] = await Promise.all([
    fetchText(FISH_TRACKER_URL, "Fish Tracker data.js"),
    loadTwPlaceNames(),
    fetchFishingSpotPlaceIds(),
    fetchSpearfishingNotebook(),
  ]);
  console.log();

  // 3. 解析 data.js
  console.log("解析 data.js…");
  const FISH_DATA = extractSection(dataJs, "FISH");
  const SPOTS_DATA = extractSection(dataJs, "FISHING_SPOTS");
  const SPEAR_DATA = extractSection(dataJs, "SPEARFISHING_SPOTS");
  const ITEMS_DATA = extractSection(dataJs, "ITEMS");
  const WEATHER_DATA = extractSection(dataJs, "WEATHER_TYPES");
  console.log(`  FISH: ${Object.keys(FISH_DATA).length} 筆`);
  console.log(`  FISHING_SPOTS: ${Object.keys(SPOTS_DATA).length} 筆`);
  console.log(`  SPEARFISHING_SPOTS: ${Object.keys(SPEAR_DATA).length} 筆`);
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

  // 釣點繁中名：FishingSpot.csv 的 PlaceName row id → twPlaces 官方繁中名。
  // 查不到就回 null（＝台服未開放或名稱不明），**不用日文／英文頂替**。
  // 實測 307 個釣場 100% 查得到，所以正常情況不會有 null。
  const spotName = (spotId) => {
    const placeId = fishingSpotPlaceIds.get(spotId);
    return placeId ? placeNames.get(placeId) ?? null : null;
  };
  const placeNameOf = (placeId) => (placeId != null ? placeNames.get(placeId) ?? null : null);

  // ---------- territoryId → mapId 對應（遊戲 Map sheet row id，全站統一 ID 空間） ----------
  // 優先讀本機 out_data/territory-map.json（{territoryId: mapId}）；沒有就打 XIVAPI TerritoryType sheet
  console.log("載入 territory→map 對應…");
  let territoryMap = {};
  const TERRITORY_MAP_LOCAL = join(__dirname, "..", "out_data", "territory-map.json");
  try {
    territoryMap = JSON.parse(await readFile(TERRITORY_MAP_LOCAL, "utf8"));
    console.log(`  本機對應 ${Object.keys(territoryMap).length} 筆`);
  } catch {
    console.log("  本機檔不存在，改抓 XIVAPI TerritoryType…");
    let after = 0;
    while (true) {
      const res = await fetch(`https://v2.xivapi.com/api/sheet/TerritoryType?fields=Map%40as%28raw%29&limit=500&after=${after}`);
      if (!res.ok) throw new Error(`TerritoryType HTTP ${res.status}`);
      const json = await res.json();
      const rows = json.rows || [];
      if (!rows.length) break;
      for (const r of rows) {
        const m = r.fields["Map@as(raw)"];
        if (m) territoryMap[r.row_id] = m;
      }
      after = rows[rows.length - 1].row_id;
      if (rows.length < 500) break;
    }
    console.log(`  XIVAPI 對應 ${Object.keys(territoryMap).length} 筆`);
  }

  // ---------- 建立釣點資料 ----------
  console.log("建立釣點資料…");
  // 既有釣場的 patch 沒有任何上游來源（不像 items/recipes 有 datamined patch，
  // patch-backfill-all.mjs 也明列 fishing-spots 為「無來源」）——
  // 重建時從舊檔帶過來，否則會安靜地洗掉 307 筆現有值。
  let prevSpotPatch = new Map();
  try {
    const prev = JSON.parse(await readFile(OUT_SPOTS, "utf8"));
    prevSpotPatch = new Map((prev.data || []).map((s) => [s.id, s.patch ?? null]));
    console.log(`  帶回舊檔 patch ${prevSpotPatch.size} 筆`);
  } catch { /* 首次建置：沒舊檔就算了 */ }

  const spotsOut = [];

  for (const [idStr, spot] of Object.entries(SPOTS_DATA)) {
    const spotId = Number(idStr);
    // 哪些魚在這個釣點
    const fishes = Object.values(FISH_DATA)
      .filter((f) => f.location === spotId)
      .map((f) => f._id);

    const mapId = territoryMap[spot.territory_id] ?? null;
    spotsOut.push({
      id: spotId,
      name: spotName(spotId),
      nameEn: spot.name_en || "",
      nameJa: spot.name_ja || "",
      territoryId: spot.territory_id ?? null,
      coords: spot.map_coords
        ? { mapId, x: spot.map_coords[0], y: spot.map_coords[1] }
        : null,
      fishes,
      patch: prevSpotPatch.get(spotId) ?? null,
    });
  }

  // ---------- 魚叉捕魚（水下）釣場 ----------
  // 上游把這 64 個點放在另一個 section，舊版沒讀 → 203 條魚叉魚 spotName=null，
  // 卡片印「—（無固定釣場資料）」、地圖檢視看不到、地區篩選也篩不到。
  const mapsForSpear = JSON.parse(await readFile(join(DATA_DIR, "maps.json"), "utf8"));
  const MAP_BY_ID = new Map((mapsForSpear.data || mapsForSpear).map((m) => [m.id, m]));
  let spearAdded = 0, spearSkipped = 0;
  for (const [idStr, sp] of Object.entries(SPEAR_DATA)) {
    const spotId = Number(idStr);
    const fishes = Object.values(FISH_DATA).filter((f) => f.location === spotId).map((f) => f._id);
    // 既有 307 個釣場沒有任何一個 fishes 是空的，沿用這個慣例：上游未收錄任何魚的 16 個點不收
    //（map-explorer 的點是由魚反推的，空釣場本來就永遠不會出現在圖上）。
    if (!fishes.length) { spearSkipped++; continue; }
    const info = spearNotebook.get(spotId);
    const name = placeNameOf(info?.placeNameId);
    if (!name) { spearSkipped++; continue; }   // 鐵則：對不到官方繁中名就不收
    const territoryId = info?.territoryId ?? sp.territory_id ?? null;
    const mapId = territoryMap[territoryId] ?? null;
    if (mapId == null || info?.x == null) { spearSkipped++; continue; }
    const sf = MAP_BY_ID.get(mapId)?.sizeFactor ?? 100;
    const ps = fishes.map((i) => FISH_DATA[i]?.patch).filter((v) => v != null).map(Number);
    spotsOut.push({
      id: spotId,
      name,
      nameEn: sp.name_en || "",
      nameJa: sp.name_ja || "",
      territoryId,
      coords: { mapId, x: toGameCoord(info.x, sf), y: toGameCoord(info.y, sf) },
      fishes,
      spearfishing: true,                       // 魚叉捕魚（水下），前端要與一般垂釣區隔
      level: info.level ?? null,                // 捕魚人需求等級
      patch: prevSpotPatch.get(spotId) ?? (ps.length ? Math.min(...ps) : null),
    });
    spearAdded++;
  }
  console.log(`  魚叉釣場：收 ${spearAdded} 個／跳過 ${spearSkipped} 個`);

  spotsOut.sort((a, b) => a.id - b.id);
  console.log(`  釣點共 ${spotsOut.length} 筆`);

  const SPOT_OUT_BY_ID = new Map(spotsOut.map((s) => [s.id, s]));

  // 傳承錄：folklore（GatheringSubCategory row id）→ 實體書 itemId
  const folkloreIds = [...new Set(Object.values(FISH_DATA).map((f) => f.folklore).filter((v) => v != null))].sort((a, b) => a - b);
  const folkloreBooks = folkloreIds.length ? await fetchFolkloreBooks(folkloreIds) : new Map();

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
    // ⚠️ 上游的每一段可能是「單一餌 id」，也可能是「[餌A, 餌B]＝兩者皆可」（82 條魚是後者）。
    // 早期版本直接把陣列塞進 itemId，name 就變成 "43849,43852" 這種 id 字串。
    // 正解：itemId 永遠是數字（第一個選項），多選項時另外記在 alts[]，name 用「／」串起來。
    const bait = (fish.bestCatchPath || []).map((step) => {
      const ids = Array.isArray(step) ? step : [step];
      const alts = ids.map((id) => ({ itemId: id, name: baitName(id) }));
      const out = { itemId: alts[0].itemId, name: alts.map((a) => a.name).join("／") };
      if (alts.length > 1) out.alts = alts;
      return out;
    });

    // 以小釣大前置魚（predators）
    const predators = (fish.predators || []).map((id) => ({
      itemId: id,
      name: itemMap.get(id) || ITEMS_DATA[id]?.name_en || String(id),
    }));

    const spotId = fish.location ?? null;
    // 釣場名要同時吃一般釣場與魚叉釣場，所以回查已組好的 spotsOut。
    const spot = spotId != null ? SPOT_OUT_BY_ID.get(spotId) : null;

    const row = {
      itemId,
      name: nameTw,
      nameEn,
      spotId,
      spotName: spot?.name ?? null,
      spotNameEn: spot?.nameEn || null,
      spotNameJa: spot?.nameJa || null,
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
      legendary: false,       // 釣場之皇；上游無此旗標，由 patch-fish-legendary.mjs 依名單標記
      patch: fish.patch ?? null,
    };

    // 上游有、舊版沒抓的五欄。**null 就不寫這個 key**——
    // 大多數魚都是 null，一律寫會讓前端要載的 fishes.json 多出約 120KB（+18%）。
    if (fish.gig != null) row.gig = fish.gig;                         // 魚叉尺寸 Small/Normal/Large/UNKNOWN
    if (fish.aquarium != null) row.aquarium = fish.aquarium;          // {water:'Freshwater'|'Saltwater', size:1-4}
    if (fish.collectable != null) row.collectable = fish.collectable; // 收藏品門檻值
    if (fish.lure != null) row.lure = fish.lure;                      // 'Ambitious' | 'Modest'（7.0 擬餌）
    if (fish.dataMissing != null) row.dataMissing = fish.dataMissing;

    // 傳承錄 → 實體書（itemId ＋ 繁中書名），讓前端能直接講「要哪一本」
    if (fish.folklore != null) {
      const bookId = folkloreBooks.get(fish.folklore);
      const bookName = bookId != null ? itemMap.get(bookId) : null;
      if (bookId && bookName) row.folkloreBook = { itemId: bookId, name: bookName };
    }

    fishesOut.push(row);
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
        source: "fish-tracker+items+FishingSpot.csv+SpearfishingNotebook+twPlaces",
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
        source: "fish-tracker+items+FishingSpot.csv+SpearfishingNotebook",
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
