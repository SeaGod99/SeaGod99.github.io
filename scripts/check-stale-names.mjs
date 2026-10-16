// check-stale-names.mjs — 物品改譯／改中點之後，還有哪些資料帶著舊名（唯讀，不改任何檔）
//
// 為什麼需要：台服改版會改物品名（7.25：27 件改譯、1,126 個「·」→「・」），而「本來就是物品名」的字串
// 散在很多檔的很多欄位——成就說明、表情的取得方式、魚的傳承錄書、園藝配種的種子名、取得方式摘要…
// 各自的建置腳本不會知道物品改名了，畫面上就會同一件東西兩種寫法。2026-10-10 升 7.25 時就是這樣
// 一個一個挖出來的（知識庫 §4.99 第 6 條）。
//
// 做法：拿 `git show <ref>:data/items.json`（升版前）對現在的 data/items.json，做「舊名 → 新名」表——
// 排除舊名仍是別件物品現名的（7.25 有兩件互換名字：手藝背心組合／手藝工作服組合）與太短的（< 3 字）。
// 然後掃 data/ 底下所有 .json 的**字串值**（不看物件鍵：四語查詢分片的鍵是簡中名，「蜜瓜派」是合法的簡中鍵），
// 依「檔案 → 欄位路徑」列出還帶著舊名的地方。
//
// 預期內、不算問題的（另列）：
//   term-names/、action-names/、monsters.json、npc-shops/ 的商店名 —— Teamcraft 來源的命名空間（任務／怪物／
//   技能／商店名），還沒改走台服客戶端（第三輪路線圖 §3 tw-names-from-client）
//   *-tc.json —— 社群站的原始快照（建置輸入，不給前端）
//
// 執行（repo 根目錄）：
//   node scripts/check-stale-names.mjs --ref <升版前的 commit>    # 預設 HEAD（升版的修改還沒 commit 時就是升版前）
// 有「要處理」的地方 exit 1。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const DATA = join(ROOT, "data");
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const REF = argOf("--ref") || "HEAD";

const before = JSON.parse(execFileSync("git", ["show", `${REF}:data/items.json`], { cwd: ROOT, maxBuffer: 1 << 28 }).toString()).data;
const now = JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data;
const nowById = new Map(now.map((i) => [i.id, i.name]));
const nowNames = new Set(now.map((i) => i.name));
const renamed = new Map();
for (const i of before) {
  const n = nowById.get(i.id);
  if (n && n !== i.name && i.name.length >= 3 && !nowNames.has(i.name)) renamed.set(i.name, n);
}
console.log(`${REF} → 工作目錄：改了名的物品 ${renamed.size} 件（已排除互換名與舊名仍在用的）`);
if (!renamed.size) { console.log("沒有改名，不用掃。"); process.exit(0); }

const EXPECTED = [
  [/^term-names\//, "Teamcraft 命名空間（任務／地名／怪物／副本）"],
  [/^action-names\//, "Teamcraft 命名空間（技能／狀態）"],
  [/^monsters\.json$/, "Teamcraft 命名空間（怪物）"],
  [/^npc-shops\/.*\.npcs\[\]\.s\[\]\.n$/, "Teamcraft 命名空間（商店名）"],
  [/-tc\.json$/, "社群站原始快照（建置輸入）"],
];
const expectedWhy = (file, path) => EXPECTED.find(([re]) => re.test(file) || re.test(`${file}${path}`))?.[1] || null;

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".json")) files.push(p); } };
walk(DATA);

const olds = [...renamed.keys()];
const hits = new Map();   // "檔或目錄 欄位" → { why, n, eg: [] }
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const present = olds.filter((o) => text.includes(o));
  if (!present.length) continue;          // 先整檔比對，有命中才逐欄位走
  const rel = relative(DATA, f).split("\\").join("/");
  const group = /\/\d+\.json$|\/_index\.json$/.test(rel) || rel.split("/").length > 1 ? rel.replace(/\/[^/]+$/, "/") : rel;
  const visit = (v, path) => {
    if (typeof v === "string") {
      const o = present.find((x) => v.includes(x));
      if (!o) return;
      const key = `${group}\t${path}`;
      if (!hits.has(key)) hits.set(key, { file: group, path, why: expectedWhy(group, path), n: 0, eg: [] });
      const h = hits.get(key);
      h.n++;
      if (h.eg.length < 2) h.eg.push(`${o} → ${renamed.get(o)}`);
    } else if (Array.isArray(v)) v.forEach((x) => visit(x, path + "[]"));
    else if (v && typeof v === "object") {
      // 鍵本身是資料的物件（id 對照表、名稱分片的查詢鍵）收成 <key>，不然每個鍵都變一條路徑
      const many = Object.keys(v).length > 50;
      for (const [k, x] of Object.entries(v)) visit(x, many || /^\d+$/.test(k) ? path + ".<key>" : `${path}.${k}`);
    }
  };
  visit(JSON.parse(text), "");
}

const todo = [...hits.values()].filter((h) => !h.why);
const ok = [...hits.values()].filter((h) => h.why);
console.log(`\n要處理（${todo.length} 處）：`);
for (const h of todo.sort((a, b) => b.n - a.n)) console.log(`  ✗ ${h.file}${h.path}  ${h.n} 筆　例：${h.eg.join("；")}`);
if (!todo.length) console.log("  （沒有）");
// 預期內的只彙總到「檔或目錄」——名稱分片的鍵本身就是資料，逐條路徑列出來沒有意義
const okBy = new Map();
for (const h of ok) {
  const k = `${h.file}\t${h.why}`;
  if (!okBy.has(k)) okBy.set(k, { file: h.file, why: h.why, n: 0, eg: h.eg[0] });
  okBy.get(k).n += h.n;
}
console.log(`\n預期內（${[...okBy.values()].reduce((s, x) => s + x.n, 0)} 筆，不改）：`);
for (const x of [...okBy.values()].sort((a, b) => b.n - a.n)) console.log(`  · ${x.file}  ${x.n} 筆　${x.why}　例：${x.eg}`);
process.exit(todo.length ? 1 : 0);
