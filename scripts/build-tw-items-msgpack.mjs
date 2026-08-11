// 重建 out_data/tw-items.msgpack（台服物品繁中名快照）
//
// 為什麼需要這支：`tw-items.msgpack` 原本是「使用者提供的一次性快照」，沒有腳本產它，
// 於是台服升版後整條繁中名權威鏈（items.json → items-lite／items-market／barding／
// emotes／equip／island／幻化配裝圖鑑）就全部卡在舊版本，新物品只能顯示英文或 #id。
//
// 來源：Teamcraft 的台服語系檔（由台服客戶端抽出，格式與本快照相同 {itemId:{tw}}）
//   https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-items.json
//
// 護欄：上游必須是既有快照的**超集**（id 一個都不能少），否則中止不寫入——
//   避免上游某次抽取不完整就把台服已開放的物品名洗掉。
//
// 執行：
//   node scripts/build-tw-items-msgpack.mjs            # dry-run，只報告
//   node scripts/build-tw-items-msgpack.mjs --apply    # 寫回 out_data/tw-items.msgpack
//
// 跑完必接：node scripts/build-items.mjs（讓 items.json 收下新物品），
//   再 node scripts/patch-backfill-all.mjs --apply（補新物品的 patch）。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode, encode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "out_data", "tw-items.msgpack");
const APPLY = process.argv.includes("--apply");

const URL_TW_ITEMS =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-items.json";

const hasCJK = (s) => /[一-鿿]/.test(s || "");

async function main() {
  let old = {};
  try {
    old = decode(await readFile(OUT));
  } catch {
    console.log("（沒有既有快照，將建立新檔）");
  }
  const oldKeys = Object.keys(old);
  console.log(`既有快照：${oldKeys.length} 筆`);

  console.log("抓 Teamcraft 台服物品名…");
  const res = await fetch(URL_TW_ITEMS);
  if (!res.ok) throw new Error(`tw-items.json HTTP ${res.status}`);
  const remote = await res.json();
  const remoteKeys = Object.keys(remote);
  console.log(`上游：${remoteKeys.length} 筆`);

  // 護欄 1：必須是超集
  const missing = oldKeys.filter((k) => remote[k]?.tw == null);
  if (missing.length) {
    throw new Error(
      `上游少了 ${missing.length} 筆既有物品（如 ${missing.slice(0, 5).join(", ")}），` +
        `疑似抽取不完整，中止不寫入`
    );
  }

  // 護欄 2：空名稱不收（寧可維持舊值）
  const blank = remoteKeys.filter((k) => !remote[k]?.tw);
  if (blank.length) console.log(`⚠ 上游有 ${blank.length} 筆空名稱，略過不收`);

  const next = {};
  const added = [];
  const renamed = [];
  const englishish = [];
  for (const k of remoteKeys.sort((a, b) => Number(a) - Number(b))) {
    const tw = remote[k]?.tw;
    if (!tw) continue;
    next[k] = { tw };
    const before = old[k]?.tw;
    if (before == null) {
      added.push(k);
      if (!hasCJK(tw)) englishish.push(`${k}=${tw}`);
    } else if (before !== tw) {
      renamed.push(`${k}: "${before}" → "${tw}"`);
    }
  }

  console.log(`\n新增 ${added.length} 筆、改名 ${renamed.length} 筆、總計 ${Object.keys(next).length} 筆`);
  if (renamed.length) console.log("改名（前 20）：\n  " + renamed.slice(0, 20).join("\n  "));
  if (englishish.length)
    console.log(`\n⚠ 新增中有 ${englishish.length} 筆不含中文字（可能為官方原文名）：` + englishish.slice(0, 10).join(", "));

  if (APPLY) {
    await writeFile(OUT, encode(next));
    console.log(`\n✅ 已寫入 ${OUT}`);
    console.log("接著跑：node scripts/build-items.mjs → node scripts/patch-backfill-all.mjs --apply");
  } else {
    console.log("\n（dry-run，未寫入；加 --apply 套用）");
  }
}

main().catch((e) => {
  console.error("錯誤：", e.message);
  process.exit(1);
});
