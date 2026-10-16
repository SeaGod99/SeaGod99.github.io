// validate-official-terms.mjs — 台服官方術語（職業／資料片／天氣）的一致性回歸
//
// 單一來源是 data/official-terms.json（scripts/build-official-terms.mjs 從台服客戶端解包產生），
// 前端版是 assets/js/official-terms.js（同一份資料嵌進 classic script）。但有幾張表**刻意**沒改成讀它：
//   assets/js/eorzea-weather.js  WEATHER_INFO   ES module，天氣演算法在載入時就要用（§4.58：改非同步會該響沒響）
//   scripts/fix-mapkeys.mjs      WEATHER_TC     建置腳本，英文天氣名 → 中文（§4.4：與上一張要同步）
//   tools/market/market.js       CRAFT_JOBS     市場頁沒載 official-terms.js
//   tools/crafting-sim/crafting-sim.js JOBS     同上
//   tools/squadron/index.html    JOB_NAME       同上
// 這支逐張比對它們與 JSON 一致，並掃資料檔的職業／資料片／天氣欄位只用官方名。
// 2026-10-11 站主拍板改官方名時建立（製作採集職 11、資料片 5、天氣 4＋特殊天氣 10、基礎職 9）。
//
// 執行（repo 根目錄）：node scripts/validate-official-terms.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const readJson = (f) => JSON.parse(read(f));
const results = [];
const push = (name, ok, detail = "") => results.push([name, !!ok, detail]);

const T = readJson("data/official-terms.json");
const jobNames = new Set(Object.values(T.jobs).map((j) => j.name));
const jobAliases = new Map();
for (const j of Object.values(T.jobs)) for (const a of j.alias || []) jobAliases.set(a, j.name);
const expNames = new Set(T.expansions.map((e) => e.name));
const expAliases = new Set(T.expansions.flatMap((e) => e.alias || []));
const weatherNames = new Set(Object.values(T.weather).map((w) => w.name));
const weatherAliases = new Set(Object.values(T.weather).flatMap((w) => w.alias || []));

/** 從原始碼取出 `<宣告> = { … };` 的物件字面量並求值（只用在本 repo 自己的檔案） */
function literalOf(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const start = src.indexOf("{", i);
  let depth = 0;
  for (let k = start; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return new Function(`return (${src.slice(start, k + 1)});`)();
  }
  return null;
}
/** 拿掉 JS／HTML 註解（掃「程式碼有沒有寫舊名」時，註解裡講歷史是合法的，§4.90） */
function stripComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

// ── ① 前端版與 JSON 同一份 ─────────────────────────────────────────────
{
  const js = read("assets/js/official-terms.js");
  const m = js.match(/var T = (\{[\s\S]*?\});\n/);
  const emb = m ? JSON.parse(m[1]) : null;
  const same = emb && ["jobs", "expansions", "weather", "races"].every((k) => JSON.stringify(emb[k]) === JSON.stringify(T[k]));
  push("assets/js/official-terms.js 嵌的資料與 data/official-terms.json 相同（不同＝有人手改，或忘了重跑 build-official-terms.mjs）", same,
    same ? "" : "跑 node scripts/build-official-terms.mjs --apply");
  push("  製作採集職 11 個都是台服官方名（木工師…漁師）",
    ["CRP", "BSM", "ARM", "GSM", "LTW", "WVR", "ALC", "CUL", "MIN", "BTN", "FSH"].map((a) => T.jobs[a]?.name).join("、") ===
    "木工師、鍛造師、甲冑師、金工師、皮革師、裁縫師、鍊金術師、烹調師、採掘師、園藝師、漁師",
    ["CRP", "MIN", "FSH"].map((a) => T.jobs[a]?.name).join("、"));
  push("  資料片 6 個依序是台服官方名", T.expansions.map((e) => e.name).join("、") === "新生艾奧傑亞、蒼天伊修加爾德、紅蓮解放者、漆黑反叛者、曉月之終途、黃金遺產",
    T.expansions.map((e) => e.name).join("、"));
}

