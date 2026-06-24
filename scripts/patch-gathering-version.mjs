// 採集點 patch（版本）重算 —— 取代 patch-backfill-proxy.mjs 的「最早物品 patch」粗略法。
//
// 背景：採集點無 datamined patch 來源（Teamcraft patch-content 不含 GatheringPointBase）。
//   舊代理法 = 節點所有產物的最早 patch，但每個節點都會掉基礎水晶/碎晶/晶簇（id 2–19，皆 2.0），
//   把各版本節點一律拉回 2.0（實測 418/733 卡 2.0、其中 ~297 筆比其採集等級下界還早＝標錯）。
//
// 新推導（三層，由可靠到細緻）：
//   1. floor = 採集等級 → 資料片基礎版本（硬下界，水晶騙不了：Lv90 不可能早於 6.0）
//   2. 若有「非基礎素材且能在 items.json 對到 patch」的產物 → est = max(floor, 這些物品最早 patch)
//   3. 若節點所有產物都對不到名稱（全為 ≥44850 的台服未開放 7.x 物品）→ 下界提到 7.0
//   其餘（只剩水晶可解析）→ floor
//
// 純讀本機 data/items.json + data/gathering.json，不連外網（沙箱可跑）。idempotent：重算全部節點。
//
// 執行：
//   node scripts/patch-gathering-version.mjs            # dry-run，只報告
//   node scripts/patch-gathering-version.mjs --apply    # 寫回 data/gathering.json（保留 minified 格式）

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const APPLY = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);

// 基礎元素素材：六元素 × 碎晶/水晶/晶簇 = id 2–19。每個採集點都會掉，非版本訊號，排除。
const CRYSTAL = new Set();
for (let i = 2; i <= 19; i++) CRYSTAL.add(i);
// items.json 對不到的物品 id 從此值起跳＝台服未開放的 7.x datamined 物品（見前端隱藏規則）。
const UNRELEASED_MIN_ID = 44850;

// 採集等級上限 → 資料片基礎版本
const lvFloor = (L) =>
  L >= 91 ? "7.0" : L >= 81 ? "6.0" : L >= 71 ? "5.0" : L >= 61 ? "4.0" : L >= 51 ? "3.0" : "2.0";

const pnum = (p) => {
  if (p == null || p === "") return Infinity;
  const m = String(p).match(/^(\d+)\.(\d+)/);
  return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : Infinity;
};
const minPatch = (ps) => ps.reduce((best, p) => (pnum(p) < pnum(best ?? Infinity) ? p : best), null);
const maxPatch = (a, b) => (pnum(a) >= pnum(b) ? a : b);

function readDB(file) {
  const raw = readFileSync(join(DATA, file), "utf8");
  return { db: JSON.parse(raw), minified: !raw.includes('\n  "') };
}

async function run() {
  const items = JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data;
  const itemPatch = new Map(items.map((i) => [i.id, i.patch]));

  const { db, minified } = readDB("gathering.json");
  const nodes = db.data;

  const derive = (n) => {
    const floor = lvFloor(n.level || 0);
    const all = [...(n.items || []), ...(n.hiddenItems || [])];
    // 非基礎素材且 items.json 有 patch 的產物
    const sig = all
      .filter((id) => !CRYSTAL.has(id))
      .map((id) => itemPatch.get(id))
      .filter((p) => p != null && p !== "");
    if (sig.length) return maxPatch(floor, minPatch(sig));
    // 全產物都對不到名稱（台服未開放 7.x）→ 下界提到 7.0
    const allUnreleased = all.length > 0 && all.every((id) => !itemPatch.has(id));
    const hasUnreleasedId = all.some((id) => id >= UNRELEASED_MIN_ID && !itemPatch.has(id));
    if (allUnreleased && hasUnreleasedId) return maxPatch(floor, "7.0");
    return floor;
  };

  const before = {};
  const after = {};
  let changed = 0;
  const samples = [];
  for (const n of nodes) {
    const old = n.patch ?? "undefined";
    const next = derive(n);
    before[old] = (before[old] || 0) + 1;
    after[next] = (after[next] || 0) + 1;
    if (String(old) !== String(next)) {
      changed++;
      if (samples.length < 12) samples.push(`  Lv${n.level} id${n.id}: ${old} → ${next}`);
    }
    if (APPLY) n.patch = next;
  }

  const dist = (o) =>
    Object.entries(o)
      .sort((a, b) => pnum(a[0]) - pnum(b[0]))
      .map(([k, v]) => `${k}:${v}`)
      .join("  ");
  console.log(`採集點 ${nodes.length} 筆；patch 變更 ${changed} 筆\n`);
  console.log("變更前:", dist(before));
  console.log("變更後:", dist(after));
  console.log("\n範例:");
  console.log(samples.join("\n"));

  if (APPLY) {
    db.updated = today;
    const out = minified ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n";
    await writeFile(join(DATA, "gathering.json"), out);
    console.log("\n✅ 已寫入 data/gathering.json");
  } else {
    console.log("\n（dry-run，未寫入；加 --apply 套用）");
  }
}

run().catch((e) => {
  console.error("錯誤：", e.message);
  process.exit(1);
});
