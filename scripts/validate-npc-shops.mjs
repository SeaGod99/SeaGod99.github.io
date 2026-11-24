// validate-npc-shops.mjs — NPC 商店目錄（/tools/npc-shops/）回歸
//
// 改完 tools/npc-shops/、scripts/build-npc-shops.mjs 或 data/npc-shops/ 必跑。
// 2026-11-24 起目錄也收「台服客戶端沒有店名」的店（第四輪 §5-6），會安靜出錯、畫面上看不出來的地方：
//   ① 無名店的標題是「無店名・付 ○○」——○○ 是建置端算好的 p（代價依筆數排序的前 2 種），不是店名。
//      p 要真的是那間店收的東西、而且照筆數排，否則標題會指向錯的貨幣。
//   ② 同一位 NPC 名下代價相同的無名店要合併（軍票補給負責人 11 間、喬納森 4 間），否則同一張卡上
//      是一串一模一樣的標題。
//   ③ **活動圖層（Teamcraft npcs.json 的 festival）上的無名店不收**：幾乎全是往年季節活動的攤位，
//      平常不在那張圖上。漏了這道，格里達尼亞舊街會從 28 人變 64 人、多的全是 2019–2021 年的活動 NPC。
//      這條要讀 out_data/cache/tc-npcs.json（不進 git）——本機有快取時才逐筆驗，CI 只驗「付往年活動貨幣的無名店是 0」。
//   ④ 有店名的店維持原樣（金色標題），無名店灰字、排在有店名的店後面。
//
// 相依：jsdom（npm i jsdom --no-save）
// 執行（repo 根目錄）：node scripts/validate-npc-shops.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTranslated } from "./lib/tw-text.mjs";

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch { console.error("需要 jsdom：npm i jsdom --no-save"); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const rj = (p) => JSON.parse(read(p));
const results = [];
const push = (n, ok, d = "") => results.push([n, !!ok, d]);

const IDX = rj("data/npc-shops/_index.json");
const SHARDS = IDX.maps.map((m) => rj(`data/npc-shops/${m.mapId}.json`));
const ITEMS = new Map(rj("data/items.json").data.map((i) => [i.id, i]));
const HTML = read("tools/npc-shops/index.html");
const mapIdOf = (name) => IDX.maps.find((m) => m.map === name)?.mapId;

const all = [];                     // [shard, npc, shop]
for (const sh of SHARDS) for (const npc of sh.npcs) for (const s of npc.s) all.push([sh, npc, s]);
const anon = all.filter(([, , s]) => !s.n);

// ── 資料層 ─────────────────────────────────────────────
{
  push("每張圖的分片都在、索引的數字對得上", SHARDS.length === IDX.maps.length &&
    IDX.maps.every((m, i) => SHARDS[i].npcs.length === m.npcCount && SHARDS[i].npcs.reduce((a, n) => a + n.s.length, 0) === m.shopCount),
    `${SHARDS.length} 張圖`);
  const badNamed = all.filter(([, , s]) => s.n && !isTranslated(s.n));
  push("有店名的店名都過守門", badNamed.length === 0, badNamed.slice(0, 3).map(([, , s]) => s.n).join("、"));

  const cnt = (s) => { const m = new Map(); for (const t of s.tr) for (const id of new Set(t.c.map(([c]) => c))) m.set(id, (m.get(id) || 0) + 1); return m; };
  const badP = anon.filter(([, , s]) => {
    const c = cnt(s);
    if (!Array.isArray(s.p) || !s.p.length || s.p.length > 2 || s.pn !== c.size) return true;
    if (s.p.some((id) => !c.has(id))) return true;
    const sorted = [...c].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id).slice(0, 2);
    return JSON.stringify(sorted) !== JSON.stringify(s.p);
  });
  push("① 無名店：p 是這間店收的代價、照筆數排的前 2 種，pn＝總共幾種", anon.length >= 100 && badP.length === 0,
    badP.length ? badP.slice(0, 3).map(([sh, n, s]) => `${n.n}@${sh.map}:${JSON.stringify(s.p)}/${s.pn}`).join("、") : `${anon.length} 間`);
  const noName = anon.filter(([, , s]) => s.p.some((id) => id !== 1 && !(ITEMS.get(id)?.name && isTranslated(ITEMS.get(id).name))));
  push("  標題用到的代價都有台服名（金幣除外，前端顯示「金幣」）", noName.length === 0, noName.slice(0, 3).map(([, n]) => n.n).join("、"));

  let dupKey = 0, dupTr = 0, order = 0;
  for (const sh of SHARDS) for (const npc of sh.npcs) {
    const keys = npc.s.filter((s) => !s.n).map((s) => s.p.join(","));
    if (new Set(keys).size !== keys.length) dupKey++;
    for (const s of npc.s.filter((x) => !x.n)) { const k = s.tr.map((t) => JSON.stringify(t)); if (new Set(k).size !== k.length) dupTr++; }
    const firstAnon = npc.s.findIndex((s) => !s.n);
    if (firstAnon >= 0 && npc.s.slice(firstAnon).some((s) => s.n)) order++;
  }
  push("② 同一位 NPC 名下沒有兩間代價相同的無名店（合併了）", dupKey === 0, `${dupKey} 位`);
  push("  合併後的無名店沒有重複的交易", dupTr === 0, `${dupTr} 間`);
  push("④ 有店名的店排在無名店前面", order === 0, `${order} 位`);

  const find = (npc, map) => all.filter(([sh, n]) => n.n === npc && sh.map === map).map(([, , s]) => s);
  const jon = find("喬納森", "格里達尼亞舊街").filter((s) => !s.n);
  push("案例：喬納森（成就幣，4 間無名店）合併成一間「付 成就幣」", jon.length === 1 && jon[0].p[0] === 21172 && jon[0].tr.length >= 30,
    jon.map((s) => `${s.p}:${s.tr.length}`).join("、"));
  const kuro = find("庫洛・阿里亞珀", "田園郡").filter((s) => !s.n);
  push("案例：庫洛・阿里亞珀收三種獎狀 → 三間、標題各不相同", kuro.length === 3 && new Set(kuro.map((s) => s.p[0])).size === 3,
    kuro.map((s) => ITEMS.get(s.p[0])?.name).join("、"));
  const gcIds = [20, 21, 22];
  const gc = gcIds.map((id) => anon.filter(([, n, s]) => /補給負責人$/.test(n.n) && s.t === "GCShop" && s.p[0] === id));
  push("案例：三國軍票補給負責人各一間「付 ○○軍票」（11 間合併成 1 間）", gc.every((g) => g.length === 1 && g[0][2].tr.length > 200),
    gc.map((g) => g.map(([, n, s]) => `${n.n}:${s.tr.length}`).join("")).join("、"));

  // ③ 往年活動攤位：CI 沒有 Teamcraft npcs.json 快取，先驗一條不需要快取的——付「年份結尾」活動貨幣的無名店是 0
  const yearly = anon.filter(([, , s]) => s.p.some((id) => /20\d\d$/.test(ITEMS.get(id)?.name || "")));
  push("③ 沒有無名店收往年活動貨幣（戀人巧克力2021、紅蓮祭票據2020…）", yearly.length === 0,
    yearly.slice(0, 3).map(([sh, n, s]) => `${n.n}@${sh.map}:${ITEMS.get(s.p[0])?.name}`).join("、") || `${anon.length} 間無名店`);
  const cache = join(ROOT, "out_data/cache/tc-npcs.json");
  if (existsSync(cache)) {
    const tc = JSON.parse(readFileSync(cache, "utf8"));
    const fest = anon.filter(([, n]) => tc[n.id]?.festival);
    const festNamed = all.filter(([, n, s]) => s.n && tc[n.id]?.festival).length;
    push("  活動圖層上的 NPC 沒有無名店（本機有 Teamcraft npcs.json 快取才驗）", fest.length === 0,
      fest.length ? fest.slice(0, 3).map(([sh, n]) => `${n.n}@${sh.map}`).join("、") : `有店名的活動 NPC 店 ${festNamed} 間維持原樣（候選 8）`);
  } else push("  活動圖層上的 NPC 沒有無名店", true, "沒有 out_data/cache/tc-npcs.json，略過（CI）");
}