// ── ② 刻意保留的手寫副本與 JSON 一致 ─────────────────────────────────────
{
  const W = await import(pathToFileURL(join(ROOT, "assets/js/eorzea-weather.js")).href);
  const info = W.WEATHER_INFO;
  const missing = Object.keys(T.weather).filter((k) => !info[k]);
  const differ = Object.keys(T.weather).filter((k) => info[k] && info[k].name !== T.weather[k].name);
  const extra = Object.keys(info).filter((k) => !T.weather[k]);
  push("eorzea-weather.js 的 WEATHER_INFO 與官方天氣名逐鍵相同", !missing.length && !differ.length && !extra.length,
    [missing.length && `缺 ${missing.join(",")}`, differ.length && `不同 ${differ.map((k) => `${k}:${info[k].name}≠${T.weather[k].name}`).join(",")}`,
      extra.length && `多 ${extra.join(",")}`].filter(Boolean).join("；"));
  const badOld = [...weatherAliases].filter((a) => /[一-鿿]/.test(a)).filter((a) => {
    const k = W.weatherKeyOfName(a);
    return !k || T.weather[k]?.alias?.indexOf(a) < 0;
  });
  push("  舊中文天氣名（陰天、降雪、放電現象、星磁暴）仍查得到對的鍵", badOld.length === 0, badOld.join("、"));
  const enBad = Object.entries(W.EN_TO_KEY).filter(([, k]) => !T.weather[k]);
  push("  EN_TO_KEY 每個鍵都在官方表裡", enBad.length === 0, enBad.map(([e, k]) => `${e}→${k}`).join("、"));

  const tc = literalOf(read("scripts/fix-mapkeys.mjs"), "const WEATHER_TC = ");
  const tcBad = tc ? Object.entries(tc).filter(([en, zh]) => en !== "Tension" && !weatherNames.has(zh)) : [["(找不到 WEATHER_TC)", ""]];
  push("fix-mapkeys.mjs 的 WEATHER_TC 只產官方天氣名（§4.4：與 WEATHER_INFO 同步）", tcBad.length === 0, tcBad.map(([e, z]) => `${e}→${z}`).join("、"));
  const tcVsKey = tc ? Object.entries(W.EN_TO_KEY).filter(([en, k]) => tc[en] && tc[en] !== T.weather[k].name) : [];
  push("  同一個英文名在 WEATHER_TC 與 EN_TO_KEY 指到同一個官方名", tcVsKey.length === 0, tcVsKey.map(([en, k]) => `${en}: ${tc[en]}≠${T.weather[k].name}`).join("、"));

  const byAbbrId = new Map(Object.values(T.jobs).map((j) => [j.id, j.name]));
  for (const [file, decl] of [["tools/market/market.js", "var CRAFT_JOBS = "], ["tools/crafting-sim/crafting-sim.js", "var JOBS = "]]) {
    const t = literalOf(read(file), decl);
    const bad = t ? Object.entries(t).filter(([id, n]) => byAbbrId.get(Number(id)) !== n) : [["?", "找不到表"]];
    push(`${file} 的 ${decl.replace(/^var |\s=\s$/g, "")} 與官方職業名相同`, bad.length === 0, bad.map(([id, n]) => `${id}:${n}`).join("、"));
  }
  const sq = literalOf(read("tools/squadron/index.html"), "const JOB_NAME = ");
  const sqBad = sq ? Object.entries(sq).filter(([a, n]) => T.jobs[a]?.name !== n) : [["?", "找不到表"]];
  push("tools/squadron/index.html 的 JOB_NAME（基礎職 9 個）與官方職業名相同", sqBad.length === 0, sqBad.map(([a, n]) => `${a}:${n}`).join("、"));
}

// ── ③ 資料檔的欄位只用官方名 ─────────────────────────────────────────────
{
  const eq = readJson("data/equip.json").names;
  const eqBad = Object.entries(eq).filter(([a, n]) => T.jobs[a] && T.jobs[a].name !== n);
  push("data/equip.json 的 names 與官方職業名相同（全站職業名權威）", eqBad.length === 0, eqBad.map(([a, n]) => `${a}:${n}`).join("、"));

  const SPECIAL = new Set(["工會工坊", "無人島"]);
  const recBad = new Set(readJson("data/recipes.json").data.map((r) => r.job).filter((j) => j && !jobNames.has(j) && !SPECIAL.has(j)));
  push("recipes.json 的 job 只有官方職業名（＋工會工坊／無人島）", recBad.size === 0, [...recBad].join("、"));
  const gat = new Set(readJson("data/gathering.json").data.map((g) => g.job).filter(Boolean));
  push("gathering.json 的 job 只有採掘師／園藝師", [...gat].every((j) => j === "採掘師" || j === "園藝師"), [...gat].join("、"));
  const lv = new Set(readJson("data/craft-leves.json").data.map((l) => l.job).filter(Boolean));
  push("craft-leves.json 的 job 只有官方職業名", [...lv].every((j) => jobNames.has(j)), [...lv].filter((j) => !jobNames.has(j)).join("、"));
  const lgDir = join(ROOT, "data/leveling-gear");
  const lgBad = readdirSync(lgDir).filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => JSON.parse(readFileSync(join(lgDir, f), "utf8"))).filter((d) => d.jobName && !jobNames.has(d.jobName)).map((d) => d.jobName);
  push("leveling-gear/*.json 的 jobName 只有官方職業名", lgBad.length === 0, lgBad.join("、"));
  const su = readJson("data/system-unlocks.json");
  const suBad = (su.jobs || []).filter((j) => !jobNames.has(j.name)).map((j) => j.name);
  push("system-unlocks.json 的職業行會名只有官方職業名", suBad.length === 0, suBad.join("、"));

  const oc = new Set(readJson("data/orchestrion.json").data.map((o) => o.category).filter(Boolean));
  push("orchestrion.json 的 category 只有官方資料片名（＋未分類）", [...oc].every((c) => expNames.has(c) || c === "未分類"), [...oc].filter((c) => !expNames.has(c) && c !== "未分類").join("、"));
  const du = new Set(readJson("data/dungeons.json").data.map((d) => d.expansion).filter(Boolean));
  push("dungeons.json 的 expansion 只有官方資料片名", [...du].every((c) => expNames.has(c)), [...du].filter((c) => !expNames.has(c)).join("、"));
  const tm = new Set(readJson("data/treasure-maps.json").data.map((g) => g.expansion).filter(Boolean));
  push("treasure-maps.json 的 expansion 只有官方資料片名", [...tm].every((c) => expNames.has(c)), [...tm].filter((c) => !expNames.has(c)).join("、"));

  const mw = new Set(readJson("data/maps.json").data.flatMap((m) => (m.weatherRates || []).map((w) => w.weather)));
  push("maps.json 的天氣名全是官方名（沒有舊名、沒有英文）", [...mw].every((w) => weatherNames.has(w)), [...mw].filter((w) => !weatherNames.has(w)).join("、"));
  const iw = new Set(readJson("data/island-animals.json").data.flatMap((a) => a.weather || []));
  push("island-animals.json 的出現天氣全是官方名（無人島頁拿它比 WEATHER_INFO）", [...iw].every((w) => weatherNames.has(w)), [...iw].filter((w) => !weatherNames.has(w)).join("、"));
}

