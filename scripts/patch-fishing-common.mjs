// patch-fishing-common.mjs
// 補齊 fishes.json 缺少的「常駐普通魚」。
//
// 問題：fish-tracker 來源只收錄有窗口/值得追蹤的魚（1104 筆），
//       遊戲釣魚筆記裡隨時可釣的普通魚（珊瑚蝶、海馬、銀鯊…）不在其中，
//       造成釣場魚單顯示不齊（南鮮血濱遊戲內 10 條、本站只列 4 條）。
//
// 做法：
//   1. 以本站已收釣場的遊戲魚單（FishingSpot.csv Item[0-9]）取聯集
//   2. 找出不在 fishes.json 且 items.json 有台服名的魚（= 台服已開放的常駐魚）
//   3. 英文名批次補自 XIVAPI Item sheet
//   4. 以「無時間/天氣限制、無餌鏈資料」的基本欄位加入 fishes.json
//
// ⚠️ 執行後務必接著跑 patch-fishing-multispot.mjs（補 spots[] 與主釣場、
//    並把新魚接回 fishing-spots.json 的魚單）。
//
// 執行（repo 根目錄，需可連外網）：
//   node scripts/patch-fishing-common.mjs && node scripts/patch-fishing-multispot.mjs

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
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
  console.log("=== patch-fishing-common.mjs ===\n");

  const fishesDb = JSON.parse(await readFile(join(DATA_DIR, "fishes.json"), "utf8"));
  const spotsDb = JSON.parse(await readFile(join(DATA_DIR, "fishing-spots.json"), "utf8"));
  const itemsDb = JSON.parse(await readFile(join(DATA_DIR, "items.json"), "utf8"));
  const itemName = new Map(itemsDb.data.map(i => [i.id, i.name]));
  const haveFish = new Set(fishesDb.data.map(f => f.itemId));
  const ourSpotIds = new Set(spotsDb.data.map(s => s.id));

  console.log("抓取 FishingSpot.csv…");
  const csv = await (await fetch(CSV_URL)).text();
  const landFish = new Set();
  for (const line of csv.split("\n").slice(3)) {
    const f = parseCSVLine(line.trim());
    if (f.length < 24) continue;
    const spotId = parseInt(f[0]);
    if (isNaN(spotId) || !ourSpotIds.has(spotId)) continue; // 只看本站已收釣場（排除出海等）
    for (let c = 14; c <= 23; c++) {
      const id = parseInt(f[c]);
      if (!isNaN(id) && id > 0) landFish.add(id);
    }
  }

  const missing = [...landFish].filter(id => !haveFish.has(id) && itemName.has(id)).sort((a, b) => a - b);
  const skippedNoTw = [...landFish].filter(id => !haveFish.has(id) && !itemName.has(id)).length;
  console.log(`釣場魚單聯集 ${landFish.size} 種；缺 ${missing.length} 種（另 ${skippedNoTw} 種無台服名，視為未開放跳過）\n`);
  if (!missing.length) { console.log("無缺魚，結束。"); return; }

  // 英文名批次補自 XIVAPI（rows 批次，每批 100）
  console.log("補英文名（XIVAPI Item sheet）…");
  const nameEn = new Map();
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const res = await fetch(`https://v2.xivapi.com/api/sheet/Item?rows=${batch.join(",")}&fields=Name`);
    if (!res.ok) throw new Error(`Item sheet HTTP ${res.status}`);
    const json = await res.json();
    for (const r of json.rows || []) nameEn.set(r.row_id, r.fields?.Name || "");
    process.stdout.write(`  ${Math.min(i + 100, missing.length)}/${missing.length}\r`);
  }
  console.log();

  // 加入基本欄位（常駐魚：無時間/天氣限制；餌鏈/竿型社群無收錄 → null）
  for (const id of missing) {
    fishesDb.data.push({
      itemId: id,
      name: itemName.get(id),
      nameEn: nameEn.get(id) || "",
      spotId: null, spotName: null, spotNameEn: null, spotNameJa: null,
      startHour: 0, endHour: 24,
      weatherSet: [], previousWeatherSet: [],
      bait: [], predators: [],
      intuitionLength: null, hookset: null, tug: null,
      bigFish: false, fishEyes: false, snagging: null, folklore: null,
      patch: null,
    });
  }
  fishesDb.data.sort((a, b) => a.itemId - b.itemId);
  fishesDb.count = fishesDb.data.length;
  fishesDb.updated = new Date().toISOString().slice(0, 10);

  await writeFile(join(DATA_DIR, "fishes.json"), JSON.stringify(fishesDb, null, 2));
  console.log(`✓ fishes.json：${missing.length} 種常駐魚補入，總數 ${fishesDb.data.length}`);
  console.log("⚠️ 請接著執行：node scripts/patch-fishing-multispot.mjs");
}

main().catch(e => { console.error(e); process.exit(1); });
