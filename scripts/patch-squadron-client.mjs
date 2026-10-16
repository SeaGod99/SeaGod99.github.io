// patch-squadron-client.mjs — data/squadron.json 的文字換成台服客戶端（取代 OpenCC 簡轉繁）
//
// 為什麼需要（2026-10-11，第三輪路線圖 §3 squadron-client-names）：build-squadron.mjs 內嵌的是簡中字串、
// 經 OpenCC 轉繁（違反「繁中名不用簡轉繁」鐵則）。台服客戶端解包每一類都有，以 row id 對：
//   mission            GcArmyExpedition.Name
//   training           GcArmyTraining.Name／Description
//   chemistry          GcArmyExpeditionTrait 第 11 欄（沒有欄名，loadTcSheet 的 keepUnnamed → _c10；
//                      「體能＋<Value>IntegerParameter(1)</Value>%」換成站上的 {value} 佔位）
//   chemistryCondition GcArmyExpeditionTraitCond 第 1 欄（沒有欄名 → _c0）
//   tactic             Status（以 statusId 對）的 Name／Description
//   memberGrowth       className＝台服官方職業名（data/official-terms.json，以 classAbbr 對）
//   recruit            name＝台服客戶端 ENpcResident（以 NPC id 對）
//   classChangeBook    name＝data/items.json（以 itemId 對）
// 客戶端那列不能用（空白、日文）就保留原值並列出來，不猜。對到的標 nameSource: "tw-client"。
// 冪等。執行：node scripts/patch-squadron-client.mjs [--apply] [--offline]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { cleanName, usable, clientNameMap } from "./lib/client-names.mjs";
import { jobName } from "./lib/official-terms.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data", "squadron.json");

/** 遊戲文字的標記：<Value>IntegerParameter(1)</Value> → {value}；其餘標記去掉 */
function gameText(s) {
  return cleanName(String(s || "").replace(/<Value>IntegerParameter\(1\)<\/Value>/g, "{value}").replace(/<[^>]+>/g, ""));
}

/** 就地改 db.data，回傳 { changes, kept } */
export async function applySquadronClient(db, { offline = false } = {}) {
  const sheet = async (n, keep = false) => new Map((await loadTcSheet(n, { offline, keepUnnamed: keep })).map((r) => [r.id, r]));
  const [exp, tr, trait, cond, status] = await Promise.all([
    sheet("GcArmyExpedition"), sheet("GcArmyTraining"), sheet("GcArmyExpeditionTrait", true),
    sheet("GcArmyExpeditionTraitCond", true), sheet("Status"),
  ]);
  const npc = await clientNameMap("npc", { offline });
  const items = new Map(JSON.parse(readFileSync(join(ROOT, "data", "items.json"), "utf8")).data.map((i) => [i.id, i.name]));
  const changes = [], kept = [];
  const set = (e, k, v, label) => {
    if (!usable(v)) { kept.push(`${label}.${k}：客戶端沒有可用的字（保留「${e[k]}」）`); return; }
    if (e[k] !== v) { changes.push(`${label}.${k}：${e[k]} → ${v}`); e[k] = v; }
    e.nameSource = "tw-client";
  };
  for (const e of db.data) {
    const label = `${e.kind}#${e.id ?? e.itemId}`;
    switch (e.kind) {
      case "mission": set(e, "name", gameText(exp.get(e.id)?.Name), label); break;
      case "training":
        set(e, "name", gameText(tr.get(e.id)?.Name), label);
        if (tr.get(e.id)?.Description) set(e, "desc", gameText(tr.get(e.id).Description), label);
        break;
      case "chemistry": set(e, "text", gameText(trait.get(e.id)?._c10), label); break;
      case "chemistryCondition": set(e, "text", gameText(cond.get(e.id)?._c0), label); break;
      case "tactic":
        set(e, "name", gameText(status.get(e.statusId)?.Name), label);
        if (status.get(e.statusId)?.Description) set(e, "desc", gameText(status.get(e.statusId).Description), label);
        break;
      case "memberGrowth": set(e, "className", jobName(e.classAbbr), label); break;
      case "recruit": { const n = npc.get(e.id); if (n) { if (e.name !== n) { changes.push(`${label}.name：${e.name} → ${n}`); e.name = n; } } else kept.push(`${label}.name：客戶端沒有（保留「${e.name}」）`); break; }
      case "classChangeBook": { const n = items.get(e.itemId); if (usable(n) && e.name !== n) { changes.push(`${label}.name：${e.name} → ${n}`); e.name = n; } break; }
    }
  }
  return { changes, kept };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const raw = readFileSync(FILE, "utf8");
  const db = JSON.parse(raw);
  const { changes, kept } = await applySquadronClient(db, { offline: process.argv.includes("--offline") });
  console.log(`squadron.json：改 ${changes.length} 處、客戶端沒有而保留 ${kept.length} 處`);
  for (const c of changes) console.log(`  ${c}`);
  for (const k of kept) console.log(`  ⚠ ${k}`);
  if (!apply) { console.log("（dry-run，未寫入；加 --apply 寫回）"); return; }
  db.updated = new Date().toISOString().slice(0, 10);
  db.source = String(db.source || "").includes("台服客戶端") ? db.source : `台服客戶端 GcArmy*／Status／ENpcResident＋${db.source || ""}`;
  await writeFile(FILE, raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
  console.log("✓ data/squadron.json");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