// ── ④ 前端程式碼沒有寫死舊名（註解不算；別名表是刻意的）────────────────
{
  const ALLOW = new Map([
    ["assets/js/official-terms.js", "術語表本身（alias 就是舊名）"],
    ["assets/js/eorzea-weather.js", "OLD_NAMES：舊天氣名 → 鍵，給資料裡殘留的舊名用"],
    ["tools/glamour/index.html", "職業名 → 代碼的別名表（舊網址／舊 localStorage 要解得開）＋群組清單新舊並列"],
  ]);
  const OLD = [...jobAliases.keys(), ...expAliases, ...[...weatherAliases].filter((a) => /[一-鿿]/.test(a))]
    .filter((a) => !["園藝工"].includes(a) || true);
  const hits = [];
  const walk = (dir) => {
    for (const d of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${d.name}`;
      if (d.isDirectory()) { if (!/配裝圖片|node_modules|data$/.test(d.name)) walk(rel); continue; }
      if (!/\.(html|js)$/.test(d.name) || ALLOW.has(rel)) continue;
      const code = stripComments(readFileSync(join(ROOT, rel), "utf8"));
      for (const o of OLD) {
        let i = code.indexOf(o);
        while (i >= 0) {
          const after = code.slice(i + o.length, i + o.length + 1);
          if (!((o === "園藝工" || o === "採礦工") && after === "具")) { hits.push(`${rel}「${o}」`); break; }
          i = code.indexOf(o, i + 1);
        }
      }
    }
  };
  for (const d of ["tools", "collections", "minions", "assets/js"]) if (existsSync(join(ROOT, d))) walk(d);
  if (existsSync(join(ROOT, "index.html"))) {
    const code = stripComments(read("index.html"));
    for (const o of OLD) if (code.includes(o)) hits.push(`index.html「${o}」`);
  }
  push("前端程式碼（不含註解與別名表）沒有寫死舊職業名／舊資料片名／舊天氣名", hits.length === 0, hits.slice(0, 8).join("、") + (hits.length > 8 ? `…共 ${hits.length}` : ""));
}

// ── ⑤ 搜尋把中點摺成一種（資料照客戶端是「・」，使用者手打常是「·」或注音「‧」）────────
{
  const theme = read("assets/js/theme.js");
  const m = theme.match(/window\.SGT_fold = (function \(s\) \{[^\n]*\});/);
  let ok = false;
  if (m) {
    const fold = new Function(`return (${m[1]});`)();
    ok = fold("雅·修朵拉") === fold("雅・修朵拉") && fold("雅‧修朵拉") === fold("雅・修朵拉") && fold("ABC") === "abc";
  }
  push("theme.js 定義全站共用的 SGT_fold（小寫＋·・‧• 摺成一種），實測摺得起來", ok, m ? "" : "找不到 window.SGT_fold");
  const PAGES = ["tools/gathering/index.html", "tools/island/index.html", "tools/npc-shops/index.html", "tools/unlock-index/index.html",
    "tools/fashion-report/index.html", "tools/gold-saucer/index.html", "tools/msq/index.html", "tools/duty-codex/index.html",
    "tools/quest-finder/index.html", "tools/seasonal-shop/index.html", "tools/squadron/index.html", "tools/action-codex/index.html",
    "tools/gardening/gardening.js", "tools/glamour/index.html"];
  const miss = PAGES.filter((p) => { const s = read(p); return !/function sgtFold\(s\) \{ return window\.SGT_fold \?/.test(s) || (s.match(/sgtFold\(/g) || []).length < 3; });
  push("  14 頁自帶的搜尋框都走 SGT_fold（不在頁面裡再抄一份正規式）", miss.length === 0, miss.join("、"));
  const copies = PAGES.filter((p) => /\[·・‧•\]/.test(read(p)));
  push("  頁面裡沒有自己的中點正規式副本", copies.length === 0, copies.join("、"));
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? "✓" : "✗"} ${n}${d ? "  " + d : ""}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
