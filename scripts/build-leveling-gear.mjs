// build-leveling-gear.mjs — 產生 data/leveling-gear/<職業代碼>.json（練級裝備路線）
//
// 回答的問題：「我現在 Lv62 的龍騎士，每個部位該換什麼？」
//
// ── 只挑「等級門檻的前緣」──────────────────────────────────────────
// 同一個部位在 Lv60 可能有幾十件能穿的，但**只有 ilvl 最高的那件有意義**。
// 所以每個職業×部位只存一條「前緣」：等級每往上跳一階、可穿的最高 ilvl 換一件時才記一筆。
// 26,979 件可裝備物品因此壓成 43 個檔、每檔幾十筆。
//
// ── 槽位是從資料推出來的，不是憑印象寫的 ────────────────────────────
// 拿 `items.json` 每個 `equip.slot` 的 `category` 眾數對出來的：
//   1 主手（單手劍／工具主）  2 副手（盾／工具副）  3 頭  4 身體  5 手  7 腿  8 腳
//   9 耳  10 項鍊  11 手鐲  12 戒指  13 **雙手武器**（長槍／大斧／格鬥武器…佔兩手）
//   17 靈魂水晶（不收）  15／16／18–22 特殊整體服之類（件數極少，不收）
// **沒有 slot 6**——腰帶 6.0 已移除，資料裡本來就沒有。
//
// ── 有一件真的很怪，但那是真資料 ────────────────────────────────────
// `阿澤瑪耳墜`（6.58）的 `equip.level` 是 **1**、ilvl 是 **560**，
// 所以它會贏下每個職業從 Lv1 到 Lv8x 的耳飾欄。**那不是 bug，資料就是這樣。**
// 試過「用同等級 ilvl 中位數的 N 倍」抓離群值——**誤傷 103 件**低 ilvl 的紋章盾與裝飾品
// （Lv1 的中位 ilvl 是 1，任何 ilvl 6 的東西都變成「6 倍離群」），所以不採用。
// 解法在畫面層：每個部位列**多個候選**而不是只列第一名，那件自然只是其中一列，
// 使用者看得到它的 `Lv1 · i560` 自己判斷。**不要為了版面好看去發明一條排除規則。**
//
// ── 明說做不到的事 ──────────────────────────────────────────────────
// **只依 ilvl 排，不算副屬性**。同 ilvl 的暴擊版與信念版哪件好，取決於職業與循環，
// 那是配裝規劃器的工作（首頁已外連 ffsusu）。這頁只回答「現在穿得起的最高 ilvl 是哪件」。
//
// 執行（repo 根目錄）：
//   node scripts/build-leveling-gear.mjs            # dry-run
//   node scripts/build-leveling-gear.mjs --apply    # 寫入

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { isTw } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const OUT = join(DATA, "leveling-gear");

const apply = process.argv.includes("--apply");

// slot → 顯示名。眾數推出來的（見檔頭），17／15／16／18–22 刻意不收。
const SLOTS = {
  1: "主手", 2: "副手", 13: "雙手武器",
  3: "頭", 4: "身體", 5: "手", 7: "腿", 8: "腳",
  9: "耳飾", 10: "項鍊", 11: "手鐲", 12: "戒指",
};

