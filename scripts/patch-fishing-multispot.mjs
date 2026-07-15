// patch-fishing-multispot.mjs
// 修正釣魚資料庫的「一魚一釣點」限制：
//
// 問題：fish-tracker 來源的 fish.location 只有一個代表釣點，
//       但遊戲內許多魚可在多個釣場釣到（FishingSpot sheet 每釣場有完整 Item[0-9] 魚單）。
//
// 做法：抓 ffxiv-datamining-cn 的 FishingSpot.csv（Item[0-9] = 該釣場魚單），
//   1. fishes.json 每條魚新增 spots[]（所有可釣釣場 id，主釣場排最前）
//   2. spotId 為 null 的魚回填主釣場（取第一個有座標的釣場）
//   3. fishing-spots.json 的 fishes[] 以遊戲魚單補完整（僅保留 fishes.json 有的魚）
//
// 執行（repo 根目錄，需可連外網）：node scripts/patch-fishing-multispot.mjs

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SPOTS_FILE = join(DATA_DIR, "fishing-spots.json");
const FISHES_FILE = join(DATA_DIR, "fishes.json");
const CSV_URL = "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/FishingSpot.csv";

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
      else if (ch === ",") { fields.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function main() {
  console.log("=== patch-fishing-multispot.mjs ===\n");

  const spotsDb = JSON.parse(await readFile(SPOTS_FILE, "utf8"));
  const fishesDb = JSON.parse(await readFile(FISHES_FILE, "utf8"));
  const spotById = new Map(spotsDb.data.map(s => [s.id, s]));
  const fishIds = new Set(fishesDb.data.map(f => f.itemId));

  console.log(`抓取 FishingSpot.csv…`);
  const csv = await (await fetch(CSV_URL)).text();
  // 欄位：14-23 = Item[0]..Item[9]（該釣場魚單）
  const gameSpotItems = new Map(); // spotId -> [itemId]
  for (const line of csv.split("\n").slice(3)) {
    const f = parseCSVLine(line.trim());
    if (f.length < 24) continue;
    const spotId = parseInt(f[0]);
    if (isNaN(spotId)) continue;
    const items = [];
    for (let c = 14; c <= 23; c++) {
      const id = parseInt(f[c]);
      if (!isNaN(id) && id > 0) items.push(id);
    }
    if (items.length) gameSpotItems.set(spotId, items);
  }
  console.log(`  遊戲魚單：${gameSpotItems.size} 個釣場\n`);

  // 反查：itemId -> [spotId]（僅限 fishing-spots.json 收錄的釣場）
  const spotsByFish = new Map();
  for (const [spotId, items] of gameSpotItems) {
    if (!spotById.has(spotId)) continue; // 出海垂釣等未收錄釣場跳過
    for (const id of items) {
      if (!fishIds.has(id)) continue;
      if (!spotsByFish.has(id)) spotsByFish.set(id, []);
      spotsByFish.get(id).push(spotId);
    }
  }

  // 1) fishing-spots.json：魚單補完整
  let spotFishGrew = 0;
  for (const s of spotsDb.data) {
    const game = (gameSpotItems.get(s.id) || []).filter(id => fishIds.has(id));
    const merged = [...new Set([...(s.fishes || []), ...game])];
    if (merged.length > (s.fishes || []).length) spotFishGrew++;
    s.fishes = merged;
  }

  // 2) fishes.json：spots[] + 回填無主釣場的魚
  let multi = 0, backfilled = 0;
  for (const f of fishesDb.data) {
    let spots = spotsByFish.get(f.itemId) || [];
    // 主釣場排最前（既有 spotId 優先；tracker 的代表釣點不在遊戲魚單也保留）
    if (f.spotId != null) {
      spots = [f.spotId, ...spots.filter(id => id !== f.spotId)];
    }
    f.spots = spots;
    if (spots.length > 1) multi++;

    if (f.spotId == null && spots.length) {
      // 回填主釣場：取第一個有座標的
      const primary = spots.map(id => spotById.get(id)).find(s => s && s.coords) || spotById.get(spots[0]);
      if (primary) {
        f.spotId = primary.id;
        f.spotName = primary.name;
        f.spotNameEn = primary.nameEn;
        f.spotNameJa = primary.nameJa;
        backfilled++;
      }
    }
  }

  const now = new Date().toISOString().slice(0, 10);
  spotsDb.updated = now;
  spotsDb.source = "fish-tracker+items+FishingSpot.csv";
  fishesDb.updated = now;
  fishesDb.source = "fish-tracker+items+FishingSpot.csv";

  await writeFile(SPOTS_FILE, JSON.stringify(spotsDb, null, 2));
  await writeFile(FISHES_FILE, JSON.stringify(fishesDb, null, 2));

  console.log(`✓ fishing-spots.json：${spotFishGrew} 個釣場魚單補齊`);
  console.log(`✓ fishes.json：${multi} 條魚有多釣場（spots[]），回填主釣場 ${backfilled} 條`);
}

main().catch(e => { console.error(e); process.exit(1); });
