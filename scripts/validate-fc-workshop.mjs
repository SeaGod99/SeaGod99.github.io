// validate-fc-workshop.mjs — 部隊工房建造材料頁（/tools/fc-workshop/）回歸
//
// 改完 tools/fc-workshop/、scripts/build-fc-workshop.mjs 或 data/fc-workshop.json 必跑
// （潛水艇頁的建造材料另有 validate-submarine.mjs）。會安靜出錯、畫面上看不出來的地方：
//   ① 空的階段：乙太轉輪只有第 1 階段要交東西、外牆第 3 部位以後也只有第 1 階段——資料裡第 2、3 階段是空陣列。
//      沒濾的話會印出空表格，「3 個階段」也會算錯。
//   ② 外牆的部位名來自客戶端（CompanyCraftPart → CompanyCraftType），每個部位的標題要照資料，不可以是「部位 1」。
//   ③ 類型選單由資料長出來，不寫死。
//   ④ 用素材名搜：成品名沒比對到時，摘要要寫「用到：X ×N」，N＝這件成品的合計（不是某一階段的量）。
//   ⑤ 「帶去市場頁算成本」靠市場頁的部隊製作配方（recipes.json 的 jobId 0）展開——每件成品都要有那筆配方。
//   ⑥ 新頁要同時登記 nav.js 與首頁卡片（兩邊各自維護，2026-09-27 曾少了 9 張卡）。
//
// 相依：jsdom（npm i jsdom --no-save）
// 執行（repo 根目錄）：node scripts/validate-fc-workshop.mjs

import { readFileSync, existsSync } from "node:fs";
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

const FC = JSON.parse(read("data/fc-workshop.json")).data;
const HTML = read("tools/fc-workshop/index.html");

// ── 資料層 ─────────────────────────────────────────────
{
  const multi = FC.filter((d) => new Set(d.phases.map((p) => p.part)).size > 1);
  const badParts = multi.filter((d) => !Array.isArray(d.parts) || d.phases.some((p) => !d.parts[p.part - 1] || !isTw(d.parts[p.part - 1])));
  push("② 多部位成品（外牆）每個部位都有台服部位名", multi.length >= 50 && badParts.length === 0,
    badParts.length ? badParts.slice(0, 3).map((d) => d.name).join("、") : `${multi.length} 件`);
  push("  單一部位的成品不帶 parts（部位名＝類型名，不重複存）", FC.filter((d) => !multi.includes(d)).every((d) => !d.parts));
  const totBad = FC.filter((d) => {
    const t = new Map();
    for (const ph of d.phases) for (const m of ph.mats) t.set(m.itemId, (t.get(m.itemId) || 0) + m.qty);
    return t.size !== d.total.length || d.total.some((x) => t.get(x.itemId) !== x.qty);
  });
  push("  合計＝各階段數量加總", totBad.length === 0, totBad.slice(0, 3).map((d) => d.name).join("、"));
  const qtyBad = FC.flatMap((d) => d.phases.flatMap((ph) => ph.mats)).filter((m) => m.qty !== m.per * m.sets);
  push("  數量＝一次交幾個 × 要交幾次", qtyBad.length === 0, String(qtyBad.length));
  const rec0 = new Set(JSON.parse(read("data/recipes.json")).data.filter((r) => r.jobId === 0).map((r) => r.itemId));
  const noRec = FC.filter((d) => !rec0.has(d.itemId));
  push("⑤ 每件成品在市場頁都有部隊製作配方（帶過去才展開得成素材）", noRec.length === 0, noRec.slice(0, 3).map((d) => d.name).join("、") || `${FC.length} 件`);
  const emptyPh = FC.reduce((s, d) => s + d.phases.filter((p) => !p.mats.length).length, 0);
  push("  資料裡確實有空的階段（① 的前提；沒有的話這組斷言就沒在驗東西）", emptyPh > 50, `${emptyPh} 個空階段`);
}

