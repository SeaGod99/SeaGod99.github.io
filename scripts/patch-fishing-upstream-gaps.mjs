// patch-fishing-upstream-gaps.mjs
// 把「上游／台服官方來源早就有、但 data/fishes.json + data/fishing-spots.json 沒抓進來」的東西補回去。
// 四件事（都是既有資料的缺角，不是新玩法）：
//
//   ① 銛槍捕魚（水下捕魚）的釣場整批補進來
//      build-fishing.mjs 只讀上游 data.js 的 FISHING_SPOTS（307 筆），
//      沒讀 SPEARFISHING_SPOTS（64 筆）。結果 203 條銛槍魚 spotName=null：
//      卡片印「—（無固定釣場資料）」、地圖檢視完全看不到、地區篩選永遠篩不到
//      （regionOfSpot() 回 undefined），而釣魚頁預設就是地圖檢視 → 一開頁就是隱形的。
//      上游的 spearfishing spot `_id` ＝ 遊戲 GatheringPointBase 的 row id，
//      靠它 join XIVAPI v2 的 SpearfishingNotebook 拿到 PlaceName / TerritoryType / X / Y / 等級。
//
//   ② 釣場繁中名改吃台服官方地名表
//      build-fishing.mjs 走「簡中 PlaceName.csv → OpenCC 硬翻」，違反專案鐵則。
//      改成 FishingSpot.csv 的 PlaceName row id → out_data/places.msgpack 的 twPlaces。
//      307 個釣場 100% 查得到官方名，其中 25 個目前是錯的（女巫崖被翻成「落魔崖」、
//      風之節點被翻成「地場節點·風」…）。這不只是顯示問題——釣場詳情那顆
//      「📋 /coord X Y 地名」會把錯地名複製進遊戲。
//
//   ③ 上游 FISH 有、我們沒抓的 5 個欄位
//      gig（銛槍尺寸 Small/Normal/Large）／aquarium（水族箱水質＋尺寸）／
//      collectable（收藏品門檻值）／lure（7.0 擬餌）／dataMissing（上游自標的資料缺漏）。
//
//   ④ 傳承錄講清楚是哪一本
//      fishes.folklore 是 GatheringSubCategory 的 row id（12 個值），
//      查 XIVAPI 得到對應的傳承錄書 itemId，再回查 items.json 取繁中書名。
//
// 用法（repo 根目錄）：
//   node scripts/patch-fishing-upstream-gaps.mjs            # dry-run，只印要改什麼
//   node scripts/patch-fishing-upstream-gaps.mjs --apply    # 寫入
//   node scripts/patch-fishing-upstream-gaps.mjs --offline  # 只用 out_data/cache/fishing 的快取，不連外
//
// 冪等：重跑不會產生額外差異。跑完接 validate-data.mjs；動過 data/ 記得 sync-meta.mjs --apply。
// 需求：Node 18+

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const OUT_DATA = join(ROOT, "out_data");
const CACHE_DIR = join(OUT_DATA, "cache", "fishing");

const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");

const FISH_TRACKER_URL =
  "https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js";
const CN_FISHING_SPOT_CSV =
  "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/FishingSpot.csv";
const XIVAPI = "https://v2.xivapi.com/api/sheet";

// ---------- 抓取（帶本機快取） ----------

