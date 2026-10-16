// patch-expansion-names.mjs — 資料裡的資料片名換成台服官方（新生艾奧傑亞…黃金遺產）
//
// 站主 2026-10-10 拍板：資料片名一律台服官方（客戶端 ExVersion），舊寫法（原初之地、蒼天之禁地、紅蓮之狂潮、
// 暗影之逆焰、金曦之遺輝——社群／陸服沿用的名字）只留作別名（搜尋、舊分享連結）。對照表的單一來源是
// data/official-terms.json（scripts/build-official-terms.mjs 產生）的 expansions[].alias。
//
// 範圍：下列資料檔裡**所有字串值**中出現的舊名都換掉（整串是舊名的欄位如 category／expansion，
// 以及句子裡的舊名如「完成紅蓮之狂潮主線」「原初之地全區域」）。舊名都夠長、夠特別，不會誤傷別的字。
// 會寫舊名的建置腳本（build-treasure-maps／patch-dungeon-add-missing／patch-dungeon-expansion／
// patch-orchestrion-add-missing）已改成讀 official-terms.json，這支是給既有資料用的，冪等。
//
// 執行：node scripts/patch-expansion-names.mjs [--apply]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const APPLY = process.argv.includes("--apply");
const FILES = ["orchestrion.json", "dungeons.json", "treasure-maps.json", "mounts.json", "aether-currents.json"];

const terms = JSON.parse(readFileSync(join(DATA, "official-terms.json"), "utf8"));
const pairs = [];
for (const e of terms.expansions) for (const a of e.alias || []) if (a !== e.name) pairs.push([a, e.name]);
if (pairs.length < 5) throw new Error(`official-terms.json 的資料片別名只有 ${pairs.length} 個，預期 5 個——先跑 build-official-terms.mjs`);

let touched = 0;
for (const f of FILES) {
  const raw = readFileSync(join(DATA, f), "utf8");
  const db = JSON.parse(raw);
  const hits = new Map();
  const fix = (s) => {
    let t = s;
    for (const [a, n] of pairs) if (t.includes(a)) { t = t.split(a).join(n); hits.set(`${a}→${n}`, (hits.get(`${a}→${n}`) || 0) + 1); }
    return t;
  };
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach((v, i) => { if (typeof v === "string") node[i] = fix(v); else walk(v); }); return; }
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string") node[k] = fix(v);
      else walk(v);
    }
  };
  walk(db.data ?? db);
  const n = [...hits.values()].reduce((s, x) => s + x, 0);
  console.log(`${f.padEnd(20)} ${n} 處${n ? "　" + [...hits].map(([k, c]) => `${k}×${c}`).join("、") : ""}`);
  if (APPLY && n) {
    await writeFile(join(DATA, f), raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
    touched++;
  }
}
console.log(APPLY ? `\n✓ 已寫入 ${touched} 個檔` : "\n（dry-run，未寫入；加 --apply 套用）");
