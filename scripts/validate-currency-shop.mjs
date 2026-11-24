// validate-currency-shop.mjs — 貨幣變現排行（/tools/gc-exchange/）的貨幣選擇器與辨識資訊回歸
//
// 改完 tools/gc-exchange/、scripts/build-currency-shop.mjs 或 data/currency-shop.json 必跑。
// 2026-11-22 起每種貨幣帶圖示、兌換 NPC／地點與所屬部族，選單從原生 <select> 換成可搜尋的清單。
// 會安靜出錯、畫面上看不出來的地方：
//   ① **無人島的貨幣要找得到**：台服官方名「謝爾達萊青船幣／綠島幣」裡沒有「無人島」，
//      站主自己都以為站上沒收（其實一直都在）。打「無人島」要搜得到這兩種，清單副標要標出來。
//   ② 圖示路徑要與 items.json 一致（換版後圖示會改號，資料沒重建的話會載到別的圖）。
//   ③ 兌換地點的 NPC 商店目錄連結：**目錄裡那張圖真的有這位 NPC、而且他收這種貨幣**才可以給，
//      否則點過去是空的（無名島、新月島還沒進目錄）。
//   ④ 部族連結的部族 id 要在 beast-tribes.json、且那個部族的貨幣就是這一種（§4.10：id 撞號會連錯部族）。
//   ⑤ 鍵盤：↓ 開啟、↑↓ 移動、Enter 選定、Esc 關閉並把焦點還給按鈕；選定後網址 ?c= 跟著變；?c= 深連結選得到。
//   ⑥ 收藏缺口（2026-11-23）：每種貨幣換得到的收藏品扣掉使用者在收藏頁標記已有的。
//      **storageKey／keyOf 錯了不會報錯，只會安靜地把已有的算成「還缺」**——金碟頁的幻卡就這樣錯了
//      兩個月（寫成 ffxiv_triple_triad_owned，幻卡頁實際是 ffxiv_triadcards_owned）。所以這裡拿
//      共用層 scripts/lib/collection-owners.mjs 去對**各收藏頁的原始碼**，金碟頁的資料也一起驗。
//
// 相依：jsdom（npm i jsdom --no-save）
// 執行（repo 根目錄）：node scripts/validate-currency-shop.mjs

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTw } from "./lib/tw-text.mjs";
import { COLLECTIONS, TRIAD } from "./lib/collection-owners.mjs";

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch { console.error("需要 jsdom：npm i jsdom --no-save"); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const results = [];
const push = (n, ok, d = "") => results.push([n, !!ok, d]);

// ── 資料層 ─────────────────────────────────────────────
const CS = JSON.parse(read("data/currency-shop.json"));
const items = new Map(JSON.parse(read("data/items.json")).data.map((x) => [x.id, x]));
const tribes = new Map(JSON.parse(read("data/beast-tribes.json")).data.map((t) => [t.id, t]));
const shopIdx = JSON.parse(read("data/npc-shops/_index.json"));
const catalogMaps = new Set(shopIdx.maps.map((m) => m.mapId));
const ISLAND = [37549, 37550];   // 謝爾達萊青船幣／綠島幣

{
  const badIcon = CS.data.filter((c) => {
    const it = items.get((c.ids || [c.id])[0]);
    return !c.icon || !/^\/i\/\d{6}\/\d{6}\.png$/.test(c.icon) || !it || it.icon !== c.icon;
  });
  push("② 每種貨幣都有圖示，且與 items.json 的圖示一致", CS.data.length >= 40 && badIcon.length === 0,
    badIcon.length ? badIcon.slice(0, 5).map((c) => c.name).join("、") : `${CS.data.length} 種`);

  const withAt = CS.data.filter((c) => c.at);
  push("兌換地點覆蓋 ≥ 80% 的貨幣", withAt.length / CS.data.length >= 0.8, `${withAt.length}/${CS.data.length}`);
  const badAt = [];
  for (const c of withAt) for (const a of c.at) if (!isTw(a[0]) || !isTw(a[1]) || /·/.test(a[0] + a[1])) badAt.push(`${c.name}:${a[0]}/${a[1]}`);
  push("兌換地點的地名與 NPC 名都過台服守門（中點是「・」）", badAt.length === 0, badAt.slice(0, 3).join("、"));
  push("每種最多 3 處，其餘只記數量", withAt.every((c) => c.at.length <= 3 && (c.atMore == null || (c.at.length === 3 && c.atMore > 0))));

  let linkN = 0;
  const badLink = [];
  for (const c of withAt) for (const a of c.at) {
    if (a[2] == null) continue;
    linkN++;
    if (!catalogMaps.has(a[2]) || !existsSync(join(ROOT, `data/npc-shops/${a[2]}.json`))) { badLink.push(`${c.name}:${a[2]}`); continue; }
    const sh = JSON.parse(read(`data/npc-shops/${a[2]}.json`));
    const curIds = c.ids || [c.id];
    const ok = sh.npcs.some((n) => n.n === a[1] && n.s.some((s) => s.tr.some((t) => t.c.some(([id]) => curIds.includes(id)))));
    if (!ok) badLink.push(`${c.name}:${a[1]}@${a[2]}`);
  }
  push("③ NPC 商店目錄連結：目錄裡那張圖真的有這位 NPC、且他收這種貨幣", linkN > 20 && badLink.length === 0,
    badLink.length ? badLink.slice(0, 4).join("、") : `${linkN} 處`);

  const badTribe = CS.data.filter((c) => c.tribe && (!tribes.has(c.tribe[0]) || tribes.get(c.tribe[0]).currency?.id !== c.id || tribes.get(c.tribe[0]).name !== c.tribe[1]));
  const tribeN = CS.data.filter((c) => c.tribe).length;
  push("④ 部族連結：部族 id 在 beast-tribes.json，且該部族的貨幣就是這一種", tribeN >= 5 && badTribe.length === 0,
    badTribe.length ? badTribe.map((c) => c.name).join("、") : `${tribeN} 種`);
  // 反向：beast-tribes 的貨幣只要有收進排行，就都要掛上部族（漏掛不會報錯，只是少一條連結）
  const tribeCur = new Set([...tribes.values()].map((t) => t.currency?.id).filter(Boolean));
  const missTribe = CS.data.filter((c) => tribeCur.has(c.id) && !c.tribe);
  push("  收進排行的部族貨幣都掛上了部族", missTribe.length === 0, missTribe.map((c) => c.name).join("、"));

  const isl = ISLAND.map((id) => CS.data.find((c) => c.id === id));
  push("① 無人島兩種貨幣都在排行裡，兌換地點是無名島", isl.every((c) => c && c.at && c.at[0][0] === "無名島"),
    isl.map((c) => (c ? `${c.name}@${c.at?.[0]?.[0]}` : "缺")).join("、"));
}

// ── ⑥ 收藏缺口：共用對照表 vs 各收藏頁原始碼 ─────────────────
const ALL_BOOKS = [...COLLECTIONS, TRIAD];
{
  const bad = [];
  for (const c of ALL_BOOKS) {
    const page = read(c.path + "index.html");
    const sk = page.match(/storageKey:\s*'([^']+)'/)?.[1];
    if (sk !== c.storageKey) bad.push(`${c.file}: 頁面 ${sk} ≠ 共用層 ${c.storageKey}`);
    // keyOf：頁面有自訂就照它的函式算一次，沒有就是 collection-tracker 的預設 'id:<id>'
    const m = page.match(/keyOf:\s*function\s*\((\w+)\)\s*\{\s*return\s+([^;]+);\s*\}/);
    const sample = { id: 7, kind: c.file === "facewear" ? "facewear" : "ornament" };
    const pageKey = m ? String(new Function(m[1], "return " + m[2])(sample)) : "id:7";
    const libKey = String(c.keyOf(sample));
    if (pageKey !== libKey) bad.push(`${c.file}: 頁面 keyOf → ${pageKey} ≠ 共用層 ${libKey}`);
  }
  push("⑥ 共用對照表的 storageKey 與 keyOf 和各收藏頁原始碼逐字一致", bad.length === 0, bad.join("；") || `${ALL_BOOKS.length} 本`);

  // 每個 own.k 都要真的是那本圖鑑裡某一格的鍵（id 對錯本圖鑑的話，鍵格式對了也讀不到）
  const keysOf = new Map();
  for (const c of COLLECTIONS) {
    const s = keysOf.get(c.storageKey) || new Set();
    for (const e of JSON.parse(read(`data/${c.file}.json`)).data) s.add(String(c.keyOf(e)));
    keysOf.set(c.storageKey, s);
  }
  keysOf.set(TRIAD.storageKey, new Set(JSON.parse(read("data/triple-triad.json")).data.map((e) => String(TRIAD.keyOf(e)))));
  const checkOwn = (rows, where) => rows.filter((x) => x.own && !(keysOf.get(x.own.sk)?.has(String(x.own.k)))).map((x) => `${where}:${x.name}(${x.own.sk}/${x.own.k})`);

  const withCollect = CS.data.filter((c) => c.collect && c.collect.length);
  const coll = withCollect.flatMap((c) => c.collect);
  push("⑥ 換得到收藏品的貨幣 ≥ 30 種、收藏品 ≥ 300 筆", withCollect.length >= 30 && coll.length >= 300, `${withCollect.length} 種、${coll.length} 筆`);
  const badOwn = checkOwn(coll, "貨幣");
  push("⑥ 每筆 collect 的 own.sk／own.k 都對得到那本圖鑑真的有的一格", badOwn.length === 0, badOwn.slice(0, 3).join("、"));
  const badName = coll.filter((x) => !isTw(x.name) || !(x.cost > 0) || !x.own.path || !x.own.label);
  push("  collect 的名稱都過台服守門、單價 > 0、帶得出圖鑑頁", badName.length === 0, badName.slice(0, 3).map((x) => x.name).join("、"));
  const sorted = withCollect.every((c) => c.collect.every((x, i, a) => i === 0 || a[i - 1].cost / a[i - 1].count <= x.cost / x.count));
  push("  collect 依單價排（固定順序，不依會變的值）", sorted);

  const GS = JSON.parse(read("data/gold-saucer.json"));
  const gsOwn = GS.data.flatMap((c) => c.items.filter((x) => x.own));
  const badGs = checkOwn(gsOwn, "金碟");
  push("⑥ 金碟頁的收藏對應也走同一份（幻卡存檔鍵 ffxiv_triadcards_owned）", badGs.length === 0 && gsOwn.some((x) => x.own.sk === TRIAD.storageKey),
    badGs.slice(0, 3).join("、") || `${gsOwn.length} 筆`);
}

