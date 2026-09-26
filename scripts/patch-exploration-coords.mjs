// patch-exploration-coords.mjs
// 為 data/exploration-log.json 的 340 筆探索筆記補座標（原本 coords 全為 null）。
//
// 原理：
//   探索筆記在遊戲資料裡是 Adventure sheet，row id 由 2162688 起連號，
//   與本站的 id（1–340）是 `adventureId = 2162688 + id - 1`。
//   Adventure.Level → Level sheet 取 X／Z／Map，再用 maps.json 的 sizeFactor／offset
//   換成遊戲內地圖座標（公式與 patch-aether-coords.mjs 相同）。
//
//   id 對應正確與否**不靠推測**：Adventure 的 MinTime／MaxTime 換算後必須與現有的
//   timeStart／timeEnd 相符，不符者列出來並跳過（不寫座標）。
//
// 天氣欄刻意不動：Adventure sheet 沒有天氣欄位，該資訊只存在英文 Description 散文裡，
// 依鐵則「對不到台服官方來源就不顯示」，weather 維持 null。
//
// 執行（repo 根目錄）：
//   node scripts/patch-exploration-coords.mjs             # dry-run，只印報告
//   node scripts/patch-exploration-coords.mjs --apply     # 實際寫入
//   node scripts/patch-exploration-coords.mjs --offline   # 用 out_data/cache 的快取，不連網

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache");
const CACHE_FILE = join(CACHE, "exploration-adventure.json");

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const XIVAPI = "https://v2.xivapi.com/api/sheet";
const ADVENTURE_BASE = 2162688;

async function fetchRows(sheet, ids, fields) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const url = `${XIVAPI}/${sheet}?rows=${chunk.join(",")}&fields=${encodeURIComponent(fields)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${sheet} HTTP ${res.status}`);
    const json = await res.json();
    for (const r of json.rows ?? []) out.set(r.row_id, r.fields);
    process.stdout.write(`\r  ${sheet}: ${out.size}/${ids.length}`);
  }
  process.stdout.write("\n");
  return out;
}

// MinTime/MaxTime 是 HHMM（800 = 8:00、1159 = 11:59）；全日為 0–2359
function hhmmToHour(v) {
  return Math.floor(v / 100);
}

