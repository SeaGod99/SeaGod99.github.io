// build-monsters.mjs
// 建立 data/monsters.json 怪物資料庫
//
// 策略：以 BNpcName.csv（14367 筆）為主表，Teamcraft 資料為補充。
//   這樣可以確保討伐怪（S/A/B）即使沒有 Teamcraft 座標也能出現。
//
// 來源：
//   Teamcraft tw/tw-mobs.json        baseid(=BNpcName row_id) → { tw: 台服官方名 }（名稱第一優先）
//   thewakingsands BNpcName.csv      row_id → 簡中名（主表，全怪；OpenCC 簡轉繁為 fallback）
//   Teamcraft mobs.json              baseid(=BNpcName row_id) → { en, ja }
//   Teamcraft monsters.json          monsterId → { baseid, positions[{map,zoneid,level,hp,x,y,z}] }
//   Teamcraft drop-sources.json      monsterId → itemId[]
//   opencc-js                        簡中 → 繁中
//   data/items.json                  itemId → 繁中名（掉落物對照）
//   thewakingsands MobHuntTarget.csv + MobHuntOrder.csv → baseId → rank
//   thewakingsands PlaceName.csv      placeNameId → 簡中地名 → OpenCC 繁中
//   XIVAPI Map                       mapId → PlaceName.value（placeNameId）
//
// 輸出欄位（每筆）：
//   id          - Teamcraft monsterId（無座標資料時為 null）
//   baseId      - BNpcName row_id
//   name        - 繁中名（優先 tw-mobs 台服官方名；無則 CN+OpenCC 簡轉繁）
//   nameSource  - "tw-mobs"（僅官方名時存在；fallback 簡轉繁不標）
//   nameEn      - 英文名（來自 mobs.json，無則 null）
//   nameJa      - 日文名（來自 mobs.json，無則 null）
//   huntRank    - null | "SS" | "S" | "A" | "B"（討伐怪等級）
//   positions   - [{ mapId, mapName, level, hp, x, y, z }]（戶外怪才有）
//   drops       - [{ itemId, name }]（有繁中名的才放）
//
// 注意：Cowork 沙箱擋外網，需在本機執行。
// 執行（repo 根目錄）：node scripts/build-monsters.mjs
// 需求：Node 18+（內建 fetch）

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import * as OpenCC from "opencc-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "monsters.json");
// 先寫到系統 temp，完成後再複製到目標（避免大檔案寫入截斷問題）
const TMP = join(tmpdir(), "monsters_build.json");
const ITEMS_FILE = join(DATA, "items.json");

const TC_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/master/libs/data/src/lib/json";
const TC_TW_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw";
const CN_BASE =
  "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master";
const XIVAPI = "https://v2.xivapi.com/api/sheet";

// 簡中 → 繁中轉換器
const converter = OpenCC.Converter({ from: "cn", to: "tw" });

// ---------- 工具 ----------

async function fetchText(url, label) {
  process.stdout.write(`  抓取 ${label}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}: ${url}`);
  const text = await res.text();
  console.log(" OK");
  return text;
}

async function fetchJson(url, label) {
  process.stdout.write(`  抓取 ${label}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}: ${url}`);
  const data = await res.json();
  console.log(" OK");
  return data;
}

async function fetchXivapiAll(sheet, fields, label) {
  const rows = [];
  let after = 0;
  while (true) {
    const url = `${XIVAPI}/${sheet}?fields=${encodeURIComponent(fields)}&limit=500&after=${after}`;
    const json = await fetchJson(url, `${label}@${after}`);
    const batch = json.rows || [];
    rows.push(...batch);
    if (batch.length < 500) break;
    after = batch[batch.length - 1].row_id;
  }
  return rows;
}

// ---------- CSV 解析（簡單版，處理引號跳脫）----------

function parseCSVLine(line) {
  const fields = [];
  let cur = "";
  let inQuote = false;
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

// ---------- 資料抓取 ----------

// thewakingsands BNpcName.csv：row_id → 繁中名（簡中轉換）
async function fetchCnBNpcNames() {
  const csv = await fetchText(`${CN_BASE}/BNpcName.csv`, "BNpcName.csv(cn)");
  const lines = csv.split("\n");
  // 前3行是 header/型別說明，第4行起是資料，第一欄是 row_id，第二欄是 Singular(簡中)
  const map = new Map(); // row_id → 繁中名
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    const rowId = parseInt(fields[0]);
    const cn = fields[1] || "";
    if (!cn || isNaN(rowId)) continue;
    map.set(rowId, converter(cn));
  }
  console.log(`  BNpcName(cn→tw) 共 ${map.size} 筆`);
  return map;
}

