// validate-item-names.mjs — 物品四語查詢層的回歸
//
// 什麼時候跑：**改了 scripts/build-item-names.mjs 或 assets/js/item-names.js 之後。**
//
// 驗的核心是一件事：**前後端的 normalizeName() 與 shardOf() 必須完全一致。**
// 不一致的徵狀是「明明收錄了的東西查不到」，前端不會報任何錯、後端報告也是漂亮的，
// 只有使用者會發現。所以這裡把前端那支 js 當模組載進來，拿真實資料逐筆比對兩邊的輸出。
//
// 執行（repo 根目錄）：node scripts/validate-item-names.mjs

import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { normalizeName, shardOf } from "./build-item-names.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data/item-names");

const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

// ── 前端那支：在假的 window 裡跑起來，取出它的 normalizeName／shardOf ──
const fe = (() => {
  const src = readFileSync(join(ROOT, "assets/js/item-names.js"), "utf8");
  const win = { document: { currentScript: { src: "https://x/assets/js/item-names.js" } } };
  new Function("window", "document", "fetch", src)(win, win.document, async () => ({ ok: false }));
  return win.ItemNames;
})();

push("前端模組掛得起來", !!(fe && fe.lookup && fe.normalizeName), "");
push("SHARDS 常數兩邊一致", fe.SHARDS === 256, "前端 " + fe.SHARDS);

// ── 正規化與分片：拿真實名稱逐筆比對 ──
{
  const en = decode(await readFile(join(ROOT, "out_data/en-items.msgpack")));
  const ja = decode(await readFile(join(ROOT, "out_data/ja-items.msgpack")));
  const tw = decode(await readFile(join(ROOT, "out_data/tw-items.msgpack")));
  const samples = [];
  for (const id of Object.keys(en).slice(0, 4000)) {
    for (const v of [en[id]?.en, ja[id]?.ja, tw[id]?.tw]) if (v) samples.push(v);
  }
  // 刻意加上會踩到正規化規則的字串
  samples.push("Iron Ingot", "iron  ingot", "Rowena's Token", "Bronze-plated Ring",
    "アイアンインゴット", "ミスリル・インゴット", " 黑鐵錠 ", "黑鐵錠(HQ)", "黑鐵錠");

  let badNorm = [], badShard = [];
  for (const s of samples) {
    if (normalizeName(s) !== fe.normalizeName(s)) badNorm.push(s);
    else {
      const k = normalizeName(s);
      if (k && shardOf(k) !== fe.shardOf(k)) badShard.push(s);
    }
    if (badNorm.length > 3 || badShard.length > 3) break;
  }
  push(`normalizeName 前後端一致（${samples.length} 個真實名稱）`, badNorm.length === 0,
    badNorm.slice(0, 2).map((s) => `「${s}」→ 後 ${normalizeName(s)} / 前 ${fe.normalizeName(s)}`).join(" | ") || "全部相同");
  push(`shardOf 前後端一致`, badShard.length === 0, badShard.slice(0, 2).join(" | ") || "全部相同");
}

// ── 分片檔本身 ──
{
  const idx = JSON.parse(await readFile(join(DIR, "_index.json"), "utf8"));
  const files = (await readdir(DIR)).filter((f) => /^\d+\.json$/.test(f));
  push("片數與索引一致", files.length === idx.shards, files.length + " / " + idx.shards);

  let misplaced = [], keys = 0, langs = new Set();
  for (const f of files) {
    const s = Number(f.replace(".json", ""));
    const j = JSON.parse(await readFile(join(DIR, f), "utf8"));
    for (const [lang, obj] of Object.entries(j.k)) {
      langs.add(lang);
      for (const key of Object.keys(obj)) {
        keys++;
        if (shardOf(key) !== s) { if (misplaced.length < 3) misplaced.push(key + " 應在 " + shardOf(key) + " 卻在 " + f); }
      }
    }
  }
  push("每個鍵都在正確的片裡", misplaced.length === 0, misplaced.join(" | ") || keys + " 個鍵全對");
  push("鍵數與索引一致", keys === idx.keys, keys + " / " + idx.keys);
  push("四種語言都有", ["en", "ja", "cn", "tw"].every((l) => langs.has(l)), [...langs].join(","));
}

// ── 端到端：用前端的 lookup（接上讀檔版的 fetch）查真實物品 ──
{
  const feLive = (() => {
    const src = readFileSync(join(ROOT, "assets/js/item-names.js"), "utf8");
    const win = { document: { currentScript: { src: "https://x/assets/js/item-names.js" } } };
    const fakeFetch = async (url) => {
      const rel = String(url).replace(/^.*\/(data)\//, "$1/");
      const p = join(ROOT, rel);
      if (!existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(p, "utf8")) };
    };
    new Function("window", "document", "fetch", src)(win, win.document, fakeFetch);
    return win.ItemNames;
  })();

  const cases = [
    ["Iron Ingot", "黑鐵錠", "en"],
    ["アイアンインゴット", "黑鐵錠", "ja"],
    ["黑鐵錠", "黑鐵錠", "tw"],
    ["Soul of the Paladin", "騎士之證", "en"],
    ["ナイトの証", "騎士之證", "ja"],
  ];
  let bad = [];
  for (const [input, want, lang] of cases) {
    const r = await feLive.lookup(input);
    if (!r || r.tw !== want) bad.push(`「${input}」→ ${r ? r.tw : "null"}（應為 ${want}）`);
    else if (r.lang !== lang) bad.push(`「${input}」語言判定 ${r.lang}（應為 ${lang}）`);
  }
  push("端到端查詢正確（英／日／繁）", bad.length === 0, bad.slice(0, 2).join(" | ") || cases.length + " 例全對");

  push("查無時回 null", (await feLive.lookup("definitelyNotAnItemName12345")) === null, "");
  push("空字串回 null", (await feLive.lookup("")) === null && (await feLive.lookup("   ")) === null, "");
  push("大小寫與空白不影響", (await feLive.lookup("  iron   INGOT "))?.tw === "黑鐵錠", "");

  const before = feLive._loaded().length;
  const m = await feLive.lookupMany(["Iron Ingot", "Soul of the Paladin", "不存在的東西"]);
  push("lookupMany 回傳每個輸入", m.size === 3, m.size + " / 3");
  push("  查得到的有值、查不到的是 null",
    m.get("Iron Ingot")?.tw === "黑鐵錠" && m.get("不存在的東西") === null, "");
  push("  只抓需要的片", feLive._loaded().length - before <= 3, "新抓 " + (feLive._loaded().length - before) + " 片");
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? "✓" : "✗"} ${n}  ${d ?? ""}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