// ── 頁面（jsdom）─────────────────────────────────────────
async function boot(query = "") {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on("jsdomError", (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: "outside-only", url: "https://seagod99.github.io/tools/npc-shops/" + query, virtualConsole: vc, pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*?(data|assets)\//, "$1/");
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
  };
  for (const sc of window.document.querySelectorAll("script:not([src])")) window.eval(sc.textContent);
  await new Promise((r) => setTimeout(r, 400));
  return { window, doc: window.document, errs };
}
const cardOf = (doc, name) => [...doc.querySelectorAll(".npc-card")].find((c) => c.querySelector(".npc-name")?.textContent === name);

{
  const { doc, errs } = await boot("?m=" + mapIdOf("格里達尼亞舊街"));
  const jon = cardOf(doc, "喬納森");
  const h = jon && jon.querySelector(".shop-h");
  push("① 頁面：喬納森的店標題是灰字「無店名・付 成就幣」", errs.length === 0 && h && h.classList.contains("anon") && /^無店名・付 成就幣 \d+ 項$/.test(h.textContent),
    errs[0] || (h ? h.textContent : "沒有喬納森的卡片"));
  const named = [...doc.querySelectorAll(".shop-h:not(.anon)")];
  push("④ 有店名的標題照舊（金色、不帶「無店名」）", named.length > 20 && named.every((x) => !/無店名/.test(x.textContent)), `${named.length} 個`);
  push("  說明有講「無店名」不是店名、活動攤位不列", /無店名・付 ○○/.test(doc.querySelector(".info-note").textContent) &&
    /季節活動期間才出現的 NPC/.test(doc.querySelector(".info-note").textContent) && !!doc.querySelector('.info-note a[href="../seasonal-shop/"]'));
  push("③ 頁面：往年活動的瓦倫提昂家的女僕沒有無名店（只剩有店名的那間）", !cardOf(doc, "瓦倫提昂家的女僕") ||
    [...doc.querySelectorAll(".npc-card")].filter((c) => c.querySelector(".npc-name").textContent === "瓦倫提昂家的女僕").every((c) => !c.querySelector(".shop-h.anon")));
}

{
  const { doc } = await boot("?m=" + mapIdOf("格里達尼亞舊街") + "&q=" + encodeURIComponent("成就幣"));
  push("用代價的名字搜得到無名店（?q=成就幣 → 喬納森）", !!cardOf(doc, "喬納森") && doc.querySelectorAll(".npc-card").length >= 1,
    doc.getElementById("statusLine").textContent);
}

{
  // 代價超過 2 種的寫「等 N 種」
  const many = anon.find(([, , s]) => s.pn > 2);
  const [sh, npc, s] = many;
  const { doc } = await boot("?m=" + sh.mapId + "&q=" + encodeURIComponent(npc.n));
  const hs = [...(cardOf(doc, npc.n)?.querySelectorAll(".shop-h.anon") || [])].map((x) => x.textContent);
  push("① 代價超過 2 種的標題寫「等 N 種」", hs.some((t) => t.includes(`等 ${s.pn} 種`)), `${npc.n}@${sh.map}：${hs.join("／")}`);
}

{
  const { doc } = await boot("?m=" + mapIdOf("田園郡") + "&q=" + encodeURIComponent("庫洛"));
  const hs = [...(cardOf(doc, "庫洛・阿里亞珀")?.querySelectorAll(".shop-h.anon") || [])].map((x) => x.textContent.replace(/ \d+ 項$/, ""));
  push("② 頁面：庫洛・阿里亞珀三間無名店的標題各不相同", hs.length === 3 && new Set(hs).size === 3, hs.join("／"));
}

// ── 報告 ──
let fail = 0;
for (const [n, ok, d] of results) {
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${n}${d ? `（${d}）` : ""}`);
}
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