// Teamcraft mobs.json：baseId(=BNpcName row_id) → { en, ja }
async function fetchMobs() {
  const data = await fetchJson(`${TC_BASE}/mobs.json`, "mobs.json");
  const map = new Map();
  for (const [idStr, names] of Object.entries(data)) {
    const en = names.en || "";
    const ja = names.ja || "";
    if (!en && !ja) continue;
    map.set(Number(idStr), { en, ja });
  }
  console.log(`  mobs 共 ${map.size} 筆`);
  return map;
}

// Teamcraft tw-mobs.json：baseId → 台服官方繁中名（名稱第一優先來源）
// 佔位值（含日文假名如「ラベル削除予定」、全形問號）視為無資料
async function fetchTwMobs() {
  const data = await fetchJson(`${TC_TW_BASE}/tw-mobs.json`, "tw-mobs.json");
  const map = new Map();
  for (const [idStr, v] of Object.entries(data)) {
    const tw = v && v.tw;
    if (!tw || /[぀-ヿ]/.test(tw) || /^[？?]+$/.test(tw)) continue;
    map.set(Number(idStr), tw);
  }
  console.log(`  tw-mobs（台服官方名）共 ${map.size} 筆`);
  return map;
}

// S/SS rank baseId 名單（來源：https://ff14.huijiwiki.com/wiki/怪物狩猎）
// 顏色對應：#FF5FFF/yellow = S，orange = SS
// 以繁中名反查 BNpcName row_id 取得，2026-06-09 確認
const WIKI_S_BASE_IDS = new Set([
  // ARR (17)
  2953,2954,2956,2957,2958,2959,2960,2961,2962,2963,2964,2965,2966,2967,2968,2969,
  // HW (6) — 注意 4379 缺，共5個確認，補 4373
  4374,4375,4376,4377,4378,4380,
  // SB (6)
  5984,5985,5986,5987,5988,5989,
  // ShB (7, 含1個yellow=S)
  8653,8890,8895,8900,8905,8910,8916,
  // EW (7, 含侍從)
  10616,10617,10618,10619,10620,10621,10622,
  // DT (7, 含水晶化身)
  12754,13156,13360,13399,13407,13437,13444,13646,
]);
const WIKI_SS_BASE_IDS = new Set([
  8915,   // ShB SS: 得到寬恕的叛亂
  10615,  // EW SS: 克爾
  13406,  // DT SS: 水晶化身之王
]);

// MobHuntTarget CSV + XIVAPI MobHuntOrder → baseId → rank ("S"/"A"/"B"/"SS")
//
// 策略：
//   1. S/SS 直接用 wiki 確認的 baseId hardcode（wiki_s_base_ids / wiki_ss_base_ids）
//   2. A/B 仍從 MobHuntOrder 取（Type=2=A, Type=1=B）
async function fetchHuntTargets() {
  // 1. MobHuntTarget CSV：targetId → baseId
  const targetCsv = await fetchText(`${CN_BASE}/MobHuntTarget.csv`, "MobHuntTarget.csv");
  const targetMap = new Map();
  for (const line of targetCsv.split("\n").slice(3)) {
    const f = parseCSVLine(line.trim());
    if (f.length < 2) continue;
    const rowId = parseInt(f[0]);
    const baseId = parseInt(f[1]);
    if (!isNaN(rowId) && !isNaN(baseId) && baseId > 0) targetMap.set(rowId, baseId);
  }

  // 2. XIVAPI MobHuntOrder：抓全部，只取 A/B（S/SS 用 wiki hardcode）
  const map = new Map(); // baseId → rank
  let after = 0;
  while (true) {
    const url = `${XIVAPI}/MobHuntOrder?fields=Type,Target&limit=500&after=${after}`;
    const json = await fetchJson(url, `MobHuntOrder@${after}`);
    const rows = json.rows || [];
    for (const r of rows) {
      const type = r.fields?.Type ?? -1;
      const targetId = r.fields?.Target?.value;
      if (targetId == null) continue;

      let rank = null;
      if (type === 2) rank = "A";
      else if (type === 1) rank = "B";
      // type=3/0: S rank 改用 wiki hardcode，這裡略過

      if (!rank) continue;
      const baseId = targetMap.get(targetId);
      if (baseId == null) continue;
      if (!map.has(baseId)) map.set(baseId, rank);
    }
    if (rows.length < 500) break;
    after = rows[rows.length - 1].row_id;
  }

  // 3. 套用 wiki S/SS
  for (const baseId of WIKI_S_BASE_IDS) map.set(baseId, "S");
  for (const baseId of WIKI_SS_BASE_IDS) map.set(baseId, "SS");

  const s = [...map.values()].filter(v => v === "S").length;
  const ss = [...map.values()].filter(v => v === "SS").length;
  const a = [...map.values()].filter(v => v === "A").length;
  const b = [...map.values()].filter(v => v === "B").length;
  console.log(`  HuntTargets 共 ${map.size} 筆（S=${s} SS=${ss} A=${a} B=${b}）`);
  return map;
}