async function main() {
  const db = JSON.parse(await readFile(join(DATA, "exploration-log.json"), "utf8"));
  const mapsDb = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8"));
  const maps = new Map(mapsDb.data.map((m) => [m.id, m]));

  console.log(`探索筆記 ${db.data.length} 筆，目前有座標 ${db.data.filter((e) => e.coords).length} 筆`);

  let adventures, levels;
  if (offline) {
    if (!existsSync(CACHE_FILE)) throw new Error(`--offline 但找不到快取 ${CACHE_FILE}，先跑一次連網版`);
    const cache = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    adventures = new Map(cache.adventures.map(([k, v]) => [k, v]));
    levels = new Map(cache.levels.map(([k, v]) => [k, v]));
    console.log(`用快取：Adventure ${adventures.size}、Level ${levels.size}（抓取日 ${cache.fetched}）`);
  } else {
    const advIds = db.data.map((e) => ADVENTURE_BASE + e.id - 1);
    adventures = await fetchRows("Adventure", advIds, "Level@as(raw),MinTime,MaxTime,Emote@as(raw)");
    const levelIds = [...new Set([...adventures.values()].map((f) => f["Level@as(raw)"]).filter((v) => v > 0))];
    levels = await fetchRows("Level", levelIds, "X,Z,Map@as(raw),Territory@as(raw)");
    await mkdir(CACHE, { recursive: true });
    await writeFile(
      CACHE_FILE,
      JSON.stringify({
        fetched: new Date().toISOString().slice(0, 10),
        adventures: [...adventures],
        levels: [...levels],
      })
    );
    console.log(`快取寫入 ${CACHE_FILE}`);
  }

  // 世界座標 → 地圖座標（同 patch-aether-coords.mjs）
  // mapName 一併寫入：頁面的 `/coord X Y 地名` 與座標列都要它，
  // 而這頁只載 exploration-log.json（為了一個名字多載 80KB 的 maps.json 不划算）。
  // 這與 triple-triad.json 的 location{mapId,mapName,x,y} 是同一個慣例。
  function toMapCoords(mapId, x, z) {
    const m = maps.get(mapId);
    if (!m) return null;
    const c = (m.sizeFactor ?? 100) / 100;
    const conv = (world, offset) =>
      Math.round(((41 / c) * ((world + offset) * c + 1024) / 2048 + 1) * 10) / 10;
    return { mapId, mapName: m.name, x: conv(x, m.offsetX ?? 0), y: conv(z, m.offsetY ?? 0) };
  }

  const report = { ok: 0, noAdventure: [], noLevel: [], noMap: [], timeMismatch: [] };
  const patched = [];

  for (const entry of db.data) {
    const advId = ADVENTURE_BASE + entry.id - 1;
    const adv = adventures.get(advId);
    if (!adv) { report.noAdventure.push(`#${entry.id} ${entry.name}`); continue; }

    // 對照時段確認 id 映射正確（有時段的才對得起來）
    if (entry.timeStart !== null && entry.timeEnd !== null) {
      const s = hhmmToHour(adv.MinTime), e = hhmmToHour(adv.MaxTime);
      // 遊戲資料的 MaxTime 是該小時的 59 分（1159 = 到 11 點台服顯示為 11）
      if (s !== entry.timeStart || e !== entry.timeEnd) {
        report.timeMismatch.push(`#${entry.id} ${entry.name}：本站 ${entry.timeStart}–${entry.timeEnd}，sheet ${s}–${e}`);
        continue;
      }
    }

    const levelId = adv["Level@as(raw)"];
    const lv = levels.get(levelId);
    if (!lv) { report.noLevel.push(`#${entry.id} ${entry.name}`); continue; }

    const mapId = lv["Map@as(raw)"];
    const coords = toMapCoords(mapId, lv.X, lv.Z);
    if (!coords) { report.noMap.push(`#${entry.id} ${entry.name}（Map row ${mapId} 不在 maps.json）`); continue; }

    patched.push([entry, coords]);
    report.ok++;
  }

  console.log(`\n座標解出：${report.ok}/${db.data.length}`);
  for (const [label, list] of [
    ["Adventure 查無", report.noAdventure],
    ["Level 查無", report.noLevel],
    ["Map 不在 maps.json", report.noMap],
    ["時段對不上（已跳過）", report.timeMismatch],
  ]) {
    if (!list.length) continue;
    console.log(`\n${label}：${list.length} 筆`);
    console.log("  " + list.slice(0, 20).join("\n  "));
    if (list.length > 20) console.log(`  …還有 ${list.length - 20} 筆`);
  }

  // 地圖分佈摘要
  const byMap = new Map();
  for (const [, c] of patched) byMap.set(c.mapId, (byMap.get(c.mapId) ?? 0) + 1);
  console.log(`\n涵蓋 ${byMap.size} 張地圖`);

  if (!apply) {
    console.log("\n（dry-run，未寫入；加 --apply 才寫）");
    console.log("前 5 筆預覽：");
    for (const [e, c] of patched.slice(0, 5)) {
      console.log(`  #${e.id} ${e.name} → ${c.mapName} (${c.x}, ${c.y})`);
    }
    return;
  }

  for (const [entry, coords] of patched) entry.coords = coords;
  db.updated = new Date().toISOString().slice(0, 10);

  // 沿用檔案既有格式（本檔為 minified）
  const raw = await readFile(join(DATA, "exploration-log.json"), "utf8");
  const pretty = raw.includes("\n  ");
  await writeFile(
    join(DATA, "exploration-log.json"),
    pretty ? JSON.stringify(db, null, 2) : JSON.stringify(db)
  );
  console.log(`\n✓ data/exploration-log.json 已更新（${report.ok} 筆座標）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
