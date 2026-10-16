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

/**
 * @param name  表名（不含 .csv）
 * @param opts.offline       只讀快取，快取沒有就拋錯（不偷偷連網）
 * @param opts.refresh       不管快取，重抓一次（升版時用：快取可能還是上一版客戶端）
 * @param opts.keepUnnamed   沒有欄名的欄也保留，鍵名 `_c<欄序>`（欄序＝CSV 第 1 列的 key 欄值）。
 *                           有些表的欄名會位移或留白，例如 `BeastTribe` 的友好度名在沒有欄名的第 20 欄、
 *                           `GcArmyExpeditionTrait` 的化學反應效果在第 11 欄——預設會被丟掉。
 * @param opts.sha           讀**指定版本**的客戶端（解包 repo 的 commit sha，見 scripts/lib/tw-releases.mjs）。
 *                           快取在 out_data/cache/tc-datamining/<sha 前 8 碼>/<表名>.csv（與 patch-tw-release.mjs
 *                           同一處）；固定 sha 的內容不會變，所以 refresh 對它無效。用途：判斷站上的名字是
 *                           「上一版的官方名、這一版改譯了」還是「本來就不是官方名」（2026-10-10）。
 * @param opts.require       必須存在的欄名陣列（2026-10-11，第三輪 §6 tc-loader-hardening）。上游換版時欄名可能位移或改名
 *                           （BeastTribe、WeeklyBingoOrderData 都發生過），缺欄的話 r[欄名] 一律是 undefined、**不報錯**，
 *                           下游就安靜地產出一份空名字的資料。列在這裡的欄不在，就直接中止。
 */
export async function loadTcSheet(name, { offline = false, refresh = false, keepUnnamed = false, sha = null, require: need = null } = {}) {
  const file = sha ? join(CACHE, sha.slice(0, 8), name + ".csv") : join(CACHE, name + ".csv");
  const url = (sha ? `https://raw.githubusercontent.com/${TC_REPO}/${sha}/` : RAW) + name + ".csv";
  let text;
  if (existsSync(file) && (!refresh || sha)) text = await readFile(file, "utf8");
  else {
    if (offline) throw new Error(`--offline 但找不到 ${file}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    text = await r.text();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const keys = rows[0];                            // 第 1 列是欄序（key,0,1,2…）
  const names = rows[1];                           // 第 2 列是欄名（第 1 欄是 "#"）
  if (need && need.length) {
    const miss = need.filter((n) => !names.includes(n));
    if (miss.length) throw new Error(`台服客戶端 ${name}.csv 缺欄 ${miss.join("、")}（欄名可能位移或改名了，先人工確認再跑）`);
  }
  const out = [];
  for (const r of rows.slice(3)) {
    if (!r.length || r[0] === "") continue;
    const o = { id: Number(r[0]) };
    names.forEach((n, i) => {
      if (i === 0) return;
      if (n) o[n] = r[i];
      else if (keepUnnamed) o[`_c${keys[i]}`] = r[i];
    });
    out.push(o);
  }
  return out;
}

/**
 * 解包 repo 最新一次 commit 的客戶端版本字串（commit 訊息即版本，如 "ver 2026.09.14.0000.0000"）。
 * 回傳 { version: "2026.09.14.0000.0000", date: "2026-09-29", sha }；查不到回 null（不中止建置）。
 */
export async function latestTcClientVersion() {
  try {
    const r = await fetch(`https://api.github.com/repos/${TC_REPO}/commits?per_page=1`, {
      headers: { "User-Agent": "seagod-toolbox-build" },
    });
    if (!r.ok) return null;
    const [c] = await r.json();
    const m = c?.commit?.message?.match(/ver\s+([\d.]+)/);
    return m ? { version: m[1], date: c.commit.author?.date?.slice(0, 10) ?? null, sha: c.sha } : null;
  } catch {
    return null;
  }
}
