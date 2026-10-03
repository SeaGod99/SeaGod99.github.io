// validate-quests.mjs — 任務查詢（/tools/quest-finder/）與 data/quests/ 的回歸
//
// 改完 tools/quest-finder/、scripts/build-quests.mjs 或 data/quests/ 必跑。
// 會安靜出錯、畫面上看不出來的地方：
//   ① **報酬只收 Item 表**：Quest.Reward 是多型欄位，照 id 去查 items.json 會對到毫不相干的物品（§4.10）。
//   ② **同名任務以 id 為鍵**：70 組同名（各城市各一份），用名稱當鍵會讓 ?id= 與前置連結指錯。
//   ③ 每一個字串都要過台服守門；前置任務的 id 都要在索引裡（不然連結點了是空的）。
//   ④ 沒有搜尋條件時不倒 5,000 筆出來；?id= 只列那一筆並展開細節。
//
// 相依：jsdom（npm i jsdom --no-save）
// 執行（repo 根目錄）：node scripts/validate-quests.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTw } from "./lib/tw-text.mjs";

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch { console.error("需要 jsdom：npm i jsdom --no-save"); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const results = [];
const push = (n, ok, d = "") => results.push([n, !!ok, d]);

// ── 資料層 ─────────────────────────────────────────────
const IDX = JSON.parse(read("data/quests/_index.json"));
const ids = new Set(IDX.data.map((r) => r[0]));
const shards = {};
for (const e of IDX.exps) shards[e.id] = JSON.parse(read(`data/quests/${e.id}.json`));
const items = new Map(JSON.parse(read("data/items.json")).data.map((x) => [x.id, x]));
const maps = new Set(JSON.parse(read("data/maps.json")).data.map((m) => m.id));

push("任務數 ≥ 5,000 且 count 一致", IDX.data.length >= 5000 && IDX.count === IDX.data.length, `${IDX.data.length}`);
push("任務 id 不重複", ids.size === IDX.data.length);
push("每個任務名都過台服守門", IDX.data.every((r) => isTw(r[1])), IDX.data.filter((r) => !isTw(r[1])).slice(0, 3).map((r) => r[0]).join(","));
push("章節／區域／資料片名都過台服守門", [...IDX.genres, ...IDX.places, ...IDX.exps.map((e) => e.name)].every((s) => s && isTw(s)));
const byName = new Map();
IDX.data.forEach((r) => byName.set(r[1], (byName.get(r[1]) || 0) + 1));
const dup = [...byName].filter(([, n]) => n > 1);
push("② 同名任務各自保留（以 id 為鍵，不合併）", dup.length >= 50, `${dup.length} 組同名`);
push("每個資料片都有細節檔，且沒有多出來的檔", readdirSync(join(ROOT, "data/quests")).filter((f) => f !== "_index.json").length === IDX.exps.length);

let badPrev = 0, badItem = 0, badMap = 0, badXY = 0, npcs = 0, rw = 0;
for (const [eid, sh] of Object.entries(shards)) {
  for (const [qid, d] of Object.entries(sh.data)) {
    if (!ids.has(+qid)) badPrev++;
    for (const p of d.p || []) if (!ids.has(p)) badPrev++;
    for (const it of [...(d.r || []), ...(d.o || [])]) {
      rw++;
      const x = items.get(it[0]);
      if (!x || x.name !== it[1] || !isTw(it[1]) || (it[3] ? !x.marketable : false)) badItem++;
    }
    if (d.n != null) { npcs++; if (!isTw(sh.npcs[d.n])) badItem++; }
    if (d.a) {
      const [mid] = sh.maps[d.a[0]].split("|");
      if (!maps.has(+mid)) badMap++;
      if (!(d.a[1] >= 1 && d.a[1] <= 43 && d.a[2] >= 1 && d.a[2] <= 43)) badXY++;
    }
  }
}
push("③ 前置任務的 id 都在索引裡", badPrev === 0, `錯 ${badPrev}`);
push("① 報酬物品的 id 與名稱對得上 items.json（可交易旗標也一致），NPC 名都過守門", rw > 5000 && badItem === 0, `${rw} 件，錯 ${badItem}`);
push("接取點的地圖都在 maps.json、座標落在 1–43", badMap === 0 && badXY === 0, `地圖錯 ${badMap}、座標錯 ${badXY}`);
push("接取 NPC 覆蓋率 ≥ 95%", npcs / IDX.data.length >= 0.95, `${npcs}/${IDX.data.length}`);
const BUILD = read("scripts/build-quests.mjs");
push("  ① 建置腳本只收 sheet 是 Item 的報酬", /r\.sheet !== "Item"/.test(BUILD));
const msq = new Set(JSON.parse(read("data/msq.json")).data.map((x) => x.id));
const flagged = IDX.data.filter((r) => r[6] & 1);
push("主線旗標與 msq.json 一致", flagged.length === [...msq].filter((id) => ids.has(id)).length && flagged.every((r) => msq.has(r[0])), `${flagged.length} 個`);

// ── 登記 ─────────────────────────────────────────────
const meta = JSON.parse(read("data/_meta.json"));
const m = meta.databases.find((d) => d.file === "quests/_index.json");
push("_meta.json 有登記且筆數一致", m && m.count === IDX.data.length, m ? String(m.count) : "沒登記");
push("nav.js 的 TOOLS 有這頁", /p:\s*'tools\/quest-finder\/'/.test(read("assets/js/nav.js")));
push("首頁有入口卡片且帶 data-added", /href="tools\/quest-finder\/"[^>]*data-added="\d{4}-\d{2}-\d{2}"/.test(read("index.html")));
const si = JSON.parse(read("data/site-index.json"));
const ti = si.types.findIndex((t) => t.label === "任務");
const siRows = si.data.filter((r) => r[1] === ti);
push("命令面板索引有「任務」，key 是任務 id", ti >= 0 && siRows.length === IDX.data.length && siRows.every((r) => ids.has(+r[2])), `${siRows.length} 筆`);

// ── 頁面（jsdom）─────────────────────────────────────────
async function boot(query = "") {
  const html = read("tools/quest-finder/index.html");
  const vc = new VirtualConsole();
  const errs = [];
  vc.on("jsdomError", (e) => errs.push(e.message));
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://seagod99.github.io/tools/quest-finder/" + query, virtualConsole: vc });
  const { window } = dom;
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*?(data|assets)\//, "$1/");
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.scrollTo = () => {};
  for (const sc of window.document.querySelectorAll('script:not([src]):not([type="module"])')) window.eval(sc.textContent);
  await new Promise((r) => setTimeout(r, 700));
  return { window, doc: window.document, errs };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

{
  const { doc, errs } = await boot();
  push("④ 沒有條件時不列任務，只給提示", doc.querySelectorAll(".q-row").length === 0 && /一部分/.test(doc.querySelector(".empty")?.textContent || ""), `${doc.querySelectorAll(".q-row").length} 列`);
  const q = doc.getElementById("q");
  q.value = "陸行鳥";
  q.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  await wait(400);
  const rows = [...doc.querySelectorAll(".q-row")];
  const want = IDX.data.filter((r) => r[1].includes("陸行鳥")).length;
  push("搜尋「陸行鳥」：最多列 50 筆，狀態列寫總數", rows.length === Math.min(50, want) && doc.getElementById("status").textContent.includes(String(want)), `${rows.length} 列／共 ${want}`);
  const names = rows.map((r) => r.querySelector(".q-name").textContent);
  const firstContains = names.findIndex((n) => !n.startsWith("陸行鳥"));
  push("  排序：開頭相符的排在只是包含的前面", firstContains === -1 || names.slice(firstContains).every((n) => !n.startsWith("陸行鳥")), names.slice(0, 4).join("、"));
  q.value = "完全不存在的任務名ZZ";
  q.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  await wait(400);
  push("  查無結果時給建議，不是一片空白", /試試/.test(doc.querySelector(".empty")?.textContent || ""));
  push("  無 console error", errs.length === 0, errs.slice(0, 1).join("") || "乾淨");
}

{
  // ?id=：挑一個有 NPC＋座標＋前置＋報酬的任務
  let pick = null;
  for (const e of IDX.exps) {
    for (const [qid, d] of Object.entries(shards[e.id].data)) if (d.n != null && d.a && d.p && d.r) { pick = +qid; break; }
    if (pick) break;
  }
  const { doc, window } = await boot("?id=" + pick);
  await wait(300);
  const rows = doc.querySelectorAll(".q-row");
  push("④ ?id=<任務 id> 只列那一筆並展開", rows.length === 1 && rows[0].open && +rows[0].dataset.id === pick, `id ${pick}`);
  const body = rows[0] && rows[0].querySelector(".q-body").textContent;
  push("  展開後有接取 NPC、地圖／座標鈕、前置、報酬", /接取/.test(body) && doc.querySelector(".q-map") && doc.querySelector(".q-flag") && /前置任務/.test(body) && /報酬/.test(body), body.slice(0, 80));
  push("  座標鈕帶 /coord 指令", /^\/coord \d+\.\d \d+\.\d \S/.test(doc.querySelector(".q-flag")?.dataset.flag || ""), doc.querySelector(".q-flag")?.dataset.flag);
  const prevA = doc.querySelector("a[data-goto]");
  const prevId = +prevA.dataset.goto;
  prevA.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await wait(400);
  const r2 = doc.querySelectorAll(".q-row");
  push("  點前置任務：本頁切到那一筆（不重新載入），網址跟著變", r2.length === 1 && +r2[0].dataset.id === prevId && window.location.search === "?id=" + prevId, window.location.search);
}

{
  const dupName = dup[0][0];
  const { doc } = await boot("?q=" + encodeURIComponent(dupName));
  const rows = [...doc.querySelectorAll(".q-row")].filter((r) => r.querySelector(".q-name").textContent === dupName);
  push("② 同名任務都列出來，各自帶區域分辨", rows.length === dup[0][1] && rows.every((r) => r.querySelector(".q-meta").textContent.trim()), `「${dupName}」${rows.length} 筆`);
  const { doc: d2 } = await boot("?e=" + IDX.exps[5].id);
  push("?e=<資料片> 還原篩選", d2.getElementById("expSel").value === String(IDX.exps[5].id) && d2.querySelectorAll(".q-row").length > 0, d2.getElementById("status").textContent);
}

let fail = 0;
for (const [n, ok, d] of results) { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${n}${d ? `　（${d}）` : ""}`); }
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
