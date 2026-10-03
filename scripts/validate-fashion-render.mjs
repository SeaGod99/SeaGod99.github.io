/* 時尚品鑑頁 render 回歸（node scripts/validate-fashion-render.mjs）
   本機起不了 headless Chromium，改用最小 DOM stub 把 tools/fashion-report/index.html 的
   module script 跑一遍，檢查換週狀態機的每個狀態都能渲染、沒有洩漏 undefined/NaN。
   週更後必跑（SOP §4）。以前放在 scratchpad，被系統清掉三次，所以收進 repo。 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "out_data", "cache", "fashion-render");
const html = readFileSync(join(ROOT, "tools/fashion-report/index.html"), "utf8");
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const data = json("data/fashion-report.json");
const themes = json("data/fashion-themes.json");

function makeEl(id) {
  return {
    id, innerHTML: "", textContent: "", dataset: {}, style: {}, value: "",
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, appendChild() {}, remove() {}, select() {},
    closest: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
}
const els = new Map();
globalThis.document = {
  getElementById: (id) => (els.has(id) ? els.get(id) : (els.set(id, makeEl(id)), els.get(id))),
  createElement: () => makeEl("new"),
  addEventListener() {}, body: { appendChild() {} }, head: { appendChild() {} },
};
globalThis.window = globalThis;
globalThis.location = { pathname: "/tools/fashion-report/", search: "", hash: "" };
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
globalThis.setInterval = () => 0;
globalThis.setTimeout = (fn) => { if (typeof fn === "function") fn(); return 0; };

/* 第二套方案（滿分）在分頁裡、點了才畫，門檻與「沒有 NPC 固定價」區塊也只在那張卡上。
   DOM stub 點不了，所以另跑一輪把兩個方案對調，讓兩張卡都經過真正的 render。 */
let swapPlans = false;
const dataFor = () => (swapPlans ? { ...data, plans: [...data.plans].reverse() } : data);
globalThis.fetch = async (u) => ({
  ok: true,
  json: async () => {
    if (u.includes("fashion-report.json")) return dataFor();
    if (u.includes("fashion-themes.json")) return themes;
    if (u.includes("maps.json")) return json("data/maps.json");
    if (u.includes("fashion-fillers.json")) return json("data/fashion-fillers.json");
    throw new Error("unexpected fetch " + u);
  },
});

// 與頁面／腳本相同的週時鐘：week 440 起點 2026-06-30 16:00 UTC+8，每週二換週、週五開放評分
const ANCHOR = Date.UTC(2026, 5, 30, 8, 0, 0), WEEK = 6048e5, DAY = 864e5;
const at = (w, offDays) => ANCHOR + (w - 440) * WEEK + offDays * DAY;
const REAL_NOW = Date.now();
const W = data.week;
const cases = [
  ["資料當週・評分期（正常態）", at(W, 4)],
  ["資料當週・準備期", at(W, 1)],
  ["資料落後一週・準備期（過渡期）", at(W + 1, 1)],
  ["資料落後一週・評分期（最緊急）", at(W + 1, 4)],
  ["資料落後多週", at(W + 4, 2)],
  ["資料超前（防呆）", at(W - 1, 2)],
  ["資料當週・評分期（方案對調，畫第二張卡）", at(W, 4), { swap: true }],
];

mkdirSync(OUT_DIR, { recursive: true });
let fail = 0;
const out = [];
for (const [name, now, opt] of cases) {
  els.clear();
  swapPlans = !!opt?.swap;
  Date.now = () => now;
  const mod = `data:text/javascript;base64,${Buffer.from(src).toString("base64")}`;
  try { await import(mod + `#${now}${swapPlans ? "s" : ""}`); }
  catch (e) { console.log(`❌ ${name}：拋例外 ${e.message}`); fail++; continue; }
  await new Promise((r) => setImmediate(r));
  const h = els.get("app")?.innerHTML ?? "";
  const bad = [];
  if (!h || h.length < 400) bad.push(`輸出過短(${h.length})`);
  if (/undefined|NaN|\[object Object\]/.test(h)) bad.push("洩漏 undefined/NaN/[object Object]");
  /* 2026-10-03：資料落後時要講出「換週後已過多久」（只算本站落後，從當週週二 16:00 起）；
     資料是當週或超前時不該出現。 */
  const lag = /換週後已過 <b>(\d+ 天 )?\d+ 小時<\/b>，本站仍是第 \d+ 週的存檔/.test(h);
  const behind = name.startsWith("資料落後");
  if (behind && !lag) bad.push("落後時沒講換週後已過多久");
  if (!behind && /換週後已過/.test(h)) bad.push("沒落後卻出現「換週後已過」");
  out.push(`${bad.length ? "❌" : "✅"} ${name}：${h.length} 字元${bad.length ? " → " + bad.join("、") : ""}`);
  if (bad.length) fail++;
  if (name === "資料當週・評分期（正常態）") writeFileSync(join(OUT_DIR, "render-normal.html"), h, "utf8");
  if (opt?.swap) writeFileSync(join(OUT_DIR, "render-plan2.html"), h, "utf8");
}
Date.now = () => REAL_NOW;
console.log(out.join("\n"));
console.log(fail ? `\n${fail} 個狀態有問題（產出在 ${OUT_DIR}）` : `\n全部狀態通過（產出在 ${OUT_DIR}）`);
process.exit(fail ? 1 : 0);
