// validate-term-names.mjs — 名稱翻譯的「副本／地名／怪物／任務」四類（data/term-names/）回歸
//
// 改完 scripts/build-term-names.mjs、assets/js/item-names.js 或 tools/name-translator/ 必跑。
// 會安靜出錯的地方：
//   ① **一對多要全部列出**：同一個英文怪物名在不同地方有不同的台服譯名，只回第一筆會安靜給錯名。
//      資料裡多候選存成陣列，頁面要全部畫出來並標「N 個候選」。
//   ② 分片規則與物品／技能同一套（共用 build-item-names.mjs 的 shardOf），每個鍵都要在對的片裡，
//      否則前端查不到、兩邊都不報錯。
//   ③ 每一個值都要過台服守門（上游 mobs 有未翻譯的日文）。
//
// 相依：jsdom（npm i jsdom --no-save）
// 執行（repo 根目錄）：node scripts/validate-term-names.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName, shardOf } from "./build-item-names.mjs";
import { isTw } from "./lib/tw-text.mjs";

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch { console.error("需要 jsdom：npm i jsdom --no-save"); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data/term-names");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const results = [];
const push = (n, ok, d = "") => results.push([n, !!ok, d]);

// ── 分片檔 ─────────────────────────────────────────────
const idx = JSON.parse(readFileSync(join(DIR, "_index.json"), "utf8"));
const files = readdirSync(DIR).filter((f) => f !== "_index.json");
push("片數與索引一致（256）", files.length === idx.shards && idx.shards === 256, `${files.length}`);
let keys = 0, misplaced = 0, badVal = 0, arrays = { d: 0, p: 0, m: 0, q: 0 };
for (const f of files) {
  const s = +f.replace(".json", "");
  const j = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  for (const [kind, langs] of Object.entries(j.k)) for (const [, t] of Object.entries(langs)) for (const [key, v] of Object.entries(t)) {
    keys++;
    if (shardOf(key) !== s) misplaced++;
    const vals = Array.isArray(v) ? v : [v];
    if (Array.isArray(v)) { arrays[kind]++; if (v.length < 2 || new Set(v).size !== v.length) badVal++; }
    if (!vals.every((x) => typeof x === "string" && isTw(x))) badVal++;
  }
}
push("② 每個鍵都在正確的片裡", misplaced === 0, `${keys} 個鍵，錯 ${misplaced}`);
push("鍵數與索引一致", keys === idx.keys, `${keys} / ${idx.keys}`);
push("③ 每個值都過台服守門；陣列都是 ≥2 個不重複的名字", badVal === 0, `錯 ${badVal}`);
push("① 怪物與地名真的有多候選（存成陣列）", arrays.m > 50 && arrays.p > 50, JSON.stringify(arrays));
push("四類的台服筆數都在合理範圍", idx.kinds.d >= 600 && idx.kinds.p >= 4500 && idx.kinds.m >= 13000 && idx.kinds.q >= 5000, JSON.stringify(idx.kinds));

// ── 頁面（jsdom）：名稱翻譯切到各類別 ─────────────────────
async function boot() {
  const html = read("tools/name-translator/index.html");
  const vc = new VirtualConsole();
  const errs = [];
  vc.on("jsdomError", (e) => errs.push(e.message));
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://seagod99.github.io/tools/name-translator/", virtualConsole: vc });
  const { window } = dom;
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*?(data|assets)\//, "$1/");
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  // item-names.js 用 document.currentScript 推 ROOT；在 jsdom 裡給它一個假的 src
  Object.defineProperty(window.document, "currentScript", { configurable: true, get: () => ({ src: "https://seagod99.github.io/assets/js/item-names.js" }) });
  window.eval(read("assets/js/item-names.js"));
  Object.defineProperty(window.document, "currentScript", { configurable: true, get: () => null });
  for (const sc of window.document.querySelectorAll("script:not([src])")) window.eval(sc.textContent);
  return { window, doc: window.document, errs };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(t, kind, text) {
  t.doc.getElementById("kindSel").value = kind;
  t.doc.getElementById("input").value = text;
  t.doc.getElementById("goBtn").dispatchEvent(new t.window.MouseEvent("click", { bubbles: true }));
  await wait(500);
  return [...t.doc.querySelectorAll(".r-row")].map((r) => ({
    tw: r.querySelector(".r-tw").textContent, multi: r.querySelector(".r-multi")?.textContent || "",
    href: r.querySelector(".r-tw a")?.getAttribute("href") || "", miss: r.classList.contains("miss"),
  }));
}
{
  const t = await boot();
  const d = await run(t, "d", "Sastasha\n地下霊殿 タムタラの墓所\nNot A Real Duty");
  push("副本：英／日都查得到，連到副本圖鑑", d[0].tw === "天然要害沙斯塔夏溶洞" && d[1].tw === "地下靈殿塔姆·塔拉墓園" && /duty-codex\/\?q=/.test(d[0].href), d.map((x) => x.tw).join("｜"));
  push("  查不到的標紅", d[2].miss, "");
  const m = await run(t, "m", "Trickster Imp\nMorbol");
  push("① 怪物多候選：全部列出並標「3 個候選」", /小頑童/.test(m[0].tw) && /欺詐小頑童/.test(m[0].tw) && /搗蛋鬼/.test(m[0].tw) && m[0].multi === "3 個候選", `${m[0].tw}（${m[0].multi}）`);
  push("  單一候選不標", m[1].tw === "毛爾波爾" && !m[1].multi, m[1].tw);
  push("  怪物、地名沒有對應頁，不給連結", m.every((x) => !x.href), "");
  const q = await run(t, "q", "An Ill-conceived Venture");
  push("任務：連到任務查詢，三個城市版本都列", q[0].multi === "3 個候選" && /quest-finder\/\?q=/.test(q[0].href), q[0].tw);
  push("  非物品類別時藏起「帶去市場查價」", t.doc.getElementById("marketBtn").hidden === true, "");
  const p = await run(t, "p", "Limsa Lominsa");
  push("地名：區域名與城區名都列", /利姆薩·羅敏薩城區/.test(p[0].tw) && p[0].multi === "2 個候選", p[0].tw);
  const it = await run(t, "item", "Iron Ingot");
  push("切回物品：仍走物品查詢、連市場、顯示市場鈕", it[0].tw === "黑鐵錠" && /market\/\?q=/.test(it[0].href) && t.doc.getElementById("marketBtn").hidden === false, it[0].tw);
  push("無 console error", t.errs.length === 0, t.errs.slice(0, 1).join("") || "乾淨");
}
push("item-names.js 有 TermNames 查詢器", /window\.TermNames = create\('data\/term-names'/.test(read("assets/js/item-names.js")));

let fail = 0;
for (const [n, ok, d] of results) { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${n}${d ? `　（${d}）` : ""}`); }
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
