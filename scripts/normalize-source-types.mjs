// 正規化 sources[].type 的明確同義詞，統一各收藏檔的取得方式分類
// （減少前端篩選出現重複 chip；SCHEMA 1.5 字典碎片化的部分收斂）。
//
// 只合併語意明確相同者；副本 vs 副本掉落 不合併（blue-magic 的「副本」指副本內習得，
// 非掉落，語意有別），保留並於 SCHEMA 註記。
//
// 執行：node scripts/normalize-source-types.mjs [--apply]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const APPLY = process.argv.includes("--apply");

const MERGE = { 任務獎勵: "任務", 成就獎勵: "成就", NPC商店: "商店", 商城購買: "商城" };
const FILES = ["mounts", "minions", "orchestrion", "barding", "triple-triad"];

let total = 0;
for (const f of FILES) {
  const path = join(DATA, f + ".json");
  const raw = readFileSync(path, "utf8");
  const minified = !raw.includes('\n  "');
  const db = JSON.parse(raw);
  let n = 0;
  for (const e of db.data) for (const s of e.sources || []) {
    if (MERGE[s.type]) { if (APPLY) s.type = MERGE[s.type]; n++; }
  }
  if (n) { total += n; console.log(`${f}: 正規化 ${n} 筆`); }
  if (APPLY && n) { db.updated = new Date().toISOString().slice(0, 10); await writeFile(path, minified ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n"); }
}
console.log(`\n合併規則：${Object.entries(MERGE).map(([a, b]) => a + "→" + b).join("、")}`);
console.log(`共 ${total} 筆` + (APPLY ? "（已寫入）" : "（dry-run，加 --apply）"));
