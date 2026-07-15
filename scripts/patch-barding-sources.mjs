// 補上 barding.json 的取得方式（sources）
//
// 來源：data/obtainable-methods.json（itemId → 取得方式陣列，36336 筆，繁中 typeName 已備）
// 對應：barding.json 每筆用 itemId 查表，組成 { type, detail } 陣列
//
// 與 patch-minion-sources.mjs 共用同一套 toSource() 轉換邏輯
//
// 執行（repo 根目錄）：
//   node scripts/patch-barding-sources.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const BARDING_FILE = join(DATA, "barding.json");
const OBTAINABLE_FILE = join(DATA, "obtainable-methods.json");

const SHOP_NAME_ZH = {
  "Gemstone Trader": "寶石商人",
  "Cowrie Exchange": "貝殼兌換",
  "Clan Centurio Member": "百智隊成員",
  "Prize Claim": "獎品兌換",
  "Maelstrom": "黑渦團",
  "Order of the Twin Adder": "雙蛇黨",
  "Immortal Flames": "不滅隊",
  "Beaver Merchant": "海狸商人",
};

function zhShopName(name) {
  return SHOP_NAME_ZH[name] || name;
}

const CONTENT_TYPE_NAMES = {
  2: "迷宮挑戰",
  4: "討伐戰",
  5: "大型任務",
  9: "深層迷宮",
  21: "PvP",
  28: "絕境戰",
  30: "異界戰爭",
};

function toSource(method) {
  const tn = method.typeName;
  switch (method.type) {
    case "specialshop": {
      const cur = method.currency;
      const detailParts = [];
      if (method.shopName) detailParts.push(zhShopName(method.shopName));
      if (cur?.name) detailParts.push(`需 ${cur.name}${cur.amount ? ` x${cur.amount}` : ""}`);
      if (method.npcs && method.npcs.length) {
        const npcNames = [...new Set(method.npcs.map(n => n.name).filter(Boolean))];
        if (npcNames.length) detailParts.push(`NPC：${npcNames.slice(0, 2).join("、")}`);
      }
      return { type: tn, detail: detailParts.join(" / ") || null };
    }
    case "vendor": {
      if (method.npcs && method.npcs.length) {
        const npcNames = [...new Set(method.npcs.map(n => n.name).filter(Boolean))];
        return { type: tn, detail: npcNames.length ? `NPC：${npcNames.slice(0, 2).join("、")}` : null };
      }
      return { type: tn, detail: null };
    }
    case "instance": {
      const cts = (method.instanceContentTypes || []).map(id => CONTENT_TYPE_NAMES[id]).filter(Boolean);
      const parts = [];
      if (cts.length) parts.push(cts.join("／"));
      if (method.totalInstances) parts.push(`共 ${method.totalInstances} 個副本掉落`);
      return { type: tn, detail: parts.join(" · ") || null };
    }
    case "treasure":
      return { type: tn, detail: method.count ? `${method.count} 個寶箱/容器` : null };
    case "drop":
      return { type: tn, detail: null };
    case "quest":
      return { type: tn, detail: method.questName || null };
    case "fate":
      return { type: tn, detail: [method.fateName, method.level ? `Lv.${method.level}` : null].filter(Boolean).join(" ") || null };
    case "gathering":
      return { type: tn, detail: method.level ? `採集 Lv.${method.level}` : null };
    case "gardening":
      return { type: tn, detail: method.seedName ? `種子：${method.seedName}` : null };
    case "craft":
      return { type: tn, detail: method.level ? `製作 Lv.${method.level}` : null };
    case "desynth":
      return { type: tn, detail: null };
    case "masterbook":
      return { type: tn, detail: null };
    case "venture":
      return { type: tn, detail: null };
    case "voyage":
      return { type: tn, detail: method.totalVoyages ? `共 ${method.totalVoyages} 種航線` : null };
    case "alarm":
      return { type: tn, detail: null };
    case "achievement":
      return { type: tn, detail: null };
    case "mogstation":
      return { type: tn, detail: null };
    default:
      return { type: tn || method.type || "其他", detail: null };
  }
}

async function main() {
  console.log("讀取 barding.json / obtainable-methods.json…");
  const bardingFile = JSON.parse(await readFile(BARDING_FILE, "utf8"));
  const obtainable = JSON.parse(await readFile(OBTAINABLE_FILE, "utf8")).data;

  let updated = 0, stillEmpty = 0, noItemId = 0;

  for (const b of bardingFile.data) {
    if (b.itemId == null) {
      noItemId++;
      continue;
    }
    const methods = obtainable[String(b.itemId)];
    if (!methods || !methods.length) {
      if (!b.sources || b.sources.length === 0) stillEmpty++;
      continue;
    }

    const seen = new Set();
    const newSources = [];
    for (const method of methods) {
      const src = toSource(method);
      const key = `${src.type}|${src.detail ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      newSources.push(src);
    }

    if (newSources.length) {
      b.sources = newSources;
      updated++;
    } else if (!b.sources || b.sources.length === 0) {
      stillEmpty++;
    }
  }

  bardingFile.updated = new Date().toISOString().slice(0, 10);
  bardingFile.source = "xivapi+tw-items+obtainable-methods (icons local)";

  await writeFile(BARDING_FILE, JSON.stringify(bardingFile, null, 2));

  console.log(`\n更新 ${updated} 筆 sources`);
  console.log(`itemId=null（台服未開放或無對應項目，不影響）：${noItemId} 筆`);
  console.log(`仍為空（obtainable-methods 無資料）：${stillEmpty} 筆`);
  console.log(`寫入 ${BARDING_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
