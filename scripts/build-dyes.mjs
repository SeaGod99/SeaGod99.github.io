// 產生 data/dyes.json — 全服染劑的「顏色 + 取得方式 + 真實代價」資料庫。
//
// 為什麼要這支（2026-07-25 定案）：
// 時尚品鑑頁過去只寫「本週指定色＝萄乾棕」，但**染色本身就是成本**——
//   ・染劑要錢：城市雜貨商 40～334 金幣不等
//   ・染劑幾乎都**不能上市場板**（114 支裡只有 20 支可交易），買不到就得自己跑
//   ・有些卡在**蠻族部族聲望**（萄乾棕只有南薩納蘭的蜥蜴人族雜用商人賣）
//   ・有些是**製作限定＋不可交易**（東洲藍要刻木匠自己做）
//   ・每染一個部位消耗一支，四個部位＝四支
// 沒有這張表，「省事 80 分只要 116 金幣」這種結論就是騙人的。
//
// 資料來源（唯一連外是 XIVAPI 的 Stain 表，會快取到 out_data/cache/）：
//   顏色／色群       ← XIVAPI v2 sheet Stain（Color 為 RGB int、Shade 為遊戲染色面板分頁）
//   英→台服名        ← out_data/en-items.msgpack 反轉 + data/items.json
//   取得方式與門檻    ← scripts/lib/game-sources.mjs（shops/obtainable-methods/npcs/maps）
//
// ⚠️ 台服未實裝的染劑（items.json 查無台服名）不收進 data，只記在信封的 unreleased。
// ⚠️ 國際服 7.5 已把單色染劑整併下架，Garland／XIVAPI／英文 wiki 查不到這些染劑的取得方式，
//    台服（7.15）仍在用舊系統，所以取得方式只採本站 7.2 離線資料。
//
// 執行：node scripts/build-dyes.mjs            （抓一次 XIVAPI Stain 並快取）
//       node scripts/build-dyes.mjs --offline  （只用快取）

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadIndexes, resolveSources, accessOf } from "./lib/game-sources.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE_DIR = join(ROOT, "out_data", "cache");
const STAIN_CACHE = join(CACHE_DIR, "stain-en.json");
const OUT = join(ROOT, "data", "dyes.json");
const offline = process.argv.includes("--offline");

/** 遊戲染色面板的分頁（Stain.Shade）。名稱依面板成員歸納，屬本站分類，非台服官方字串。 */
const SHADE_NAME = {
  2: "白灰黑", 4: "紅粉", 5: "橙棕", 6: "黃", 7: "綠", 8: "藍", 9: "紫",
  10: "特殊（金屬・柔彩・純色）",
};

async function loadStains() {
  if (offline) {
    if (!existsSync(STAIN_CACHE)) throw new Error(`--offline 但沒有快取：${STAIN_CACHE}`);
    return JSON.parse(readFileSync(STAIN_CACHE, "utf8")).rows;
  }
  const res = await fetch("https://v2.xivapi.com/api/sheet/Stain?limit=200&fields=Name,Color,Shade,SubOrder");
  if (!res.ok) throw new Error(`XIVAPI Stain HTTP ${res.status}`);
  const json = await res.json();
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(STAIN_CACHE, JSON.stringify(json), "utf8");
  return json.rows;
}

const ix = loadIndexes();
const stains = await loadStains();
const rows = [];
const unreleased = [];

for (const st of stains) {
  const nameEn = (st.fields?.Name || "").trim();
  if (!nameEn || nameEn === "No Color") continue;

  // 通用版優先：原版常是商城限定（台服名帶 EX 前綴），通用版才是遊戲內拿得到的同色
  const gp = ix.enToIds.get(`general-purpose ${nameEn} dye`.toLowerCase()) || [];
  const plain = ix.enToIds.get(`${nameEn} dye`.toLowerCase()) || [];
  const id = [...gp, ...plain].find((i) => ix.byId.get(i)?.name) ?? null;
  if (id == null) { unreleased.push(nameEn); continue; }

  const it = ix.byId.get(id);
  const c = st.fields.Color >>> 0;
  const hex = (n) => n.toString(16).padStart(2, "0");
  const sources = resolveSources(id, ix);
  const best = sources[0] ?? null;

  rows.push({
    id,
    name: it.name,
    short: it.name.replace(/染劑$/, ""),
    nameEn,
    generalPurpose: gp.includes(id),
    color: `#${hex((c >> 16) & 255)}${hex((c >> 8) & 255)}${hex(c & 255)}`,
    shade: st.fields.Shade,
    shadeName: SHADE_NAME[st.fields.Shade] ?? String(st.fields.Shade),
    subOrder: st.fields.SubOrder,
    icon: it.icon ?? null,
    patch: it.patch ?? null,
    marketable: !!it.marketable,
    access: accessOf(best),
    /** 買得到這支染劑的最低金幣價（無金幣管道＝null）。前端算染色成本用這欄。 */
    gil: sources.find((s) => s.type === "npc-gil" && !s.gate)?.price
      ?? sources.find((s) => s.type === "npc-gil")?.price ?? null,
    bestGate: best?.gate ?? null,
    allGates: [...new Set(sources.filter((s) => s.released !== false).map((s) => s.gate?.label).filter(Boolean))],
    best,
    sources,
  });
}

rows.sort((a, b) => a.shade - b.shade || a.subOrder - b.subOrder);

const stats = { open: 0, gated: 0, rng: 0, marketable: 0, npcGil: 0, npcTrade: 0, craft: 0, marketOnly: 0, none: 0 };
for (const r of rows) {
  stats[r.access] = (stats[r.access] ?? 0) + 1;
  if (r.marketable) stats.marketable++;
  const t = r.best?.type;
  if (t === "npc-gil") stats.npcGil++;
  else if (t === "npc-trade") stats.npcTrade++;
  else if (t === "craft") stats.craft++;
  else if (t === "market") stats.marketOnly++;
  else if (!t) stats.none++;
}

writeFileSync(OUT, JSON.stringify({
  schema: "dyes",
  patch: ix.items.patch,
  updated: new Date().toISOString().slice(0, 10),
  source: "XIVAPI Stain（顏色／色群）+ scripts/lib/game-sources.mjs（取得方式：shops / obtainable-methods / npcs / maps）",
  note:
    "shadeName 為本站依遊戲染色面板分頁歸納的分類名，非台服官方字串。" +
    "gate ＝金錢以外的門檻（部族聲望／製作職業／限時活動／隨機掉落）。" +
    "⚠️ 國際服 7.5 已將單色染劑整併下架，Garland／XIVAPI／英文 wiki 皆查不到其取得方式；" +
    "台服停在 7.15 仍用舊系統，故取得方式一律採本站 7.2 離線資料。",
  count: rows.length,
  unreleased,
  stats,
  data: rows,
}, null, 2) + "\n", "utf8");

console.log(
  `✅ data/dyes.json：${rows.length} 支（台服未實裝 ${unreleased.length} 支未收）\n` +
    `   最佳管道：NPC 金幣 ${stats.npcGil}／兌換 ${stats.npcTrade}／製作 ${stats.craft}／僅市場 ${stats.marketOnly}／無來源 ${stats.none}\n` +
    `   好拿程度：無門檻 ${stats.open}／有門檻 ${stats.gated}／看運氣 ${stats.rng ?? 0}・可上市場板 ${stats.marketable} 支`
);
