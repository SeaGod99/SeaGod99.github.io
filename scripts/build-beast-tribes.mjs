// build-beast-tribes.mjs — 產生 data/beast-tribes.json（部族聲望階級與每日聲望）
//
// ── 部族名：台服客戶端解包的 BeastTribe（2026-10-10 起） ──────────────
// 2026-09-27 版本以「部族名沒有台服來源」為由改用貨幣道具名標示——那時只找了 Teamcraft tw/ 與 XIVAPI。
// **台服客戶端本身有**（thewakingsands/ffxiv-datamining-tc 的 BeastTribe：「蜥蜴人族：灰黨」「鳥人族：長風空力團」…）。
// 兩個要注意的地方：
//   · ⚠ **不要用 `tw-locales` 的 `tribes`**（＝Teamcraft `tw/tw-tribes.json`，16 筆）——那是
//     **玩家種族**（中原之民＝Midlander、高地之民＝Highlander），不是蠻族，而它的 row id 恰好與
//     `BeastTribe` 的前 16 列對得上，**照 id 接會全錯**（同 §4.10：接 id 之前先用名稱對一次）。
//   · 客戶端 CSV 的**欄名位移了一格**：名稱字串在標「Adjective」的欄、貨幣道具 id 在標「DisplayOrder」的欄、
//     友好度名在沒有欄名的最後一欄（`_c19`）；標「CurrencyItem」「Name」的欄是無關的數字。
//     所以建置時用**貨幣欄逐列對位**當斷言：客戶端該列的貨幣必須等於 XIVAPI 的 CurrencyItem，
//     任何一族對不上就中止——這同時證明沒有接到別張表。
// 台服未開放的部族（貨幣道具或部族名查不到台服名）整筆不收；第 0 列是空殼。
// 7.25 起多了第 19 族「輝鱗族：恆彩農園」（貨幣 青蕉幣）。
//
// ── 資料來源 ────────────────────────────────────────────────────────
//   XIVAPI v2 BeastTribe            貨幣道具、MaxRank、資料片、顯示順序
//   XIVAPI v2 BeastReputationRank   9 階的門檻（`RequiredReputation`）
//   XIVAPI v2 Quest                 `BeastTribe`／`ReputationReward`／`BeastReputationRank`
//                                   → **每個階級的任務各給多少聲望**（實測乾淨：
//                                   新部族一律 60、2.x 的四族是 10／14／20 隨階級升）
//   out_data/tw-locales.msgpack     `beastReputationRanks`（9/9 有台服名）、`exVersions`
//   out_data/tw-quests.json         任務台服名（510/566 有）
//
// ⚠ **`BeastTribe.MinLevel` 不是接取等級**（21 列裡 11 列是 0）。
// 真正的等級門檻取自該部族任務的 `ClassJobLevel` 最小值。
//
// ── 刻意不做 ────────────────────────────────────────────────────────
// **不寫「每天能接幾個」當成事實。** 那是遊戲規則（每日配額）而不是資料表裡的欄位，
// 所以做成前端的輸入欄（預設 3），頁面講明它不是查來的。
// 也**不做跨部族的配額最佳化**——提案自己就說「無最佳化空間」。
//
// 執行（repo 根目錄）：
//   node scripts/build-beast-tribes.mjs            # dry-run，印覆蓋率
//   node scripts/build-beast-tribes.mjs --apply    # 寫入
//   node scripts/build-beast-tribes.mjs --offline  # 只用快取

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { xiv } from "./lib/xivapi.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw } from "./lib/tw-text.mjs";
import { loadTcSheet } from "./lib/tc-datamining.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

