// 修正 orchestrion patch：原本是粗略「N.x」（如 "2.x"/"7.x"），無法數值化，
// 導致前端 patch-gate（patch > gamePatch 即隱藏）對樂譜形同無效——台服未開放的
// 樂譜不會被隱藏。改用 ffxivcollect orchestrions 的精確 patch（"7.51" 等）覆蓋。
//
// join：本檔 itemId ↔ ffxivcollect orchestrion.item_id（實測 ~99%）。
// 對不到者保留原值。
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

const raw = readFileSync(FILE, "utf8");
const minified = !raw.includes('\n  "');
const db = JSON.parse(raw);

let changed = 0, noMatch = 0, kept = 0;
const samples = [];
for (const e of db.data) {
  const fc = e.itemId != null ? byItem.get(e.itemId) : null;
  if (!fc) { noMatch++; continue; }
  if (String(e.patch) === String(fc)) { kept++; continue; }
  if (samples.length < 8) samples.push(`  ${e.name}: ${e.patch} → ${fc}`);
  changed++;
  if (APPLY) e.patch = fc;
}
console.log(`改 ${changed}（多為 N.x→精確）、同 ${kept}、無對應 ${noMatch}`);
console.log(samples.join("\n"));
const stillCoarse = db.data.filter((e) => isCoarse(APPLY ? e.patch : (byItem.get(e.itemId) ?? e.patch))).length;
console.log(`套用後仍為粗略 N.x（無對應、保留）：約 ${db.data.filter((e) => !byItem.get(e.itemId) && isCoarse(e.patch)).length}`);

if (APPLY) {
  db.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FILE, minified ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n");
  console.log("✅ 已寫入");
} else {
  console.log("（dry-run，加 --apply 套用）");
}
