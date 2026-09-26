// build-msq.mjs — 產生 data/msq.json（主線任務進度）
//
// ── 「哪些是主線」有依據，不是用眼睛挑的 ────────────────────────────
// `Quest` → `JournalGenre` → `JournalCategory` → `JournalSection`，
// **區段名以 `Main Scenario` 開頭的才算主線**：
//   genre 1  新生艾奧傑亞 → 區段 `Main Scenario (A Realm Reborn through Endwalker)`
//   genre 13 黃金遺產     → 區段 `Main Scenario (Dawntrail)`
//   genre 74 各族盟友     → 區段 `Allied Society Quests`（**不是主線**）
// 用 genre id 白名單的話，改版新增一個主線章節就會安靜漏掉。
//
// ── 順序 ────────────────────────────────────────────────────────────
// 章節內依 `SortKey`。那是遊戲手帳裡的排序，與實際接取順序一致。
//
// ── 刻意不做 ────────────────────────────────────────────────────────
// 提案本來有「每天 N 個估完成日」，砍掉了——每個人的速度差太多，估出來的日期
// 只會讓人覺得被騙。這份只回答「還剩幾個」。
//
// 執行（repo 根目錄）：
//   node scripts/build-msq.mjs            # dry-run
//   node scripts/build-msq.mjs --apply    # 寫入
//   node scripts/build-msq.mjs --offline  # 只用快取

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { xiv } from "./lib/xivapi.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

async function main() {
  const quests = await xiv.sheet(
    "Quest",
    "Name,JournalGenre@as(raw),ClassJobLevel,SortKey,Expansion@as(raw)",
    { limit: 500, cache: "out_data/cache/quest-msq.json", offline, label: "  Quest：" }
  );
  const genres = await xiv.sheet(
    "JournalGenre",
    "Name,JournalCategory.Name,JournalCategory.JournalSection.Name",
    { limit: 500, cache: "out_data/cache/journal-genre.json", offline, label: "  Genre：" }
  );

  const tw = await loadTwLocales();
  const twQuests = JSON.parse(await readFile(join(ROOT, "out_data", "tw-quests.json"), "utf8"));
  /* ⚠ **「沿途解鎖哪些副本」做不到。** `dungeons.json` 的 `unlock.questId` 只有 32 筆
     （`Quest.InstanceContentUnlock` 全表只有 48 筆，見知識庫 §4.74），而且與主線任務
     **零交集**——多數副本由主線解鎖，但那個關聯在任務腳本裡、不在 sheet 欄位上。
     實測交集是 0，所以這份不放 `unlocks` 欄位，頁面也不宣稱。 */

  /* 主線＝區段名以 `Main Scenario` 開頭。**不要用 genre id 白名單**，
     改版新增章節時會安靜漏掉。 */
  const msqGenres = new Map();
  for (const g of genres) {
    const cat = g.f.JournalCategory && g.f.JournalCategory.fields;
    const sec = cat && cat.JournalSection && cat.JournalSection.fields;
    const secName = sec ? sec.Name : "";
    if (!/^Main Scenario/.test(secName || "")) continue;
    const name = twName(tw.journalGenre, g.id);
    if (!isTw(name)) continue;                    // 台服未開放的章節不收
    msqGenres.set(g.id, { id: g.id, name, section: secName });
  }

  const out = [];
  const stat = { notMsq: 0, noTw: 0 };
  for (const q of quests) {
    const gid = q.f["JournalGenre@as(raw)"];
    if (!gid || !msqGenres.has(gid)) { stat.notMsq++; continue; }
    const row = twQuests[q.id];
    const name = row && row.tw;
    if (!isTw(name)) { stat.noTw++; continue; }   // 台服未開放＝整筆不收（鐵則）
    // ClassJobLevel 是陣列（每職業一格），取第一個大於 0 的
    const lvArr = q.f.ClassJobLevel;
    const lv = Array.isArray(lvArr) ? (lvArr.find((x) => x > 0) || 0) : (lvArr || 0);
    out.push({
      id: q.id, name, genre: gid, lv,
      sort: q.f.SortKey || 0,
    });
  }

  out.sort((a, b) => a.genre - b.genre || a.sort - b.sort || a.id - b.id);

  const chapters = [...msqGenres.values()].map((g) => ({
    id: g.id, name: g.name,
    count: out.filter((q) => q.genre === g.id).length,
  })).filter((c) => c.count > 0);
  /* 章節順序＝**`JournalGenre` 的 row id**。實測那就是劇情順序：
     1 新生 → 2 第七星曆 → 3 蒼天 → 4 龍詩終章 → 5 龍詩尾聲 → 6 紅蓮 → 7 解放戰爭戰後
     → 8 漆黑 → 9 拂曉回歸 → 10 末日序曲 → 11 曉月 → 12 嶄新的冒險 → 13 黃金 → 14 黃金終章。
     ⚠ **不要用「該章第一個任務的 SortKey」排**——`SortKey` 只在章節內有意義，
     跨章比會排出「第七星曆在新生前面」這種錯的順序（第一版就是這樣）。 */
  chapters.sort((a, b) => a.id - b.id);

  console.log(`\n主線章節 ${chapters.length} 個、任務 ${out.length} 個`);
  console.log(`  ${chapters.map((c) => `${c.name} ${c.count}`).join("、")}`);
  console.log(`  略過：非主線 ${stat.notMsq}、無台服名 ${stat.noTw}`);
  /* 同名任務（起始城市三選一那類）不去重——資料就是這樣，去重會讓「本章剩幾個」對不上遊戲。
     畫面上靠等級與章節區分。 */
  const nameCount = {};
  out.forEach((q) => { nameCount[q.name] = (nameCount[q.name] || 0) + 1; });
  const dupNames = Object.values(nameCount).filter((n) => n > 1).length;
  console.log(`  同名任務 ${dupNames} 組（起始城市三選一那類，不去重）`);
  const noSort = out.filter((q) => !q.sort).length;
  console.log(`  沒有 SortKey 的 ${noSort} 個（會退到依 id 排）`);
  console.log(`\n樣本：\n  ${out.slice(0, 3).map((q) => `Lv${q.lv} ${q.name}`).join("\n  ")}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "msq",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 Quest／JournalGenre（區段名以 Main Scenario 開頭者）＋ out_data/tw-quests.json",
    note: "章節內依 SortKey（遊戲手帳的順序）。**不提供「每天 N 個估完成日」**——每個人速度差太多，估出來的日期只會讓人覺得被騙。另外不提供「沿途解鎖哪些副本」——那個關聯在任務腳本裡不在 sheet 欄位上，實測與主線交集為 0。",
    count: out.length,
    chapters,
    data: out,
  };
  await writeFile(join(DATA, "msq.json"), JSON.stringify(db));
  console.log(`\n✓ data/msq.json（${chapters.length} 章／${out.length} 個任務）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
