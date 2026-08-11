// 用 items.json（台服官方物品名）補齊各庫「缺繁中名」的條目
//
// 為什麼需要：台服升版後，新開放的條目在各自的 build 腳本跑過時還沒有台服物品名，
// 於是留下 null／英文／`#47951` 佔位。版本閘門一放行，這些就直接露在畫面上
// （魚類頁是 `f.name || f.nameEn`，等於英文魚名直接見客）。
//
// 權威鏈：`out_data/tw-items.msgpack` → `data/items.json` 的 `name` ＝台服官方物品名。
// **只補、不覆蓋**：既有繁中名（多為 ffxiv-collection-tc 校正過的社群慣用名，
// 如「迷你巨人掌」vs 官方「迷你巨人掌怪」）一律保留，避免與 patch-*-tc.mjs 打架。
//
// 涵蓋：
//   fishes.json      name === null                → items[itemId].name
//   gardening.json   name／seedName 為 "#12345"    → items[productId／seedId].name
//   barding.json     name === nameEn（未譯）       → items[itemId].name
//   minions.json     _noTwName                    → 以圖示編號對物品（companion icon + 55000）
//
// 冪等。執行：
//   node scripts/patch-tw-names.mjs            # dry-run
//   node scripts/patch-tw-names.mjs --apply    # 寫回

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const APPLY = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);

function readDB(file) {
  const raw = readFileSync(join(DATA, file), "utf8");
  return { db: JSON.parse(raw), minified: !raw.includes('\n  "') };
}
const serialize = (db, m) => (m ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n");
const isPlaceholder = (s) => s == null || s === "" || /^#\d+$/.test(String(s));

const items = new Map();
for (const it of JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data) items.set(it.id, it);

// 寵物道具：圖示編號 → 道具（minions.json 沒有 itemId，只能靠圖示對，
// 對法與 build-minions.mjs 一致：companion 圖示編號 + 55000 ＝ 道具圖示編號）
const minionItemByIcon = new Map();
for (const it of items.values()) {
  if (it.category !== "寵物" || !it.icon) continue;
  const m = it.icon.match(/\/(\d+)\.png$/);
  if (m) minionItemByIcon.set(parseInt(m[1], 10), it);
}

const report = [];
let touched = 0;

function log(file, changes, stillMissing) {
  report.push(`${file.padEnd(16)} 補 ${String(changes.length).padStart(3)} 筆，仍缺 ${stillMissing}`);
  for (const c of changes.slice(0, 12)) report.push(`   ${c}`);
  if (changes.length > 12) report.push(`   …另 ${changes.length - 12} 筆`);
}

async function save(file, db, minified, changed) {
  if (!changed) return;
  touched++;
  if (!APPLY) return;
  db.updated = today;
  await writeFile(join(DATA, file), serialize(db, minified));
}

// ── fishes ────────────────────────────────────────────────
{
  const { db, minified } = readDB("fishes.json");
  const changes = [];
  for (const e of db.data) {
    if (e.name) continue;
    const it = items.get(e.itemId);
    if (!it?.name) continue;
    changes.push(`${e.itemId} ${e.nameEn} → ${it.name}`);
    e.name = it.name;
  }
  log("fishes.json", changes, db.data.filter((e) => !e.name).length - (APPLY ? 0 : changes.length));
  await save("fishes.json", db, minified, changes.length);
}

// ── gardening ─────────────────────────────────────────────
{
  const { db, minified } = readDB("gardening.json");
  const rows = db.data || db;
  const changes = [];
  for (const e of rows) {
    for (const [nameKey, enKey, idKey] of [
      ["name", "nameEn", "productId"],
      ["seedName", "seedNameEn", "seedId"],
    ]) {
      if (!isPlaceholder(e[nameKey])) continue;
      const it = items.get(e[idKey]);
      if (!it?.name) continue;
      changes.push(`${e[idKey]} ${e[nameKey]} → ${it.name}`);
      e[nameKey] = it.name;
      if (isPlaceholder(e[enKey])) e[enKey] = null; // "#47950" 不是英文名，留 null 比留假值好
    }
  }
  const still = rows.filter((e) => isPlaceholder(e.name) || isPlaceholder(e.seedName)).length;
  log("gardening.json", changes, still);
  await save("gardening.json", db, minified, changes.length);
}

// ── barding ───────────────────────────────────────────────
{
  const { db, minified } = readDB("barding.json");
  const changes = [];
  for (const e of db.data) {
    if (e.name !== e.nameEn) continue; // 有繁中名就不動
    const it = items.get(e.itemId);
    if (!it?.name || it.name === e.nameEn) continue;
    changes.push(`${e.id} ${e.nameEn} → ${it.name}`);
    e.name = it.name;
  }
  log("barding.json", changes, db.data.filter((e) => e.name === e.nameEn).length);
  await save("barding.json", db, minified, changes.length);
}

// ── minions ───────────────────────────────────────────────
{
  const { db, minified } = readDB("minions.json");
  const changes = [];
  for (const e of db.data) {
    if (!e._noTwName) continue;
    const m = e.icon && e.icon.match(/(\d+)_hr1/);
    if (!m) continue;
    const it = minionItemByIcon.get(parseInt(m[1], 10) + 55000);
    if (!it?.name) continue;
    changes.push(`${e.id} ${e.nameEn} → ${it.name}`);
    e.name = it.name;
    if (e.itemId == null) e.itemId = it.id;
    e.marketable = it.marketable ?? e.marketable;
    delete e._noTwName;
  }
  log("minions.json", changes, db.data.filter((e) => e._noTwName).length);
  await save("minions.json", db, minified, changes.length);
}

console.log(report.join("\n"));
console.log(APPLY ? `\n✅ 已寫入 ${touched} 個檔` : `\n（dry-run，未寫入；加 --apply 套用，將改 ${touched} 個檔）`);