async function main() {
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const eqDb = JSON.parse(await readFile(join(DATA, "equip.json"), "utf8"));
  const jobNames = eqDb.names || {};

  // job → slot → 候選
  const byJob = new Map();
  const stat = { eq: 0, noTw: 0, otherSlot: 0, used: 0 };

  for (const it of items) {
    const e = it.equip;
    if (!e) continue;
    stat.eq++;
    if (!SLOTS[e.slot]) { stat.otherSlot++; continue; }
    // 台服未開放＝整筆不收（鐵則）
    if (!isTw(it.name)) { stat.noTw++; continue; }
    if (!Array.isArray(e.jobs) || !e.jobs.length) continue;
    stat.used++;
    for (const job of e.jobs) {
      if (!byJob.has(job)) byJob.set(job, new Map());
      const slots = byJob.get(job);
      if (!slots.has(e.slot)) slots.set(e.slot, []);
      slots.get(e.slot).push({
        id: it.id, name: it.name, ilvl: it.ilvl || 0,
        lv: e.level || 1, marketable: !!it.marketable, patch: it.patch || null,
      });
    }
  }

  /* 前緣：依等級門檻由低到高掃，只有「可穿的最高 ilvl 變了」才記一筆。
     同 ilvl 同等級有很多件時取 id 最小的——**順序要穩定**，不然每次重建 diff 都在動。 */
  function frontier(list) {
    list.sort((a, b) => a.lv - b.lv || b.ilvl - a.ilvl || a.id - b.id);
    const out = [];
    let best = null;
    for (const x of list) {
      if (!best || x.ilvl > best.ilvl) {
        // 同一個等級門檻重複出現時，覆蓋掉前一筆（保留 ilvl 較高的）
        if (out.length && out[out.length - 1].lv === x.lv) out.pop();
        out.push(x);
        best = x;
      }
    }
    return out;
  }

  const files = [];
  for (const [job, slots] of byJob) {
    const rows = {};
    for (const [slot, list] of slots) rows[slot] = frontier(list);
    const total = Object.values(rows).reduce((n, a) => n + a.length, 0);
    if (!total) continue;
    files.push({
      job,
      jobName: jobNames[job] || job,
      slots: rows,
      total,
    });
  }
  files.sort((a, b) => a.job.localeCompare(b.job));

  const sized = files.map((f) => {
    const json = JSON.stringify({
      schema: "leveling-gear", job: f.job, jobName: f.jobName,
      slotNames: SLOTS, slots: f.slots,
    });
    return { ...f, json, bytes: json.length, gz: gzipSync(json).length };
  });

  const totalGz = sized.reduce((n, f) => n + f.gz, 0);
  console.log(`\n可裝備物品 ${stat.eq} 件；收錄 ${stat.used}（略過：無台服名 ${stat.noTw}、不收的槽位 ${stat.otherSlot}）`);
  console.log(`產出 ${sized.length} 個職業檔，合計 gzip ${(totalGz / 1024).toFixed(0)}KB`);
  const top = sized.slice().sort((a, b) => b.total - a.total).slice(0, 5);
  console.log(`  前緣筆數最多的五個：${top.map((f) => `${f.jobName} ${f.total}`).join("、")}`);
  const sample = sized.find((f) => f.job === "DRG") || sized[0];
  const s70 = Object.entries(sample.slots).map(([sl, arr]) => {
    const pick = arr.filter((x) => x.lv <= 70).pop();
    return pick ? `${SLOTS[sl]} ${pick.name}(i${pick.ilvl})` : null;
  }).filter(Boolean);
  console.log(`\n${sample.jobName} Lv70 各部位最高 ilvl：\n  ${s70.join("\n  ")}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) if (f.endsWith(".json")) await rm(join(OUT, f));
  for (const f of sized) await writeFile(join(OUT, `${f.job}.json`), f.json);
  await writeFile(join(OUT, "_index.json"), JSON.stringify({
    schema: "leveling-gear-index",
    updated: new Date().toISOString().slice(0, 10),
    source: "data/items.json 的 equip 欄位 ＋ data/equip.json 的職業名",
    note: "每個職業一個檔。slots[slot] 是「等級門檻的前緣」——只有可穿的最高 ilvl 換人時才記一筆。**只依 ilvl 排，不算副屬性。**",
    count: sized.length,
    slotNames: SLOTS,
    jobs: sized.map((f) => ({ job: f.job, name: f.jobName, rows: f.total })),
  }));
  console.log(`\n✓ data/leveling-gear/（${sized.length} 個職業檔＋_index.json）`);
  console.log("  這個目錄刻意不進 minify-data.mjs——本來就是壓過的形狀");
}

main().catch((e) => { console.error(e); process.exit(1); });
