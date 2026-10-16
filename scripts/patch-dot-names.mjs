// patch-dot-names.mjs — 前端資料裡名稱內部的「·」換成台服官方的「・」
//
// 為什麼需要（2026-10-11）：台服客戶端的名稱表一個「·」都沒有（NPC、地名、物品、怪物、任務、成就、坐騎、
// 寵物、狀態、技能、FATE、理符、道具、副本 14 張表實測），全是「・」。站上的「·」是 Teamcraft 與社群站帶進來的：
// NPC 名（夏馬尼·洛馬尼）、地名（利姆薩·羅敏薩上層甲板）、店名（巧手白票（80級·裝備3））、副本名、技能說明…
// 散在 50 多個欄位。7.25 升版時物品名已全面換成「・」，其他名稱不跟的話同一個東西在不同頁長得不一樣。
//
// 規則：只換**名稱內部**的「·」（前後都不是空白）——「季節活動報酬 · 幸運彩蛋2016」這種兩側有空白的是
// 我們自己產的分隔符，不動。判斷寫在 scripts/lib/client-names.mjs 的 officialDots()（建置端
// lib/obtainable.mjs 的 normalizeEntries() 也走同一支，新產的取得管道不會再帶「·」）。
//
// 不動的檔：
//   *-tc.json               社群站原始快照（建置輸入，保留原貌才看得出上游改了什麼）
//   obtainable-methods.json  上游 dump 原樣保存（validate-data 的白名單；顯示端一律過 convertOm）
//   official-terms.json      術語表本身
//   _meta.json
// 冪等。執行：node scripts/patch-dot-names.mjs [--apply]

import { readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { officialDots } from "./lib/client-names.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const APPLY = process.argv.includes("--apply");
const DOT = String.fromCharCode(0xb7);
export const SKIP_FILES = new Set(["obtainable-methods.json", "official-terms.json", "_meta.json"]);
export const skipFile = (name) => SKIP_FILES.has(name) || name.endsWith("-tc.json");

function files(dir) {
  const out = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) out.push(...files(p));
    else if (f.name.endsWith(".json") && !skipFile(f.name)) out.push(p);
  }
  return out;
}

async function main() {
  const per = new Map();
  let total = 0, touched = 0, kept = 0;
  for (const f of files(DATA)) {
    const raw = readFileSync(f, "utf8");
    if (!raw.includes(DOT)) continue;
    const db = JSON.parse(raw);
    let n = 0;
    const fix = (v) => { const t = officialDots(v); if (t !== v) n++; else if (v.includes(DOT)) kept++; return t; };
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach((v, i) => { if (typeof v === "string") node[i] = fix(v); else walk(v); }); return; }
      if (!node || typeof node !== "object") return;
      for (const k of Object.keys(node)) { const v = node[k]; if (typeof v === "string") node[k] = fix(v); else walk(v); }
    };
    walk(db);
    if (!n) continue;
    total += n;
    const rel = relative(ROOT, f).split(sep).join("/");
    const key = /^data\/[^/]+\/[^/]+\.json$/.test(rel) ? rel.replace(/\/[^/]+\.json$/, "/*") : rel;
    per.set(key, (per.get(key) || 0) + n);
    if (APPLY) {
      const pretty = raw.includes('\n  "') ? 2 : raw.includes('\n "') ? 1 : 0;
      await writeFile(f, (pretty ? JSON.stringify(db, null, pretty) : JSON.stringify(db)) + (raw.endsWith("\n") ? "\n" : ""));
      touched++;
    }
  }
  for (const [k, n] of [...per].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${k}`);
  console.log(`共 ${total} 個字串換掉名稱內部的「·」；兩側有空白的分隔符保留 ${kept} 個`);
  console.log(APPLY ? `✓ 已寫入 ${touched} 個檔` : "（dry-run，未寫入；加 --apply 套用）");
}

if (import.meta.url === new URL(`file:///${process.argv[1].split(sep).join("/")}`).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