async function main() {
  const tribes = await xiv.sheet(
    "BeastTribe",
    "CurrencyItem@as(raw),MaxRank,Expansion@as(raw),DisplayOrder,MinLevel",
    { limit: 100, cache: "out_data/cache/beast-tribe.json", offline, label: "  BeastTribe：" }
  );
  const ranksRaw = await xiv.sheet(
    "BeastReputationRank",
    "RequiredReputation",
    { limit: 50, cache: "out_data/cache/beast-rank.json", offline, label: "  Rank：" }
  );
  const quests = await xiv.sheet(
    "Quest",
    "BeastTribe@as(raw),ReputationReward,BeastReputationRank@as(raw),ClassJobLevel",
    { limit: 500, cache: "out_data/cache/quest-beast.json", offline, label: "  Quest：" }
  );

  const tw = await loadTwLocales();
  // 台服官方部族名（見檔頭：欄名位移，名稱在 Adjective、貨幣在 DisplayOrder、友好度名在 _c19）
  const tcTribe = new Map((await loadTcSheet("BeastTribe", { offline, keepUnnamed: true })).map((r) => [r.id, r]));
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const twQuests = JSON.parse(await readFile(join(ROOT, "out_data", "tw-quests.json"), "utf8"));
  const itemById = new Map(items.map((i) => [i.id, i]));

  // ── 9 階門檻 ────────────────────────────────────────
  /* ⚠ 第 8 階（盟友）的 `RequiredReputation` 是 0，因為它不是靠聲望累積解鎖的
     （要先做完盟友部族任務）。**照抄 0 會讓試算算出「立刻就到」**，
     所以把它標成 `req: null` 並在頁面上講明，不要讓 0 自己說話。 */
  const ranks = [];
  for (const r of ranksRaw) {
    const name = twName(tw.beastReputationRanks, r.id);
    if (!isTw(name)) continue;
    const req = r.f.RequiredReputation;
    ranks.push({ rank: r.id, name, req: req > 0 ? req : null });
  }
  ranks.sort((a, b) => a.rank - b.rank);

  // ── 每個部族每階的任務聲望 ──────────────────────────
  const byTribe = new Map();
  const stat = { quests: 0, questTw: 0 };
  for (const q of quests) {
    const t = q.f["BeastTribe@as(raw)"];
    if (!t || !q.f.ReputationReward) continue;
    stat.quests++;
    if (twQuests[q.id] && twQuests[q.id].tw) stat.questTw++;
    if (!byTribe.has(t)) byTribe.set(t, { rep: new Map(), lvs: [], n: 0 });
    const g = byTribe.get(t);
    g.n++;
    const rk = q.f["BeastReputationRank@as(raw)"] || 0;
    // 同一階的任務聲望值實測一致；不一致時取最小（不要高估進度）
    const cur = g.rep.get(rk);
    g.rep.set(rk, cur == null ? q.f.ReputationReward : Math.min(cur, q.f.ReputationReward));
    const lv = Array.isArray(q.f.ClassJobLevel)
      ? (q.f.ClassJobLevel.find((x) => x > 0) || 0) : (q.f.ClassJobLevel || 0);
    if (lv > 0) g.lvs.push(lv);
  }

  const out = [];
  const skipped = [];
  const misaligned = [];
  for (const t of tribes) {
    if (!t.id) continue;                                 // 第 0 列是空殼
    const curId = t.f["CurrencyItem@as(raw)"];
    const item = curId ? itemById.get(curId) : null;
    if (!item || !isTw(item.name)) { skipped.push(t.id + (item ? `（${item.name}）` : "")); continue; }
    const g = byTribe.get(t.id);
    if (!g || !g.rep.size) { skipped.push(t.id + "（沒有帶聲望的任務）"); continue; }
    // 官方部族名：客戶端同一列，先用貨幣欄對位（對不上＝接錯表或欄位又位移了）
    const c = tcTribe.get(t.id);
    if (!c || Number(c.DisplayOrder) !== curId) {
      misaligned.push(`${t.id}（XIVAPI 貨幣 ${curId}、客戶端 ${c ? c.DisplayOrder : "無此列"}）`);
      continue;
    }
    const name = (c.Adjective || "").trim();
    const relation = (c._c19 || "").trim();
    if (!isTw(name)) { skipped.push(t.id + "（客戶端沒有台服部族名）"); continue; }
    const rep = {};
    [...g.rep.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, v]) => { rep[k] = v; });
    out.push({
      id: t.id,
      name,                                               // 台服官方部族名（客戶端 BeastTribe，貨幣欄對位）
      relation: isTw(relation) ? relation : null,         // 友好度名（「蜥蜴人族友好度」）
      currency: { id: item.id, name: item.name, icon: item.icon || null },
      /* `MinLevel` 有 11 列是 0，不可信。等級門檻取該部族任務的最低 `ClassJobLevel`。 */
      level: g.lvs.length ? Math.min(...g.lvs) : null,
      maxRank: t.f.MaxRank || null,
      expansion: twName(tw.exVersions, t.f["Expansion@as(raw)"]) || null,
      order: t.f.DisplayOrder || 0,
      quests: g.n,
      rep,
    });
  }
  if (misaligned.length) {
    throw new Error(`客戶端 BeastTribe 與 XIVAPI 的貨幣對不上 ${misaligned.length} 族：${misaligned.join("、")}——` +
      "欄位可能又位移了，或接到了別張表，中止不寫入");
  }
  out.sort((a, b) => (a.level || 0) - (b.level || 0) || a.id - b.id);

  console.log(`\n部族 ${out.length} 個（略過 ${skipped.length}：${skipped.join("、")}）`);
  console.log(`  階級 ${ranks.length} 階（台服名 ${ranks.length}/9）：${ranks.map((r) => `${r.name}${r.req == null ? "(無門檻)" : " " + r.req}`).join("、")}`);
  console.log(`  帶聲望的任務 ${stat.quests} 個（有台服名 ${stat.questTw}）`);
  console.log("\n各部族：");
  for (const t of out) {
    const reps = Object.entries(t.rep).map(([k, v]) => `階${k}:${v}`).join(" ");
    console.log(`  ${t.name}｜${t.currency.name.padEnd(8)} Lv${String(t.level).padEnd(3)} ${t.expansion || "?"} 上限階${t.maxRank}　${t.quests} 個任務　${reps}`);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "beast-tribes",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 BeastTribe／BeastReputationRank／Quest ＋ 台服客戶端解包 BeastTribe（部族名、友好度名）＋ tw-locales(beastReputationRanks, exVersions) ＋ items.json（貨幣道具名）",
    note: "部族名取自台服客戶端解包的 BeastTribe（thewakingsands/ffxiv-datamining-tc），建置時以貨幣欄逐列對位證明 row 對得上；**不是** tw-locales 的 tribes（那是玩家種族）。`rep` 是「該階級的任務每個給多少聲望」。第 8 階（盟友）的門檻寫 null——它不是靠聲望累積解鎖的，照抄 0 會算出「立刻就到」。**每天能接幾個不在資料裡**（那是遊戲配額規則），由前端當輸入。",
    count: out.length,
    ranks,
    data: out,
  };
  await writeFile(join(DATA, "beast-tribes.json"), JSON.stringify(db));
  console.log(`\n✓ data/beast-tribes.json（${out.length} 個部族／${ranks.length} 階）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
