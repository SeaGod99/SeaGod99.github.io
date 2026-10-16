// build-facewear.mjs — 臉部配件（台服）收藏資料 → data/facewear.json
//
// 第三輪路線圖 §5 facewear-collection（2026-10-11）：臉部配件（眼鏡、墨鏡…）是 7.0 起的收藏系統，
// 遊戲內選單**不顯示取得方式**。站上沒有它；照路線圖建議**併入時尚配飾頁當一個類別**，不另開新頁。
//
// 各欄位的來源（都不憑印象）：
//   款式名 name        台服客戶端 GlassesStyle.Name（keyOf 用 GlassesStyle 的 row id）
//   色版名 aliases     GlassesStyle.Glasses[0..11] 指到的 Glasses.Name（12 個色版，**只當搜尋別名**，不做色版勾選——
//                      遊戲內解鎖的單位是「款式」，買一件解鎖整組 12 色）
//   解鎖道具 itemId    items.json 名稱「臉部配件：<款式名>」——路線圖實測 28/28 逐字對得上
//                      （ItemAction 37312 是同一批，但 action 的 Data 欄不直接指 GlassesStyle，用名稱對比較可靠）
//   版本 patch         解鎖道具的 patch（items.json）
//   圖示 icon          解鎖道具的圖示（items.json，前端走 xivapi 圖示 CDN，同時尚配飾）
//   取得方式 sources   兌換／購買：lib/client-shop-sources.mjs（NPC 台服名＋座標，收藏頁共用的 sourceWhere 會畫）；
//                      其他類型：取得管道分片層 data/item-sources/（已是客戶端名、經 normalizeEntries 統一出口）
// **台服客戶端沒有款式名、或找不到解鎖道具的款式不收**（台服未開放＝不顯示，鐵則）。
//
// 執行：node scripts/build-facewear.mjs [--apply] [--offline]
// 跑完：node scripts/sync-meta.mjs --apply → node scripts/build-site-index.mjs --apply → validate-tracker-pages

import { readFileSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { cleanName, usable } from "./lib/client-names.mjs";
import { createShopSources } from "./lib/client-shop-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "facewear.json");
const APPLY = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");
const PREFIX = "臉部配件：";

async function main() {
  const [styles, glasses] = await Promise.all([
    loadTcSheet("GlassesStyle", { offline, require: ["Name", "Glasses[0]", "Glasses[11]"] }), loadTcSheet("Glasses", { offline, require: ["Name"] }),
  ]);
  const gName = new Map(glasses.map((r) => [r.id, cleanName(r.Name)]));
  const items = JSON.parse(readFileSync(join(ROOT, "data", "items.json"), "utf8")).data;
  const unlockByStyle = new Map();
  for (const it of items) if (typeof it.name === "string" && it.name.startsWith(PREFIX)) unlockByStyle.set(it.name.slice(PREFIX.length), it);

  const shops = await createShopSources({ root: ROOT, offline: true });
  const shardCache = new Map();
  const shardOf = (id) => {
    const k = id >> 10;
    if (!shardCache.has(k)) {
      const f = join(ROOT, "data", "item-sources", `${k}.json`);
      shardCache.set(k, existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).data : {});
    }
    return shardCache.get(k)[id] || shardCache.get(k)[String(id)] || [];
  };

  /* newIn（「✨ 本次新增」用）：款式**第一次出現在站上**時記當時的 gamePatch；已存在的保留原值——
     不這樣的話每次升版重建，全部 28 款都會又變成「本次新增」。 */
  const gamePatch = JSON.parse(readFileSync(join(ROOT, "data", "_meta.json"), "utf8")).gamePatch;
  const prevNewIn = new Map(existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).data.map((d) => [d.id, d.newIn]) : []);
  const data = [], skipped = [];
  for (const s of styles) {
    const name = cleanName(s.Name);
    if (!usable(name)) continue;                                   // 空列／未翻譯
    const it = unlockByStyle.get(name);
    if (!it) { skipped.push(`${s.id} ${name}（找不到「${PREFIX}${name}」）`); continue; }
    const variants = [];
    for (let i = 0; i < 12; i++) {
      const v = gName.get(Number(s[`Glasses[${i}]`]));
      if (usable(v) && v !== name && !variants.includes(v)) variants.push(v);
    }
    // 取得方式：兌換／購買走結構化的商店來源；其餘類型照分片層
    const shopSrc = shops.sourcesFor(it.id, { type: "兌換" })
      .map((x) => (x.issuer && x.issuer.verb === "販售" ? { ...x, type: "NPC商店" } : x));   // 金幣直購＝NPC商店
    const other = shardOf(it.id)
      .filter((e) => !(shopSrc.length && (e.t === "兌換" || e.t === "NPC商店")))
      .map((e) => ({ type: e.t, detail: e.d, ...(e.w ? { where: e.w } : {}) }));
    data.push({
      id: s.id, kind: "facewear", name, itemId: it.id, icon: it.icon || null, patch: it.patch || null,
      newIn: prevNewIn.get(s.id) || gamePatch,
      ...(variants.length ? { aliases: variants } : {}),
      sources: [...shopSrc, ...other],
    });
  }
  data.sort((a, b) => a.id - b.id);
  const withSrc = data.filter((d) => d.sources.length).length;
  console.log(`臉部配件 ${data.length} 款（有取得方式 ${withSrc}；色版別名 ${data.reduce((n, d) => n + (d.aliases || []).length, 0)} 個）`);
  for (const d of data.slice(0, 6)) console.log(`  ${d.id} ${d.name}｜${d.patch}｜${d.sources.map((s) => `${s.type}：${s.detail}`).slice(0, 2).join("／") || "（無）"}`);
  if (skipped.length) console.log(`  略過 ${skipped.length}：${skipped.join("、")}`);
  if (!APPLY) { console.log("（dry-run，未寫入；加 --apply 寫 data/facewear.json）"); return; }
  const out = {
    schema: "facewear", updated: new Date().toISOString().slice(0, 10),
    source: "台服客戶端 GlassesStyle／Glasses ＋ items.json（解鎖道具「臉部配件：…」）＋ 取得管道分片層 ＋ lib/client-shop-sources",
    count: data.length, data,
  };
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log("✓ data/facewear.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
