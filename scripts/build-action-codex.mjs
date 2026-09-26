// build-action-codex.mjs — 產生 data/action-codex/（技能／特性／狀態辭典）
//
// 站內已經有 `data/action-names/`（四語反查用的 256 片），但那份只有名字。
// 這份是**辭典**：台服官方說明、職業、等級、圖示，給「這個技能是幹嘛的」用。
//
// ── 說明文字要洗掉 UI 標記 ──────────────────────────────────────────
// 上游的說明夾著遊戲內的顏色標記：
//   `威力：<UIForeground>F201F8</UIForeground><UIGlow>F201F9</UIGlow>220`
// 不洗的話畫面上會直接印出那串。洗法是整段拿掉 `<UIForeground>`／`<UIGlow>`／`<Indent>` 等標籤
// **但保留標籤之間的文字**——數值就在標籤之間。
//
// ── 只收玩家技能 ────────────────────────────────────────────────────
// `tw-actions.json` 的 38,490 筆裡只有 1,373 個是玩家技能（`Action.IsPlayerAction`），
// 其餘是敵人／NPC 技能（知識庫 §4.70）。辭典只收玩家的——
// 收敵人技能會讓「黑魔法師有哪些技能」這種篩選變成垃圾。
//
// 執行（repo 根目錄）：
//   node scripts/build-action-codex.mjs            # dry-run
//   node scripts/build-action-codex.mjs --apply    # 寫入
//   node scripts/build-action-codex.mjs --offline  # 只用快取

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { xiv } from "./lib/xivapi.mjs";
import { isTw, isTranslated } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const OUT = join(DATA, "action-codex");
const TC = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/";

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

async function grab(file, cacheName) {
  const cache = join(ROOT, "out_data", "cache", cacheName);
  if (offline || existsSync(cache)) {
    if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8"));
    throw new Error(`--offline 但找不到快取 ${cache}`);
  }
  const res = await fetch(TC + file);
  if (!res.ok) throw new Error(`${file} HTTP ${res.status}`);
  const j = await res.json();
  await writeFile(cache, JSON.stringify(j));
  return j;
}

/* 洗掉遊戲內的 UI 標記。
   ⚠ **`<UIForeground>` 包的是顏色碼，要連內容一起刪**，不能只刪標籤：
     原文 `攻擊　<UIForeground>F201F8</UIForeground><UIGlow>F201F9</UIGlow>威力：…180`
     只刪標籤 → `攻擊　F201F8F201F9威力：…180`（把顏色碼印到畫面上）
     連內容刪 → `攻擊 威力：180` ✓
   真正的數值在標籤**之外**，所以整段刪掉不會掉數字。

   條件式文字 `<If(…)>A<Else/>B</If>` 依職業／等級顯示不同敘述（359/1326 個技能有）。
   多數分支的文字其實**完全相同**（同一個效果、不同職業判斷），所以拆成行之後交給
   `dedupe()` 去重；保留全部分支的話畫面上會出現七八行一模一樣的句子。 */
