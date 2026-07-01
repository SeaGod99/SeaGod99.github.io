// 從 Teamcraft treasures.json 建立 treasure-maps.json（藏寶圖採集點 / 挖寶地點）
//
// 為什麼本機跑：Cowork 沙箱通常擋外網，無法在 session 內抓 Teamcraft / GitHub raw。
// 在你電腦跑沒這限制。需 Node 18+（內建 fetch）。
//
// 執行（repo 根目錄）：
//   node scripts/build-treasure-maps.mjs
//
// 來源：Teamcraft libs/data/.../treasures.json（每個藏寶圖道具 → 多個挖寶座標）
//   欄位：{ item(道具id), map(遊戲 Map row id), coords:{x,y,z}(遊戲座標), partySize }
// 繁中名稱／圖示：由 data/items.json 以 item id 反查（台服官方譯名「陳舊的地圖G8」等）。
// 地圖名稱／區域／資料片：由 data/maps.json 以 mapId 反查。
// 輸出：data/treasure-maps.json（信封格式，data[] 以「藏寶圖等級」為單位、內含 locations[]）
//
// 只收台服有官方譯名、且名稱符合「陳舊的地圖G#／S#」的等級圖；
// ARR 舊式雜項藏寶圖（神秘地圖、鞣革製的隱藏地圖…）不在等級體系內，略過。

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "data", "treasure-maps.json");

const TC_BASE = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";
const TREASURES_URL = `${TC_BASE}/treasures.json`;

// 資料片繁中名（全站統一，見 collections/exploration-log PATCH_LABELS）
const EXPANSION_BY_MAJOR = {
  2: "原初之地", 3: "蒼天之禁地", 4: "紅蓮之狂潮",
  5: "暗影之逆焰", 6: "曉月之終途", 7: "金曦之遺輝",
};

// 名稱 → 等級：陳舊的地圖G8 / 陳舊的地圖S1
const GRADE_RE = /^陳舊的地圖([GS])(\d+)$/;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// 允許沙箱環境改讀本機暫存的 treasures.json（--local <path>）
async function loadTreasures() {
  const i = process.argv.indexOf("--local");
  if (i >= 0 && process.argv[i + 1] && existsSync(process.argv[i + 1])) {
    console.log(`讀取本機 treasures.json：${process.argv[i + 1]}`);
    return JSON.parse(await readFile(process.argv[i + 1], "utf8"));
  }
  console.log("抓取 Teamcraft treasures.json…");
  return fetchJson(TREASURES_URL);
}

const majorOf = (patch) => Number(String(patch || "").split(".")[0]) || 0;

async function main() {
  const treasuresRaw = await loadTreasures();
  const treasures = Array.isArray(treasuresRaw) ? treasuresRaw : Object.values(treasuresRaw);
  console.log(`  原始挖寶座標 ${treasures.length} 筆`);

  const itemsDb = JSON.parse(await readFile(join(ROOT, "data", "items.json"), "utf8"));
  const mapsDb = JSON.parse(await readFile(join(ROOT, "data", "maps.json"), "utf8"));
  const itemById = new Map(itemsDb.data.map((i) => [i.id, i]));
  const mapById = new Map(mapsDb.data.map((m) => [m.id, m]));

  // 依道具 id 分組
  const byItem = new Map();
  for (const t of treasures) {
    const item = t.item ?? t.itemId;
    if (item == null) continue;
    if (!byItem.has(item)) byItem.set(item, []);
    byItem.get(item).push(t);
  }

  const data = [];
  const skipped = [];
  for (const [itemId, locs] of byItem) {
    const item = itemById.get(itemId);
    const m = item && GRADE_RE.exec(item.name || "");
    if (!m) { skipped.push(itemId); continue; } // 非等級圖（或台服無譯名）

    const series = m[1];            // G / S
    const gradeNum = Number(m[2]);  // 1..17
    const grade = series + gradeNum;

    // 去重（同地圖同座標）＋反查地圖名
    const seen = new Set();
    const locations = [];
    const patchTally = new Map();
    for (const l of locs) {
      const mapId = l.map;
      const map = mapById.get(mapId);
      if (!map) continue; // 無 maps.json 對應 → 無法定位，略過
      const x = Number((l.coords?.x ?? 0).toFixed(1));
      const y = Number((l.coords?.y ?? 0).toFixed(1));
      const key = `${mapId}:${x}:${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      locations.push({ mapId, x, y, partySize: l.partySize ?? 1 });
      const mj = majorOf(map.patch);
      if (mj) patchTally.set(mj, (patchTally.get(mj) || 0) + 1);
    }
    if (!locations.length) continue;

    // 資料片＝該等級挖寶區域中最常見的主版本
    const major = [...patchTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    locations.sort((a, b) => a.mapId - b.mapId || a.x - b.x || a.y - b.y);

    data.push({
      id: itemId,
      grade,
      series,
      gradeNum,
      name: item.name,
      icon: item.icon || null,
      expansion: EXPANSION_BY_MAJOR[major] || null,
      major,
      locations,
    });
  }

  // S 系列（陳舊的地圖S#）與某些 G 系列挖寶座標完全相同，是台服的同內容別名圖。
  // 合併：把座標相同的 S 圖收成 G 圖的 aliases，避免介面出現重複等級。
  const sig = (g) => g.locations.map((l) => `${l.mapId}:${l.x}:${l.y}`).sort().join("|");
  const gEntries = data.filter((g) => g.series === "G");
  const sEntries = data.filter((g) => g.series === "S");
  const gBySig = new Map(gEntries.map((g) => [sig(g), g]));
  const leftoverS = [];
  for (const s of sEntries) {
    const match = gBySig.get(sig(s));
    if (match) {
      (match.aliases ||= []).push({ grade: s.grade, id: s.id, name: s.name });
    } else {
      leftoverS.push(s); // 無對應 G 圖 → 保留為獨立等級
    }
  }

  // 排序：G 系列在前、未合併的 S 系列在後，各依等級升序
  const merged = [...gEntries, ...leftoverS];
  const seriesRank = { G: 0, S: 1 };
  merged.sort((a, b) =>
    (seriesRank[a.series] ?? 9) - (seriesRank[b.series] ?? 9) || a.gradeNum - b.gradeNum
  );
  data.length = 0;
  data.push(...merged);

  const out = {
    schema: "treasure-maps",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "teamcraft+xivapi",
    count: data.length,
    data,
  };
  await writeFile(OUT, JSON.stringify(out, null, 0));

  const totalLoc = data.reduce((a, d) => a + d.locations.length, 0);
  console.log(`\n寫入 ${OUT}`);
  console.log(`  藏寶圖等級 ${data.length} 種、挖寶座標 ${totalLoc} 個`);
  console.log("  各等級：", data.map((d) =>
    `${d.grade}${d.aliases ? "＝" + d.aliases.map((a) => a.grade).join("＝") : ""}(${d.locations.length})`
  ).join(" "));
  if (skipped.length) console.log(`  略過非等級圖 ${skipped.length} 種（item id）：${skipped.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
