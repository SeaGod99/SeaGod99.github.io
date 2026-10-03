// validate-achievements.mjs — 成就追蹤頁（/collections/achievements/）的回歸
//
// 什麼時候跑：改了 collections/achievements/、scripts/build-achievements.mjs、
// data/achievements.json，或命令面板索引（build-site-index.mjs）之後。
//
// 最重要的三條：
//   ① **稱號名與分類名不可以出現**——兩者都沒有台服來源（見 build-achievements.mjs 檔頭）。
//      資料只准有 `title` 旗標與 `ord` 名次，不准有任何能拿來顯示的稱號／分類字串欄位；
//      畫面上也不准出現英文詞。
//   ② 物品獎勵連到收藏頁時，`?id=` 的值要真的對得到該頁的 keyOf（寵物頁是純 id、其餘是 id:<id>），
//      對不上的話連過去會安靜地捲不到東西。
//   ③ 命令面板索引裡「成就」要排在**最後一類**：面板目前只取索引順序前 40 筆、不依相關度排序，
//      成就 3,349 筆排前面會把職業行會等小類別擠出去（搜「騎士」）。面板改成依相關度排序後可拿掉。
//
// 相依：jsdom（npm i jsdom --no-save）
// 執行（repo 根目錄）：node scripts/validate-achievements.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isTw } from "./lib/tw-text.mjs";

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch { console.error("需要 jsdom：npm i jsdom --no-save"); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "collections/achievements/index.html";
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const results = [];
const push = (n, ok, d = "") => results.push([n, !!ok, d]);

// ───────────────────────── 資料層 ─────────────────────────
const db = JSON.parse(read("data/achievements.json"));
const A = db.data;
const meta = JSON.parse(read("data/_meta.json"));
const pnum = (p) => { const m = p == null ? null : String(p).match(/^(\d+)\.(\d+)/); return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : null; };
const released = (p) => { const v = pnum(p), g = pnum(meta.gamePatch); return v == null || g == null || v <= g; };
const visible = A.filter((a) => a.name && released(a.patch));

push("成就數量 ≥ 3,000 且 count 與資料一致", A.length >= 3000 && db.count === A.length, `${A.length} 筆`);
push("每筆成就名都過台服守門 isTw()", A.every((a) => isTw(a.name)), A.filter((a) => !isTw(a.name)).slice(0, 3).map((a) => a.id).join(","));
push("達成條件不是 null 就要過 isTw()", A.every((a) => a.desc == null || isTw(a.desc)));
const ALLOWED = new Set(["id", "name", "desc", "pts", "patch", "icon", "item", "title", "ord"]);
const extra = new Set();
for (const a of A) for (const k of Object.keys(a)) if (!ALLOWED.has(k)) extra.add(k);
push("資料沒有任何稱號名／分類名之類的額外欄位（只准 title 旗標與 ord 名次）", extra.size === 0, [...extra].join(","));
push("title 只是旗標（1 或不存在）", A.every((a) => a.title === undefined || a.title === 1));
const ords = A.map((a) => a.ord).sort((x, y) => x - y);
push("ord 是 0..N-1 的連續名次", ords.every((v, i) => v === i));
push("資料順序就是 ord 順序（頁面的「預設排序」＝遊戲內排列）", A.every((a, i) => a.ord === i));
push("物品獎勵名都過 isTw()", A.every((a) => !a.item || isTw(a.item.n)));

// ② 收藏頁連結的 key 要對得到該頁的 keyOf
const KEYOF = {
  "collections/mounts/": ["mounts", (e) => "id:" + e.id],
  "minions/": ["minions", (e) => String(e.id)],
  "collections/orchestrion/": ["orchestrion", (e) => "id:" + e.id],
  "collections/emotes/": ["emotes", (e) => "id:" + e.id],
  "collections/barding/": ["barding", (e) => "id:" + e.id],
  "collections/ornaments/": ["ornaments", (e) => "id:" + e.id],
  "collections/triple-triad/": ["triple-triad", (e) => "id:" + e.id],
};
const keySets = {};
for (const [p, [f, fn]] of Object.entries(KEYOF)) keySets[p] = new Set(JSON.parse(read(`data/${f}.json`)).data.map(fn));
const linked = A.filter((a) => a.item && a.item.p);
const badLinks = linked.filter((a) => !keySets[a.item.p] || !keySets[a.item.p].has(a.item.k));
push("物品獎勵的收藏頁連結全部對得到該頁的 keyOf", linked.length > 0 && badLinks.length === 0, `${linked.length} 條，錯 ${badLinks.length}：${badLinks.slice(0, 3).map((a) => a.id).join(",")}`);

// ── 獎勵內容（2026-10-04）──
{
  const items = new Map(JSON.parse(read("data/items.json")).data.map((x) => [x.id, x]));
  const equip = JSON.parse(read("data/equip.json"));
  const jobNames = new Set(Object.values(equip.names));
  const rewarded = A.filter((a) => a.item);
  push("每個物品獎勵都有種類標籤", rewarded.every((a) => a.item.c && isTw(a.item.c)), rewarded.filter((a) => !a.item.c).slice(0, 3).map((a) => a.id).join(","));
  push("  有圖示的道具都帶了圖示", rewarded.every((a) => !items.get(a.item.id)?.icon || a.item.i === items.get(a.item.id).icon));
  const gear = rewarded.filter((a) => items.get(a.item.id)?.equip);
  push("裝備獎勵都有部位／裝備等級／品級／可裝備職業", gear.length > 0 && gear.every((a) => a.item.eq && a.item.eq.slot && a.item.eq.lv && a.item.eq.il && a.item.eq.jobs), `${gear.length} 件`);
  /* 職業名鐵則：個別職業一律是 equip.json 的名字。jobCategories 的單一職業字串是舊譯（「木工師」＝刻木匠），
     只准用它的兩個群組字串。 */
  const GROUPS = new Set(["所有職業", "戰鬥精英 魔法導師"]);
  const badJobs = gear.filter((a) => !GROUPS.has(a.item.eq.jobs) && !a.item.eq.jobs.split("、").every((n) => jobNames.has(n)));
  push("  可裝備職業只用 equip.json 的職業名（或兩個官方群組字串），沒有舊譯", badJobs.length === 0, badJobs.slice(0, 3).map((a) => a.item.eq.jobs).join(" ｜ "));
  const cards = rewarded.filter((a) => a.item.p === "collections/triple-triad/");
  const tt = new Map(JSON.parse(read("data/triple-triad.json")).data.map((c) => ["id:" + c.id, c]));
  push("幻卡獎勵連到幻卡頁，而且卡名與道具名對得上", cards.length >= 20 && cards.every((a) => a.item.n === "九宮幻卡：" + tt.get(a.item.k)?.name), `${cards.length} 張`);
}

// ───────────────────────── 登記 ─────────────────────────
const m = meta.databases.find((d) => d.file === "achievements.json");
push("_meta.json 有登記且筆數一致", m && m.count === A.length, m ? `${m.count}` : "沒登記");
push("nav.js 的 TOOLS 有這頁", /p:\s*'collections\/achievements\/'/.test(read("assets/js/nav.js")));
push("首頁有入口卡片且帶 data-added", /href="collections\/achievements\/"[^>]*data-added="\d{4}-\d{2}-\d{2}"/.test(read("index.html")));
const idx = JSON.parse(read("data/site-index.json"));
const ti = idx.types.findIndex((t) => t.label === "成就");
// 10-03 起「任務」（5,130 筆）也是大類別，與成就一起排在最後；兩個都在其他類別之後就對了
const tailFrom = idx.types.findIndex((t) => t.label === "成就" || t.label === "任務");
push("③ 命令面板索引的「成就」排在一般類別之後（大類別區）", ti >= 0 && ti >= tailFrom && idx.types.slice(tailFrom).every((t) => t.label === "成就" || t.label === "任務"), idx.types.map((t) => t.label).join(","));
const idxN = idx.data.filter((r) => r[1] === ti).length;
push("索引裡的成就數＝頁面可見數（同一道版本閘門）", idxN === visible.length, `索引 ${idxN}／頁面 ${visible.length}`);

// ───────────────────────── 頁面（jsdom） ─────────────────────────
async function boot(query = "", seed = null) {
  const html = read(PAGE);
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (...a) => errors.push(a.join(" ")));
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  let stripped = html;
  for (const b of blocks) stripped = stripped.replace(b[0], "");
  const dom = new JSDOM(stripped, {
    runScripts: "dangerously",
    url: "https://seagod99.github.io/collections/achievements/" + query,
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = async (url) => {
        const rel = String(url).replace(/^.*?(data|assets)\//, "$1/");
        return { ok: true, json: async () => JSON.parse(read(rel)) };
      };
      window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      window.HTMLElement.prototype.scrollIntoView = function () {};
      if (seed) for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
    },
  });
  const { window } = dom;
  for (const f of ["assets/js/toast.js", "assets/js/patch-gate.js", "assets/js/collection-tracker.js"]) window.eval(read(f));
  for (const b of blocks) { try { window.eval(b[1]); } catch (e) { errors.push("inline: " + e.message); } }
  await new Promise((r) => setTimeout(r, 1200));
  return { window, doc: window.document, errors };
}