// ── 登記 ───────────────────────────────────────────────
{
  const nav = read("assets/js/nav.js"), home = read("index.html");
  push("⑥ nav.js 與首頁都登記了", /p: 'tools\/fc-workshop\/'/.test(nav) && /href="tools\/fc-workshop\/"/.test(home));
  push("  首頁卡片有 data-added", /href="tools\/fc-workshop\/" class="tool-card available" data-added="\d{4}-\d{2}-\d{2}"/.test(home));
  push("  潛水艇頁的建造材料區連過來", /href="\.\.\/fc-workshop\/"/.test(read("tools/submarine/index.html")));
  push("  市場頁「會用掉它的地方」的部隊工房列連到 ?id=", /\.\.\/fc-workshop\/\?id=' \+ r\[0\]/.test(read("tools/market/market.js")));
  push("③ 類型選單在 HTML 裡只有「全部類型」（其餘由資料長出來）", /<select id="typeSel"[^>]*><option value="">全部類型<\/option><\/select>/.test(HTML));
  // 先拿掉 HTML 註解再找位置（§4.90：<link> 上方的說明寫著「排在下面那個 <style> 之前」，會被 indexOf 當成真的標籤）
  const noCm = HTML.replace(/<!--[\s\S]*?-->/g, "");
  push("  載了 common.css 且排在頁面自己的 <style> 之前", noCm.indexOf("assets/css/common.css") > 0 && noCm.indexOf("assets/css/common.css") < noCm.indexOf("<style>"));
}

// ── 頁面（jsdom）─────────────────────────────────────────
async function boot(query = "") {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on("jsdomError", (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: "outside-only", url: "https://seagod99.github.io/tools/fc-workshop/" + query, virtualConsole: vc, pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*?(data|assets)\//, "$1/");
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  for (const sc of window.document.querySelectorAll("script:not([src])")) window.eval(sc.textContent);
  await new Promise((r) => setTimeout(r, 300));
  return { window, doc: window.document, errs };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const open = async (win, det) => { det.open = true; det.dispatchEvent(new win.Event("toggle")); await wait(10); };

{
  const { window, doc, errs } = await boot();
  const cards = doc.querySelectorAll("details.fw");
  push("全部成品都列出來、依類型分組", errs.length === 0 && cards.length === FC.length && doc.querySelectorAll("section.grp").length >= 5,
    `${cards.length} 件、${doc.querySelectorAll("section.grp").length} 組`);
  const groups = new Set(FC.map((d) => (d.type.includes("：") ? d.type.slice(0, d.type.indexOf("：")) + "部件" : d.type)));
  const opts = [...doc.querySelectorAll("#typeSel option")].slice(1).map((o) => o.value);
  push("③ 類型選單＝資料裡的類型（組）", opts.length === groups.size && opts.every((o) => groups.has(o)), opts.join("、"));
  push("  內容是展開時才畫（162 件不一次塞進 DOM）", [...doc.querySelectorAll(".fw-body")].every((b) => !b.innerHTML));

  // ① 乙太轉輪：只有第 1 階段
  const wheel = FC.find((d) => d.type === "乙太轉輪");
  const wd = doc.getElementById("fw-" + wheel.itemId);
  await open(window, wd);
  const wNonEmpty = wheel.phases.filter((p) => p.mats.length);
  const wRows = wd.querySelectorAll(".fw-body table:not(.x) tbody tr").length - wheel.total.length;   // 扣掉合計表
  push("① 空的階段不顯示：乙太轉輪只畫有東西的階段、摘要的階段數也不算空的", wRows === wNonEmpty.reduce((s, p) => s + p.mats.length, 0) &&
    !/第 2 階段|第 3 階段/.test(wd.querySelector(".fw-body").textContent) && wd.querySelector(".fw-sub").textContent.includes(wNonEmpty.length + " 個階段"),
    `${wheel.name}：${wd.querySelector(".fw-sub").textContent}`);
  const qCell = wd.querySelector("td.q");
  const m0 = wNonEmpty[0].mats[0];
  push("  數量欄寫成「一次交幾個×要交幾次＝合計」", qCell && qCell.textContent === `${m0.per}×${m0.sets}＝${m0.qty}`, qCell && qCell.textContent);
  push("  素材名連到市場頁、沒有配方的標「另外取得」", !!wd.querySelector('a[href="../market/#item=' + m0.itemId + '"]') &&
    (wNonEmpty.flatMap((p) => p.mats).some((m) => !m.craftable) ? !!wd.querySelector(".ext") : true));
  push("⑤ 帶去市場頁的連結是成品本身（#craft=<成品>:1）", !!wd.querySelector('a[href="../market/#craft=' + wheel.itemId + ':1"]'));

  // ② 外牆：部位標題照資料
  const wall = FC.find((d) => d.parts && d.parts.length === 8);
  const wl = doc.getElementById("fw-" + wall.itemId);
  await open(window, wl);
  const heads = [...wl.querySelectorAll(".fw-body h3.fw-part")].map((h) => h.textContent).filter((t) => !/^合計/.test(t));
  push("② 外牆：每個部位的標題就是資料裡的台服部位名", JSON.stringify(heads) === JSON.stringify(wall.parts) && /8 個部位/.test(wl.querySelector(".fw-sub").textContent),
    `${wall.name}：${heads.join("／")}`);
  const totRows = wl.querySelectorAll(".fw-total tbody tr");
  const qs = [...totRows].map((tr) => Number(tr.querySelector("td.q").textContent.replace(/,/g, "")));
  push("  合計表列出每一種素材、依數量由多到少", totRows.length === wall.total.length && qs.every((q, i) => i === 0 || qs[i - 1] >= q), `${totRows.length} 種`);

  // ④ 用素材名搜
  const mat = "鈷鐵鉚釘";
  const using = FC.filter((d) => d.phases.some((p) => p.mats.some((m) => m.name === mat)));
  const q = doc.getElementById("q");
  q.value = mat;
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(250);
  const shown = [...doc.querySelectorAll("details.fw")];
  const sample = using.find((d) => !d.name.includes(mat));
  const sumHit = sample && doc.getElementById("fw-" + sample.itemId)?.querySelector(".fw-hit")?.textContent;
  const want = sample && sample.total.find((t) => t.itemId === sample.phases.flatMap((p) => p.mats).find((m) => m.name === mat).itemId).qty;
  push("④ 用素材名搜：列出所有用到它的成品，摘要寫「用到：素材 ×合計」", shown.length === using.length && sumHit === `用到：${mat} ×${want.toLocaleString()}`,
    `${shown.length} 件；${sumHit}`);
  push("  網址 ?q= 跟著變", new URL(window.location.href).searchParams.get("q") === mat);
  const sd = doc.getElementById("fw-" + sample.itemId);
  await open(window, sd);
  push("  展開後比對到的素材那幾列有標出來", sd.querySelectorAll("tr.mat-hit").length >= 2);
  q.value = "完全不存在的素材ZZ";
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(250);
  push("  搜不到時講出來", /找不到符合/.test(doc.getElementById("list").textContent));
}

{
  const wall = FC.find((d) => d.parts);
  const { doc, window } = await boot("?id=" + wall.itemId);
  const shown = doc.querySelectorAll("details.fw");
  push("深連結 ?id=：只列那一件、已展開、內容已畫好", shown.length === 1 && shown[0].open && shown[0].querySelector(".fw-body").innerHTML.length > 100, wall.name);
  doc.getElementById("showAll").click();
  await wait(20);
  push("  按「顯示全部」：列回全部、剛剛那件仍展開、網址拿掉 id", doc.querySelectorAll("details.fw").length === FC.length &&
    doc.getElementById("fw-" + wall.itemId).open && !new URL(window.location.href).searchParams.has("id"));
}

{
  const { doc } = await boot("?type=" + encodeURIComponent("潛水艇部件"));
  const n = FC.filter((d) => d.type.startsWith("潛水艇：")).length;
  push("深連結 ?type=潛水艇部件：只列那一組、選單跟著選好", doc.querySelectorAll("details.fw").length === n && doc.getElementById("typeSel").value === "潛水艇部件", `${n} 件`);
}

// ── 報告 ──
let fail = 0;
for (const [n, ok, d] of results) {
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${n}${d ? `（${d}）` : ""}`);
}
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
