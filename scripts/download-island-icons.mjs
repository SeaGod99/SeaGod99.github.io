// 下載無人島頁要用的圖示到 assets/island/，讓頁面不必在執行期依賴 XIVAPI。
//
// 兩種來源：
//  · 動物：MJIAnimals.Icon（70121–70163）——這是遊戲內的動物圖示，只有 icon id，沒有 itemId。
//  · 物品（工坊生產品／素材／建築素材／採集工具）：items.json 的 icon 欄已是
//    "/i/025000/025026.png" 形式，轉成 ui/icon/025000/025026_hr1.tex 去抓。
//
// 為什麼存本機而不是直接連 XIVAPI：本站有 service worker 且要能離線看；
// 收藏頁的圖示一向也是快取在 assets/ 下（見 assets/mounts、assets/barding…）。
// hr1 原圖是 80×80，這裡統一縮成 48×48 png——頁面最大只顯示到 40px，
// 48px 在 2x 螢幕已足夠，整包才幾百 KB，對 GitHub Pages 1GB 上限無壓力。
//
// 執行：
//   node scripts/download-island-icons.mjs           只補缺的
//   node scripts/download-island-icons.mjs --force   全部重抓

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "assets", "island", "icons");
const FORCE = process.argv.includes("--force");
const SIZE = 48;

const assetUrl = (path) =>
  `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(path)}&format=png`;
const iconPath = (id) => {
  const s = String(id).padStart(6, "0");
  return `ui/icon/${s.slice(0, 3)}000/${s}_hr1.tex`;
};

/* ── 收集需要的 icon id ── */
const want = new Map();                       // iconId -> 用途（只為報告好讀）
const add = (id, why) => { if (id && !want.has(id)) want.set(id, why); };

const J = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
const itemIcon = new Map();                   // itemId -> iconId
for (const i of J("items.json").data) {
  const m = /(\d{6})\.png$/.exec(i.icon || "");
  if (m) itemIcon.set(i.id, Number(m[1]));
}

for (const a of J("island-animals.json").data) {
  add(a.icon, "動物");
  if (a.capture) add(itemIcon.get(a.capture.itemId), "捕捉道具");   // 捕獸網／繩／睡眠球
}
for (const m of J("island-materials.json").data) {
  add(itemIcon.get(m.itemId), "素材");
  if (m.gathering && m.gathering.tool) add(itemIcon.get(m.gathering.tool.itemId), "採集工具");
}
for (const c of J("island-craftworks.json").data) add(itemIcon.get(c.itemId), "工坊生產品");
for (const r of J("island-recipes.json").data) add(itemIcon.get(r.itemId), "人工製作");
for (const b of J("island-buildings.json").data) {
  add(b.icon, "建築");                        // MJIBuilding.Icon，不是物品圖示
  for (const g of b.materials) add(itemIcon.get(g.itemId), "建築素材");
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

/* ── 下載 ── */
let got = 0, skip = 0, fail = 0;
const failed = [];
const ids = [...want.keys()].sort((a, b) => a - b);
console.log(`需要 ${ids.length} 個圖示 → ${OUT}`);

for (const id of ids) {
  const dest = join(OUT, `${id}.png`);
  if (!FORCE && existsSync(dest)) { skip++; continue; }
  try {
    const res = await fetch(assetUrl(iconPath(id)));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).resize(SIZE, SIZE, { fit: "inside" }).png({ compressionLevel: 9 }).toFile(dest);
    got++;
    if (got % 25 === 0) console.log(`  …已下載 ${got}`);
  } catch (e) {
    fail++; failed.push(`${id}(${want.get(id)}): ${e.message}`);
  }
}

console.log(`\n新增 ${got}／已存在 ${skip}／失敗 ${fail}`);
if (failed.length) {
  console.log("失敗清單：");
  failed.forEach((f) => console.log("  ·", f));
}
