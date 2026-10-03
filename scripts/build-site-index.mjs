// build-site-index.mjs — 產生 data/site-index.json（全站搜尋面板的索引）
//
// 解決的問題：站上有 30 個工具，命令面板（Ctrl/⌘K）只搜得到「工具名稱」。
// 使用者想找的其實常常是**一個東西**——「星極房裡的那隻寵物叫什麼」「拂曉這張卡在哪」——
// 而他不會知道那屬於哪個工具頁。
//
// 索引收什麼：**「站內有專屬頁面、且該頁可以用 ?id= 直接捲到」的東西**。
//   坐騎／寵物／樂譜／鳥鞍／髮型／表情／幻卡／青魔法／探索筆記／討伐目標 → 收藏頁 ?id=<keyOf>
//   魚 → 釣魚頁（它自己的 keyOf 是純 itemId）
//   副本 → 接 /tools/duty-codex/，`?id=duty:<名稱>`（該頁把它當篩選，不是捲動錨點）
//
// 索引**不收**一般物品（45,548 筆）：那會讓索引膨脹十倍，而且市場查價頁本來就能搜。
// 前端在搜尋結果最後固定附一條「🔎 到市場查價搜『…』」保底，涵蓋所有沒進索引的東西。
//
// `?id=` 的值是**各收藏頁 keyOf 的輸出**，各頁格式不同（多數 'id:<id>'，寵物頁是純數字）。
// 這裡照各頁的實際設定產生，不統一格式——那是各頁的存檔鍵，改它會動到使用者進度（§2.5）。
// 規約見 docs/deep-links.md。
//
// 執行（repo 根目錄）：
//   node scripts/build-site-index.mjs            # dry-run
//   node scripts/build-site-index.mjs --apply

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const apply = process.argv.includes("--apply");

// 每一類：[顯示標籤, 資料檔, 目的地路徑, 取名與 keyOf 的函式]
// keyOf 的寫法必須與該收藏頁的設定一致——對不上的話 ?id= 會安靜地捲不到東西。
const SOURCES = [
  ["坐騎", "mounts", "collections/mounts/", (x) => ["id:" + x.id, x.name]],
  ["寵物", "minions", "minions/", (x) => [String(x.id), x.name]],            // 純數字：沿用舊存檔格式
  ["樂譜", "orchestrion", "collections/orchestrion/", (x) => ["id:" + x.id, x.name]],
  ["鳥鞍", "barding", "collections/barding/", (x) => ["id:" + x.id, x.name]],
  ["時尚配飾", "ornaments", "collections/ornaments/", (x) => ["id:" + x.id, x.name]],
  ["髮型", "hairstyles", "collections/hairstyles/", (x) => ["id:" + x.id, x.name]],
  ["表情", "emotes", "collections/emotes/", (x) => ["id:" + x.id, x.name]],
  ["幻卡", "triple-triad", "collections/triple-triad/", (x) => ["id:" + x.id, x.name]],
  ["青魔法", "blue-magic", "collections/blue-magic/", (x) => ["id:" + x.id, x.name]],
  ["探索筆記", "exploration-log", "collections/exploration-log/", (x) => ["id:" + x.id, x.name]],
  ["魚", "fishes", "tools/fishing/", (x) => [String(x.itemId), x.name]],
  // 副本圖鑑的 ?id= 是 `duty:<名稱>`，語意與解鎖索引的 `sys:`／`job:` 同一套（docs/deep-links.md §2.1）。
  // 它不像追蹤頁那樣「捲到某張卡」，而是把該頁篩到只剩那一個副本——520 張卡捲過去不如直接篩。
  ["副本", "dungeons", "tools/duty-codex/", (x) => ["duty:" + x.name, x.name]],
];

// 排在**整份索引最後**的類別（在討伐目標／文書／系統解鎖／職業行會之後）。
// 面板目前只取「索引順序的前 40 筆」、不依相關度排序（第二輪路線圖 cmd-palette-ranking），
// 成就 3,349 筆若排在前面，短字查詢會被成就佔滿——例如搜「騎士」，名字含騎士的成就
// 會把職業行會那一筆擠出前 40。面板改成依相關度排序之前，大類別一律放這裡。
const TAIL_SOURCES = [
  ["成就", "achievements", "collections/achievements/", (x) => ["id:" + x.id, x.name]],
];

