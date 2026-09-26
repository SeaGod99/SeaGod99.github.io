// build-materia.mjs — 產生 data/materia.json（魔晶石與禁忌鑲嵌成功率）
//
// ── 成功率表用哪一張 ────────────────────────────────────────────────
// XIVAPI 有兩張長得很像的表，**選錯會整個對不上**：
//   `MateriaJoinRate`  10 列 —— 列數與魔晶石階級（12 階）對不起來，無法安全對應
//   `MateriaGrade`     12 列 —— **正好一階一列**，且另帶 `MeldFee`（每次鑲嵌的金幣費用）
// 用後者，`row_id + 1` 就是階級。禁忌鑲嵌的四個孔位成功率直接在
// `OvermeldHQPercent`／`OvermeldNQPercent`（HQ／NQ 指的是**裝備**是不是 HQ）。
//
// 資料本身就解釋了「為什麼雙數階只能鑲第一孔」：
//   階 5／7／9／11 → [17,10,7,5]（四孔都能鑲）
//   階 6／8／10／12 → [17,0,0,0]（只有第一孔，其餘是 0）
// **不要自己寫這條規則**，讓 0 自己說話。
//
// ── 刻意不收的欄位 ──────────────────────────────────────────────────
// `MateriaGrade.ReturnRate`（100／80／40）意義查不出來——可能是精製返還率，
// 也可能是別的。**查不出來就不顯示**，不要憑猜測給使用者一個數字。
//
// ── 台服名 ───────────────────────────────────────────────────────────
// 屬性名走 `tw-locales` 的 `baseParams`（力量／暴擊／加工精度…），
// 魔晶石道具名走 `items.json`。任一查不到就整筆不收（鐵則）。
//
// 執行（repo 根目錄）：
//   node scripts/build-materia.mjs            # dry-run
//   node scripts/build-materia.mjs --apply    # 寫入
//   node scripts/build-materia.mjs --offline  # 只用快取

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
  const grades = await xiv.sheet(
    "MateriaGrade",
    "OvermeldHQPercent,OvermeldNQPercent,MeldFee",
    { limit: 50, cache: "out_data/cache/materia-grade.json", offline, label: "  MateriaGrade：" }
  );
  const mats = await xiv.sheet(
    "Materia",
    "Item@as(raw),Value,BaseParam@as(raw)",
    { limit: 100, cache: "out_data/cache/materia.json", offline, label: "  Materia：" }
  );

  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const byId = new Map(items.map((i) => [i.id, i]));
  const tw = await loadTwLocales();

  // 階級表：row_id + 1 = 階級
  const tiers = grades
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((g) => ({
      grade: g.id + 1,
      hq: g.f.OvermeldHQPercent,
      nq: g.f.OvermeldNQPercent,
      fee: g.f.MeldFee,
    }));

  const stats = [];
  const stat = { noStatTw: [], noItemTw: 0, cells: 0 };

  for (const m of mats) {
    const bp = m.f["BaseParam@as(raw)"];
    if (!bp) continue;                                   // 0 = 佔位列
    const statName = twName(tw.baseParams, bp);
    if (!isTw(statName) && !/^[A-Za-z]/.test(statName || "")) {
      // HP／MP／CP／GP 這類拉丁字串是台服真的這樣顯示的（知識庫 §4.72），要放行
      if (statName == null) { stat.noStatTw.push(bp); continue; }
    }
    if (!statName) { stat.noStatTw.push(bp); continue; }

    const ids = m.f["Item@as(raw)"] || [];
    const vals = m.f.Value || [];
    const gs = [];
    ids.forEach((id, gi) => {
      if (!id) return;
      stat.cells++;
      const it = byId.get(id);
      if (!it || !isTw(it.name)) { stat.noItemTw++; return; }  // 台服未開放＝整筆不收
      gs.push({
        g: gi + 1,
        itemId: id,
        name: it.name,
        value: vals[gi] || 0,
        marketable: !!it.marketable,
      });
    });
    if (!gs.length) continue;
    stats.push({ baseParam: bp, stat: statName, grades: gs });
  }

  stats.sort((a, b) => a.baseParam - b.baseParam);

  const totalGrades = stats.reduce((n, s) => n + s.grades.length, 0);
  console.log(`\n階級表 ${tiers.length} 階（row_id + 1 = 階級）`);
  console.log(`  只能鑲第一孔的階（其餘孔位是 0）：${tiers.filter((t) => t.hq[1] === 0).map((t) => t.grade).join("、")}`);
  console.log(`  鑲嵌費用：階 1 ${tiers[0].fee}G → 階 ${tiers.length} ${tiers[tiers.length - 1].fee}G`);
  console.log(`\n屬性 ${stats.length} 種／魔晶石 ${totalGrades} 件（共 ${stat.cells} 格）`);
  console.log(`  可交易 ${stats.reduce((n, s) => n + s.grades.filter((g) => g.marketable).length, 0)} 件`);
  console.log(`  台服未開放而跳過 ${stat.noItemTw} 件${stat.noStatTw.length ? `；屬性無台服名 ${stat.noStatTw.length} 種` : ""}`);
  const top = stats.filter((s) => s.grades.some((g) => g.g >= 11));
  console.log(`  有 11／12 階的屬性 ${top.length} 種：${top.slice(0, 6).map((s) => s.stat).join("、")}${top.length > 6 ? "…" : ""}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "materia",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 MateriaGrade + Materia ＋ data/items.json ＋ tw-locales.baseParams",
    note: "tiers[].hq/nq 是禁忌鑲嵌四個孔位的成功率（%），HQ／NQ 指裝備是不是 HQ；0 代表該階不能鑲那個孔。fee 是每次嘗試的金幣費用。",
    count: stats.length,
    tiers,
    data: stats,
  };
  await writeFile(join(DATA, "materia.json"), JSON.stringify(db));
  console.log(`\n✓ data/materia.json（${stats.length} 種屬性／${totalGrades} 件魔晶石）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
