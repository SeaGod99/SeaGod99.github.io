// build-craft-leves.mjs — 產生 data/craft-leves.json（製作理符）
//
// 資料鏈：`Leve`（等級／EXP／gil／配額）→ `DataId` → `CraftLeve`（交付什麼、幾個、能不能三倍）
//
// ── 兩個查表教訓（知識庫 §4.81）────────────────────────────────────
// · `CraftLeve` 的 row id 從 **917504** 開始，打 `/api/sheet/CraftLeve/1` 會 404
//   ——那不代表這張表不存在。要確認 sheet 存不存在，打 `/api/sheet` 拿全表清單。
// · `Leve.DataId` 就是 `CraftLeve` 的 row id，直接對得上。
//
// ── 刻意不收的東西 ──────────────────────────────────────────────────
// **HQ 交付的加成沒有收**。遊戲資料裡找不到那個倍率：`Leve.ExpFactor` 恆為 1，
// `LeveSystemDefine` 只是 UI 訊息常數。所以這份只放 `ExpReward`／`GilReward` 的原值，
// 頁面也不宣稱「HQ ×2」——**憑印象寫倍率，使用者會照著算錯整條練級規劃**。
//
// 採集理符與戰鬥理符不收（提案就砍掉了）：只留 ClassJobCategory 是八大製作職的。
//
// 執行（repo 根目錄）：
//   node scripts/build-craft-leves.mjs            # dry-run
//   node scripts/build-craft-leves.mjs --apply    # 寫入
//   node scripts/build-craft-leves.mjs --offline  # 只用快取

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

// ClassJobCategory.Name → 台服職業名。八大製作職才收。
const CRAFT_JOBS = {
  CRP: "刻木匠", BSM: "鍛鐵匠", ARM: "鑄甲匠", GSM: "雕金匠",
  LTW: "製革匠", WVR: "裁衣匠", ALC: "煉金術士", CUL: "烹調師",
};

async function main() {
  const leves = await xiv.sheet(
    "Leve",
    "ClassJobLevel,ExpReward,GilReward,AllowanceCost,DataId@as(raw),ClassJobCategory.Name",
    { limit: 500, cache: "out_data/cache/leve.json", offline, label: "  Leve：" }
  );
  const crafts = await xiv.sheet(
    "CraftLeve",
    "Item@as(raw),ItemCount,Leve@as(raw),Repeats",
    { limit: 500, cache: "out_data/cache/craft-leve.json", offline, label: "  CraftLeve：" }
  );

  const craftById = new Map(crafts.map((c) => [c.id, c.f]));
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const byId = new Map(items.map((i) => [i.id, i]));

  /* 交付物的配方 id 在建置期就帶上——製作模擬器的深連結吃 `#r=<recipeId>`，
     讓前端自己去 13,835 列的 craft-recipes.json 裡查太浪費。
     同一件可能有多個配方，取等級最低的（最好做的那個）。 */
  const cr = JSON.parse(await readFile(join(DATA, "craft-recipes.json"), "utf8"));
  const cix = {};
  cr.columns.forEach((k, i) => { cix[k] = i; });
  const recipeOf = new Map();
  for (const row of cr.data) {
    const itemId = row[cix.itemId], lvl = row[cix.lvl] || 0;
    const cur = recipeOf.get(itemId);
    if (!cur || lvl < cur.lvl) recipeOf.set(itemId, { id: row[cix.id], lvl });
  }
  const tw = await loadTwLocales();

  const out = [];
  const stat = { notCraft: 0, noData: 0, noTwName: 0, noItem: 0, noItemTw: 0 };

  for (const l of leves) {
    const cat = l.f.ClassJobCategory && l.f.ClassJobCategory.fields
      ? l.f.ClassJobCategory.fields.Name : null;
    const job = CRAFT_JOBS[cat];
    if (!job) { stat.notCraft++; continue; }

    const dataId = l.f["DataId@as(raw)"];
    const cl = dataId ? craftById.get(dataId) : null;
    if (!cl) { stat.noData++; continue; }

    // 台服理符名查不到＝台服未開放，整筆不收（鐵則）
    const name = twName(tw.leves, l.id);
    if (!isTw(name)) { stat.noTwName++; continue; }

    /* `Item`／`ItemCount` 是長度 4 的陣列（一張理符最多四種交付物），
       多數只用第一格。空格是 0，要濾掉——**不要用 length 判斷**。 */
    const ids = cl["Item@as(raw)"] || [];
    const counts = cl.ItemCount || [];
    const turnIn = [];
    ids.forEach((id, i) => {
      if (!id) return;
      const it = byId.get(id);
      if (!it) { stat.noItem++; return; }
      if (!isTw(it.name)) { stat.noItemTw++; return; }
      const rec = recipeOf.get(id);
      turnIn.push({
        itemId: id, name: it.name, count: counts[i] || 1,
        ...(rec ? { recipeId: rec.id } : {}),
      });
    });
    if (!turnIn.length) continue;

    out.push({
      id: l.id,
      name,
      job,
      level: l.f.ClassJobLevel || 0,
      exp: l.f.ExpReward || 0,
      gil: l.f.GilReward || 0,
      allowance: l.f.AllowanceCost || 1,
      repeats: cl.Repeats || 0,        // 0＝不可三倍交付；>0＝可以
      turnIn,
    });
  }

  out.sort((a, b) => a.level - b.level || a.job.localeCompare(b.job, "zh-Hant") || a.id - b.id);

  const byJob = {};
  for (const l of out) byJob[l.job] = (byJob[l.job] || 0) + 1;
  const lv = [...new Set(out.map((l) => l.level))].sort((a, b) => a - b);
  console.log(`\n收錄 ${out.length} 張製作理符`);
  console.log(`  各職業：${Object.entries(byJob).map(([j, n]) => `${j} ${n}`).join("、")}`);
  console.log(`  等級 ${lv[0]}–${lv[lv.length - 1]}，共 ${lv.length} 個等級檔`);
  console.log(`  可三倍交付 ${out.filter((l) => l.repeats > 0).length} 張`);
  const withRecipe = out.filter((l) => l.turnIn.every((t) => t.recipeId)).length;
  console.log(`  交付物都查得到配方 ${withRecipe}/${out.length} 張（模擬器深連結用）`);
  console.log(`  略過：非製作職 ${stat.notCraft}、無 CraftLeve ${stat.noData}、無台服理符名 ${stat.noTwName}`);
  if (stat.noItemTw || stat.noItem) console.log(`  交付物：無台服名 ${stat.noItemTw}、不在主庫 ${stat.noItem}`);
  console.log(`\n範例：\n  ${out.slice(0, 3).map((l) => `Lv${l.level} ${l.job}「${l.name}」→ ${l.turnIn.map((t) => t.name + "×" + t.count).join("、")}　EXP ${l.exp}／${l.gil}G／配額 ${l.allowance}`).join("\n  ")}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "craft-leves",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 Leve + CraftLeve ＋ data/items.json ＋ tw-locales.leves",
    note: "exp／gil 是遊戲資料的原值。**HQ 交付的加成倍率不在遊戲資料裡，本站不提供**（Leve.ExpFactor 恆為 1）。repeats > 0 代表可以三倍交付。",
    count: out.length,
    data: out,
  };
  await writeFile(join(DATA, "craft-leves.json"), JSON.stringify(db));
  console.log(`\n✓ data/craft-leves.json（${out.length} 張）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
