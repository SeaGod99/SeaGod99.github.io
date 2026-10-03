// patch-collection-shop-links.mjs — 收藏頁的商店／兌換來源連到 NPC 商店目錄（「這位 NPC 還賣什麼」）
//
// 第二輪路線圖 `collection-shared-source-cohort`：原案是在卡片上列「同一來源還給哪些收藏」。
// 2026-10-03 量過：跨 ≥2 種收藏的共同來源有 192 組，其中 153 組是副本——那一半已經由副本圖鑑的
// 「資料列為此副本的產出」回答了（收藏頁的副本來源本來就連過去，patch-collection-duty-links.mjs）。
// 剩下的是商店 NPC，答案也已經在 NPC 商店目錄裡，所以**不另做一份群組資料**，只補一條連結。
//
// 這支替商店／兌換類來源補 `shop: [[mapId, NPC 名, 地圖名], …]`（最多 3 處），由共用的
// CollectionTracker.sourceWhere() 畫成 `/tools/npc-shops/?m=<mapId>&q=<NPC 名>`。
// 每一處都必須是「NPC 商店目錄裡**真的有一筆交易給出這件物品**（itemId）的 NPC」——那是遊戲的商店表，
// 不是猜的。對應規則：
//   ① 來源點得出 NPC 名（issuer.name、detail 開頭的「NPC 名：」或「NPC：名」，「、」分隔的多位都算）
//      → 只認同名的；**目錄裡同名的沒賣就不接**（不拿別的 NPC 去頂替來源寫的那位）
//      → 同名的在好幾張圖都有時，detail 括號裡的地名對得上就只留那張；對不上就全列（每一張都真的有賣）
//   ② 來源沒寫 NPC（只有「商店」兩個字）→ 目錄裡賣這件的 ≤3 處就全列，多於 3 處不接（列不完，不如不列）。
//      這一類順便補上了原本缺的 NPC 與地點。
//
// 冪等：跑第二次是 0 筆變動。重建收藏資料或 NPC 商店目錄（build-npc-shops.mjs）後再跑一次即可。
//
// 執行（repo 根目錄）：
//   node scripts/patch-collection-shop-links.mjs           # dry-run
//   node scripts/patch-collection-shop-links.mjs --apply   # 寫回（保留各檔原本的 minified／pretty 格式）

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

export const FILES = ["mounts", "minions", "orchestrion", "barding", "emotes", "ornaments"];
const SHOP_TYPE = /商店|兌換/;
const MAX = 3;

/** itemId → [{ mapId, map, npc }]：哪幾位 NPC（在哪張圖）有交易給出這件物品 */
export function loadShopIndex() {
  const dir = join(DATA, "npc-shops");
  const by = new Map();
  for (const f of readdirSync(dir)) {
    if (f[0] === "_" || !f.endsWith(".json")) continue;
    const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const n of s.npcs) for (const sh of n.s) for (const t of sh.tr) for (const [g] of t.g) {
      if (!by.has(g)) by.set(g, []);
      const a = by.get(g);
      if (!a.some((x) => x.mapId === s.mapId && x.npc === n.n)) a.push({ mapId: s.mapId, map: s.map, npc: n.n });
    }
  }
  return by;
}

/** 來源裡點得出的 NPC 名（可能好幾位；點不出就空陣列） */
export function npcNamesOf(s) {
  if (s.issuer && s.issuer.name) return [s.issuer.name.trim()];
  const d = s.detail || "";
  const m = d.match(/^([^：:（(/]+)[：:]/) || d.match(/NPC：([^/（(]+)/);
  return m ? m[1].split("、").map((x) => x.trim()).filter(Boolean) : [];
}

export function resolveShop(s, itemId, index) {
  if (!SHOP_TYPE.test(s.type || "") || !itemId) return null;
  const all = (index.get(+itemId) || []).slice().sort((a, b) => a.mapId - b.mapId);
  const names = npcNamesOf(s);
  let cand;
  if (names.length) {
    cand = all.filter((x) => names.includes(x.npc));
    const place = ((s.detail || "").match(/（([^）]+)）\s*$/) || [])[1] || (s.at && s.at.mapName);
    const here = place ? cand.filter((x) => x.map === place) : [];
    if (here.length) cand = here;
  } else {
    cand = all.length <= MAX ? all : [];
  }
  return cand.length ? cand.slice(0, MAX).map((x) => [x.mapId, x.npc, x.map]) : null;
}

function main() {
  const apply = process.argv.includes("--apply");
  const index = loadShopIndex();
  let total = 0, linked = 0, changed = 0, filled = 0;
  for (const f of FILES) {
    const path = join(DATA, f + ".json");
    const raw = readFileSync(path, "utf8");
    const minified = !raw.trimStart().startsWith("{\n");
    const db = JSON.parse(raw);
    let fileChanged = 0, fileLinked = 0, fileTotal = 0;
    for (const e of db.data) for (const s of e.sources || []) {
      if (!SHOP_TYPE.test(s.type || "")) continue;
      fileTotal++;
      const shop = resolveShop(s, e.itemId, index);
      if (shop) fileLinked++;
      if (shop && !npcNamesOf(s).length) filled++;
      const before = JSON.stringify(s.shop || null);
      if (shop) s.shop = shop; else delete s.shop;
      if (JSON.stringify(s.shop || null) !== before) fileChanged++;
    }
    total += fileTotal; linked += fileLinked; changed += fileChanged;
    console.log(`${f.padEnd(12)} 商店／兌換來源 ${String(fileTotal).padStart(4)}　接上 ${String(fileLinked).padStart(4)}　變動 ${fileChanged}`);
    if (apply && fileChanged) writeFileSync(path, minified ? JSON.stringify(db) + (raw.endsWith("\n") ? "\n" : "") : JSON.stringify(db, null, 2) + "\n");
  }
  console.log(`\n合計：${total} 筆商店／兌換來源，接上 ${linked}（${(linked / total * 100).toFixed(1)}%）；其中 ${filled} 筆原本沒寫 NPC，這次補上了 NPC 與地點`);
  console.log(apply ? `已寫回（變動 ${changed} 筆）` : `dry-run（會變動 ${changed} 筆；加 --apply 寫回）`);
}

// 被回歸 import 時不執行
if ((process.argv[1] || "").endsWith("patch-collection-shop-links.mjs")) main();
