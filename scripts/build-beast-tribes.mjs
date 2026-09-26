// build-beast-tribes.mjs — 產生 data/beast-tribes.json（部族聲望階級與每日聲望）
//
// ── 部族名沒有台服來源，所以**用貨幣道具名當識別** ───────────────────
// 找過三條路，全部不通：
//   · `tw-locales` 的 `tribes`（＝Teamcraft `tw/tw-tribes.json`，16 筆）是
//     **玩家種族**（中原之民＝Midlander、高地之民＝Highlander），不是蠻族。
//     ⚠ 它的 row id 恰好與 `BeastTribe` 的前 16 列對得上，**照 id 接會全錯**
//     （同 §4.10：接 id 之前先用名稱對一次）。
//   · Teamcraft 沒有 `tw-beast-tribes.json`（404）。
//   · `BeastTribe.IntersocietalQuest` 是**整個資料片共用**的盟友任務
//     （蒼天三族都指向「伊修加爾德的盟友們」），不是部族名。
// 所以每個部族以**貨幣道具的台服名**（旅翼幣、星鈷幣…）＋資料片＋等級標示。
// 那是官方道具名，不是俗稱，也不必猜。**18/21 有台服名**，另兩個（Mamool Ja／
// Yok Huy）的貨幣查不到繁中名＝台服未開放，整筆不收；第 0 列是空殼。
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
  for (const t of tribes) {
    if (!t.id) continue;                                 // 第 0 列是空殼
    const curId = t.f["CurrencyItem@as(raw)"];
    const item = curId ? itemById.get(curId) : null;
    if (!item || !isTw(item.name)) { skipped.push(t.id + (item ? `（${item.name}）` : "")); continue; }
    const g = byTribe.get(t.id);
    if (!g || !g.rep.size) { skipped.push(t.id + "（沒有帶聲望的任務）"); continue; }
    const rep = {};
    [...g.rep.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, v]) => { rep[k] = v; });
    out.push({
      id: t.id,
      // 識別靠貨幣道具名（官方道具名），不是部族名——後者沒有台服來源
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
  out.sort((a, b) => (a.level || 0) - (b.level || 0) || a.id - b.id);

  console.log(`\n部族 ${out.length} 個（略過 ${skipped.length}：${skipped.join("、")}）`);
  console.log(`  階級 ${ranks.length} 階（台服名 ${ranks.length}/9）：${ranks.map((r) => `${r.name}${r.req == null ? "(無門檻)" : " " + r.req}`).join("、")}`);
  console.log(`  帶聲望的任務 ${stat.quests} 個（有台服名 ${stat.questTw}）`);
  console.log("\n各部族：");
  for (const t of out) {
    const reps = Object.entries(t.rep).map(([k, v]) => `階${k}:${v}`).join(" ");
    console.log(`  ${t.currency.name.padEnd(8)} Lv${String(t.level).padEnd(3)} ${t.expansion || "?"} 上限階${t.maxRank}　${t.quests} 個任務　${reps}`);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "beast-tribes",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 BeastTribe／BeastReputationRank／Quest ＋ tw-locales(beastReputationRanks, exVersions) ＋ items.json（貨幣道具名）",
    note: "部族名沒有台服來源（tw-locales 的 tribes 是玩家種族、Teamcraft 沒有 tw-beast-tribes、IntersocietalQuest 是整個資料片共用），所以每個部族以**貨幣道具的台服名**標示。`rep` 是「該階級的任務每個給多少聲望」。第 8 階（盟友）的門檻寫 null——它不是靠聲望累積解鎖的，照抄 0 會算出「立刻就到」。**每天能接幾個不在資料裡**（那是遊戲配額規則），由前端當輸入。",
    count: out.length,
    ranks,
    data: out,
  };
  await writeFile(join(DATA, "beast-tribes.json"), JSON.stringify(db));
  console.log(`\n✓ data/beast-tribes.json（${out.length} 個部族／${ranks.length} 階）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