// ── 頁面（jsdom）─────────────────────────────────────────
const HTML = read("tools/gc-exchange/index.html");
push("頁面不再用原生 <select> 選貨幣（放不了圖示）", !/id="curSel"/.test(HTML));
push("搜尋摺疊走全站共用的 SGT_fold，不自己抄正規式", /function sgtFold\(s\) \{ return window\.SGT_fold \? window\.SGT_fold\(s\)/.test(HTML));
/* 表頭蓋住第 1 名（2026-11-22 修）：.table-wrap 有 overflow-x: auto 時它就是 sticky 的參考框，
   表頭的 top: 46px 會讓表頭永遠往下壓一列、蓋住變現值最高的那一列。jsdom 量不了版面，所以驗原始碼：
   預設 top: 0；只有在拿掉橫向捲動的那個斷點裡才可以是 46px。 */
{
  const css = HTML.slice(HTML.indexOf("<style>"), HTML.indexOf("</style>"));
  const base = css.match(/thead th \{[^}]*\}/)?.[0] || "";
  const mq = css.match(/@media \(min-width: (\d+)px\) \{\s*\.table-wrap \{ overflow-x: visible; \}\s*thead th \{ top: 46px; \}/);
  push("表頭預設 top: 0（外框是捲動容器時 46px 會蓋住第 1 名），46px 只出現在拿掉橫向捲動的斷點",
    /top: 0;/.test(base) && !/top: 46px/.test(base) && !!mq, mq ? `≥${mq[1]}px 才黏頂列` : "找不到斷點");
}

async function boot(query = "", ls = {}) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on("jsdomError", (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: "outside-only", url: "https://seagod99.github.io/tools/gc-exchange/" + query, virtualConsole: vc, pretendToBeVisual: true });
  const { window } = dom;
  for (const [k, v] of Object.entries(ls)) window.localStorage.setItem(k, v);
  window.fetch = async (u) => {
    const s = String(u);
    if (/universalis/.test(s)) return { ok: true, status: 200, json: async () => ({ results: [], failedItems: [] }) };
    const rel = s.replace(/^.*?(data|assets)\//, "$1/");
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.scrollTo = () => {};
  for (const src of ["assets/js/patch-gate.js", "assets/js/universalis.js"]) window.eval(read(src));
  for (const sc of window.document.querySelectorAll('script:not([src]):not([type="module"])')) window.eval(sc.textContent);
  await new Promise((r) => setTimeout(r, 600));
  return { window, doc: window.document, errs };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (win, el, k) => el.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

{
  const { window, doc, errs } = await boot();
  const btn = doc.getElementById("curBtn");
  const panel = doc.getElementById("curPanel");
  const search = doc.getElementById("curSearch");
  push("開頁沒有 JS 錯誤", errs.length === 0, errs.slice(0, 2).join(" | "));
  push("按鈕顯示第一種貨幣的名稱與圖示", doc.getElementById("curBtnName").textContent === CS.data[0].name &&
    /xivapi\.com\/i\//.test(doc.getElementById("curBtnIco").getAttribute("src") || "") && !doc.getElementById("curBtnIco").hidden,
    doc.getElementById("curBtnName").textContent);
  push("成本欄表頭帶貨幣圖示", !!doc.querySelector("thead .th-ico"));
  push("面板預設關著，aria-expanded=false", panel.hidden && btn.getAttribute("aria-expanded") === "false");

  btn.click();
  await wait(20);
  const opts = [...doc.querySelectorAll("#curList [role=option]")];
  push("點按鈕開啟面板，焦點進搜尋框", !panel.hidden && btn.getAttribute("aria-expanded") === "true" && doc.activeElement === search);
  push("清單列出全部貨幣（已過版本閘門）", opts.length >= 40, `${opts.length} 列`);
  push("每一列都有圖示（alt 留空，旁邊就是名字）", opts.every((o) => { const im = o.querySelector("img.cur-ico"); return im && im.getAttribute("alt") === "" && /^https:\/\/xivapi\.com\/i\/\d{6}\/\d{6}\.png$/.test(im.getAttribute("src")); }));
  push("目前選的那一列 aria-selected=true，鍵盤游標也在它身上", opts[0].getAttribute("aria-selected") === "true" && search.getAttribute("aria-activedescendant") === opts[0].id);
  const islOpts = opts.filter((o) => ISLAND.includes(+o.dataset.id));
  push("① 無人島兩種貨幣的副標標出「無名島」與「🏝️ 無人島」", islOpts.length === 2 && islOpts.every((o) => /無名島/.test(o.textContent) && /🏝️ 無人島/.test(o.textContent)),
    islOpts.map((o) => o.querySelector(".cur-opt-sub").textContent).join(" ／ "));
  push("季節活動貨幣另成一組", [...doc.querySelectorAll("#curList [role=group]")].some((g) => /季節活動/.test(g.textContent)));

  search.value = "無人島";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  const hit = [...doc.querySelectorAll("#curList [role=option]")].map((o) => +o.dataset.id).sort();
  push("① 打「無人島」只剩無人島的兩種貨幣", JSON.stringify(hit) === JSON.stringify([...ISLAND].sort()), hit.join(","));

  search.value = "長風";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  const tribeHit = [...doc.querySelectorAll("#curList [role=option]")].map((o) => +o.dataset.id);
  push("用部族名搜得到部族貨幣（長風 → 櫟木幣）", tribeHit.length === 1 && tribeHit[0] === 21073, tribeHit.join(","));

  search.value = "工票交易員";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  push("用 NPC 名搜得到（工票交易員 → 各色工票）", doc.querySelectorAll("#curList [role=option]").length >= 4);

  search.value = "完全不存在的貨幣ZZ";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  push("搜不到時給提示、游標清空", /找不到/.test(doc.getElementById("curList").textContent) && !search.hasAttribute("aria-activedescendant"));

  search.value = "綠島";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  key(window, search, "Enter");
  await wait(50);
  push("⑤ 搜尋後 Enter 選第一筆：面板關閉、焦點回按鈕、網址 ?c= 跟著變", panel.hidden && doc.activeElement === btn &&
    new URL(window.location.href).searchParams.get("c") === "37550" && doc.getElementById("curBtnName").textContent === "謝爾達萊綠島幣",
    window.location.search);
  const info = doc.getElementById("curInfo");
  push("① 兌換資訊列：貿易小員（無名島）＋連到無人島頁", !info.hidden && /貿易小員（無名島）/.test(info.textContent) &&
    !!info.querySelector('a[href="../island/"]'));
  /* 2026-11-24 起 NPC 商店目錄也收客戶端沒有店名的店（第四輪 §5-6），貿易小員的兌換就是這種店——
     先前這條驗的是「無名島不在目錄所以不給連結」，前提已經變了。目錄真的收這位 NPC 收這種貨幣，由上面的 ③ 逐處驗。 */
  const isl = [...info.querySelectorAll('a[href^="../npc-shops/"]')].find((a) => /貿易小員/.test(a.textContent));
  push("  貿易小員（無店名的店，11-24 起目錄有收）連到 NPC 商店目錄的無名島", isl && new URL(isl.getAttribute("href"), "http://x/").searchParams.get("m") ===
    String(shopIdx.maps.find((m) => m.map === "無名島")?.mapId), isl && isl.getAttribute("href"));

  key(window, btn, "ArrowDown");
  await wait(20);
  push("⑤ 按鈕上按 ↓ 開啟", !panel.hidden && doc.activeElement === search);
  const before = search.getAttribute("aria-activedescendant");
  key(window, search, "ArrowDown");
  const after = search.getAttribute("aria-activedescendant");
  push("  ↓ 移動鍵盤游標", before && after && before !== after, `${before} → ${after}`);
  key(window, search, "Escape");
  push("⑤ Esc 關閉並把焦點還給按鈕，選擇不變", panel.hidden && doc.activeElement === btn && new URL(window.location.href).searchParams.get("c") === "37550");

  btn.click();
  await wait(20);
  doc.body.click();
  push("點面板外面會關閉", panel.hidden);

  // 部族貨幣：兌換資訊連到部族頁
  btn.click();
  await wait(20);
  doc.getElementById("curOpt21073").click();
  await wait(50);
  push("④ 部族貨幣的兌換資訊連到部族頁 ?tribe=", !!doc.querySelector('#curInfo a[href="../beast-tribes/?tribe=5"]'));
  push("  NPC 商店目錄收了的 NPC 給連結（帶 m 與 q）", !!doc.querySelector('#curInfo a[href^="../npc-shops/?m="]'));

  doc.getElementById("tabEarn").click();
  await wait(50);
  push("切到「軍票怎麼賺」時選擇器與兌換資訊都收起來", doc.getElementById("curPick").style.display === "none" && doc.getElementById("curInfo").hidden);
}

{
  const { doc, window } = await boot("?c=37549");
  push("⑤ 深連結 ?c=37549 選到謝爾達萊青船幣", doc.getElementById("curBtnName").textContent === "謝爾達萊青船幣" &&
    new URL(window.location.href).searchParams.get("c") === "37549");
}

// ── ⑥ 收藏缺口（jsdom）──
{
  const LABELS = ["坐騎", "寵物", "樂譜", "表情", "鳥鞍", "時尚配飾", "幻卡"];
  // 收藏品最多、而且跨最多本圖鑑的貨幣
  const big = [...CS.data].filter((c) => c.collect).sort((a, b) =>
    new Set(b.collect.map((x) => x.own.label)).size - new Set(a.collect.map((x) => x.own.label)).size || b.collect.length - a.collect.length)[0];
  const sumNum = (doc, re) => { const m = doc.getElementById("gapSum").textContent.replace(/,/g, "").match(re); return m ? +m[1] : null; };

  // ① 什麼都沒標
  let { doc, errs } = await boot("?c=" + (big.ids || [big.id])[0]);
  const wrap = doc.getElementById("gapWrap");
  const lis = () => doc.querySelectorAll("#gapBody .gap-list li").length;
  const T = sumNum(doc, /換得到 (\d+) 件/), N0 = sumNum(doc, /還缺 (\d+) 件/), C0 = sumNum(doc, /全換要 (\d+)/);
  push("⑥ 換得到收藏品的貨幣顯示缺口區（預設收合，摘要行有件數與總價）", errs.length === 0 && !wrap.hidden && !doc.getElementById("gapBox").open && T > 0 && N0 === T && C0 > 0,
    `${big.name}：${doc.getElementById("gapSum").textContent}`);
  push("  沒有任何進度時：清單列出全部、並講明哪幾本沒讀到進度", lis() === T && /沒有讀到/.test(doc.getElementById("gapBody").textContent));
  const heads = [...doc.querySelectorAll("#gapBody .gap-grp-head a")].map((a) => a.textContent);
  push("  分組順序固定（坐騎→寵物→樂譜→表情→鳥鞍→時尚配飾→幻卡），不隨缺口多寡跳動",
    heads.length >= 2 && heads.every((h, i) => i === 0 || LABELS.indexOf(heads[i - 1]) < LABELS.indexOf(h)), heads.join("→"));
  // 從畫面上實際列出的挑（被版本閘門擋掉的不會出現）
  const a0 = doc.querySelector("#gapBody a.gap-name");
  const first = big.collect.find((x) => a0 && x.name === a0.textContent) || big.collect[0];
  push("  名稱連到該收藏頁的 ?id=<那一格的鍵>", a0 && a0.getAttribute("href") === "../../" + first.own.path + "?id=" + encodeURIComponent(first.own.k),
    a0 && a0.getAttribute("href"));

  // ② 標了一件：少一件、總價扣掉它的單價，那本不再被列為「沒讀到進度」
  ({ doc } = await boot("?c=" + (big.ids || [big.id])[0], { [first.own.sk]: JSON.stringify([first.own.k]) }));
  const N1 = sumNum(doc, /還缺 (\d+) 件/), C1 = sumNum(doc, /全換要 (\d+)/);
  push("⑥ 在收藏頁標了一件 → 少一件、總價扣掉它的單價、清單不再列它", N1 === T - 1 && C1 === C0 - first.cost && lis() === T - 1 &&
    ![...doc.querySelectorAll("#gapBody a.gap-name")].some((a) => a.textContent === first.name), `${N0}→${N1}、${C0}→${C1}`);
  const warnTxt = doc.querySelector("#gapBody .warn")?.textContent || "";
  push("  有進度的那本不再出現在「沒讀到」的提示裡", !warnTxt.includes("「" + first.own.label) && !warnTxt.includes("、" + first.own.label));

  // ③ 寵物頁存的是純數字（keyOf 回傳 m.id）——數字與字串都要認得
  const pet = CS.data.flatMap((c) => (c.collect || []).map((x) => [c, x])).find(([, x]) => x.own.c === "minions");
  if (pet) {
    const [pc, px] = pet;
    ({ doc } = await boot("?c=" + (pc.ids || [pc.id])[0], { ffxiv_minions_owned: JSON.stringify([Number(px.own.k)]) }));
    push("⑥ 寵物頁存純數字的進度也認得", ![...doc.querySelectorAll("#gapBody a.gap-name")].some((a) => a.textContent === px.name), `${pc.name}／${px.name}`);
  } else push("⑥ 寵物頁存純數字的進度也認得", false, "資料裡找不到寵物");

  // ④ 全部標起來 → 「你都有了」
  const ls = {};
  for (const x of big.collect) { const s = ls[x.own.sk] ? JSON.parse(ls[x.own.sk]) : []; s.push(x.own.k); ls[x.own.sk] = JSON.stringify(s); }
  ({ doc } = await boot("?c=" + (big.ids || [big.id])[0], ls));
  push("⑥ 全部都有 → 摘要寫「你都有了」、各組標已收齊、沒有清單列", /你都有了/.test(doc.getElementById("gapSum").textContent) && lis() === 0 &&
    doc.querySelectorAll("#gapBody .gap-done").length === new Set(big.collect.map((x) => x.own.label)).size);

  // ⑤ 展開狀態跨貨幣保留；沒有收藏品的貨幣、與「軍票怎麼賺」都不顯示
  ({ doc } = await boot("?c=" + (big.ids || [big.id])[0]));
  doc.getElementById("gapBox").open = true;
  const other = CS.data.find((c) => c !== big && c.collect && c.collect.length && !c.event);
  doc.getElementById("curBtn").click();
  await wait(20);
  doc.getElementById("curOpt" + other.id).click();
  await wait(50);
  push("⑥ 切到另一種有收藏品的貨幣：內容換掉、展開狀態保留", doc.getElementById("gapBox").open && doc.getElementById("gapSum").textContent.includes(other.name), other.name);
  const none = CS.data.find((c) => !c.collect && !c.event);
  doc.getElementById("curBtn").click();
  await wait(20);
  doc.getElementById("curOpt" + none.id).click();
  await wait(50);
  push("  換不到收藏品的貨幣：整塊不出現", doc.getElementById("gapWrap").hidden, none.name);
  doc.getElementById("curBtn").click();
  await wait(20);
  doc.getElementById("curOpt" + other.id).click();
  await wait(50);
  doc.getElementById("tabEarn").click();
  await wait(50);
  push("  「軍票怎麼賺」分頁不顯示", doc.getElementById("gapWrap").hidden);
}

// ── 報告 ──
let fail = 0;
for (const [n, ok, d] of results) {
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${n}${d ? `（${d}）` : ""}`);
}
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
