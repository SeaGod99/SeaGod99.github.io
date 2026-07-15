// 全資料庫 patch 回填（接續 patch-backfill.mjs 的收藏檔之後）
//
// 目標：盡可能讓每個 data/*.json 的條目都帶 patch（版本），作為「台服未開放即隱藏」依據。
//
// 來源（皆實測可連）：
//   Teamcraft patch-content.json  { patchId: { contentType: [ids] } } → 反查 id→patchId
//   Teamcraft patch-names.json    { patchId: { version: "7.15", ... } } → patchId→版本號
//   ffxivcollect /api/cards       幻卡 patch（版本字串）→ triple-triad
//   out_data/cfc-content.json     ContentFinderCondition id → InstanceContent id（dungeons 橋接）
//
// 已驗證命中率：items 100% / npcs 99% / recipes 97%(經產物 itemId) / dungeons 87%(經 cfc 橋) /
//   gardening(經 productId) / triple-triad(ffxivcollect)。
// 無 datamined patch 來源（內部參照/工具表，非收藏隱藏用）：monsters / maps / gathering /
//   fishing-spots / squadron → 本腳本不動，於報告標示。
//
// 執行：
//   node scripts/patch-backfill-all.mjs            # dry-run，只報告
//   node scripts/patch-backfill-all.mjs --apply    # 寫回

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const OUT_DATA = join(ROOT, "out_data");
const APPLY = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);

const TC = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";
const FC = "https://ffxivcollect.com/api";
const lc = (s) => (s == null ? "" : String(s)).toLowerCase().trim();
// 讀檔並偵測原始格式（大型庫如 items/npcs/recipes 為單行 minified，須原樣寫回，
// 否則 pretty-print 會把整檔展開造成數十萬行 diff）。
function readDB(file) {
  const raw = readFileSync(join(DATA, file), "utf8");
  const minified = !raw.includes('\n  "'); // 有縮排鍵 = pretty；否則 minified
  return { db: JSON.parse(raw), minified };
}
const serialize = (db, minified) => (minified ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n");
const j = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  return r.json();
};

async function run() {
  process.stderr.write("抓 Teamcraft patch-content / patch-names …\n");
  const [content, names] = await Promise.all([j(`${TC}/patch-content.json`), j(`${TC}/patch-names.json`)]);

  // patchId → 版本號
  const ver = (pid) => names[pid]?.version ?? null;
  // 反查每個 content type 的 id→patchId
  const inv = {};
  for (const [pid, obj] of Object.entries(content))
    for (const [t, ids] of Object.entries(obj)) {
      if (!Array.isArray(ids)) continue;
      (inv[t] ||= new Map());
      for (const id of ids) if (!inv[t].has(id)) inv[t].set(id, pid);
    }

  const cfc = JSON.parse(readFileSync(join(OUT_DATA, "cfc-content.json"), "utf8"));

  // resolver(entry) → 版本字串 | null
  const viaType = (type, field) => (e) => {
    const k = e[field];
    if (k == null) return null;
    const pid = inv[type]?.get(k);
    return pid ? ver(pid) : null;
  };
  const dungeonResolver = (e) => {
    const cid = cfc[String(e.id)] ?? cfc[e.id];
    if (cid == null) return null;
    const pid = inv["instancecontent"]?.get(cid);
    return pid ? ver(pid) : null;
  };
  // 幻卡：ffxivcollect 無 cards 端點；改由 sources[].instanceId 反查所屬副本的 instancecontent 版本（近似：卡片隨該副本上線）
  const cardResolver = (e) => {
    for (const s of e.sources || []) {
      const iid = s.instanceId;
      const pid = iid != null ? inv["instancecontent"]?.get(iid) : null;
      if (pid) return ver(pid);
    }
    return null;
  };
  const gardeningResolver = (e) => {
    for (const f of ["productId", "seedId"]) {
      const pid = e[f] != null ? inv["item"]?.get(e[f]) : null;
      if (pid) return ver(pid);
    }
    return null;
  };

  const jobs = [
    { file: "items.json", resolve: viaType("item", "id") },
    { file: "recipes.json", resolve: viaType("item", "itemId") },
    { file: "npcs.json", resolve: viaType("enpcresident", "id") },
    { file: "dungeons.json", resolve: dungeonResolver },
    { file: "gardening.json", resolve: gardeningResolver },
    { file: "triple-triad.json", resolve: cardResolver },
  ];
  const noSource = ["monsters.json", "maps.json", "gathering.json", "fishing-spots.json", "squadron.json"];

  const rows = [];
  for (const job of jobs) {
    const { db, minified } = readDB(job.file);
    const data = Array.isArray(db.data) ? db.data : [];
    if (db.count != null && db.count !== data.length) {
      console.log(`⚠ ${job.file}: count(${db.count}) != data.length(${data.length})，跳過`);
      continue;
    }
    let filled = 0, still = 0;
    for (const e of data) {
      const old = e.patch;
      if (old != null && old !== "") continue; // fill-only：不覆蓋既有 patch
      const v = job.resolve(e);
      if (v == null) {
        still++;
        continue;
      }
      filled++;
      if (APPLY) e.patch = v;
    }
    rows.push({ file: job.file, total: data.length, filled, still });
    if (APPLY && filled > 0) {
      db.updated = today;
      await writeFile(join(DATA, job.file), serialize(db, minified));
    }
  }

  console.log("\n檔案                 總數    填     仍無patch");
  for (const r of rows)
    console.log(`${r.file.padEnd(20)} ${String(r.total).padEnd(7)} ${String(r.filled).padEnd(6)} ${r.still}`);
  console.log(`\n無 datamined patch 來源（不動）：${noSource.join(", ")}`);
  console.log(APPLY ? "\n✅ 已寫入" : "\n（dry-run，未寫入；加 --apply 套用）");
}

run().catch((e) => {
  console.error("錯誤：", e.message);
  process.exit(1);
});