{
  const { doc, errors } = await boot();
  push("頁面渲染出控制面且 console 乾淨", doc.querySelector("#ct-clear") && errors.length === 0, errors.slice(0, 2).join(" | "));
  push("進度分母＝可見成就數", doc.querySelector("#ct-total")?.textContent === String(visible.length), doc.querySelector("#ct-total")?.textContent);
  const cards = [...doc.querySelectorAll(".col-card")];
  push("一頁 60 張卡", cards.length === 60, `${cards.length}`);
  // ① 畫面上不得出現英文詞（No.／ver 是本站自己的標籤）
  const gridText = doc.querySelector("#ct-root").textContent.replace(/No\.\d+|ver \d+\.\d+/g, "");
  const eng = gridText.match(/[A-Za-z]{3,}/g) || [];
  push("① 控制面與卡片沒有英文詞", eng.length === 0, eng.slice(0, 5).join(","));
  const pts = visible.reduce((s, a) => s + a.pts, 0);
  const line = () => doc.querySelector("#ac-points")?.textContent || "";
  push("點數合計：一開始是 0 / 總點數", line().includes(`0 / ${pts.toLocaleString("en-US")}`), line());
  const first = visible[0];
  cards[0].querySelector(".ct-check")?.click();
  await new Promise((r) => setTimeout(r, 50));
  push("勾第一張後，已達成點數＝該成就點數", line().includes(`已達成點數 ${first.pts} /`), line());
  const titled = cards.find((c) => /稱號/.test(c.textContent));
  push("有稱號獎勵的卡片只標「稱號」，滑過說明為何沒有名字", !titled || /台服/.test(titled.querySelector('[title]')?.getAttribute("title") || ""));
}

