// 建立 items.json 全物品主表
//
// 來源：
//   out_data/tw-items.msgpack         使用者提供，{itemId: {tw: 繁中名}}，43748 筆現成繁中
//   out_data/equipment.msgpack        使用者提供，{itemId: {equipSlotCategory,level,jobs,pDmg,...}}
//   XIVAPI v2 Item sheet              補 icon / categoryId / ilvl / rarity / stackSize / marketable
//   Teamcraft tw-item-ui-categories   補繁中 category 名稱（XIVAPI v2 不提供中文，此為台服官方譯名）
//
// 為什麼本機跑：Cowork 沙箱擋外網，無法在 session 內打 XIVAPI。你電腦沒這限制。
// 需 Node 18+（內建 fetch）。需安裝 msgpack 套件：
//   npm install @msgpack/msgpack
//
// 執行（repo 根目錄）：
//   node scripts/build-items.mjs
//
// 效率：XIVAPI 用分頁一次抓 500 筆（不是逐筆查 4 萬次）。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT_DATA = join(__dirname, "..", "out_data");
const TW_FILE = join(OUT_DATA, "tw-items.msgpack");
const EQ_FILE = join(OUT_DATA, "equipment.msgpack");
const OUT = join(DATA, "items.json");

const API = "https://v2.xivapi.com/api/sheet/Item";
const TC_TW_UI_CATEGORIES_URL =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-item-ui-categories.json";

// 從 Teamcraft 抓台服繁中 ItemUICategory 對照表 → Map(categoryId → 繁中名)
async function fetchTwUiCategories() {
  const res = await fetch(TC_TW_UI_CATEGORIES_URL);
  if (!res.ok) throw new Error(`tw-item-ui-categories HTTP ${res.status}`);
  const json = await res.json();
  // 格式：{ "1": { "tw": "格鬥武器" }, "2": { "tw": "單手劍" }, ... }
  const map = new Map();
  for (const [id, val] of Object.entries(json)) {
    if (val?.tw) map.set(Number(id), val.tw);
  }
  console.log(`  繁中分類對照表：${map.size} 筆`);
  return map;
}

// XIVAPI Icon.path（ui/icon/020000/020801.tex）→ /i/020000/020801.png
function iconPath(icon) {
  if (!icon?.path) return null;
  const m = icon.path.match(/ui\/icon\/(\d+)\/(\d+)\.tex/);
  return m ? `/i/${m[1]}/${m[2]}.png` : null;
}

// 抓 XIVAPI Item sheet 補充欄位 → Map(itemId → {icon,categoryId,ilvl,rarity,stackSize,marketable})
// 注意：改抓 ItemUICategory.row_id（分類 ID），搭配 twUiCategories 對照表轉繁中名
async function fetchItemMeta() {
  const fields = [
    "Icon",
    "ItemUICategory",
    "LevelItem",
    "Rarity",
    "StackSize",
    "IsUntradable",
  ].join(",");

  const meta = new Map();
  let after = 0;
  while (true) {
    const url = `${API}?fields=${encodeURIComponent(fields)}&limit=500&after=${after}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Item sheet HTTP ${res.status} @ after=${after}`);
    const json = await res.json();
    const rows = json.rows || [];
    if (!rows.length) break;
    for (const r of rows) {
      const f = r.fields || {};
      meta.set(r.row_id, {
        icon: iconPath(f.Icon),
        categoryId: f.ItemUICategory?.row_id ?? null,
        ilvl: f.LevelItem?.value ?? 0,
        rarity: f.Rarity ?? 0,
        stackSize: f.StackSize ?? 0,
        marketable: f.IsUntradable === false,
      });
    }
    after = rows[rows.length - 1].row_id;
    process.stdout.write(`\r  XIVAPI 已抓 ${meta.size} 筆…`);
    if (rows.length < 500) break;
  }
  process.stdout.write("\n");
  return meta;
}

async function main() {
  console.log("讀取 msgpack…");
  const tw = decode(await readFile(TW_FILE));   // {itemId: {tw}}
  const eq = decode(await readFile(EQ_FILE));   // {itemId: {...}}
  console.log(`  tw-items ${Object.keys(tw).length} 筆、equipment ${Object.keys(eq).length} 筆`);

  console.log("抓 Teamcraft 繁中 UI 分類對照表…");
  const twUiCategories = await fetchTwUiCategories();

  console.log("抓 XIVAPI Item 補充欄位…");
  const meta = await fetchItemMeta();

  const data = [];
  for (const [idStr, val] of Object.entries(tw)) {
    const name = val?.tw;
    if (!name) continue;                 // 跳過空名稱
    const id = Number(idStr);
    const m = meta.get(id) || {};
    const e = eq[idStr];

    const categoryId = m.categoryId ?? null;
    const category = categoryId != null ? (twUiCategories.get(categoryId) ?? null) : null;

    const entry = {
      id,
      name,
      icon: m.icon ?? null,
      category,
      ilvl: m.ilvl ?? 0,
      rarity: m.rarity ?? 0,
      stackSize: m.stackSize ?? 0,
      marketable: m.marketable ?? false,
    };
    if (e) {
      entry.equip = {
        slot: e.equipSlotCategory ?? 0,
        level: e.level ?? 0,
        jobs: e.jobs ?? [],
        pDmg: e.pDmg ?? 0, mDmg: e.mDmg ?? 0,
        pDef: e.pDef ?? 0, mDef: e.mDef ?? 0,
        delay: e.delay ?? 0, unique: e.unique ?? 0,
      };
    }
    data.push(entry);
  }

  data.sort((a, b) => a.id - b.id);

  const out = {
    schema: "items",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "mixed",
    count: data.length,
    data,
  };
  await writeFile(OUT, JSON.stringify(out));

  const withIcon = data.filter((d) => d.icon).length;
  const withEquip = data.filter((d) => d.equip).length;
  const withCategory = data.filter((d) => d.category).length;
  const noMeta = data.filter((d) => !d.category).length;
  console.log(`\n寫入 ${OUT}`);
  console.log(`  物品 ${data.length} 筆（有圖示 ${withIcon}、含裝備 ${withEquip}、有繁中分類 ${withCategory}）`);
  if (noMeta > 0) console.log(`  註：${noMeta} 筆無分類（可能為 7.2+ 新物品尚未進 Teamcraft TW 資料，或已下架物品）`);
  console.log("\n完成。items.json 約數 MB，前端建議建 itemId→item 的 Map 快取。");
}

main().catch((e) => { console.error(e); process.exit(1); });
