// validate-universalis.mjs — assets/js/universalis.js 客戶端的回歸（2026-10-03 建）
//
// 改完 universalis.js 的請求／快取段必跑。驗的都是「出錯時畫面看不出來」的行為：
//   ① 同一個查詢還在路上時不重打（在途請求合併）
//   ② 4xx 是永久錯誤、不重試——2026-10-03 前那個 throw 寫在 try 裡被同一個 catch 接走，4xx 也重試兩次
//   ③ 429／5xx 會重試（共 3 次）
//   ④ 每次請求都帶 AbortController 的 signal（逾時 15 秒；原本連線掛住會一直卡在「查價中…」）
//   ⑤ sessionStorage 配額滿時先清掉最舊的查價快取再寫——原本只吞掉例外，之後每次都寫不進去、每次都重打
//
// 相依：jsdom（npm i jsdom --no-save）
// 執行（repo 根目錄）：node scripts/validate-universalis.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let JSDOM;
try { ({ JSDOM } = await import("jsdom")); }
catch { console.error("需要 jsdom：npm i jsdom --no-save"); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "assets/js/universalis.js"), "utf8");
const results = [];
const push = (n, ok, d = "") => results.push([n, !!ok, d]);

function mk(fetchImpl, quota = Infinity) {
  const dom = new JSDOM("<!doctype html><body>", { runScripts: "outside-only", url: "https://seagod99.github.io/tools/market/" });
  const w = dom.window;
  const store = new Map();
  const size = () => [...store.values()].reduce((s, v) => s + v.length, 0);
  Object.defineProperty(w, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { v = String(v); if (size() - (store.get(k) || "").length + v.length > quota) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } store.set(k, v); },
      removeItem: (k) => { store.delete(k); },
      key: (i) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    },
  });
  const calls = [];
  w.fetch = async (url, opts) => { calls.push({ url: String(url), opts }); return fetchImpl(url, opts, calls.length); };
  w.eval(SRC);
  return { U: w.Universalis, calls, store };
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const listing = (ids) => ({ items: Object.fromEntries(ids.map((id) => [id, { itemID: id, listings: [], lastUploadTime: 1 }])) });

{
  // ① 在途請求合併
  let release;
  const gate = new Promise((r) => { release = r; });
  const { U, calls } = mk(async (url) => { await gate; return ok(listing([5057, 5056])); });
  const p1 = U.fetchListings(4028, [5057, 5056]);
  const p2 = U.fetchListings(4028, [5057, 5056]);
  release();
  const [a, b] = await Promise.all([p1, p2]);
  push("① 同一個查詢同時發兩次，只打一次 API", calls.length === 1 && a && b && a === b, `fetch ${calls.length} 次`);
  push("④ 請求帶 AbortController 的 signal（逾時用）", calls[0] && calls[0].opts && calls[0].opts.signal, "");
}
{
  // ② 4xx 不重試
  const { U, calls } = mk(async () => ({ ok: false, status: 404, json: async () => ({}) }));
  const r = await U.fetchListings(4028, [1]);
  push("② 4xx 不重試（永久錯誤）", calls.length === 1 && r === null, `fetch ${calls.length} 次`);
}
{
  // ③ 5xx 重試
  const { U, calls } = mk(async (url, opts, n) => (n < 3 ? { ok: false, status: 503, json: async () => ({}) } : ok(listing([2]))));
  const r = await U.fetchListings(4028, [2]);
  push("③ 5xx 會重試，第三次成功就拿到資料", calls.length === 3 && r && r.items && r.items[2], `fetch ${calls.length} 次`);
}
{
  // ⑤ 配額滿：清掉舊的查價快取後寫得進去
  const { U, store } = mk(async (url) => {
    const ids = String(url).split("/").pop().split("?")[0].split(",").map(Number);
    return ok(listing(ids));
  }, 700);    // 每筆約 120 字元，12 筆一定會塞爆
  for (let i = 1; i <= 12; i++) await U.fetchListings(4028, [i * 10]);
  const keys = [...store.keys()];
  const last = keys.some((k) => /:120$/.test(k));
  push("⑤ sessionStorage 配額滿時清掉最舊的查價快取，最新的寫得進去", last && keys.length < 12, `快取 ${keys.length} 筆，含最新的：${last}`);
}

{
  // ⑥ 共用的「我的伺服器」＋兩個「賣掉換錢」的頁面扣賣方稅（2026-10-03）
  const dom = new JSDOM("<!doctype html><body>", { runScripts: "outside-only", url: "https://seagod99.github.io/tools/gc-exchange/" });
  dom.window.localStorage.setItem("ffxiv_market_home", "4028");
  dom.window.eval(SRC);
  push("⑥ Universalis.homeWorld() 讀市場頁設定的 ffxiv_market_home", dom.window.Universalis.homeWorld() === 4028, String(dom.window.Universalis.homeWorld()));
  dom.window.localStorage.setItem("ffxiv_market_home", "99999");
  push("  不是陸行鳥 DC 的伺服器就回 null", dom.window.Universalis.homeWorld() === null, "");
  for (const [page, re] of [["tools/gc-exchange/index.html", /p\.ref \* \(1 - Universalis\.TAX_RATE\)/], ["tools/ventures/index.html", /p\.ref \* \(1 - Universalis\.TAX_RATE\)/]]) {
    const h = readFileSync(join(ROOT, page), "utf8");
    push(`  ${page.split("/")[1]}：變現值扣 5% 賣方稅、預設我的伺服器`, re.test(h) && /Universalis\.homeWorld\(\)/.test(h), "");
  }
}

let fail = 0;
for (const [n, okk, d] of results) { if (!okk) fail++; console.log(`${okk ? "✓" : "✗"} ${n}${d ? `　（${d}）` : ""}`); }
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
