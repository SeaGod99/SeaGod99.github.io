// 把 data/_meta.json 的 databases[] 與各資料檔的實況同步（updated／count），
// 並把沒登記的資料檔列出來。
//
// 為什麼要這支：`_meta.json` 的 status／updated 一直是手動維護的，結果從
// 2026-06-23 之後就沒人更新過——23 個庫裡有 14 個的 updated 停在 6 月，
// 但資料檔本身早就換過好幾輪。PROGRESS 從 6 月就掛著這條待辦。
//
// 根治的關鍵不是「記得跑這支」，而是 **validate-data.mjs 會自動報不同步**
// （它是「改完資料必跑」的那支）。所以流程變成：改資料 → validate 報 drift →
// 跑這支 → 再 validate。忘不掉。
//
// 資料來源＝各資料檔自己的信封欄位（`updated`／`count`），那些是 build/patch
// 腳本寫的，本來就是最新的；這支只是把它們抄進 _meta.json，不自己算日期。
//
// 執行：
//   node scripts/sync-meta.mjs           # dry-run
//   node scripts/sync-meta.mjs --apply

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const META = join(DATA, "_meta.json");
const APPLY = process.argv.includes("--apply");

const meta = JSON.parse(readFileSync(META, "utf8"));
const dbs = meta.databases || [];

let changed = 0;
const rows = [];
for (const d of dbs) {
  if (!d.file) continue;
  const p = join(DATA, d.file);
  if (!existsSync(p)) { rows.push([d.file, "檔案不存在", "", ""]); continue; }
  let j;
  try { j = JSON.parse(readFileSync(p, "utf8")); } catch (e) { rows.push([d.file, "無法解析", "", ""]); continue; }

  // count：信封的 count 優先，否則數 data/zones
  const arr = Array.isArray(j.data) ? j.data : (Array.isArray(j.zones) ? j.zones : null);
  const count = j.count ?? (arr ? arr.length : null);
  const updated = j.updated ?? null;

  const before = `${d.updated ?? "—"} / ${d.count ?? "—"}`;
  const after = `${updated ?? "—"} / ${count ?? "—"}`;
  if ((updated && d.updated !== updated) || (count != null && d.count !== count)) {
    changed++;
    rows.push([d.file, "更新", before, after]);
    if (APPLY) {
      if (updated) d.updated = updated;
      if (count != null) d.count = count;
    }
  }
}

// 沒登記進 databases[] 的資料檔（新增資料庫時很容易忘記登記）
const registered = new Set(dbs.map((d) => d.file));
const onDisk = readdirSync(DATA).filter((f) => f.endsWith(".json") && f !== "_meta.json");
const unregistered = onDisk.filter((f) => !registered.has(f));

console.log(`_meta.json：${dbs.length} 個資料庫登記`);
if (rows.length) {
  console.log(`\n要同步的 ${rows.length} 筆（檔名｜原本 updated/count → 實際）：`);
  rows.forEach(([f, kind, b, a]) => console.log(`  ${f.padEnd(26)} ${kind}  ${b}  →  ${a}`));
} else {
  console.log("  ✓ 全部已同步");
}
if (unregistered.length) {
  console.log(`\n⚠ 有 ${unregistered.length} 個資料檔沒登記進 databases[]（新庫記得補）：`);
  unregistered.forEach((f) => console.log(`    ${f}`));
}

if (!APPLY) { console.log("\n（dry-run，未寫入。加 --apply 才會寫進 data/_meta.json）"); process.exit(0); }
if (!changed) { console.log("\n沒有要改的。"); process.exit(0); }

// 頂層 updated 取「所有資料庫裡最新的那個日期」，不用今天——這樣它代表的是
// 「資料的新鮮度」而不是「這支腳本跑過的時間」。
const newest = dbs.map((d) => d.updated).filter(Boolean).sort().pop();
if (newest) meta.updated = newest;
writeFileSync(META, JSON.stringify(meta, null, 2) + "\n", "utf8");
console.log(`\n✓ 已寫入 data/_meta.json（同步 ${changed} 筆，頂層 updated → ${meta.updated}）`);