function clean(s) {
  return String(s || "")
    .replace(/<UIForeground>[^<]*<\/UIForeground>/g, "")
    .replace(/<UIGlow>[^<]*<\/UIGlow>/g, "")
    .replace(/<If\([^>]*\)>/g, "\n")
    .replace(/<Else\s*\/>/g, "\n")
    .replace(/<\/If>/g, "\n")
    .replace(/<\/?(?:Indent|Highlight|Emphasis|SoftHyphen|Sheet|Clickable)[^>]*>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/[　\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 同一段說明裡重複的行只留第一次——條件式常常七八個分支講同一句話。 */
function dedupe(s) {
  var seen = Object.create(null);
  return String(s || "").split("\n")
    .map(function (l) { return l.trim(); })
    .filter(function (l) {
      if (!l) return false;
      if (seen[l]) return false;
      seen[l] = true;
      return true;
    })
    .join("\n");
}

/** 說明也要過台服名守門：不是台服文字就當作沒有（名字仍然可用）。 */
function twDesc(tbl, id) {
  const raw = tbl[id];
  const v = raw && (typeof raw.tw === "string" ? raw.tw : (raw.name && raw.name.tw));
  const c = dedupe(clean(v));
  return c && isTranslated(c) ? c : null;
}

async function main() {
  const [twAct, twActDesc, twTrait, twTraitDesc, twStatus, twStatusDesc] = await Promise.all([
    grab("tw/tw-actions.json", "tc-tw-actions.json"),
    grab("tw/tw-action-descriptions.json", "tc-tw-action-desc.json"),
    grab("tw/tw-traits.json", "tc-tw-traits.json"),
    grab("tw/tw-trait-descriptions.json", "tc-tw-trait-desc.json"),
    grab("tw/tw-statuses.json", "tc-tw-statuses.json"),
    grab("tw/tw-status-descriptions.json", "tc-tw-status-desc.json"),
  ]);

  // 玩家技能的 id、職業與等級
  const acts = await xiv.sheet(
    "Action",
    "IsPlayerAction,IsPvP,ClassJob@as(raw),ClassJobLevel,ActionCategory.Name,Icon,ActionCombo@as(raw)",
    { limit: 500, cache: "out_data/cache/action-meta.json", offline, label: "  Action：" }
  );
  const jobs = await xiv.sheet(
    "ClassJob",
    "Abbreviation,ClassJobCategory@as(raw)",
    { limit: 200, cache: "out_data/cache/classjob.json", offline, label: "  ClassJob：" }
  );
  const eqDb = JSON.parse(await readFile(join(DATA, "equip.json"), "utf8"));
  const jobNames = eqDb.names || {};
  const jobById = new Map(jobs.map((j) => [j.id, j.f.Abbreviation]));

  const twOf = (tbl, id) => {
    const r = tbl[id];
    const v = r && (typeof r.tw === "string" ? r.tw : (r.name && r.name.tw));
    return v && v.trim() ? v.trim() : null;
  };

  // ── 技能 ────────────────────────────────────────────
  const actions = [];
  const stat = { notPlayer: 0, noTw: 0, noDesc: 0 };
  for (const a of acts) {
    if (!a.f.IsPlayerAction) { stat.notPlayer++; continue; }
    const name = twOf(twAct, a.id);
    if (!isTw(name)) { stat.noTw++; continue; }        // 台服未開放＝整筆不收
    /* ⚠ **名字過了守門不代表說明也過**。上游有一批條目名字翻了、說明還是日文原文
       （例：狀態說明仍是日文原文）。validate-data 的掃描抓到了——說明也要各自驗，
       查不到就留 null（名字仍然可用），不要把日文放行到畫面上。 */
    const desc = twDesc(twActDesc, a.id);
    if (!desc) stat.noDesc++;
    const jobAbbr = jobById.get(a.f["ClassJob@as(raw)"]) || null;
    const icon = a.f.Icon && a.f.Icon.path ? a.f.Icon.path.replace(/^ui\/icon\//, "").replace(/\.tex$/, "") : null;
    actions.push({
      id: a.id, name, desc: desc || null,
      job: jobAbbr ? (jobNames[jobAbbr] || jobAbbr) : null,
      jobAbbr,
      lv: a.f.ClassJobLevel || 0,
      cat: (a.f.ActionCategory && a.f.ActionCategory.fields && a.f.ActionCategory.fields.Name) || null,
      /* ⚠ **PvP 版與 PvE 版同名但威力差幾十倍**（火焰：PvE 180 / PvP 6000），
         而且 PvP 版的 ClassJob 掛在進階職（黑魔道士）、PvE 版掛在基礎職（咒術士），
         所以依職業篩選時 PvP 版會排在前面。不標出來的話黑魔會把 PvP 數值當成 PvE 的。
         Action.IsPvP 分得開（實測 29649=true、141=false）。 */
      pvp: !!a.f.IsPvP,
      /* 連擊前置：`ActionCombo` 是「要先用哪一招，這一招才有連擊效果」。
         實測玩家技能裡只有 53 筆有值，而且前置技能 53/53 都在辭典裡（不會產生死連結）。
         0 代表沒有連擊前置——**不要寫成 0，前端用 falsy 判斷，寫 0 會被當成 id 0 那筆**。 */
      combo: a.f["ActionCombo@as(raw)"] || null,
      icon,
    });
  }
  actions.sort((a, b) => (a.jobAbbr || "").localeCompare(b.jobAbbr || "") || a.lv - b.lv || a.id - b.id);

  // ── 特性 ────────────────────────────────────────────
  const traits = [];
  for (const id of Object.keys(twTrait)) {
    const name = twOf(twTrait, id);
    if (!isTw(name)) continue;
    const desc = twDesc(twTraitDesc, id);
    traits.push({ id: +id, name, desc: desc || null });
  }
  traits.sort((a, b) => a.id - b.id);

  // ── 狀態 ────────────────────────────────────────────
  const statuses = [];
  for (const id of Object.keys(twStatus)) {
    const name = twOf(twStatus, id);
    if (!isTw(name)) continue;
    const desc = twDesc(twStatusDesc, id);
    statuses.push({ id: +id, name, desc: desc || null });
  }
  statuses.sort((a, b) => a.id - b.id);

  const byJob = {};
  actions.forEach((a) => { byJob[a.job || "（無職業）"] = (byJob[a.job || "（無職業）"] || 0) + 1; });

  const files = {
    "actions.json": { schema: "action-codex-actions", count: actions.length, data: actions },
    "traits.json": { schema: "action-codex-traits", count: traits.length, data: traits },
    "statuses.json": { schema: "action-codex-statuses", count: statuses.length, data: statuses },
  };
  const sizes = Object.entries(files).map(([n, j]) => {
    const s = JSON.stringify(j);
    return [n, s, s.length, gzipSync(s).length];
  });

  console.log(`\n技能 ${actions.length}（非玩家技能略過 ${stat.notPlayer}、無台服名 ${stat.noTw}、無說明 ${stat.noDesc}）`);
  console.log(`  有職業的 ${actions.filter((a) => a.job).length}／有說明的 ${actions.filter((a) => a.desc).length}`);
  console.log(`  職業分佈（前 8）：${Object.entries(byJob).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([j, n]) => `${j} ${n}`).join("、")}`);
  console.log(`特性 ${traits.length}（有說明 ${traits.filter((t) => t.desc).length}）`);
  console.log(`狀態 ${statuses.length}（有說明 ${statuses.filter((s) => s.desc).length}）`);
  console.log(`\n檔案大小：${sizes.map(([n, , b, g]) => `${n} ${(b / 1024).toFixed(0)}KB（gzip ${(g / 1024).toFixed(0)}KB）`).join("、")}`);
  const sample = actions.find((a) => a.desc && a.job);
  console.log(`\n樣本：${sample.job} Lv${sample.lv}「${sample.name}」\n  ${sample.desc.split("\n")[0].slice(0, 80)}`);
  // 洗乾淨了沒
  const dirty = actions.filter((a) => a.desc && /<UI|<Indent|<Sheet/.test(a.desc));
  console.log(`\n說明裡還有 UI 標記的：${dirty.length} 筆${dirty.length ? "　⚠ " + dirty[0].name : "　（洗乾淨）"}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  for (const [n, s] of sizes) await writeFile(join(OUT, n), s);
  await writeFile(join(OUT, "_index.json"), JSON.stringify({
    schema: "action-codex-index",
    updated: new Date().toISOString().slice(0, 10),
    source: "Teamcraft tw/tw-{actions,action-descriptions,traits,trait-descriptions,statuses,status-descriptions}.json ＋ XIVAPI v2 Action／ClassJob",
    note: "只收玩家技能（Action.IsPlayerAction）。說明已洗掉 <UIForeground>／<UIGlow> 等 UI 標記但保留標籤間的數值。",
    counts: { actions: actions.length, traits: traits.length, statuses: statuses.length },
    jobs: Object.entries(byJob).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
  }));
  console.log(`\n✓ data/action-codex/（3 份＋_index.json）`);
  console.log("  這個目錄刻意不進 minify-data.mjs——本來就是壓過的形狀");
}

main().catch((e) => { console.error(e); process.exit(1); });
