// 隨從寵物（minions）名稱校正 — 來源：ffxiv-collection-tc（繁中）
//
// 原 minions.json 名稱來自 teamcraft（zh 為簡中）＋英文 fallback，問題：
//   英文未譯（tiny tortoise）、簡轉繁錯字（巨像乒→魔像丙）、甚至壞檔（id151 名稱
//   變成描述碎片）。TC 以 minion id 與我們對齊（517 全中），名稱為乾淨繁中。
//
// 本檔以 TC 名稱（data/minions-names-tc.json，依 id）覆寫；TC 沒有的（多為台服未開放）
//   保留原樣。sources 不動（既有 sources 已是繁中且分類更細）。
//
// 冪等。執行：node scripts/patch-minions-tc.mjs ／ 重建後需再跑。

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "minions.json");

const tc = JSON.parse(await readFile(join(DATA, "minions-names-tc.json"), "utf-8"));
const byId = new Map();
for (const t of tc) byId.set(t.id, t.name);

const json = JSON.parse(await readFile(OUT, "utf-8"));
let changed = 0, kept = 0;
for (const m of json.data) {
  const tcName = byId.get(m.id);
  if (tcName && m.name !== tcName) { m.name = tcName; changed++; }
  else if (!tcName) kept++;
}

const TMP = join(tmpdir(), "minions_tc.json");
await writeFile(TMP, JSON.stringify(json, null, 2) + "\n", "utf-8");
JSON.parse(await readFile(TMP, "utf-8"));
await copyFile(TMP, OUT);

console.log("名稱校正：" + changed + "｜TC 無此 id（保留）：" + kept);
