// patch-aether-coords.mjs
// 為 data/aether-currents.json 的 303 筆風脈補座標。
//
// 原理：
//   - 野外型：EObj.csv 中 Data == AetherCurrent id 的物件 → Level.csv 取得放置座標
//   - 任務型：Quest.csv 的 Issuer{Location}（接取 NPC 的 Level id）→ Level.csv 座標
//   - 世界座標 → 遊戲地圖座標：41/c * ((world + offset) * c + 1024) / 2048 + 1，c = sizeFactor/100
//
// 執行（repo 根目錄，需連外網；Level.csv 較大約數十 MB）：
//   node scripts/patch-aether-coords.mjs

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const RAW = "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/";

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

async function fetchCSV(name) {
  console.log(`抓取 ${name}…`);
  const res = await fetch(RAW + name);
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n");
  const header = parseCSVLine(lines[1]); // 第 2 列為欄名
  return { header, lines: lines.slice(3) };
}

function colIndex(header, name) {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`找不到欄位 ${name}（現有：${header.slice(0, 30).join(", ")}…）`);
  return i;
}

async function main() {
  const acDb = JSON.parse(await readFile(join(DATA_DIR, "aether-currents.json"), "utf8"));
  const mapsDb = JSON.parse(await readFile(join(DATA_DIR, "maps.json"), "utf8"));
  const maps = new Map(mapsDb.data.map(m => [m.id, m]));

  const acIds = new Set(), questIds = new Set();
  for (const z of acDb.zones) for (const c of z.currents) {
    if (c.type === "field") acIds.add(c.id);
    else if (c.questId) questIds.add(c.questId);
  }
  console.log(`目標：野外 ${acIds.size} 筆、任務 ${questIds.size} 筆`);

  // 1) EObj：Data == AetherCurrent id
  const eobj = await fetchCSV("EObj.csv");
  const eData = colIndex(eobj.header, "Data");
  const eobjByAc = new Map(); // acId -> eobjId
  for (const line of eobj.lines) {
    const f = parseCSVLine(line.trim());
    if (f.length <= eData) continue;
    const data = parseInt(f[eData]);
    if (acIds.has(data)) eobjByAc.set(data, parseInt(f[0]));
  }
  console.log(`EObj 對上野外風脈：${eobjByAc.size}/${acIds.size}`);

  // 2) Quest：Issuer{Location} → Level id
  const quest = await fetchCSV("Quest.csv");
  let qLoc;
  try { qLoc = colIndex(quest.header, "Issuer{Location}"); }
  catch { qLoc = colIndex(quest.header, "IssuerLocation"); }
  const levelByQuest = new Map(); // questId -> levelId
  for (const line of quest.lines) {
    const f = parseCSVLine(line.trim());
    if (f.length <= qLoc) continue;
    const qid = parseInt(f[0]);
    if (questIds.has(qid)) levelByQuest.set(qid, parseInt(f[qLoc]));
  }
  console.log(`Quest 對上接取地點：${levelByQuest.size}/${questIds.size}`);

  // 3) Level：兩用（key ∈ 任務 Level id；Object ∈ EObj id）
  const wantLevelIds = new Set(levelByQuest.values());
  const wantObjIds = new Set(eobjByAc.values());
  const level = await fetchCSV("Level.csv");
  const lX = colIndex(level.header, "X"), lZ = colIndex(level.header, "Z");
  const lObj = colIndex(level.header, "Object"), lMap = colIndex(level.header, "Map");
  const posByLevel = new Map(), posByObj = new Map();
  for (const line of level.lines) {
    const f = parseCSVLine(line.trim());
    if (f.length <= lMap) continue;
    const key = parseInt(f[0]);
    const obj = parseInt(f[lObj]);
    const hitLevel = wantLevelIds.has(key), hitObj = wantObjIds.has(obj);
    if (!hitLevel && !hitObj) continue;
    const pos = { x: parseFloat(f[lX]), z: parseFloat(f[lZ]), mapId: parseInt(f[lMap]) };
    if (hitLevel) posByLevel.set(key, pos);
    if (hitObj) posByObj.set(obj, pos);
  }
  console.log(`Level 命中：任務地點 ${posByLevel.size}、野外物件 ${posByObj.size}`);

  // 4) 世界座標 → 地圖座標
  function toMapCoords(pos) {
    const m = maps.get(pos.mapId);
    if (!m) return null;
    const c = (m.sizeFactor ?? 100) / 100;
    const conv = (world, offset) => Math.round((41 / c * ((world + offset) * c + 1024) / 2048 + 1) * 10) / 10;
    return { mapId: pos.mapId, x: conv(pos.x, m.offsetX ?? 0), y: conv(pos.z, m.offsetY ?? 0) };
  }

  let done = 0, missing = [];
  for (const z of acDb.zones) for (const c of z.currents) {
    let pos = null;
    if (c.type === "field") pos = posByObj.get(eobjByAc.get(c.id));
    else if (c.questId) pos = posByLevel.get(levelByQuest.get(c.questId));
    const coords = pos ? toMapCoords(pos) : null;
    if (coords) { c.coords = coords; done++; }
    else missing.push(`${z.zone} ${c.type} ${c.questName ?? c.id}`);
  }
  console.log(`\n座標寫入：${done}/303`);
  if (missing.length) console.log("缺漏：\n  " + missing.slice(0, 15).join("\n  "));

  acDb.updated = new Date().toISOString().slice(0, 10);
  await writeFile(join(DATA_DIR, "aether-currents.json"), JSON.stringify(acDb, null, 2));
  console.log("✓ data/aether-currents.json 已更新");
}

main().catch(e => { console.error(e); process.exit(1); });
