// patch-tw-renames.mjs — 台服官方改譯（地名、任務、怪物、NPC…）同步到「沒有走共用名表」的欄位
//
// 為什麼需要（2026-11-17，升台服 7.3）：Teamcraft 先出了台服 7.3、客戶端解包還停在 7.25，lib/client-names.mjs
// 的 clientNameMap() 會把 Teamcraft 這次才改的字疊上去（交匯河→交會河、札哈克→達哈卡、陸行鳥欄管理員→陸行鳥廄管理員、
// 向著永護塔頂層進發→前進永護塔頂層…）。走共用名表的建置腳本會自己跟上，但有幾份資料的名字是早年建好、
// 之後沒有建置腳本重產的（釣場名、探索筆記、風脈泉的任務名、青魔法的取得方式文字），它們就留著舊字。
//
// 對照表每次都由 clientNameMap() 重新推導（每一筆都有 id：客戶端那一列的字 → Teamcraft 推這一版時才改成的字），
// 不靠手寫。兩道護欄：
//   ① 同一個舊名對到兩個以上新名的不收（不猜）
//   ② 舊名仍是同種類別另一個 id 的現役名的不收（那個字串可能在說那一個）
// **不做子字串替換**（同 patch-npc-renames.mjs 的理由：「船頭」是 NPC 舊名、也是官方地名「船頭小屋」的一段）。只認：
//   字串整串等於舊名；或以空白／全形空白／頓號／斜線分隔出來的某一段整段等於舊名（取得方式文字「…《尖牙利齒的怪物》 暗黑札哈克」）。
// 不碰：`aliases`（刻意留著舊名讓搜尋找得到）、`nameTc`、英日文欄位（*En／*Ja）。
// 不掃：建置時就走共用名表的分片目錄（term-names／action-names／item-names／quests／npc-shops／item-sources／
//   leveling-gear／action-codex）與 site-index.json（重跑 build-site-index.mjs 就跟上）。
//
// 執行：node scripts/patch-tw-renames.mjs [--apply] [--offline]
// 跑完：node scripts/build-site-index.mjs --apply → minify-data／sync-meta

import { readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clientNameMap, aheadStatsOf, teamcraftAhead } from "./lib/client-names.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const APPLY = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");
const KINDS = ["place", "quest", "mob", "npc", "fate", "leve", "eventItem", "status", "action"];
const SKIP_FILES = new Set(["site-index.json", "_meta.json"]);
const SKIP_KEYS = (k) => k === "aliases" || k === "nameTc" || /(En|Ja)$/.test(k);
const SEP = /([ 　、／/])/;

if (!teamcraftAhead) { console.log("客戶端解包沒有落後（台服版本清單最後一筆是 client 來源），沒有要同步的改譯。"); process.exit(0); }

/* 對照表：舊名 → 新名（過三道護欄）
   ③ 舊名仍是**任何類別**（含物品名）的現役名的不收——怪物「水道蜥蜴」7.3 改成「水道巨蜥」，同名的寵物道具卻還叫
      「水道蜥蜴」，只看同類別會把物品表、寵物頁一起改錯（2026-11-17 預演抓到） */
const rename = new Map(), dropped = [];
const maps = new Map();
for (const kind of KINDS) maps.set(kind, await clientNameMap(kind, { offline }));
const allCurrent = new Set(JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data.map((i) => i.name));
for (const m of maps.values()) for (const n of m.values()) allCurrent.add(n);
for (const kind of KINDS) {
  const m = maps.get(kind);
  const st = aheadStatsOf(m);
  if (!st?.renames?.length) continue;
  const cand = new Map();
  for (const [, old, neu] of st.renames) { if (!cand.has(old)) cand.set(old, new Set()); cand.get(old).add(neu); }
  for (const [old, set] of cand) {
    if (set.size > 1) { dropped.push(`${kind}「${old}」→ ${[...set].join("／")}（對到多個新名）`); continue; }
    if (allCurrent.has(old)) { dropped.push(`${kind}「${old}」（仍是某一列的現役名，可能在說那一個）`); continue; }
    const neu = [...set][0];
    if (rename.has(old) && rename.get(old) !== neu) { dropped.push(`「${old}」（不同類別改成不同字）`); rename.delete(old); continue; }
    rename.set(old, neu);
  }
}
console.log(`台服 ${teamcraftAhead.version} 改譯對照：${rename.size} 筆（護欄擋下 ${dropped.length}）`);
for (const d of dropped.slice(0, 10)) console.log(`  略過 ${d}`);

function fix(s) {
  if (rename.has(s)) return rename.get(s);
  if (!SEP.test(s)) return s;
  const parts = s.split(SEP);
  let hit = false;
  for (let i = 0; i < parts.length; i += 2) if (rename.has(parts[i])) { parts[i] = rename.get(parts[i]); hit = true; }
  return hit ? parts.join("") : s;
}

let total = 0;
// *-tc.json 是社群站的原始快照（建置輸入），保持原樣
for (const f of readdirSync(DATA).filter((x) => x.endsWith(".json") && !SKIP_FILES.has(x) && !x.endsWith("-tc.json")).sort()) {
  const raw = readFileSync(join(DATA, f), "utf8");
  if (![...rename.keys()].some((o) => raw.includes(o))) continue;
  const db = JSON.parse(raw);
  const changes = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { if (typeof v[i] === "string") { const n = fix(v[i]); if (n !== v[i]) { changes.push(`${path}[]：${v[i]} → ${n}`); v[i] = n; } } else walk(v[i], path + "[]"); } return; }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (SKIP_KEYS(k)) continue;
      if (typeof x === "string") { const n = fix(x); if (n !== x) { changes.push(`${path}.${k}：${x} → ${n}`); v[k] = n; } }
      else walk(x, /^\d+$/.test(k) ? path + ".<id>" : `${path}.${k}`);
    }
  };
  walk(db, "");
  if (!changes.length) continue;
  total += changes.length;
  console.log(`${f.padEnd(24)} ${changes.length} 處`);
  for (const c of changes.slice(0, 6)) console.log(`    ${c}`);
  if (changes.length > 6) console.log(`    …另 ${changes.length - 6} 處`);
  if (APPLY) await writeFile(join(DATA, f), raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
}
console.log(`\n共 ${total} 處` + (APPLY ? "，✓ 已寫入" : "（dry-run，未寫入；加 --apply 套用）"));
