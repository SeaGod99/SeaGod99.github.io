// build-submarine.mjs — 產生 data/submarine.json（潛水艇部件與航點）
//
// ── 部件：Slot 編號不可用位置猜 ──────────────────────────────────────
// `SubmarinePart` 只有 `Slot`（0–3），沒有名字。名字在道具上，關聯是
// **`Item.AdditionalData` = SubmarinePart 的 row id**（同幻卡那條可證的關聯，§4.10 的教訓）。
//
// 實測 Slot 編號與道具順序**完全不一致**——照 id 順序猜會四個全錯：
//   鯊魚級船首(21792) → Part 1 → Slot **2**
//   鯊魚級艦橋(21793) → Part 2 → Slot **3**
//   鯊魚級船體(21794) → Part 3 → Slot **0**
//   鯊魚級船尾(21795) → Part 4 → Slot **1**
// 所以部位名一律取自**道具分類**（`潛水艇組件（船首）` 這種台服官方分類），不碰 Slot 編號。
//
// ── 航點：只收資料裡有的，不算多點航程 ──────────────────────────────
// 每個航點自己的 `CeruleumTankReq`／`SurveyDistance`／`SurveyDurationmin`／`ExpReward`
// 都在表裡。但**「勾五個點跑一趟要幾桶」的公式不在遊戲資料裡**——
// 那牽涉點與點之間的距離與航行規則。**憑印象寫出來的桶數會讓人派出去回不來**，
// 所以這份不提供多點航程試算，頁面也講明。
//
// 台服航點名走 `tw-locales.submarineVoyages`（123 筆）；查不到的整筆不收（鐵則）。
//
// 執行（repo 根目錄）：
//   node scripts/build-submarine.mjs            # dry-run
//   node scripts/build-submarine.mjs --apply    # 寫入
//   node scripts/build-submarine.mjs --offline  # 只用快取

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
  const parts = await xiv.sheet(
    "SubmarinePart",
    "Class,Rank,Slot,Speed,Range,Surveillance,Retrieval,Favor",
    { limit: 200, cache: "out_data/cache/sub-part.json", offline, label: "  Part：" }
  );
  const expl = await xiv.sheet(
    "SubmarineExploration",
    "Destination,Location,RankReq,CeruleumTankReq,SurveyDistance,SurveyDurationmin,ExpReward,Stars,StartingPoint",
    { limit: 500, cache: "out_data/cache/sub-exploration.json", offline, label: "  Ex：" }
  );
  const ranks = await xiv.sheet(
    "SubmarineRank",
    "Capacity,ExpToNext,SurveillanceBonus,RetrievalBonus,SpeedBonus,RangeBonus,FavorBonus",
    { limit: 200, cache: "out_data/cache/sub-rank.json", offline, label: "  Rank：" }
  );

  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const tw = await loadTwLocales();

  /* 道具 → 部件。`AdditionalData` 是 SubmarinePart 的 row id。
     部位名取自道具分類（台服官方），**不從 Slot 編號推**。 */
  const partById = new Map(parts.map((p) => [p.id, p.f]));
  const partItems = items.filter((i) => /^潛水艇組件（/.test(i.category || ""));
  const slotOf = (cat) => (/（(.+?)）/.exec(cat) || [])[1] || null;

  // AdditionalData 不在 items.json 裡，另抓一次（只抓這 40 件）
  const addl = await xiv.rows(
    "Item",
    partItems.map((i) => i.id),
    "AdditionalData@as(raw)",
    { chunk: 50, cache: "out_data/cache/sub-part-items.json", offline, label: "  部件道具：" }
  );

  const outParts = [];
  const stat = { noLink: [], noTw: 0 };
  for (const it of partItems) {
    if (!isTw(it.name)) { stat.noTw++; continue; }
    const row = addl.get(it.id);
    const pid = row ? row["AdditionalData@as(raw)"] : null;
    const p = pid ? partById.get(pid) : null;
    if (!p) { stat.noLink.push(it.name); continue; }
    outParts.push({
      itemId: it.id, name: it.name, slot: slotOf(it.category),
      partId: pid, class: p.Class, rank: p.Rank,
      speed: p.Speed, range: p.Range,
      surveillance: p.Surveillance, retrieval: p.Retrieval, favor: p.Favor,
      marketable: !!it.marketable,
    });
  }
  outParts.sort((a, b) => a.class - b.class || a.itemId - b.itemId);

  // 航點
  const outDest = [];
  const dstat = { noTw: 0, noName: 0 };
  for (const e of expl) {
    if (!e.f.Destination) { dstat.noName++; continue; }
    const name = twName(tw.submarineVoyages, e.id);
    if (!isTw(name)) { dstat.noTw++; continue; }   // 台服未開放＝整筆不收
    outDest.push({
      id: e.id, name,
      sector: e.f.Location || null,
      rankReq: e.f.RankReq || 0,
      tanks: e.f.CeruleumTankReq || 0,
      distance: e.f.SurveyDistance || 0,
      minutes: e.f.SurveyDurationmin || 0,
      exp: e.f.ExpReward || 0,
      stars: e.f.Stars || 0,
    });
  }
  outDest.sort((a, b) => a.rankReq - b.rankReq || a.id - b.id);

  const outRanks = ranks
    .filter((r) => r.f.Capacity > 0 || r.f.ExpToNext > 0)
    .map((r) => ({
      rank: r.id, capacity: r.f.Capacity || 0, expToNext: r.f.ExpToNext || 0,
      speed: r.f.SpeedBonus || 0, range: r.f.RangeBonus || 0,
      surveillance: r.f.SurveillanceBonus || 0, retrieval: r.f.RetrievalBonus || 0,
      favor: r.f.FavorBonus || 0,
    }));

  const slots = {};
  for (const p of outParts) slots[p.slot] = (slots[p.slot] || 0) + 1;
  console.log(`\n部件 ${outParts.length} 件：${Object.entries(slots).map(([s, n]) => `${s} ${n}`).join("、")}`);
  if (stat.noLink.length) console.log(`  ⚠ 對不到 SubmarinePart 的 ${stat.noLink.length} 件：${stat.noLink.slice(0, 4).join("、")}`);
  console.log(`  ⚠ Slot 編號與部位名的對應（證明不能用位置猜）：`);
  const proof = {};
  for (const p of outParts.filter((x) => x.class === outParts[0].class)) proof[p.slot] = p.partId;
  console.log(`     ${outParts.filter((x) => x.class === outParts[0].class).map((p) => `${p.slot}→Part${p.partId}(Slot ${partById.get(p.partId).Slot})`).join("、")}`);
  console.log(`\n航點 ${outDest.length} 個（略過：無台服名 ${dstat.noTw}、無英文名 ${dstat.noName}）`);
  console.log(`  Rank 需求 ${outDest[0].rankReq}–${outDest[outDest.length - 1].rankReq}、桶數 ${[...new Set(outDest.map((d) => d.tanks))].sort().join("／")}`);
  const sectors = [...new Set(outDest.map((d) => d.sector))].filter(Boolean);
  console.log(`  海域代號 ${sectors.length} 個：${sectors.slice(0, 12).join("")}${sectors.length > 12 ? "…" : ""}`);
  console.log(`  階級表 ${outRanks.length} 階`);
  console.log(`\n航點樣本：\n  ${outDest.slice(0, 4).map((d) => `${d.name}　Rank${d.rankReq}・${d.tanks}桶・${d.minutes}分・EXP ${d.exp}`).join("\n  ")}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "submarine",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 SubmarinePart／SubmarineExploration／SubmarineRank ＋ data/items.json ＋ tw-locales.submarineVoyages",
    note: "部件的部位名取自道具分類（台服官方），**不是從 SubmarinePart.Slot 推的**——Slot 編號與道具順序不一致。航點只有各點自己的桶數與時間；**多點航程要幾桶的公式不在遊戲資料裡，本站不提供**。",
    counts: { parts: outParts.length, destinations: outDest.length, ranks: outRanks.length },
    parts: outParts,
    destinations: outDest,
    ranks: outRanks,
  };
  await writeFile(join(DATA, "submarine.json"), JSON.stringify(db));
  console.log(`\n✓ data/submarine.json（部件 ${outParts.length}／航點 ${outDest.length}／階級 ${outRanks.length}）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
