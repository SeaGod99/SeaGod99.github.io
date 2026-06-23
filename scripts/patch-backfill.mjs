// patch 回填腳本（T0 基石）
//
// 目的：為收藏類資料補上準確的 patch（版本）欄位，作為「台服未開放即隱藏」規則的依據。
//   隱藏規則（後續步驟套用，本腳本不動名稱）：
//     entry.patch  > 台服當前版本(7.15) → 台服未開放 → 後續 name=null 隱藏
//     entry.patch ≤ 7.15              → 台服已開放 → 缺繁中名/來源 = 真缺口要補
//
// 資料來源：ffxivcollect API（patch 為全球版本號，跨區相同，只是台服較晚上線）。
//   本沙箱可連 ffxivcollect.com（v2.xivapi.com 才被擋）。
//
// join key（實測 match 率）：
//   mounts      e.id → nameEn        （Mount row id 對齊）
//   minions     e.id → nameEn        （Companion row id 對齊）
//   emotes      e.id → command；未命中且為「預設」→ "2.0"（基礎版動作，ffxivcollect 不收錄預設）
//   barding     nameEn → item_id     （barding 的 id 為站內自編，不可靠）
//
// patch 取值原則：命中 ffxivcollect 即以其值為準（既有手動 patch 可能錯位，見 build-mounts.mjs）；
//   未命中則保留既有值。每筆變更都會在 dry-run 報告中列出。
//
// 執行：
//   node scripts/patch-backfill.mjs            # dry-run，只報告不寫入
//   node scripts/patch-backfill.mjs --apply    # 實際寫回 data/*.json + _meta.json

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const APPLY = process.argv.includes("--apply");
const TW_PATCH = "7.15"; // 台服當前版本門檻

const FC = "https://ffxivcollect.com/api";
const lc = (s) => (s == null ? "" : String(s)).toLowerCase().trim();
const today = new Date().toISOString().slice(0, 10);

async function fetchAll(type) {
  const r = await fetch(`${FC}/${type}?limit=9999`);
  if (!r.ok) throw new Error(`ffxivcollect ${type} HTTP ${r.status}`);
  const d = await r.json();
  return d.results || [];
}

async function loadDB(file) {
  const db = JSON.parse(await readFile(join(DATA, file), "utf8"));
  if (db.count != null && db.data && db.count !== db.data.length) {
    throw new Error(`${file}: count(${db.count}) != data.length(${db.data.length})，中止避免半寫`);
  }
  return db;
}

// 回傳 { filled, changed, unchanged, nomatch, samples }
function backfill(name, data, fc, opts) {
  const byId = new Map(fc.map((x) => [x.id, x]));
  const byItem = new Map(fc.filter((x) => x.item_id).map((x) => [x.item_id, x]));
  const byName = new Map(fc.map((x) => [lc(x.name), x]));
  const stat = { filled: 0, changed: 0, unchanged: 0, nomatch: 0, defaulted: 0, changes: [] };

  for (const e of data) {
    let hit = null;
    for (const key of opts.keys) {
      if (key === "id") hit = byId.get(e.id);
      else if (key === "itemId") hit = e.itemId && byItem.get(e.itemId);
      else if (key === "nameEn") hit = e.nameEn && byName.get(lc(e.nameEn));
      if (hit) break;
    }

    const old = e.patch;
    let next;
    if (hit) {
      next = hit.patch;
    } else if (opts.defaultFn) {
      next = opts.defaultFn(e); // emotes 預設 → "2.0"
      if (next != null) stat.defaulted++;
    }

    if (next == null) {
      stat.nomatch++;
      continue;
    }
    if (old == null || old === "") {
      stat.filled++;
      if (stat.changes.length < 8) stat.changes.push(`  填 ${e.id} ${e.name || e.nameEn}: "" → ${next}`);
    } else if (String(old) !== String(next)) {
      stat.changed++;
      if (stat.changes.length < 8) stat.changes.push(`  改 ${e.id} ${e.name || e.nameEn}: ${old} → ${next}`);
    } else {
      stat.unchanged++;
      continue;
    }
    if (APPLY) e.patch = next;
  }
  return stat;
}

async function run() {
  process.stderr.write(`抓 ffxivcollect…\n`);
  const [mt, mn, em, bard] = await Promise.all([
    fetchAll("mounts"),
    fetchAll("minions"),
    fetchAll("emotes"),
    fetchAll("bardings"),
  ]);
  process.stderr.write(`fc 筆數 mounts=${mt.length} minions=${mn.length} emotes=${em.length} bardings=${bard.length}\n\n`);

  const jobs = [
    { file: "mounts.json", fc: mt, keys: ["id", "nameEn"] },
    { file: "minions.json", fc: mn, keys: ["id", "nameEn"] },
    {
      file: "emotes.json",
      fc: em,
      keys: ["id"],
      // 預設動作（unlockLink===0 / sources.type==="預設"）ffxivcollect 不收錄 → 基礎版 2.0
      defaultFn: (e) => {
        const isDefault = e.unlockLink === 0 || (e.sources || []).some((s) => s.type === "預設");
        return isDefault ? "2.0" : null;
      },
    },
    { file: "barding.json", fc: bard, keys: ["nameEn", "itemId"] },
  ];

  for (const j of jobs) {
    const db = await loadDB(j.file);
    const s = backfill(j.file, db.data, j.fc, j);
    console.log(
      `${j.file}: 填${s.filled} 改${s.changed} 同${s.unchanged} 預設${s.defaulted} 無對應${s.nomatch} （共 ${db.data.length}）`
    );
    if (s.changes.length) console.log(s.changes.join("\n"));
    if (APPLY) {
      db.updated = today;
      await writeFile(join(DATA, j.file), JSON.stringify(db, null, 2) + "\n");
    }
  }

  // _meta.json gamePatch → 7.15（台服當前版本）
  const metaPath = join(DATA, "_meta.json");
  const meta = JSON.parse(await readFile(metaPath, "utf8"));
  console.log(`\n_meta.json gamePatch: ${meta.gamePatch} → ${TW_PATCH}`);
  if (APPLY) {
    meta.gamePatch = TW_PATCH;
    meta.updated = today;
    await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n");
  }

  console.log(APPLY ? "\n✅ 已寫入" : "\n（dry-run，未寫入；加 --apply 套用）");
}

run().catch((e) => {
  console.error("錯誤：", e.message);
  process.exit(1);
});
