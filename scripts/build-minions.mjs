// 建立 minions.json 寵物資料庫（一鍵完整版）
//
// 來源：
//   data/items.json                      已完成的全物品主表（category === 'Minion'，含繁中名）
//   XIVAPI v2 Companion sheet            寵物外觀圖示、行為、種族、Order
//   Teamcraft item-patch.json            itemId → patchId（整數）
//   Teamcraft patch-names.json           patchId → version 字串（"2.0"、"3.1"...）
//   Teamcraft achievements.json          成就 → itemReward（寵物成就來源）
//
// 圖示對應邏輯：
//   items.json 道具 icon：/i/059000/059403.png → icon_num = 59403
//   Companion 外觀 icon id = 4403           → icon_num - 55000 = 4403
//   圖片路徑：/assets/minions/004403_hr1.webp（需先跑 download-minions.mjs）
//
// 為什麼本機跑：Cowork 沙箱擋外網。需 Node 18+（內建 fetch）。
//
// 執行（repo 根目錄）：
//   node scripts/build-minions.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const ITEMS_FILE = join(DATA, "items.json");
const OUT = join(DATA, "minions.json");

const COMPANION_API = "https://v2.xivapi.com/api/sheet/Companion";
const COMPANION_FIELDS = ["Singular", "Icon", "Order", "Behavior", "MinionRace"].join(",");

const TC_BASE = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/master/libs/data/src/lib/json";

// ---------- 工具函式 ----------

function iconLocalPath(path_hr1) {
  if (!path_hr1) return null;
  const m = path_hr1.match(/ui\/icon\/(\d+)\/(\d+_hr1)\.tex/);
  return m ? `/assets/minions/${m[2]}.webp` : null;
}

function iconUrl(path_hr1) {
  if (!path_hr1) return null;
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(path_hr1)}&format=png`;
}

async function fetchJson(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.json();
}

// ---------- 資料抓取 ----------

// XIVAPI Companion sheet（分頁）
async function fetchCompanions() {
  const companions = new Map(); // iconId → companion
  let after = 0;

  while (true) {
    const url = `${COMPANION_API}?fields=${encodeURIComponent(COMPANION_FIELDS)}&limit=500&after=${after}`;
    const json = await fetchJson(url, `Companion@${after}`);
    const rows = json.rows || [];
    if (!rows.length) break;

    for (const r of rows) {
      const f = r.fields || {};
      const iconId = f.Icon?.id;
      if (!iconId || !f.Singular) continue;
      companions.set(iconId, {
        companionId: r.row_id,
        nameEn: f.Singular,
        iconPath: iconLocalPath(f.Icon?.path_hr1),
        iconUrl: iconUrl(f.Icon?.path_hr1),
        order: f.Order ?? 0,
        behavior: f.Behavior?.fields?.Name || null,
        race: f.MinionRace?.fields?.Name || null,
      });
    }

    after = rows[rows.length - 1].row_id;
    process.stdout.write(`\r  Companion 已抓 ${companions.size} 筆…`);
    if (rows.length < 500) break;
  }
  process.stdout.write("\n");
  return companions;
}

// Teamcraft: itemId → version 字串（"2.0"、"3.1"...）
async function fetchPatchMap() {
  const [itemPatch, patchNames] = await Promise.all([
    fetchJson(`${TC_BASE}/item-patch.json`, "item-patch"),
    fetchJson(`${TC_BASE}/patch-names.json`, "patch-names"),
  ]);

  // patchNames: { "2": { version: "2.0" }, ... }
  const patchMap = new Map(); // itemId → version string
  for (const [itemId, patchId] of Object.entries(itemPatch)) {
    const version = patchNames[patchId]?.version ?? null;
    if (version) patchMap.set(Number(itemId), version);
  }
  return patchMap;
}

// Teamcraft: itemId → 成就名稱（英文，取得方式用）
async function fetchAchievementSources() {
  const achievements = await fetchJson(`${TC_BASE}/achievements.json`, "achievements");
  const sourceMap = new Map(); // itemId → achieveName(en)
  for (const [, ach] of Object.entries(achievements)) {
    if (ach.itemReward && ach.en) {
      sourceMap.set(ach.itemReward, ach.en);
    }
  }
  return sourceMap;
}

// ---------- 主程式 ----------

async function main() {
  // 1. 讀 items.json
  console.log("讀取 items.json…");
  const itemsFile = JSON.parse(await readFile(ITEMS_FILE, "utf8"));
  const minionItems = itemsFile.data.filter((i) => i.category === "Minion");
  console.log(`  Minion 道具 ${minionItems.length} 筆`);

  // items icon /i/059000/059403.png → 數字 59403 → Map
  const itemByIconNum = new Map();
  for (const item of minionItems) {
    if (!item.icon) continue;
    const m = item.icon.match(/\/(\d+)\.png$/);
    if (!m) continue;
    itemByIconNum.set(parseInt(m[1]), item);
  }

  // 2. 並行抓遠端資料
  console.log("抓遠端資料（XIVAPI + Teamcraft）…");
  const [companions, patchMap, achieveSources] = await Promise.all([
    fetchCompanions(),
    fetchPatchMap().then(m => { console.log(`  patch-map ${m.size} 筆`); return m; }),
    fetchAchievementSources().then(m => { console.log(`  achievement-sources ${m.size} 筆`); return m; }),
  ]);
  console.log(`  Companion 共 ${companions.size} 筆`);

  // 3. 組合資料
  const data = [];
  let matched = 0, unmatched = 0;

  for (const [iconId, comp] of companions) {
    const itemIconNum = iconId + 55000;
    const item = itemByIconNum.get(itemIconNum);
    const itemId = item?.id ?? null;

    // patch 版本
    const patch = itemId ? (patchMap.get(itemId) ?? null) : null;

    // 成就來源
    const sources = [];
    if (itemId && achieveSources.has(itemId)) {
      sources.push({
        type: "成就",
        detail: achieveSources.get(itemId), // 英文成就名（暫無繁中對照）
      });
    }

    if (item) {
      matched++;
      data.push({
        id: comp.companionId,
        name: item.name,
        nameEn: comp.nameEn,
        itemId,
        icon: comp.iconPath,
        iconUrl: comp.iconUrl,
        order: comp.order,
        behavior: comp.behavior,
        race: comp.race,
        marketable: item.marketable,
        patch,
        sources,
      });
    } else {
      unmatched++;
      data.push({
        id: comp.companionId,
        name: comp.nameEn,
        nameEn: comp.nameEn,
        itemId: null,
        icon: comp.iconPath,
        iconUrl: comp.iconUrl,
        order: comp.order,
        behavior: comp.behavior,
        race: comp.race,
        marketable: false,
        patch,
        sources,
        _noTwName: true,
      });
    }
  }

  data.sort((a, b) => a.order - b.order);

  // 4. 輸出
  const withPatch = data.filter(d => d.patch).length;
  const withSources = data.filter(d => d.sources.length > 0).length;

  const out = {
    schema: "minions",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "xivapi+teamcraft+items",
    count: data.length,
    data,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2));

  console.log(`\n寫入 ${OUT}`);
  console.log(`  總計 ${data.length} 筆`);
  console.log(`  有繁中名 ${matched}、無繁中名(台服未開放) ${unmatched}`);
  console.log(`  有版本資訊 ${withPatch}、有成就來源 ${withSources}`);
  console.log("\n注意：成就來源目前為英文成就名，無繁中對照。其他來源（副本掉落/商店/活動等）需手動補充。");
}

main().catch((e) => { console.error(e); process.exit(1); });