{
  // ② 深連結：頑強騎士（id 921）在遊戲內排列第 93 位 → 第 2 頁；獎勵連到坐騎頁
  const target = A.find((a) => a.item && a.item.p === "collections/mounts/");
  const { doc } = await boot("?id=" + encodeURIComponent("id:" + target.id));
  const card = [...doc.querySelectorAll(".col-card")].find((c) => c.textContent.includes(target.name));
  push("?id=id:<成就 id> 會翻到那一筆所在的分頁", !!card, `${target.id} ${target.name}`);
  const a = card && card.querySelector(".ac-reward a");
  push("物品獎勵連到收藏頁的 ?id=", a && a.getAttribute("href") === `../../collections/mounts/?id=${encodeURIComponent(target.item.k)}`, a && a.getAttribute("href"));
}

{
  const { doc } = await boot("?f_reward=title");
  const cards = [...doc.querySelectorAll(".col-card")];
  push("「獎勵：稱號」篩選後每張卡都有稱號標籤", cards.length > 0 && cards.every((c) => /稱號/.test(c.textContent)), `${cards.length} 張`);
}

{
  // 獎勵內容的畫面：依種類篩、裝備那一行、幻卡連結
  const { doc } = await boot("?f_reward=" + encodeURIComponent("k:坐騎"));
  const cards = [...doc.querySelectorAll(".col-card")];
  const want = visible.filter((a) => a.item && a.item.c === "坐騎").length;
  push("「獎勵：坐騎」只列出獎勵是坐騎的成就", cards.length === Math.min(60, want) && cards.every((c) => c.querySelector(".ac-rw-kind")?.textContent === "坐騎"), `${cards.length}／${want}`);
  push("  獎勵篩選的種類由資料長出（含裝備、幻卡）", /裝備/.test(doc.querySelector("#ct-root").textContent) && /幻卡/.test(doc.querySelector("#ct-root").textContent), "");
  const g = await boot("?f_reward=" + encodeURIComponent("k:裝備"));
  const eqLine = g.doc.querySelector(".ac-rw-eq")?.textContent || "";
  push("裝備獎勵的卡片多一行部位・裝備等級・品級・職業", /裝備等級 \d+・品級 \d+・/.test(eqLine), eqLine);
  const t = await boot("?f_reward=" + encodeURIComponent("k:幻卡"));
  const a = t.doc.querySelector(".ac-reward a.ac-rw-name");
  push("幻卡獎勵連到幻卡頁的 ?id=id:<卡 id>", !!a && /collections\/triple-triad\/\?id=id%3A\d+/.test(a.getAttribute("href")), a && a.getAttribute("href"));
  push("  這幾條路徑 console 都乾淨", [g, t].every((x) => x.errors.length === 0), [g, t].flatMap((x) => x.errors).slice(0, 1).join(""));
}

