// 從 Teamcraft recipes.json 建立 recipes.json 製作配方資料庫
//
// 為什麼本機跑：Cowork 沙箱擋外網，無法在 session 內抓 Teamcraft / GitHub raw。
// 你電腦沒這限制。需 Node 18+（內建 fetch）。
//
// 執行（repo 根目錄）：
//   node scripts/build-recipes.mjs
//
// 來源：Teamcraft libs/data/.../recipes.json（陣列，每筆含 result/ingredients/job…）
// 輸出：data/recipes.json（信封格式）
//
// 物品繁中名稱不存本表，由 itemId 連 items.json 主表顯示（見 SCHEMA.md 2.6）。

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "recipes.json");

const URL_SRC = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/recipes.json";

// FFXIV ClassJob id → 台服官方職業譯名（見 SCHEMA.md 1.8 JOBS）
// 特殊製作系統不屬八大製作職：jobId 0=工會工坊（飛空艇零件/外牆/機工台）、-10=無人島開拓
const JOBS = {
  8:  "刻木匠",
  9:  "鍛鐵匠",
  10: "鑄甲匠",
  11: "雕金匠",
  12: "製革匠",
  13: "裁衣匠",
  14: "煉金術士",
  15: "烹調師",
  0:  "工會工坊",
  "-10": "無人島",
};

async function main() {
  console.log("抓取 Teamcraft recipes.json…");
  const res = await fetch(URL_SRC);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  console.log(`  原始配方 ${raw.length} 筆`);

  const data = [];
  for (const r of raw) {
    if (r.result == null) continue;            // 無成品的略過
    const ingredients = (r.ingredients || [])
      .filter((g) => g.id != null && g.amount > 0)
      .map((g) => ({ itemId: g.id, qty: g.amount }));

    data.push({
      id: r.id,
      itemId: r.result,
      job: JOBS[r.job] || `職業${r.job}`,
      jobId: r.job,
      level: r.lvl ?? 0,
      rlvl: r.rlvl ?? 0,
      stars: r.stars ?? 0,
      yield: r.yields ?? 1,
      ingredients,
      durability: r.durability ?? 0,
      quality: r.quality ?? 0,
      progress: r.progress ?? 0,
      expert: !!r.expert,
    });
  }

  data.sort((a, b) => a.id - b.id);

  const out = {
    schema: "recipes",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "teamcraft",
    count: data.length,
    data,
  };
  await writeFile(OUT, JSON.stringify(out));

  const byJob = data.reduce((a, d) => ((a[d.job] = (a[d.job] || 0) + 1), a), {});
  console.log(`\n寫入 ${OUT}`);
  console.log(`  配方 ${data.length} 筆`);
  console.log("  各職業:", JSON.stringify(byJob));
  console.log("\n提醒：成品/材料名稱需 items.json 主表。對不到名稱（台服未開放）前端直接不顯示。");
}

main().catch((e) => { console.error(e); process.exit(1); });
