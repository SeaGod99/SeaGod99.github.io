// 建立 obtainable-methods.json 物品取得方式資料庫
//
// 來源：
//   out_data/obtainable-methods.msgpack  物品取得方式（已整理好的結構，含繁中地名）
//   out_data/shops.msgpack               twShops 商店繁中名
//   out_data/npcs.msgpack                twNpcs NPC 繁中名
//   out_data/tw-items.msgpack            currencyItemId 等道具的繁中名
//
// 輸出：data/obtainable-methods.json
//   格式：{ itemId: [ { type, typeName, detail, ... } ] }
//   只輸出在 tw-items 中有繁中名的物品（台服已開放）
//
// 執行（repo 根目錄）：
//   node scripts/build-obtainable.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DATA = join(__dirname, "..", "out_data");
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "obtainable-methods.json");

async function main() {
  console.log("讀取 msgpack…");
  const om      = decode(await readFile(join(OUT_DATA, "obtainable-methods.msgpack")));
  const twItems = decode(await readFile(join(OUT_DATA, "tw-items.msgpack")));
  const shopsRaw = decode(await readFile(join(OUT_DATA, "shops.msgpack")));
  const npcsRaw  = decode(await readFile(join(OUT_DATA, "npcs.msgpack")));

  const twShops = shopsRaw.twShops;   // { "shopId": { tw } }
  const twNpcs  = npcsRaw.twNpcs;    // { "npcId": { tw } }

  // helper
  const shopName = (id) => twShops[String(id)]?.tw ?? null;
  const npcName  = (id) => twNpcs[String(id)]?.tw ?? null;
  const itemName = (id) => twItems[String(id)]?.tw ?? null;

  // 整理每個 type 的欄位，輸出精簡結構
  function processMethod(m) {
    const base = { type: m.type, typeName: m.typeName };

    switch (m.type) {
      case "craft":
        return { ...base, recipeId: m.recipeId ? Number(m.recipeId) : null, jobId: m.job ?? null, level: m.level ?? null };

      case "gathering":
        return { ...base, gatheringType: m.gatheringType ?? null, level: m.level ?? null };

      case "alarm": // 限時採集（同 gathering，有 spawns）
        return { ...base, gatheringType: m.gatheringType ?? null, level: m.level ?? null };

      case "vendor": {
        // npcIds 轉繁中名
        const npcs = (m.npcIds || []).map(id => ({ id, name: npcName(id) })).filter(n => n.name);
        return { ...base, npcs: npcs.length ? npcs : null };
      }

      case "specialshop": {
        const name = shopName(m.shopId) ?? m.shopName?.en ?? null;
        const currency = m.currencyItemId ? { itemId: m.currencyItemId, name: itemName(m.currencyItemId), amount: m.currencyAmount ?? 1 } : null;
        const npcs = (m.npcIds || []).map(id => ({ id, name: npcName(id) })).filter(n => n.name);
        return { ...base, shopId: m.shopId ?? null, shopName: name, currency, npcs: npcs.length ? npcs : null };
      }

      case "instance":
        return { ...base, instanceContentTypes: m.instanceContentTypes ?? null, totalInstances: m.totalInstances ?? null };

      case "quest":
        return { ...base, questId: m.questId ?? null, questName: m.questName || null };

      case "achievement":
        return { ...base, achievementIds: m.achievementIds ?? null };

      case "mogstation":
        return { ...base, productId: m.productId ?? null };

      case "treasure":
        return { ...base, count: m.count ?? null };

      case "voyage":
        return { ...base, totalVoyages: m.totalVoyages ?? null };

      case "venture":
        return { ...base };

      case "drop":
        return { ...base };

      case "reduction":
        return { ...base, count: m.count ?? null };

      case "desynth":
        return { ...base, count: m.count ?? null };

      case "gardening":
        return { ...base, seedItemId: m.seedItemId ?? null, seedName: m.seedItemId ? itemName(m.seedItemId) : null, duration: m.duration ?? null };

      case "fate":
        return { ...base, fateId: m.fateId ?? null, fateName: m.fateName || null, level: m.level ?? null };

      case "masterbook":
        return { ...base, masterbookItemIds: (m.masterbookItemIds || []).map(b => b.id ?? b) };

      case "requirement":
        return { ...base, drops: m.drops ?? null };

      case "islandcrop":
        return { ...base, seedItemId: m.seedItemId ?? null, seedName: m.seedItemId ? itemName(m.seedItemId) : null };

      case "islandpasture":
        return { ...base, count: m.count ?? null };

      default:
        return base;
    }
  }

  console.log(`處理 ${Object.keys(om).length} 個物品…`);

  const result = {};
  let skipped = 0;
  let total = 0;

  for (const [itemIdStr, methods] of Object.entries(om)) {
    // 只輸出台服有開放的物品（tw-items 有繁中名）
    if (!twItems[itemIdStr]?.tw) { skipped++; continue; }

    const processed = methods.map(processMethod);
    result[Number(itemIdStr)] = processed;
    total++;
  }

  // 統計
  const typeCounts = {};
  for (const methods of Object.values(result)) {
    for (const m of methods) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
    }
  }

  const out = {
    schema: "obtainable-methods",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "mixed",
    count: total,
    data: result,
  };

  await writeFile(OUT, JSON.stringify(out));

  console.log(`\n寫入 ${OUT}`);
  console.log(`  收錄物品: ${total} 筆，略過（台服未開放）: ${skipped} 筆`);
  console.log("  各類型筆數:");
  for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t}: ${c}`);
  }
  console.log("\n完成。");
}

main().catch((e) => { console.error(e); process.exit(1); });