async function cached(name, url, { json = false } = {}) {
  const file = join(CACHE_DIR, name);
  if (OFFLINE || existsSync(file)) {
    if (!existsSync(file)) throw new Error(`--offline 但快取不存在：${file}`);
    const text = await readFile(file, "utf8");
    console.log(`  快取 ${name}（${(text.length / 1024).toFixed(0)}KB）`);
    return json ? JSON.parse(text) : text;
  }
  process.stdout.write(`  抓取 ${name}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, text, "utf8");
  console.log(` OK（${(text.length / 1024).toFixed(0)}KB）`);
  return json ? JSON.parse(text) : text;
}

// 從 data.js 取出某個 section 的 JSON 物件（格式：`  NAME: { … },`）
function extractSection(js, name) {
  const start = js.indexOf(`  ${name}: `);
  if (start === -1) throw new Error(`data.js 找不到 section ${name}`);
  const objStart = js.indexOf("{", start);
  let depth = 0, i = objStart;
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}" && --depth === 0) break;
  }
  return JSON.parse(js.slice(objStart, i + 1));
}

// FishingSpot.csv 第 24 欄＝ PlaceName row id（表頭第 2 行就寫著 PlaceName）
function parseFishingSpotPlaceIds(csv) {
  const map = new Map();
  for (const line of csv.split("\n").slice(3)) {
    const f = line.trim().split(",");
    const id = parseInt(f[0], 10);
    const pn = parseInt(f[24], 10);
    if (!isNaN(id) && !isNaN(pn) && pn > 0) map.set(id, pn);
  }
  return map;
}

// ---------- 座標換算 ----------
// SpearfishingNotebook 的 X/Y 已經是 0–2048 的地圖空間（不是世界座標），
// 故只需 gameCoord = X/2048 * 41 / c + 1，c = sizeFactor/100。
// 與 build-island.mjs 的 frac→gameCoord 那一半完全一致。
function toGameCoord(v, sizeFactor) {
  const c = (sizeFactor || 100) / 100;
  return Math.round(((v / 2048) * 41 / c + 1) * 10) / 10;
}

// ---------- 主流程 ----------

async function main() {
  console.log(`釣魚資料缺角補正${APPLY ? "（寫入）" : "（dry-run）"}${OFFLINE ? "（離線）" : ""}\n`);

  console.log("載入來源…");
  const dataJs = await cached("fish-tracker-data.js", FISH_TRACKER_URL);
  const csv = await cached("FishingSpot.csv", CN_FISHING_SPOT_CSV);

  const UP_FISH = extractSection(dataJs, "FISH");
  const UP_SPOTS = extractSection(dataJs, "FISHING_SPOTS");
  const UP_SPEAR = extractSection(dataJs, "SPEARFISHING_SPOTS");
  console.log(`  上游 FISH ${Object.keys(UP_FISH).length}／FISHING_SPOTS ${Object.keys(UP_SPOTS).length}／SPEARFISHING_SPOTS ${Object.keys(UP_SPEAR).length}`);

  const spotPlaceIds = parseFishingSpotPlaceIds(csv);
  console.log(`  FishingSpot → PlaceName 對照 ${spotPlaceIds.size} 筆`);

  // SpearfishingNotebook（64 列，一次抓完）
  const nb = await cached(
    "SpearfishingNotebook.json",
    `${XIVAPI}/SpearfishingNotebook?limit=200&fields=GatheringPointBase,PlaceName,TerritoryType,X,Y,GatheringLevel`,
    { json: true },
  );
  const notebook = new Map(); // GatheringPointBase row id → {placeNameId, territoryId, x, y, level}
  for (const r of nb.rows || []) {
    const f = r.fields || {};
    const gpb = f.GatheringPointBase?.row_id ?? f.GatheringPointBase?.value;
    if (!gpb) continue;
    notebook.set(gpb, {
      placeNameId: f.PlaceName?.row_id ?? f.PlaceName?.value ?? null,
      nameEn: f.PlaceName?.fields?.Name ?? "",
      territoryId: f.TerritoryType?.row_id ?? f.TerritoryType?.value ?? null,
      x: f.X, y: f.Y,
      level: f.GatheringLevel ?? null,
    });
  }
  console.log(`  SpearfishingNotebook ${notebook.size} 筆`);

  // 傳承錄：GatheringSubCategory row id → 書的 itemId
  const folkloreIds = [...new Set(Object.values(UP_FISH).map((f) => f.folklore).filter((v) => v != null))].sort((a, b) => a - b);
  const folkloreBooks = await (async () => {
    const file = join(CACHE_DIR, "folklore-books.json");
    if (OFFLINE || existsSync(file)) {
      if (!existsSync(file)) throw new Error(`--offline 但快取不存在：${file}`);
      console.log(`  快取 folklore-books.json`);
      return JSON.parse(await readFile(file, "utf8"));
    }
    process.stdout.write(`  抓取 GatheringSubCategory ×${folkloreIds.length}…`);
    const out = {};
    for (const id of folkloreIds) {
      const res = await fetch(`${XIVAPI}/GatheringSubCategory/${id}?fields=Item`);
      if (!res.ok) throw new Error(`GatheringSubCategory/${id} HTTP ${res.status}`);
      const j = await res.json();
      const itemId = j.fields?.Item?.row_id ?? j.fields?.Item?.value ?? null;
      if (itemId) out[id] = itemId;
    }
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(out, null, 2), "utf8");
    console.log(` OK`);
    return out;
  })();
  console.log(`  傳承錄對照 ${Object.keys(folkloreBooks).length} 本`);

  // 本機權威來源
  const twPlaces = decode(await readFile(join(OUT_DATA, "places.msgpack"))).twPlaces;
  const territoryMap = JSON.parse(await readFile(join(OUT_DATA, "territory-map.json"), "utf8"));
  const mapsJson = JSON.parse(await readFile(join(DATA_DIR, "maps.json"), "utf8"));
  const MAPS = new Map((mapsJson.data || mapsJson).map((m) => [m.id, m]));
  const itemsJson = JSON.parse(await readFile(join(DATA_DIR, "items.json"), "utf8"));
  const itemName = new Map(itemsJson.data.map((i) => [i.id, i.name]));

  const twName = (placeNameId) => (placeNameId != null ? twPlaces[placeNameId]?.tw ?? null : null);

  const spotsJson = JSON.parse(await readFile(join(DATA_DIR, "fishing-spots.json"), "utf8"));
  const fishesJson = JSON.parse(await readFile(join(DATA_DIR, "fishes.json"), "utf8"));

  // ── ② 既有 307 個釣場改吃官方繁中名 ──────────────────────────
  const renamed = [];
  let noOfficial = 0;
  for (const s of spotsJson.data) {
    const tw = twName(spotPlaceIds.get(s.id));
    if (!tw) { noOfficial++; continue; }          // 查不到就保留原值，不亂改
    if (tw !== s.name) { renamed.push([s.id, s.name, tw]); s.name = tw; }
  }
  console.log(`\n② 官方地名：${spotsJson.data.length - noOfficial}/${spotsJson.data.length} 查得到，${renamed.length} 個名稱修正`);
  renamed.forEach(([id, o, n]) => console.log(`   ${String(id).padStart(4)} 「${o}」→「${n}」`));
  if (noOfficial) console.log(`   （${noOfficial} 個查不到官方名，保留原值）`);

  // ── ① 補進 64 個銛槍捕魚釣場 ────────────────────────────────
  const existingIds = new Set(spotsJson.data.map((s) => s.id));
  const fishBySpot = new Map();   // spotId → [itemId]
  for (const [idStr, f] of Object.entries(UP_FISH)) {
    if (f.location == null) continue;
    if (!fishBySpot.has(f.location)) fishBySpot.set(f.location, []);
    fishBySpot.get(f.location).push(Number(idStr));
  }

  const addedSpots = [];
  const skippedSpots = [];
  for (const [idStr, sp] of Object.entries(UP_SPEAR)) {
    const id = Number(idStr);
    if (existingIds.has(id)) continue;             // 冪等
    const info = notebook.get(id);
    const placeNameId = info?.placeNameId ?? null;
    const name = twName(placeNameId);
    // 鐵則：對不到台服官方繁中名 → 不收（台服未開放或名稱不明，寧缺勿用英日文頂替）
    if (!name) { skippedSpots.push([id, sp.name_en, "無官方繁中名"]); continue; }
    const territoryId = info?.territoryId ?? sp.territory_id ?? null;
    const mapId = territoryMap[territoryId] ?? null;
    if (mapId == null || info?.x == null) { skippedSpots.push([id, name, "無地圖或座標"]); continue; }
    // 既有 307 個釣場沒有任何一個 fishes 是空的——沿用這個慣例，
    // 上游沒有收錄任何魚的 16 個銛槍點不收（收了也只是在地圖清單上多出「0 種」的雜訊，
    // 且 map-explorer 的點是由魚反推的，空釣場本來就永遠不會出現在圖上）。
    const spotFishes = fishBySpot.get(id) || [];
    if (!spotFishes.length) { skippedSpots.push([id, name, "上游未收錄任何魚"]); continue; }
    const sf = MAPS.get(mapId)?.sizeFactor ?? 100;
    addedSpots.push({
      id,
      name,
      nameEn: sp.name_en || info.nameEn || "",
      nameJa: sp.name_ja || "",
      territoryId,
      coords: { mapId, x: toGameCoord(info.x, sf), y: toGameCoord(info.y, sf) },
      fishes: spotFishes,
      spearfishing: true,                          // 銛槍捕魚（水下），前端要與一般垂釣區隔
      level: info.level ?? null,                   // 捕魚人需求等級
      patch: null,
    });
  }
  // patch 欄：沿用該釣場第一條魚的版本（上游釣場本身沒有 patch）
  const fishPatch = new Map(Object.entries(UP_FISH).map(([k, v]) => [Number(k), v.patch ?? null]));
  for (const s of addedSpots) {
    const ps = s.fishes.map((i) => fishPatch.get(i)).filter((v) => v != null);
    s.patch = ps.length ? Math.min(...ps.map(Number)) : null;
  }

  console.log(`\n① 銛槍捕魚釣場：新增 ${addedSpots.length} 個（上游 ${Object.keys(UP_SPEAR).length} 個）`);
  addedSpots.slice(0, 8).forEach((s) => console.log(`   ${s.id} ${s.name}（${s.nameEn}）map${s.coords.mapId} X${s.coords.x} Y${s.coords.y} Lv${s.level} ${s.fishes.length} 種`));
  if (addedSpots.length > 8) console.log(`   …其餘 ${addedSpots.length - 8} 個`);
  if (skippedSpots.length) {
    console.log(`   跳過 ${skippedSpots.length} 個：`);
    skippedSpots.forEach(([id, n, why]) => console.log(`     ${id} ${n} — ${why}`));
  }

  spotsJson.data.push(...addedSpots);
  spotsJson.data.sort((a, b) => a.id - b.id);
  spotsJson.count = spotsJson.data.length;

  // ── 魚：回填釣場欄位 ＋ ③ 5 個上游欄位 ＋ ④ 傳承錄書 ──────────
  const SPOT_BY_ID = new Map(spotsJson.data.map((s) => [s.id, s]));
  const stat = {
    spotFilled: 0, spotRenamed: 0,
    gig: 0, aquarium: 0, collectable: 0, lure: 0, dataMissing: 0, folkloreBook: 0,
  };

  for (const f of fishesJson.data) {
    const up = UP_FISH[f.itemId];

    // 釣場欄位：銛槍魚原本三個名稱欄全 null；改名的釣場也要跟著同步
    const sp = f.spotId != null ? SPOT_BY_ID.get(f.spotId) : null;
    if (sp) {
      if (!f.spotName) stat.spotFilled++;
      else if (f.spotName !== sp.name) stat.spotRenamed++;
      f.spotName = sp.name;
      f.spotNameEn = sp.nameEn || null;
      f.spotNameJa = sp.nameJa || null;
    }

    if (!up) continue;

    // ③ 上游有、原本沒抓的欄位
    //    **值為 null 就不寫這個 key**——這五欄大多數魚都是 null，
    //    照既有 schema 那樣一律寫 null 會讓前端要載的 fishes.json 多出約 120KB（+18%）。
    //    前端一律用 f.gig / f.aquarium 這種存在性判斷，缺 key 與 null 等價。
    const setIf = (key, val, counter) => {
      if (val == null) { delete f[key]; return; }
      if (f[key] == null) stat[counter]++;
      f[key] = val;
    };
    setIf("gig", up.gig ?? null, "gig");                      // 銛槍尺寸 Small/Normal/Large/UNKNOWN
    setIf("aquarium", up.aquarium ?? null, "aquarium");       // {water:'Freshwater'|'Saltwater', size:1-4}
    setIf("collectable", up.collectable ?? null, "collectable"); // 收藏品門檻值
    setIf("lure", up.lure ?? null, "lure");                   // 'Ambitious' | 'Modest'（7.0 擬餌）
    setIf("dataMissing", up.dataMissing ?? null, "dataMissing");

    // ④ 傳承錄 → 實體書（itemId ＋ 繁中書名）
    if (f.folklore != null) {
      const bookId = folkloreBooks[f.folklore];
      const bookName = bookId != null ? itemName.get(bookId) : null;
      if (bookId && bookName) {
        if (f.folkloreBook == null) stat.folkloreBook++;
        f.folkloreBook = { itemId: bookId, name: bookName };
      } else delete f.folkloreBook;
    } else delete f.folkloreBook;
  }

  console.log(`\n③ 上游欄位補齊：gig ${stat.gig}／aquarium ${stat.aquarium}／collectable ${stat.collectable}／lure ${stat.lure}／dataMissing ${stat.dataMissing}`);
  console.log(`④ 傳承錄書：${stat.folkloreBook} 條魚補上書名（共 ${Object.keys(folkloreBooks).length} 本）`);
  console.log(`   釣場欄位：回填 ${stat.spotFilled} 條（原本 null）、同步改名 ${stat.spotRenamed} 條`);

  // 驗收：不該再有無釣場的魚
  const stillOrphan = fishesJson.data.filter((f) => !f.spotName);
  console.log(`\n驗收：仍無釣場名的魚 ${stillOrphan.length} 條`);
  if (stillOrphan.length) {
    console.log(`   ${stillOrphan.slice(0, 10).map((f) => `${f.itemId}:${f.name || f.nameEn}(spot ${f.spotId})`).join("、")}`);
  }
  const noMap = spotsJson.data.filter((s) => !s.coords || s.coords.mapId == null);
  console.log(`　　　　無地圖座標的釣場 ${noMap.length} 個`);

  spotsJson.source = "fish-tracker+items+FishingSpot.csv+SpearfishingNotebook+twPlaces";
  fishesJson.source = "fish-tracker+items+FishingSpot.csv+SpearfishingNotebook";
  const today = new Date().toISOString().slice(0, 10);
  spotsJson.updated = today;
  fishesJson.updated = today;

  if (!APPLY) {
    console.log("\n（dry-run，未寫入。加 --apply 才會寫）");
    return;
  }
  // 前端載的是壓縮版，直接寫 minified（與現有檔一致：單行、無結尾換行）
  await writeFile(join(DATA_DIR, "fishing-spots.json"), JSON.stringify(spotsJson), "utf8");
  await writeFile(join(DATA_DIR, "fishes.json"), JSON.stringify(fishesJson), "utf8");
  console.log(`\n已寫入 data/fishing-spots.json（${spotsJson.count} 個釣場）與 data/fishes.json（${fishesJson.count} 條魚）`);
  console.log("接著跑：node scripts/validate-data.mjs　→　node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
