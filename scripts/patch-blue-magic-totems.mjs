// 補 blue-magic 14 筆特殊習得來源（非怪物習得 → learnFrom 原本為空）
//
// 來源確認：ffxiv.consolegameswiki.com Blue Magic Spellbook。
// 這 14 筆皆為「瓦哈拉吉圖騰」(Whalaqee Totem) 向異男子嘎希加（烏爾達哈）兌換，
// 條件為「習得 N 個青魔法 / 通關狩魔競技場 N 關 / 青魔等級達 N」；水炮為職業初始法術。
// Force Field 另可由「無瑕靈君殲滅戰」(dungeons id 666) 取得。
//
// 只填 learnFrom 與 learnFromMob 皆空者（不覆蓋既有）。
// 執行：node scripts/patch-blue-magic-totems.mjs [--apply]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "data", "blue-magic.json");
const APPLY = process.argv.includes("--apply");

const NPC = "異男子嘎希加";
const LOC = "烏爾達哈";
const totem = (cond) => ({ type: "圖騰", detail: `${NPC}（${LOC}）兌換・${cond}`, npc: NPC, npcLocation: LOC });

// key = 手帳編號 no
const FIX = {
  1: [{ type: "預設", detail: "青魔法師初始法術（習得職業即會）" }],
  13: [totem("習得 10 個青魔法")],
  20: [totem("習得 5 個青魔法")],
  22: [totem("習得 20 個青魔法")],
  30: [totem("習得 10 個青魔法")],
  39: [totem("通關狩魔競技場 10 關")],
  42: [totem("通關狩魔競技場 20 關")],
  71: [totem("習得 50 個青魔法")],
  72: [totem("通關狩魔競技場 30 關")],
  88: [totem("青魔法師等級達 70")],
  95: [totem("習得 100 個青魔法")],
  100: [totem("習得 100 個青魔法")],
  109: [totem("青魔法師等級達 80")],
  117: [totem("習得 120 個青魔法"), { type: "副本", contentId: 666, detail: "無瑕靈君殲滅戰" }],
};

const raw = readFileSync(FILE, "utf8");
const minified = !raw.includes('\n  "');
const db = JSON.parse(raw);
let filled = 0;
for (const e of db.data) {
  const isEmpty = (!e.learnFrom || !e.learnFrom.length) && (!e.learnFromMob || !e.learnFromMob.length);
  if (!isEmpty) continue;
  const fix = FIX[e.no];
  if (!fix) { console.log(`  未涵蓋 #${e.no} ${e.name}`); continue; }
  filled++;
  console.log(`  #${e.no} ${e.name} ← ${fix.map((f) => f.type + "/" + f.detail).join(" + ")}`);
  if (APPLY) e.learnFrom = fix;
}
console.log(`\n填 ${filled} 筆`);
if (APPLY) {
  db.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FILE, minified ? JSON.stringify(db) + "\n" : JSON.stringify(db, null, 2) + "\n");
  console.log("✅ 已寫入");
} else {
  console.log("（dry-run，加 --apply 套用）");
}
