// 產生 data/fashion-themes.json — 時尚品鑑「每週主題名」的預查表（含未來數十週）。
//
// 為什麼要這支：時尚品鑑一週有三段資料，釋出時間不同——
//   ① 主題名：**寫死在遊戲資料表裡**，可以離線預查到一年後
//   ② 四個部位提示：伺服器每週二 16:00 才指派
//   ③ 接受裝備清單：純伺服器端，要社群實測
// 過去頁面在「本週提示還沒收錄」的空窗期只能顯示上一週存檔，看起來像壞掉。
// 有了這張表，空窗期至少能誠實地說「第 N 週主題是『風信子冒險者』，提示尚未收錄」，
// 不必假裝沒資料，也不必把上週答案擺在最上面誤導人。
//
// 位移規則（已由 week 440–443 四週實測校準）：
//   FashionCheckWeeklyTheme 的 row ＝ 社群週次 + 9
//   （驗證：row 449 = Western Rider = week 440；row 452 = 真麻正式装 = week 443）
//
// ⚠️ 名稱來源限制：這張表**沒有台服官方譯名**。FashionCheckWeeklyTheme 不是物品／地名／
// 副本名，tw-items 那條權威鏈涵蓋不到它，台服也沒有公開的時尚品鑑主題譯名表。
// 因此本表走陸服 datamining 簡中原文 + OpenCC(cn→twp) 轉繁，並在每筆帶 nameCn 原文、
// 信封標 nameSource: "cn-hant"。前端顯示時**必須標註「非台服官方譯名」**
// （比照 §4.3d：非物品的敘述字串可簡轉繁，但要標記）。
//
// 執行：node scripts/build-fashion-themes.mjs
//       node scripts/build-fashion-themes.mjs --offline   （用既有快取，不連網）

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as OpenCC from "opencc-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "data", "fashion-themes.json");
const CACHE_DIR = join(ROOT, "out_data", "cache");
const CACHE = join(CACHE_DIR, "FashionCheckWeeklyTheme.csv");

const CSV_URL =
  "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/FashionCheckWeeklyTheme.csv";

/** 社群週次 → CSV row 的位移。改這個數字前先用已知週次回歸驗證。 */
const ROW_OFFSET = 9;
/** 起始週次：week 440 是本站開站第一次收錄的週次，之前的沒有意義。 */
const FIRST_WEEK = 440;
/** 回歸驗證用的已知答案（簡中原文，抓下來的 CSV 必須對得上，對不上就是位移跑掉了）。 */
const CHECKPOINTS = {
  440: "新大陆骑手",
  441: "知性蛮族工匠",
  442: "亚拉戈高位装扮",
  443: "真麻正式装",
};

const offline = process.argv.includes("--offline");

async function loadCsv() {
  if (offline || !CSV_URL) {
    if (!existsSync(CACHE)) throw new Error(`--offline 但沒有快取檔：${CACHE}`);
    return readFileSync(CACHE, "utf8");
  }
  const res = await fetch(CSV_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`下載失敗 HTTP ${res.status}`);
  const text = await res.text();
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE, text, "utf8");
  return text;
}

/** 極簡 CSV 解析：本表只有 key,Name 兩欄且 Name 不含逗號／引號，不需要完整 RFC4180。 */
function parseCsv(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(",");
    if (i < 0) continue;
    const key = line.slice(0, i).replace(/^﻿/, "").trim();
    if (!/^\d+$/.test(key)) continue; // 前三行是 key/#/int32 標頭
    rows.set(Number(key), line.slice(i + 1).trim().replace(/^"|"$/g, ""));
  }
  return rows;
}

const csv = parseCsv(await loadCsv());
const toTw = OpenCC.Converter({ from: "cn", to: "twp" });

// 回歸驗證：位移錯了就整張表都是錯的，寧可不出檔
for (const [week, expect] of Object.entries(CHECKPOINTS)) {
  const got = csv.get(Number(week) + ROW_OFFSET);
  if (got !== expect) {
    throw new Error(
      `位移驗證失敗：week ${week} 應為「${expect}」，row ${Number(week) + ROW_OFFSET} 實得「${got ?? "(空)"}」。` +
        `CSV 結構或 ROW_OFFSET 可能已變，請人工確認後再跑。`
    );
  }
}

const maxRow = Math.max(...csv.keys());
const lastWeek = maxRow - ROW_OFFSET;
const data = {};
let empty = 0;
for (let w = FIRST_WEEK; w <= lastWeek; w++) {
  const cn = csv.get(w + ROW_OFFSET);
  if (!cn) { empty++; continue; } // 表尾可能有空列
  data[w] = { name: toTw(cn), nameCn: cn };
}

const out = {
  schema: "fashion-themes",
  updated: new Date().toISOString().slice(0, 10),
  source: "thewakingsands/ffxiv-datamining-cn FashionCheckWeeklyTheme.csv",
  nameSource: "cn-hant", // 簡轉繁，非台服官方譯名 —— 前端必須標註
  rowOffset: ROW_OFFSET,
  firstWeek: FIRST_WEEK,
  lastWeek,
  count: Object.keys(data).length,
  data,
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(
  `✅ data/fashion-themes.json：week ${FIRST_WEEK}–${lastWeek} 共 ${out.count} 筆` +
    (empty ? `（跳過 ${empty} 筆空列）` : "") +
    `\n   回歸驗證 ${Object.keys(CHECKPOINTS).length}/${Object.keys(CHECKPOINTS).length} 通過`
);
