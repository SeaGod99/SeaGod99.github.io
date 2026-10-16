// official-terms.mjs — 建置腳本取台服官方術語（職業名、資料片名）的單一入口
//
// 資料是 data/official-terms.json（scripts/build-official-terms.mjs 從台服客戶端解包產生：ClassJob、ExVersion…）。
// 站主 2026-10-10 拍板：職業名、資料片名一律台服官方，舊寫法只留作別名。**不要在建置腳本裡另寫對照表**——
// 10-11 改官方名時，同一張「jobId → 職業名」表散在 9 支腳本裡（build-recipes、build-gathering、
// build-gardening、build-craft-leves、build-equip、lib/game-sources、lib/obtainable、lib/system-unlock-map…），
// 每一份都要找出來改。
//
// 用法：
//   import { jobName, jobNameById, expansionName } from "./lib/official-terms.mjs";
//   jobName("CRP")      // "木工師"
//   jobNameById(16)     // "採掘師"（ClassJob row id）
//   expansionName(7)    // "黃金遺產"（主版本號）

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "official-terms.json");
export const TERMS = JSON.parse(readFileSync(FILE, "utf8"));

const byId = new Map(Object.values(TERMS.jobs).map((j) => [j.id, j.name]));
const oldToNew = new Map();
for (const j of Object.values(TERMS.jobs)) for (const a of j.alias || []) oldToNew.set(a, j.name);

/** 職業縮寫 → 台服官方名（查不到回 null） */
export function jobName(abbr) {
  return TERMS.jobs[abbr]?.name ?? null;
}

/** ClassJob row id（8＝木工師…18＝漁師）→ 台服官方名 */
export function jobNameById(id) {
  return byId.get(Number(id)) ?? null;
}

/** 舊職業名（刻木匠…捕魚人、斧術師…）→ 官方名；本來就是官方名或查不到的原樣回傳 */
export function officialJobName(name) {
  return oldToNew.get(name) ?? name;
}

/** 主版本號（2..7）→ 台服官方資料片名 */
export function expansionName(major) {
  return TERMS.expansions.find((e) => e.major === Number(major))?.name ?? null;
}