async function main() {
  const types = [];
  const rows = [];
  const report = [];

  // 與前端 assets/js/patch-gate.js 的 released() 同一套比對（"7.4" 補成 7.40 再比）。
  // 頁面用它擋掉台服還沒開放的條目，索引若不擋，面板會列出一筆點進去卻捲不到的東西。
  const gamePatch = JSON.parse(await readFile(join(DATA, "_meta.json"), "utf8")).gamePatch;
  const pnum = (p) => { const m = p == null ? null : String(p).match(/^(\d+)\.(\d+)/); return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : null; };
  const released = (p) => { const v = pnum(p), g = pnum(gamePatch); return v == null || g == null || v <= g; };

  async function addSource([label, file, path, fn]) {
    const db = JSON.parse(await readFile(join(DATA, `${file}.json`), "utf8"));
    const ti = types.length;
    types.push({ label, path, patch: file });
    let n = 0, noTw = 0, gated = 0;
    for (const e of db.data) {
      const [key, name] = fn(e);
      // 無台服繁中名＝台服未開放，本來就不該被搜到（鐵則）
      if (!name || !isTw(name)) { noTw++; continue; }
      if (!released(e.patch)) { gated++; continue; }
      rows.push(key == null ? [name, ti] : [name, ti, key]);
      n++;
    }
    report.push(`${label} ${n}${noTw ? `（略過無台服名 ${noTw}）` : ""}${gated ? `（略過版本 > ${gamePatch} ${gated}）` : ""}`);
  }
  for (const s of SOURCES) await addSource(s);

  // 討伐目標（資料是「12 組 × 條目 × 目標」的巢狀，同一隻怪跨職業重複，依 baseId 去重）
  {
    const db = JSON.parse(await readFile(join(DATA, "hunting-log.json"), "utf8"));
    const ti = types.length;
    types.push({ label: "討伐目標", path: "collections/hunting-log/" });
    const seen = new Map();
    for (const g of db.data) for (const e of g.entries) for (const t of e.targets) {
      if (!seen.has(t.baseId)) seen.set(t.baseId, t.name);
    }
    for (const [id, name] of seen) rows.push([name, ti, String(id)]);
    report.push(`討伐目標 ${seen.size}`);
  }

  /* 文書（relic-note.json）。使用者想搜的是「火天文書」——那是道具名，
     所以名稱就是索引鍵。key 用 `book:<書名>`，語意同副本圖鑑的 `duty:`：
     不捲到某一列，而是把頁面切到那一本。 */
  {
    const db = JSON.parse(await readFile(join(DATA, "relic-note.json"), "utf8"));
    const ti = types.length;
    types.push({ label: "文書", path: "tools/relic-note/" });
    for (const b of db.data) rows.push([b.name, ti, "book:" + b.name]);
    report.push(`文書 ${db.data.length}`);
  }

  // 系統解鎖與職業行會（system-unlocks.json 的兩個陣列）
  // 使用者想搜的是「金碟怎麼開」「機工士在哪轉職」，而不是工具名，所以名稱才是索引鍵。
  // key 用 sys:<key> / job:<縮寫>，對應 tools/unlock-index/ 的 data-key。
  {
    const db = JSON.parse(await readFile(join(DATA, "system-unlocks.json"), "utf8"));
    const tiSys = types.length;
    types.push({ label: "系統解鎖", path: "tools/unlock-index/" });
    for (const s of db.data) rows.push([s.name, tiSys, "sys:" + s.key]);
    const tiJob = types.length;
    types.push({ label: "職業行會", path: "tools/unlock-index/" });
    for (const j of db.jobs) rows.push([j.name, tiJob, "job:" + j.abbr]);
    report.push(`系統解鎖 ${db.data.length}、職業行會 ${db.jobs.length}`);
  }

  for (const s of TAIL_SOURCES) await addSource(s);

  const out = {
    schema: "site-index",
    updated: new Date().toISOString().slice(0, 10),
    source: "各收藏／工具資料檔；key 為該頁 keyOf 的輸出（見 docs/deep-links.md）",
    note: "不收一般物品（45,548 筆）——前端固定附「到市場查價搜」保底",
    count: rows.length,
    types,
    data: rows,
  };
  const json = JSON.stringify(out);
  console.log(report.join("、"));
  console.log(`\n合計 ${rows.length} 筆／${(json.length / 1024).toFixed(0)}KB／gzip ${(gzipSync(json).length / 1024).toFixed(1)}KB`);
  console.log(`相異名稱 ${new Set(rows.map((r) => r[0])).size}`);

  if (gzipSync(json).length > 200 * 1024) {
    console.error("\n✗ gzip 超過 200KB——面板是全站載入的，索引不能再大了。先砍類別再說。");
    process.exit(1);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  await writeFile(join(DATA, "site-index.json"), json);
  console.log(`\n✓ data/site-index.json`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
