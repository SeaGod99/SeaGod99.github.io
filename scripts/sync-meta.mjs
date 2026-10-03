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

/* 刻意不登記的檔與目錄（2026-10-03，第二輪路線圖 meta-registry-rule）。
   **登記的意思是「前端會讀、要追蹤它的新鮮度」。** 下面這些前端不讀（建置快照、中繼檔、報告），
   每一條都要講得出理由；沒登記、也不在這裡的，才會被當成「忘了登記」報出來。
   另外，一筆登記可以用 `family`（檔名前綴）代表一整組檔，例如 island-*.json。 */
const NOT_REGISTERED = {
  "barding-names-tc.json": "建置快照（patch-barding-tc.mjs 讀），前端不載",
  "bluemage-sources-tc.json": "建置快照（build-blue-magic／patch-blue-magic-sources 讀），前端不載",
  "emotes-sources-fxc.json": "建置快照（patch-emotes-sources.mjs 讀），前端不載",
  "emotes-sources-tc.json": "建置快照（patch-emotes-sources.mjs 讀），前端不載",
  "minions-names-tc.json": "建置快照（patch-minions-tc.mjs 讀），前端不載",
  "mounts-sources-tc.json": "建置快照（build-mounts／patch-mounts-tc 讀），前端不載",
  "orchestrion-sources-fxc.json": "建置快照（patch-orchestrion-sources.mjs 讀），前端不載",
  "orchestrion-sources-tc.json": "建置快照（patch-orchestrion-sources／patch-sources-from-om 讀），前端不載",
  "fashion-fillers.json": "時尚品鑑週更的建置輸入（build-fashion-report.mjs 讀），前端不載",
  "scripts/": "舊的一次性腳本與 build-emotes.mjs 的未對上報告，不是資料",
};

// 沒登記進 databases[] 的資料檔與子目錄（新增資料庫時很容易忘記登記）
const registered = new Set(dbs.map((d) => d.file));
const families = dbs.map((d) => d.family).filter(Boolean);
const entries = readdirSync(DATA, { withFileTypes: true });
const onDisk = entries.filter((e) => e.isFile() && e.name.endsWith(".json") && e.name !== "_meta.json").map((e) => e.name);
const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name + "/");
const covered = (f) => registered.has(f) || families.some((p) => f.startsWith(p)) || f in NOT_REGISTERED;
const unregistered = onDisk.filter((f) => !covered(f))
  .concat(dirs.filter((d) => !(d in NOT_REGISTERED) && ![...registered].some((f) => f.startsWith(d))));
const stale = Object.keys(NOT_REGISTERED).filter((f) => !onDisk.includes(f) && !dirs.includes(f));

console.log(`_meta.json：${dbs.length} 個資料庫登記`);
if (rows.length) {
  console.log(`\n要同步的 ${rows.length} 筆（檔名｜原本 updated/count → 實際）：`);
  rows.forEach(([f, kind, b, a]) => console.log(`  ${f.padEnd(26)} ${kind}  ${b}  →  ${a}`));
} else {
  console.log("  ✓ 全部已同步");
}
if (unregistered.length) {
  console.log(`\n⚠ 有 ${unregistered.length} 個資料檔／目錄沒登記進 databases[]（前端會讀就登記；建置用的寫進本檔的 NOT_REGISTERED 並寫理由）：`);
  unregistered.forEach((f) => console.log(`    ${f}`));
} else {
  console.log(`  ✓ 沒有漏登記的檔（刻意不登記 ${Object.keys(NOT_REGISTERED).length} 項，理由見 NOT_REGISTERED）`);
}
if (stale.length) console.log(`\n⚠ NOT_REGISTERED 裡有已經不存在的項目（請刪掉）：${stale.join("、")}`);

if (!APPLY) { console.log("\n（dry-run，未寫入。加 --apply 才會寫進 data/_meta.json）"); process.exit(0); }
if (!changed) { console.log("\n沒有要改的。"); process.exit(0); }

// 頂層 updated 取「所有資料庫裡最新的那個日期」，不用今天——這樣它代表的是
// 「資料的新鮮度」而不是「這支腳本跑過的時間」。
const newest = dbs.map((d) => d.updated).filter(Boolean).sort().pop();
if (newest) meta.updated = newest;
writeFileSync(META, JSON.stringify(meta, null, 2) + "\n", "utf8");
console.log(`\n✓ 已寫入 data/_meta.json（同步 ${changed} 筆，頂層 updated → ${meta.updated}）`);
