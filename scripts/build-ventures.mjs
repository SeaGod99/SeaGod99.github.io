// build-ventures.mjs — 產生 data/ventures.json（雇員探險收益排行的資料層）
//
// 回答的問題：「我的雇員現在能派哪些探險、帶得回幾個、哪一個最值錢、
// 識別力再加幾點會跳下一個數量檔」。站內原本沒有任何一頁回答得出來。
//
// 資料來源：
//   out_data/obtainable-methods.msgpack  type==='venture' 的方法（1,425 個物品）
//     每個 task 有：id、level、reqGathering、reqIlvl、exp、category、
//     quantities[]＝數量檔位（{quantity, stat:'perception'|'ilvl', value:門檻}）
//   out_data/tw-locales.msgpack          tw-ventures 台服探險名、tw-job-categories 台服分類名
//   data/items.json                      物品台服名（實測 977/977 全有）
//
// 收錄規則（實測 2026-09-23）：
//   1,030 個相異 task 裡，**977 個**「有分類且只產一件物品」＝可排行的目標型探險，
//   其餘 53 個是 `category: null` 的舊式探索委託（無等級／無數量檔，其中「自由尋寶委託」
//   一個 task 對到 415 種物品），**排不出每趟收益，不收**。
//
// 數量檔位怎麼讀：`quantities` 由少到多，第一筆沒有 `value`＝基礎量，
// 之後每筆的 `value` 是「該 stat 要達到多少才跳到這個數量」。
// stat 是 `perception`（採集職雇員的識別力）或 `ilvl`（戰鬥職雇員的裝等）。
//
// 執行（repo 根目錄）：
//   node scripts/build-ventures.mjs            # dry-run
//   node scripts/build-ventures.mjs --apply    # 寫入

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const apply = process.argv.includes("--apply");

async function main() {
  const om = decode(await readFile(join(ROOT, "out_data", "obtainable-methods.msgpack")));
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const tw = await loadTwLocales();
  const byId = new Map(items.map((i) => [i.id, i]));

  // task id → { task, items:Set }
  const tasks = new Map();
  for (const [itemId, methods] of Object.entries(om)) {
    for (const m of methods || []) {
      if (m.type !== "venture") continue;
      for (const t of m.tasks || []) {
        if (!tasks.has(t.id)) tasks.set(t.id, { t, items: new Set() });
        tasks.get(t.id).items.add(Number(itemId));
      }
    }
  }
  console.log(`obtainable-methods 的 venture：${tasks.size} 個相異 task`);

  const stats = { kept: 0, noCat: 0, multiItem: 0, noTwVenture: 0, noTwItem: 0, notListable: 0 };
  const out = [];
  for (const { t, items: set } of tasks.values()) {
    if (t.category == null) { stats.noCat++; continue; }          // 舊式探索委託，無數量檔
    if (set.size !== 1) { stats.multiItem++; continue; }           // 一趟帶回多種（自由尋寶），排不出收益
    const itemId = [...set][0];
    const it = byId.get(itemId);
    if (!it || !it.name || !isTw(it.name)) { stats.noTwItem++; continue; }

    const ventureName = twName(tw.ventures, t.id);
    if (!ventureName) { stats.noTwVenture++; continue; }           // 無台服探險名＝不顯示（鐵則）
    const catName = twName(tw.jobCategories, t.category);
    if (!catName) { console.log(`  ⚠ 分類 ${t.category} 無台服名`); continue; }

    // 數量檔位：第一筆無 value＝基礎量
    const tiers = (t.quantities || []).map((q) => ({
      qty: q.quantity,
      stat: q.stat,
      need: q.value ?? 0,
    })).sort((a, b) => a.need - b.need);

    out.push({
      taskId: t.id,
      name: ventureName,
      itemId,
      itemName: it.name,
      category: t.category,
      categoryName: catName,
      level: t.level ?? null,
      reqGathering: t.reqGathering || 0,
      reqIlvl: t.reqIlvl || 0,
      exp: t.exp || 0,
      tiers,
      patch: it.patch || null,
    });
    stats.kept++;
  }

  // 排序鍵固定：分類 → 等級 → taskId。**不可用市價排**（那是會變的值，§3.19）
  out.sort((a, b) => a.category - b.category || (a.level || 0) - (b.level || 0) || a.taskId - b.taskId);

  const byCat = new Map();
  for (const v of out) byCat.set(v.categoryName, (byCat.get(v.categoryName) || 0) + 1);
  console.log(`\n收錄 ${stats.kept} 個探險：`);
  for (const [k, n] of byCat) console.log(`  ${k.padEnd(12)} ${n}`);
  console.log(`\n未收錄：`);
  console.log(`  無分類（舊式探索委託，無等級與數量檔）  ${stats.noCat}`);
  console.log(`  一趟帶回多種物品（自由尋寶委託）        ${stats.multiItem}`);
  if (stats.noTwItem) console.log(`  物品無台服名                            ${stats.noTwItem}`);
  if (stats.noTwVenture) console.log(`  探險無台服名                            ${stats.noTwVenture}`);

  const maxTier = Math.max(...out.map((v) => v.tiers.length));
  console.log(`\n數量檔位最多 ${maxTier} 檔；等級範圍 ${Math.min(...out.map((v) => v.level || 99))}–${Math.max(...out.map((v) => v.level || 0))}`);
  console.log("樣本：", JSON.stringify(out[0]));

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  await writeFile(join(DATA, "ventures.json"), JSON.stringify({
    schema: "ventures",
    updated: new Date().toISOString().slice(0, 10),
    source: "out_data/obtainable-methods.msgpack(venture) + tw-locales(tw-ventures, tw-job-categories) + data/items.json",
    note: "只收「有分類且只產一件物品」的目標型探險；舊式探索委託與自由尋寶排不出每趟收益故不收",
    count: out.length,
    data: out,
  }));
  console.log(`\n✓ data/ventures.json（${out.length} 個探險）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