{
  // 收藏頁的「成就」來源連到這頁（2026-10-03）：連過來的每一筆都要真的在頁面上（台服已開放、非舊版）
  const vis = new Set(visible.map((a) => a.id));
  let n = 0, miss = [];
  for (const f of ["mounts", "minions", "orchestrion", "barding", "emotes", "triple-triad", "hairstyles", "ornaments"]) {
    for (const e of JSON.parse(read(`data/${f}.json`)).data) for (const s of e.sources || []) {
      if (s.achievementId == null) continue;
      n++; if (!vis.has(s.achievementId)) miss.push(`${f}:${s.achievementId}`);
    }
  }
  push("收藏頁的成就來源都連得到這頁（台服已開放、非舊版）", n > 0 && miss.length === 0, `${n} 筆，缺 ${miss.length}：${miss.slice(0, 3).join(",")}`);
  const dom = new JSDOM("<!doctype html><body>", { runScripts: "outside-only", url: "https://seagod99.github.io/collections/mounts/" });
  dom.window.eval(read("assets/js/patch-gate.js"));
  dom.window.eval(read("assets/js/collection-tracker.js"));
  const h = dom.window.CollectionTracker.sourceWhere({ type: "成就", detail: "x", achievementId: 921 });
  push("  共用的 sourceWhere() 會畫出成就追蹤連結", /collections\/achievements\/\?id=id%3A921/.test(h), h.slice(0, 120));
}

// ───────────────────────── 報告 ─────────────────────────
let fail = 0;
for (const [n, ok, d] of results) {
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${n}${d ? `　（${d}）` : ""}`);
}
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
