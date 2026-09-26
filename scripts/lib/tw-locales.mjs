// 台服語系檔讀取器（來源：scripts/fetch-tw-locales.mjs 產的 out_data/tw-locales.msgpack）
//
// 用法：
//   import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
//   const tw = await loadTwLocales();
//   twName(tw.achievements, 1)        // "勝利的榮光1"，查無回 null
//
// 鐵則：查無就是台服未開放，回 null 讓呼叫端整筆跳過或留白，
//      **不要退回英文／日文／簡中，也不要簡轉繁**（docs/專案慣例與記憶.md §4.1、§4.40）。

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { isTranslated } from "./tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "..", "out_data", "tw-locales.msgpack");

let _cache = null;

/** 載入全部台服語系表（重複呼叫走記憶體快取）。回傳物件另帶 `_fetched`／`_source`。 */
export async function loadTwLocales() {
  if (_cache) return _cache;
  if (!existsSync(FILE)) {
    throw new Error(`找不到 ${FILE}，先跑 node scripts/fetch-tw-locales.mjs --apply`);
  }
  const db = decode(await readFile(FILE));
  _cache = { ...db.data, _fetched: db.fetched, _source: db.source };
  return _cache;
}

/**
 * 取單筆台服名。Teamcraft 的語系檔有兩種形狀：
 *   扁平 `{ "1": { "tw": "名稱" } }`
 *   巢狀 `{ "120": { "name": { "tw": "名稱" }, ... } }`（如 fates）
 * 兩種都吃；查無、空字串一律回 null。
 */
export function twName(table, id) {
  const row = table?.[id];
  if (!row) return null;
  const v = typeof row.tw === "string" ? row.tw : row.name?.tw;
  if (!v || !v.trim()) return null;
  /* ⚠ **有值不等於有翻譯**。Teamcraft 的台服語系檔對未翻譯的條目會留日文原文，
     還有一批是遊戲內部的佔位列：`shops` 10 筆、`mobs` 89 筆、`statuses` 77 筆
     （`_rsv_4389_…`、「ラベル削除予定」、`（仮）空島中ボス1名稱`、`●未使用アクション`）。
     沒有這道守門的話，7 個日文店名會上 NPC 商店目錄的店名欄（知識庫 §4.72）。 */
  return isTranslated(v) ? v.trim() : null;
}