// thewakingsands PlaceName.csv：placeNameId → 繁中地名
async function fetchCnPlaceNames() {
  const csv = await fetchText(`${CN_BASE}/PlaceName.csv`, "PlaceName.csv(cn)");
  const lines = csv.split("\n");
  const map = new Map(); // placeNameId → 繁中名
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    const rowId = parseInt(fields[0]);
    const cn = fields[1] || "";
    if (!cn || isNaN(rowId)) continue;
    map.set(rowId, converter(cn));
  }
  console.log(`  PlaceName(cn→tw) 共 ${map.size} 筆`);
  return map;
}

// Map sheet：mapId → placeNameId（再用 placeNames 查繁中名）
async function fetchMapPlaceIds() {
  const rows = await fetchXivapiAll("Map", "PlaceName", "Map");
  const map = new Map(); // mapId → placeNameId
  for (const r of rows) {
    const placeId = r.fields?.PlaceName?.value ?? null;
    if (placeId != null) map.set(r.row_id, placeId);
  }
  console.log(`  Map 共 ${map.size} 筆`);
  return map;
}

// ---------- 主程式 ----------

async function main() {
  console.log("=== build-monsters.mjs ===\n");

  // 1. 讀本地 items.json
  console.log("讀取 items.json…");
  const itemsFile = JSON.parse(await readFile(ITEMS_FILE, "utf8"));
  const itemMap = new Map();
  for (const item of itemsFile.data) itemMap.set(item.id, item.name);
  console.log(`  items 共 ${itemMap.size} 筆\n`);

  // 2. 抓遠端資料（並行）
  console.log("抓取遠端資料…");
  const [tcMonsters, tcDrops, cnNames, mobs, huntTargets, mapPlaceIds, placeNames, twMobs] =
    await Promise.all([
      fetchJson(`${TC_BASE}/monsters.json`, "monsters.json"),
      fetchJson(`${TC_BASE}/drop-sources.json`, "drop-sources.json"),
      fetchCnBNpcNames(),
      fetchMobs(),
      fetchHuntTargets(),
      fetchMapPlaceIds(),
      fetchCnPlaceNames(),
      fetchTwMobs(),
    ]);
  console.log(`\n  monsters(Teamcraft) 共 ${Object.keys(tcMonsters).length} 筆`);
  console.log(`  drop-sources 共 ${Object.keys(tcDrops).length} 筆`);
  console.log(`  BNpcName(主表) 共 ${cnNames.size} 筆\n`);

  // 反轉 drop-sources：monsterId → itemId[]
  const monsterDrops = new Map();
  for (const [itemId, monsterIds] of Object.entries(tcDrops)) {
    for (const mId of monsterIds) {
      if (!monsterDrops.has(mId)) monsterDrops.set(mId, []);
      monsterDrops.get(mId).push(Number(itemId));
    }
  }

  // 3. 建立 baseId → monsterIds 的反向索引（一個 baseId 可對應多個 monsterId）
  const baseToMonsterIds = new Map();
  for (const [idStr, monster] of Object.entries(tcMonsters)) {
    const monsterId = Number(idStr);
    const baseId = monster.baseid;
    if (!baseToMonsterIds.has(baseId)) baseToMonsterIds.set(baseId, []);
    baseToMonsterIds.get(baseId).push(monsterId);
  }

  // 4. 組合（以 BNpcName.csv 為主表）
  console.log("組合資料…");
  const data = [];
  let noEngName = 0;

  for (const [baseId, nameTw] of cnNames) {
    const nameData = mobs.get(baseId) ?? null;

    // 沒有英文名的跳過（通常是廢棄/未使用的 NPC）
    if (!nameData || !nameData.en) { noEngName++; continue; }

    const huntRank = huntTargets.get(baseId) ?? null;

    // 取所有對應的 monsterId 的座標（去重）
    const monsterIds = baseToMonsterIds.get(baseId) ?? [];
    const posSet = new Set();
    const positions = [];
    for (const monsterId of monsterIds) {
      const monster = tcMonsters[monsterId];
      if (!monster) continue;
      for (const p of (monster.positions || [])) {
        const key = `${p.map}|${p.x}|${p.y}|${p.z}`;
        if (posSet.has(key)) continue;
        posSet.add(key);
        positions.push({
          mapId: p.map,
          mapName: placeNames.get(mapPlaceIds.get(p.map)) ?? null,
          level: p.level ?? null,
          hp: p.hp ?? null,
          x: p.x ?? null,
          y: p.y ?? null,
          z: p.z ?? null,
        });
      }
    }

    // 掉落物：合併所有 monsterId 的掉落
    const dropItemIdSet = new Set();
    for (const monsterId of monsterIds) {
      for (const itemId of (monsterDrops.get(monsterId) || [])) {
        dropItemIdSet.add(itemId);
      }
    }
    const drops = [...dropItemIdSet]
      .map((itemId) => {
        const name = itemMap.get(itemId);
        return name ? { itemId, name } : null;
      })
      .filter(Boolean);

    // 代表 monsterId（取第一個，無則 null）
    const id = monsterIds.length > 0 ? monsterIds[0] : null;

    // 名稱優先序：tw-mobs 台服官方名 → CN+OpenCC 簡轉繁（fallback，不標 nameSource）
    const twName = twMobs.get(baseId) ?? null;
    const entry = {
      id,
      baseId,
      name: twName ?? nameTw,
      nameEn: nameData.en,
      nameJa: nameData.ja,
      huntRank,
      positions,
      drops,
    };
    if (twName) entry.nameSource = "tw-mobs";
    data.push(entry);
  }

  // 排序：討伐怪優先（S>A>B），其次按 baseId
  const RANK_ORDER = { SS: 0, S: 1, A: 2, B: 3 };
  data.sort((a, b) => {
    const ra = RANK_ORDER[a.huntRank] ?? 3;
    const rb = RANK_ORDER[b.huntRank] ?? 3;
    if (ra !== rb) return ra - rb;
    return a.baseId - b.baseId;
  });

  // 5. 統計與輸出
  const huntCount = data.filter((d) => d.huntRank).length;
  const withDrops = data.filter((d) => d.drops.length > 0).length;
  const withTw = data.filter((d) => d.name).length;
  const withOfficial = data.filter((d) => d.nameSource === "tw-mobs").length;
  const withPos = data.filter((d) => d.positions.length > 0).length;

  const out = {
    schema: "monsters",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "tw-mobs+datamining-cn+teamcraft+xivapi+items",
    count: data.length,
    data,
  };

  // 先寫到 /tmp（本地），完成後再複製到掛載路徑，避免 Windows NTFS 掛載寫入截斷
  const { createWriteStream } = await import("node:fs");
  const { unlink, copyFile } = await import("node:fs/promises");

  await unlink(TMP).catch(() => {});
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(TMP, { encoding: "utf8", flags: "w" });
    ws.on("error", reject);
    ws.on("finish", resolve);
    ws.write('{"schema":"monsters","patch":"7.2","updated":"' + out.updated + '","source":"tw-mobs+datamining-cn+teamcraft+xivapi+items","count":' + data.length + ',"data":[');
    for (let i = 0; i < data.length; i++) {
      ws.write(JSON.stringify(data[i]));
      if (i < data.length - 1) ws.write(",");
    }
    ws.end("]}");
  });
  // 驗證暫存檔完整性
  const { stat } = await import("node:fs/promises");
  const tmpStat = await stat(TMP);
  console.log(`  暫存檔大小: ${tmpStat.size} bytes`);
  const tmpContent = await readFile(TMP, "utf8");
  if (!tmpContent.endsWith("]}")) {
    throw new Error(`暫存檔不完整！結尾是: ${JSON.stringify(tmpContent.slice(-30))}`);
  }
  console.log(`  暫存檔完整，複製到目標…`);
  await copyFile(TMP, OUT);
  const outStat = await stat(OUT);
  console.log(`  目標檔大小: ${outStat.size} bytes`);

  console.log(`\n✓ 寫入 ${OUT}`);
  console.log(`  總計 ${data.length} 筆（略過無英文名 ${noEngName} 筆）`);
  console.log(`  有繁中名：${withTw} 筆（台服官方 tw-mobs ${withOfficial} 筆，其餘 CN+OpenCC fallback）`);
  console.log(`  討伐怪（Hunt）：${huntCount} 筆`);
  console.log(`  有座標（戶外怪）：${withPos} 筆`);
  console.log(`  有掉落物：${withDrops} 筆`);
}

main().catch((e) => { console.error(e); process.exit(1); });
