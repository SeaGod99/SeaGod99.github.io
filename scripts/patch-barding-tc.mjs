// 鳥鞍裝甲（barding）名稱校正 — 來源：ffxiv-collection-tc（繁中）
//
// 原名稱來自 tw-items，但部分缺台服譯名而 fallback 英文（Lominsan Saddle、
// Paladin Barding…），也有「EX」前綴贅字（EX星芒裝甲）與用詞差異（尋蛋→獵蛋）。
// TC 以 barding id 與我們對齊（88 同名），名稱為乾淨繁中。
//
// 本檔以 TC 名稱（data/barding-names-tc.json，依 id）覆寫；TC 沒有的（6 個 7.x 新裝甲）
// 保留原樣。sources 不動。冪等。執行：node scripts/patch-barding-tc.mjs。

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "barding.json");

const tc = JSON.parse(await readFile(join(DATA, "barding-names-tc.json"), "utf-8"));
const byId = new Map();
for (const t of tc) byId.set(t.id, t.name);

const json = JSON.parse(await readFile(OUT, "utf-8"));
let changed = 0, kept = 0;
for (const b of json.data) {
  const tcName = byId.get(b.id);
  if (tcName && b.name !== tcName) { b.name = tcName; changed++; }
  else if (!tcName) kept++;
}

const TMP = join(tmpdir(), "barding_tc.json");
await writeFile(TMP, JSON.stringify(json, null, 2) + "\n", "utf-8");
JSON.parse(await readFile(TMP, "utf-8"));
await copyFile(TMP, OUT);

console.log("名稱校正：" + changed + "｜TC 無此 id（保留）：" + kept);
