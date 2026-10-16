// patch-job-names.mjs — 資料裡的製作採集職名換成台服官方（木工師…漁師）
//
// 站主 2026-10-10 拍板：職業名一律台服官方（客戶端 ClassJob.Name，data/official-terms.json），
// 舊寫法（刻木匠、鍛鐵匠、鑄甲匠、雕金匠、製革匠、裁衣匠、煉金術士、採礦工、園藝工、捕魚人——陸服名轉繁）
// 只留作別名。建置腳本已改成讀 official-terms（scripts/lib/official-terms.mjs），這支處理既有資料，冪等。
//
// 範圍：data/ 底下所有 .json（含分片目錄）的**所有字串值**。2026-10-11 逐欄位掃過，出現的欄位全是職業名
// 或由職業名組出的字（job／jobs／j／name／label／how／gate／buy／text／allGates，以及取得管道的
// 「鍛鐵匠 製作」「採礦工 Lv.5（礦脈）」），所以整串替換是安全的。兩個例外：
//   · 「園藝工具」是官方物品分類名（園藝工具（主工具）…），**不是**職業名——「園藝工」「採礦工」後面接「具」的不換。
//   · data/npcs.json 的 NPC 名（「園藝工行會的工作人員」）是人名，不能照職業名換——NPC 名走台服客戶端
//     ENpcResident（patch-npc-names-client.mjs），這支不碰 npcs.json。
// 另外 official-terms.json 的 alias 本來就是舊名，不碰。
// 基礎職的舊寫法（斧術師、弓箭手…）**不在範圍**：「弓箭手」之類在官方文字裡是普通名詞，不能整串換；
// 而且掃過 data/，沒有任何一處用到。
//
// 執行：node scripts/patch-job-names.mjs [--apply]

import { readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const APPLY = process.argv.includes("--apply");
const SKIP = new Set(["npcs.json", "official-terms.json"]);
const CRAFT_GATHER = ["CRP", "BSM", "ARM", "GSM", "LTW", "WVR", "ALC", "CUL", "MIN", "BTN", "FSH"];

const terms = JSON.parse(readFileSync(join(DATA, "official-terms.json"), "utf8"));
const pairs = [];
for (const a of CRAFT_GATHER) for (const old of terms.jobs[a]?.alias || []) pairs.push([old, terms.jobs[a].name]);
if (pairs.length < 10) throw new Error(`official-terms.json 的製作採集職別名只有 ${pairs.length} 個，預期 10 個——先跑 build-official-terms.mjs`);

/** 一個字串裡的舊職業名全換掉；「採礦工具／園藝工具」不換。回傳 [新字串, 換了幾處] */
function fix(s) {
  let n = 0, out = s;
  for (const [old, neu] of pairs) {
    if (!out.includes(old)) continue;
    const parts = out.split(old);
    let acc = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const keep = parts[i].startsWith("具");          // 園藝工具、採礦工具＝物品分類，不是職業
      acc += (keep ? old : (n++, neu)) + parts[i];
    }
    out = acc;
  }
  return [out, n];
}

function files(dir) {
  const out = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) out.push(...files(p));
    else if (f.name.endsWith(".json") && !SKIP.has(f.name)) out.push(p);
  }
  return out;
}

let touched = 0, total = 0;
const byFile = [];
for (const f of files(DATA)) {
  const raw = readFileSync(f, "utf8");
  if (!pairs.some(([old]) => raw.includes(old))) continue;
  const db = JSON.parse(raw);
  let n = 0;
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach((v, i) => { if (typeof v === "string") { const [t, k] = fix(v); if (k) { node[i] = t; n += k; } } else walk(v); }); return; }
    if (!node || typeof node !== "object") return;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") { const [t, c] = fix(v); if (c) { node[k] = t; n += c; } }
      else walk(v);
    }
  };
  walk(db);
  if (!n) continue;
  total += n;
  byFile.push([relative(ROOT, f).split(sep).join("/"), n]);
  if (APPLY) {
    await writeFile(f, raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : raw.includes('\n "') ? JSON.stringify(db, null, 1) + "\n" : JSON.stringify(db) + (raw.endsWith("\n") ? "\n" : ""));
    touched++;
  }
}
// 分片目錄合併成一行顯示
const agg = new Map();
for (const [f, n] of byFile) {
  const k = /^data\/[^/]+\/[^/]+\.json$/.test(f) ? f.replace(/\/[^/]+\.json$/, "/*") : f;
  agg.set(k, (agg.get(k) || 0) + n);
}
for (const [k, n] of [...agg].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log(`共 ${total} 處、${byFile.length} 個檔（${pairs.map(([o, n]) => `${o}→${n}`).join("、")}）`);
console.log(APPLY ? `✓ 已寫入 ${touched} 個檔` : "（dry-run，未寫入；加 --apply 套用）");
