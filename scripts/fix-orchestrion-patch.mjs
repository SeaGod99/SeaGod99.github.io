// 修正 orchestrion patch：原本是粗略「N.x」（如 "2.x"/"7.x"），無法數值化，
// 導致前端 patch-gate（patch > gamePatch 即隱藏）對樂譜形同無效——台服未開放的
// 樂譜不會被隱藏。改用 ffxivcollect orchestrions 的精確 patch（"7.51" 等）覆蓋。
//
// join：本檔 itemId ↔ ffxivcollect orchestrion.item_id（實測 ~99%）。
// ffxivcollect 對不到者，退回本站 data/items.json 的樂譜物品 patch（同一顆 itemId，
// 來源為 tw-items，精確到 x.y）——4 筆 4.x/5.x/6.x 舊資料即由此補完。
// 兩者都對不到才保留原值。
//
// 執行：node scripts/fix-orchestrion-patch.mjs [--apply]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "data", "orchestrion.json");
const APPLY = process.argv.includes("--apply");

const isCoarse = (p) => p != null && !/^\d+\.\d/.test(String(p)); // "7.x" 之類

const orc = (await (await fetch("https://ffxivcollect.com/api/orchestrions?limit=9999")).json()).results || [];
const byItem = new Map(orc.filter((o) => o.item_id).map((o) => [o.item_id, o.patch]));

// 後備來源：本站 items.json（tw-items）的樂譜物品 patch
const byItemLocal = new Map(
  JSON.parse(readFileSync(join(__dirname, "..", "data", "items.json"), "utf8"))
    .data.filter((i) => i.patch && !isCoarse(i.patch))
    .map((i) => [i.id, i.patch])
);

const raw = readFileSync(FILE, "utf8");
const minified = !raw.includes('\n  "');
const db = JSON.parse(raw);

let changed = 0, noMatch = 0, kept = 0, viaLocal = 0;
const samples = [];
for (const e of db.data) {
  let fc = e.itemId != null ? byItem.get(e.itemId) : null;
  // ffxivcollect 沒有 → 只在原值粗略時才用 items.json 補（不覆蓋已精確的值）
  if (!fc && isCoarse(e.patch) && e.itemId != null) {
    fc = byItemLocal.get(e.itemId);
    if (fc) viaLocal++;
  }
  if (!fc) { noMatch++; continue; }
  if (String(e.patch) === String(fc)) { kept++; continue; }
  if (samples.length < 8) samples.push(`  ${e.name}: ${e.patch} → ${fc}`);
  changed++;
  if (APPLY) e.patch = fc;
}
console.log(`改 ${changed}（其中 ${viaLocal} 筆走 items.json 後備）、同 ${kept}、無對應 ${noMatch}`);
console.log(samples.join("\n"));
const stillCoarse = db.data.filter(
  (e) => isCoarse(byItem.get(e.itemId) ?? byItemLocal.get(e.itemId) ?? e.patch)
).length;
console.log(`套用後仍為粗略 N.x（兩來源皆無、保留）：${stillCoarse}`);

if (APPLY) {
  db.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FILE, minified ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n");
  console.log("✅ 已寫入");
} else {
  console.log("（dry-run，加 --apply 套用）");
}
