// tc-datamining.mjs — 台服客戶端解包資料（thewakingsands/ffxiv-datamining-tc）的讀取
//
// 2026-10-04 找到的台服官方字串來源：xivapi 自己的 ffxiv-datamining 把 `csv/tc` 指向這個 repo，
// 內容是台服客戶端（SaintCoinach 匯出）的 CSV。Teamcraft 的 tw/ 語系檔沒收的表（成就分類、稱號…）
// 這裡有。**用之前先驗**：拿它的 Achievement 名稱與說明對 Teamcraft tw-locales，一致才算同一份台服資料
// （validate-achievements.mjs 會跑這個比對）。
//
// 用法：
//   import { loadTcSheet } from "./lib/tc-datamining.mjs";
//   const rows = await loadTcSheet("AchievementCategory", { offline });   // → [{ id, Name, ... }]
//
// 快取在 out_data/cache/tc-datamining/<表名>.csv；`offline` 時檔案不在就拋錯，不偷偷連網。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(ROOT, "out_data", "cache", "tc-datamining");
export const TC_REPO = "thewakingsands/ffxiv-datamining-tc";
const RAW = `https://raw.githubusercontent.com/${TC_REPO}/main/`;

/** SaintCoinach 的 CSV：第 1 列是欄位序號、第 2 列欄名、第 3 列型別，之後是資料。欄位可能有引號、逗號、換行。 */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export async function loadTcSheet(name, { offline = false } = {}) {
  const file = join(CACHE, name + ".csv");
  let text;
  if (existsSync(file)) text = await readFile(file, "utf8");
  else {
    if (offline) throw new Error(`--offline 但找不到 ${file}`);
    const r = await fetch(RAW + name + ".csv");
    if (!r.ok) throw new Error(`${RAW}${name}.csv HTTP ${r.status}`);
    text = await r.text();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const names = rows[1];                           // 第 2 列是欄名（第 1 欄是 "#"）
  const out = [];
  for (const r of rows.slice(3)) {
    if (!r.length || r[0] === "") continue;
    const o = { id: Number(r[0]) };
    names.forEach((n, i) => { if (i > 0 && n) o[n] = r[i]; });
    out.push(o);
  }
  return out;
}
