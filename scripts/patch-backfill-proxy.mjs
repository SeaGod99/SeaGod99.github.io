// patch 回填第三階段：無 datamined 來源的表，用站內已補好的 patch 反推（代理值，較粗略）。
//
// 依賴 items/fishes/dungeons 已先補好 patch（先跑 patch-backfill-all.mjs）。
// 順序：maps 先補（monsters 會引用 map patch），再 monsters。
//
//   gathering      節點 patch = 其 items+hiddenItems 物品的最早 patch
//   fishing-spots  釣場 patch = 其 fishes（itemId）對應魚的最早 patch；退化用 coords.mapId 地圖 patch
//   maps           dungeon/instance 型別 → 對 dungeons.json nameEn 取精確 patch；其餘 → region→資料片基礎版本
//   monsters       bnpcname 命中 → 否則 positions[].mapId 地圖 patch → 否則 drops 物品最早 patch（其餘無訊號留空）
//   squadron       冒險者小隊系統於 3.4 開放 → 全填 3.4；並修正既有 count 不一致
//
// 執行：node scripts/patch-backfill-proxy.mjs [--apply]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const APPLY = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);
const lc = (s) => (s == null ? "" : String(s)).toLowerCase().trim();

function readDB(file) {
  const raw = readFileSync(join(DATA, file), "utf8");
  return { db: JSON.parse(raw), minified: !raw.includes('\n  "'), file };
}
const serialize = (db, minified) => (minified ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n");
const pnum = (p) => {
  if (p == null || p === "") return Infinity;
  const m = String(p).match(/^(\d+)\.(\d+)/);
  return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : Infinity;
};
const minPatch = (patches) => {
  let best = null, bestN = Infinity;
  for (const p of patches) {
    const n = pnum(p);
    if (n < bestN) { bestN = n; best = p; }
  }
  return best;
};

// region（繁中）→ 資料片基礎版本（粗略；庫爾札斯多為 HW，少數 ARR 低地略有誤差）
const REGION_PATCH = {
  "拉諾西亞": "2.0", "薩納蘭": "2.0", "黑衣森林": "2.0", "摩杜納": "2.0",
  "庫爾札斯": "2.0", "阿巴拉提亞": "3.0", "德拉瓦尼亞": "3.0",
  "基拉巴尼亞": "4.0", "遠東之國": "4.0", "奧薩德": "4.0",
  "諾弗蘭特": "5.0",
  "北洋地域": "6.0", "古代世界": "6.0", "伊爾薩巴德": "6.0", "星外天域": "6.0",
  "薩卡圖拉爾": "7.0", "尤卡圖拉爾": "7.0",
};

const apply = (db, minified, file) => APPLY && writeFile(join(DATA, file), ((db.updated = today), serialize(db, minified)));

async function run() {
  // 物品 / 魚 / 副本 patch 對照
  const items = JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data;
  const itemPatch = new Map(items.map((i) => [i.id, i.patch]));
  const fishes = JSON.parse(readFileSync(join(DATA, "fishes.json"), "utf8")).data;
  const fishPatch = new Map(fishes.map((f) => [f.itemId, f.patch]));
  const dungeons = JSON.parse(readFileSync(join(DATA, "dungeons.json"), "utf8")).data;
  const dunByName = new Map(dungeons.filter((d) => d.nameEn).map((d) => [lc(d.nameEn), d.patch]));

  const rows = [];
  const fill = (file, fn) => {
    const { db, minified } = readDB(file);
    const data = Array.isArray(db.data) ? db.data : [];
    let filled = 0, still = 0;
    for (const e of data) {
      if (e.patch != null && e.patch !== "") continue;
      const v = fn(e);
      if (v == null) { still++; continue; }
      filled++;
      if (APPLY) e.patch = v;
    }
    rows.push({ file, total: data.length, filled, still });
    return { db, minified, filled };
  };

  // gathering：物品最早 patch
  {
    const r = fill("gathering.json", (e) => minPatch([...(e.items || []), ...(e.hiddenItems || [])].map((id) => itemPatch.get(id)).filter(Boolean)));
    if (r.filled) await apply(r.db, r.minified, "gathering.json");
  }

  // maps：dungeon/instance 對 dungeons.json，其餘 region 表（先補，供 monsters 用）
  let mapPatch;
  {
    const { db, minified } = readDB("maps.json");
    const data = db.data;
    let filled = 0, still = 0;
    for (const m of data) {
      if (m.patch != null && m.patch !== "") continue;
      let v = null;
      if ((m.type === "dungeon" || m.type === "instance") && m.nameEn) v = dunByName.get(lc(m.nameEn));
      if (!v) v = REGION_PATCH[m.region];
      if (!v) { still++; continue; }
      filled++;
      if (APPLY) m.patch = v;
    }
    rows.push({ file: "maps.json", total: data.length, filled, still });
    if (APPLY && filled) await apply(db, minified, "maps.json");
    mapPatch = new Map(data.map((m) => [m.id, m.patch])); // 含本次補的
  }

  // fishing-spots：魚最早 patch；退化用 mapId 地圖 patch
  {
    const r = fill("fishing-spots.json", (e) => {
      const v = minPatch((e.fishes || []).map((id) => fishPatch.get(id)).filter(Boolean));
      return v || (e.coords?.mapId != null ? mapPatch.get(e.coords.mapId) : null);
    });
    if (r.filled) await apply(r.db, r.minified, "fishing-spots.json");
  }

  // monsters：bnpcname 已在 all 階段沒處理（無 type 對應），這裡用 positions 地圖 patch → drops 物品 patch
  {
    const r = fill("monsters.json", (e) => {
      const mp = minPatch((e.positions || []).map((p) => mapPatch.get(p.mapId)).filter(Boolean));
      if (mp) return mp;
      return minPatch((e.drops || []).map((d) => itemPatch.get(d.itemId)).filter(Boolean));
    });
    if (r.filled) await apply(r.db, r.minified, "monsters.json");
  }

  // squadron：系統 3.4 開放；修正 count
  {
    const { db, minified } = readDB("squadron.json");
    const data = db.data;
    let filled = 0;
    for (const e of data) { if (e.patch == null || e.patch === "") { filled++; if (APPLY) e.patch = "3.4"; } }
    const countFix = db.count !== data.length ? `count ${db.count}→${data.length}` : "";
    rows.push({ file: "squadron.json", total: data.length, filled, still: 0, note: countFix });
    if (APPLY) { db.count = data.length; await apply(db, minified, "squadron.json"); }
  }

  console.log("\n檔案                 總數    填     仍無patch  備註");
  for (const r of rows)
    console.log(`${r.file.padEnd(20)} ${String(r.total).padEnd(7)} ${String(r.filled).padEnd(6)} ${String(r.still ?? "-").padEnd(10)} ${r.note || ""}`);
  console.log(APPLY ? "\n✅ 已寫入" : "\n（dry-run，未寫入；加 --apply）");
}

run().catch((e) => { console.error("錯誤：", e.message); process.exit(1); });
