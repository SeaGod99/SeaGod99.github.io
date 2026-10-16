// build-fc-workshop.mjs — 部隊工房（潛水艇／飛空艇部件、房屋外牆、乙太轉輪…）的建造材料 → data/fc-workshop.json
//
// 第三輪路線圖 §5 fc-workshop-materials（2026-10-11）：先不開新頁，在潛水艇頁的部件旁展開「建造材料」。
// 巴哈有玩家共編的試算表被抓出算錯（snA=29169），遊戲內的工房介面一次只看得到一個階段。
//
// 資料（台服客戶端解包，以 row id 串）：
//   CompanyCraftSequence  成品 ResultItem、部位 CompanyCraftPart[0..7]、類型 CompanyCraftType（→ .Name 台服名）
//   CompanyCraftPart      三個階段 CompanyCraftProcess[0..2]
//   CompanyCraftProcess   SupplyItem[0..11] × SetQuantity[i] × SetsRequired[i]（一次交 SetQuantity 個、要交 SetsRequired 次）
//   CompanyCraftSupplyItem.Item → 素材的道具 id；名稱取 data/items.json（台服名）
// ⚠ 數量的語意（SetQuantity × SetsRequired）只能由欄名推定，錯了會是整張表安靜地錯。2026-10-11 拿 Teamcraft 的
//   部隊製作偽配方（data/recipes.json 的 jobId 0，fc1…）**全量交叉核對 162/162 一致**；這支每次建置都重跑這個核對，
//   對不上就中止。遊戲內抽查仍建議做一次（知識庫 §4.98 的「用之前先驗」）。
// 素材本身能不能做：data/recipes.json（jobId 8–15）有配方的記 craftable——市場頁的製作清單會往下展開配方樹；
//   沒有配方的（多半是採集品、商店品）前端講明「要另外取得」。
// **成品或任何素材查不到台服名的整筆不收**（台服未開放＝不顯示）。
//
// 執行：node scripts/build-fc-workshop.mjs [--apply] [--offline]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { cleanName, usable } from "./lib/client-names.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "fc-workshop.json");
const APPLY = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

async function main() {
  const REQUIRE = {
    CompanyCraftSequence: ["ResultItem", "CompanyCraftType", "CompanyCraftPart[0]"],
    CompanyCraftPart: ["CompanyCraftProcess[0]", "CompanyCraftProcess[2]"],
    CompanyCraftProcess: ["SupplyItem[0]", "SetQuantity[0]", "SetsRequired[0]", "SupplyItem[11]"],
    CompanyCraftSupplyItem: ["Item"], CompanyCraftType: ["Name"],
  };
  const sheet = async (n) => new Map((await loadTcSheet(n, { offline, keepUnnamed: true, require: REQUIRE[n] })).map((r) => [r.id, r]));
  const [seq, part, proc, sup, type] = await Promise.all(
    ["CompanyCraftSequence", "CompanyCraftPart", "CompanyCraftProcess", "CompanyCraftSupplyItem", "CompanyCraftType"].map(sheet));
  const items = new Map(JSON.parse(readFileSync(join(ROOT, "data", "items.json"), "utf8")).data.map((i) => [i.id, i]));
  const recipes = JSON.parse(readFileSync(join(ROOT, "data", "recipes.json"), "utf8")).data;
  const craftable = new Set(recipes.filter((r) => r.jobId >= 8 && r.jobId <= 15).map((r) => r.itemId));
  const tcFc = new Map();
  for (const r of recipes.filter((x) => x.jobId === 0)) { if (!tcFc.has(r.itemId)) tcFc.set(r.itemId, []); tcFc.get(r.itemId).push(r); }

  const data = [], skipped = [];
  let crossOk = 0;
  const crossBad = [];
  for (const s of seq.values()) {
    const result = Number(s.ResultItem);
    if (!result) continue;
    const it = items.get(result);
    if (!it || !usable(it.name)) { skipped.push(`${s.id}（成品 ${result} 沒有台服名）`); continue; }
    const phases = [];
    const total = new Map();
    let missing = null;
    for (let i = 0; i < 8; i++) {
      const pid = Number(s[`CompanyCraftPart[${i}]`]);
      const p = pid ? part.get(pid) : null;
      if (!p) continue;
      for (let j = 0; j < 3; j++) {
        const pr = proc.get(Number(p[`CompanyCraftProcess[${j}]`]));
        if (!pr) continue;
        const mats = [];
        for (let k = 0; k < 12; k++) {
          const si = Number(pr[`SupplyItem[${k}]`]);
          if (!si) continue;
          const mid = Number(sup.get(si)?.Item);
          const m = items.get(mid);
          if (!m || !usable(m.name)) { missing = mid; break; }
          const per = Number(pr[`SetQuantity[${k}]`]), sets = Number(pr[`SetsRequired[${k}]`]);
          mats.push({ itemId: mid, name: m.name, per, sets, qty: per * sets, ...(craftable.has(mid) ? { craftable: true } : {}) });
          total.set(mid, (total.get(mid) || 0) + per * sets);
        }
        if (missing) break;
        phases.push({ part: i + 1, phase: j + 1, mats });
      }
      if (missing) break;
    }
    if (missing) { skipped.push(`${s.id} ${it.name}（素材 ${missing} 沒有台服名）`); continue; }
    // 與 Teamcraft 的部隊製作偽配方交叉核對（數量語意的唯一外部驗證）
    const tcs = tcFc.get(result) || [];
    const ok = tcs.some((tc) => {
      const t = new Map();
      for (const g of tc.ingredients) t.set(g.itemId, (t.get(g.itemId) || 0) + g.qty);
      return t.size === total.size && [...total].every(([k, v]) => t.get(k) === v);
    });
    if (ok) crossOk++; else crossBad.push(`${s.id} ${it.name}`);
    data.push({
      id: s.id, itemId: result, name: it.name, type: cleanName(type.get(Number(s.CompanyCraftType))?.Name) || null,
      phases, total: [...total].map(([itemId, qty]) => ({ itemId, qty })),
    });
  }
  console.log(`部隊工房成品 ${data.length} 件（略過 ${skipped.length}）；與 Teamcraft 交叉核對 ${crossOk}/${data.length}`);
  const byType = {};
  for (const d of data) byType[d.type] = (byType[d.type] || 0) + 1;
  console.log("  類型：" + Object.entries(byType).map(([k, v]) => `${k} ${v}`).join("、"));
  if (skipped.length) console.log("  略過：" + skipped.slice(0, 6).join("、") + (skipped.length > 6 ? "…" : ""));
  if (crossBad.length) {
    console.error(`✗ ${crossBad.length} 件與 Teamcraft 的數量對不上（${crossBad.slice(0, 5).join("、")}）——數量語意可能變了，中止不出檔`);
    process.exit(1);
  }
  if (!APPLY) { console.log("（dry-run，未寫入；加 --apply 寫 data/fc-workshop.json）"); return; }
  const out = {
    schema: "fc-workshop", updated: new Date().toISOString().slice(0, 10),
    source: "台服客戶端 CompanyCraftSequence／Part／Process／SupplyItem／Type ＋ data/items.json（名稱）＋ data/recipes.json（素材能不能做；jobId 0 交叉核對數量）",
    note: "qty＝per（一次交幾個）× sets（要交幾次）；phases[].part＝第幾個部位（多數成品只有 1 個）、phase＝第幾階段（1–3）",
    count: data.length, data,
  };
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log("✓ data/fc-workshop.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
