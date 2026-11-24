// seasonal-npcs.mjs — 「只在季節活動期間出現的 NPC」判別（2026-11-24，第四輪 §5-8 抽出來給兩支共用）
//
// 用在：build-npc-shops.mjs（目錄卡片標「季節活動期間限定」、無名的活動攤位整間不收）、
//       build-item-uses.mjs（市場頁「會用掉它的地方」的兌換地點註明季節活動期間）。
// **兩支必須用同一份規則**——不然同一位 NPC 在目錄說是季節活動、在市場頁看起來像常駐商人。
//
// ── 判別（只用台服官方字串，不自己列名單）────────────────────────────
// NPC 在活動圖層上（Teamcraft npcs.json 的 `festival`），而且下列任一成立：
//   · 官方頭銜（客戶端 ENpcResident.Title）含「季節」（季節商店／季節商鋪）；
//   · 同一個活動圖層上有任何 NPC 的頭銜含「季節」（可疑的占卜師沒頭銜，但與瓦倫提昂家的女僕同圖層）；
//   · 它開的店的官方店名含「季節活動」（金碟遊樂園的特別紀念品兌換員：沒頭銜、圖層上也沒別人，店名「季節活動報酬1」）。
// ⚠ 不能只看 `festival`：渴望灣的梅蘇艾東克／歌吉斯（宇宙探索常駐，頭銜「貿易人員」「購物&修理」）也在活動圖層上。
//
// 用法：
//   import { loadSeasonalNpcs } from "./lib/seasonal-npcs.mjs";
//   const SN = await loadSeasonalNpcs({ root, offline, shops: S });   // S＝loadShops() 的結果（店名規則要用）
//   SN.isSeasonal(npcId)   // true／false
//   SN.festival            // Map<NPC id, 活動圖層 id>（build-npc-shops 擋無名活動攤位用）
//
// Teamcraft npcs.json 17MB，快取在 out_data/cache/tc-npcs.json（不進 git）。--offline 而快取不在就中止——
// 安靜地當成「沒有活動 NPC」會把往年活動攤位當常駐商人。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadTcSheet } from "./tc-datamining.mjs";

const TC_NPCS = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/npcs.json";

export async function loadFestivalNpcs({ root, offline = false }) {
  const cache = join(root, "out_data/cache/tc-npcs.json");
  let raw;
  if (existsSync(cache)) raw = JSON.parse(await readFile(cache, "utf8"));
  else if (offline) throw new Error(`--offline 但找不到 ${cache}（先不帶 --offline 跑一次）`);
  else {
    const r = await fetch(TC_NPCS);
    if (!r.ok) throw new Error(`Teamcraft npcs.json HTTP ${r.status}`);
    const t = await r.text();
    await mkdir(join(root, "out_data/cache"), { recursive: true });
    await writeFile(cache, t);
    raw = JSON.parse(t);
  }
  const map = new Map(Object.entries(raw).filter(([, v]) => v && v.festival).map(([id, v]) => [Number(id), v.festival]));
  if (map.size < 1000) throw new Error(`Teamcraft npcs.json 的活動 NPC 只有 ${map.size} 個（2026-11 是 4,154）——欄位可能改名了`);
  return map;   // NPC id → 活動圖層 id
}

/**
 * @param opts.shops  loadShops() 的結果（用它的 byNpc 看 NPC 開的店名）
 */
export async function loadSeasonalNpcs({ root, offline = false, shops }) {
  if (!shops || !shops.byNpc) throw new Error("loadSeasonalNpcs 需要 shops（loadShops() 的結果）");
  const festival = await loadFestivalNpcs({ root, offline });
  const title = new Map((await loadTcSheet("ENpcResident", { offline, require: ["Title"] })).map((r) => [r.id, r.Title || ""]));
  const seasonalLayer = new Set();
  for (const [id, f] of festival) if (/季節/.test(title.get(id) || "")) seasonalLayer.add(f);
  if (seasonalLayer.size < 50) throw new Error(`頭銜含「季節」的活動圖層只有 ${seasonalLayer.size} 個（2026-11 是 97）——ENpcResident.Title 可能位移了`);
  const memo = new Map();
  const isSeasonal = (id) => {
    if (memo.has(id)) return memo.get(id);
    const f = festival.get(id);
    const v = !!f && (seasonalLayer.has(f) || /季節/.test(title.get(id) || "") ||
      (shops.byNpc.get(id) || []).some((s) => /季節活動/.test(s.name || "")));
    memo.set(id, v);
    return v;
  };
  return { festival, isSeasonal, title: (id) => title.get(id) || "" };
}
