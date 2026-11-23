// validate-orchestrion.mjs — 樂譜的英文名與取得方式回歸（2026-11-23，第四輪路線圖 §5-2）
//
// 改完 data/orchestrion.json、scripts/patch-orchestrion-official.mjs 或 patch-orchestrion-add-missing.mjs 必跑。
// orchestrion.json **沒有建置腳本**，所以這種錯只會在這裡被抓到。會安靜出錯的地方：
//   ① 英文名接到別首：舊資料用流水號接社群站，客戶端列號有缺號處整段錯開，495／776 首的「英文名：」顯示的是別首的。
//      現在每一首都要等於自己道具的英文名（「曲名 Orchestrion Roll」）。
//   ② 「只有類型、沒有細節」的取得方式是跟著同一批錯位資料進來的（No.717 官方說明「潛水艇探索獲得」、站上「副本掉落」）。
//      改成官方說明（客戶端 Orchestrion.Description）之後，**只有類型的條目只准出現在下面列明理由的例外清單**。
//   ③ 細節就是官方說明句式的來源，類型要與說明推出的一致（規則與 patch-orchestrion-official.mjs 共用同一份函式）。
//   ④ 說明裡「？？」是遊戲防雷遮掉的副本名，不可以印到畫面上。
// 客戶端快取（out_data/cache/tc-datamining）不在 git 裡：有的話（本機）多做一層「每一首的官方說明都已經用上」，CI 上略過並註明。
//
// 執行（repo 根目錄）：node scripts/validate-orchestrion.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { songOfItemEn, typeOfDesc, DUTYLIKE } from "./patch-orchestrion-official.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const results = [];
const push = (n, ok, d = "") => results.push([n, !!ok, d]);

const D = JSON.parse(read("data/orchestrion.json")).data;
const byNo = new Map(D.map((e) => [e.number, e]));
const duties = new Set(JSON.parse(read("data/dungeons.json")).data.map((d) => d.name).filter(Boolean));
const en = decode(readFileSync(join(ROOT, "out_data/en-items.msgpack")));
const enOf = (id) => { const v = en[id] ?? en[String(id)]; return typeof v === "string" ? v : (v && (v.en || v.name)) || ""; };

// ① 英文名
{
  const bad = D.filter((e) => { const s = songOfItemEn(enOf(e.itemId)); return s == null || s !== e.nameEn; });
  push("① 每一首的英文名＝自己道具的英文名（不是接到別首的）", D.length > 700 && bad.length === 0,
    bad.length ? bad.slice(0, 4).map((e) => `No.${e.number} ${e.name}：${e.nameEn}／道具 ${enOf(e.itemId)}`).join("；") : `${D.length} 首`);
}

// ② 只有類型的條目只准是例外清單
{
  // 例外：客戶端沒有說明（4 首）、說明遮名而類型推得出（製作，細節留空）、說明遮名而推不出類型（No.746）
  const NO_DESC = new Set([1220, 1245, 1383, 1563]);
  const typeOnly = D.filter((e) => (e.sources || []).length && e.sources.every((s) => s.detail == null));
  const bad = typeOnly.filter((e) => !NO_DESC.has(e.number) && !(e.sources.length === 1 && e.sources[0].type === "製作") && e.number !== 746);
  push("② 只有類型、沒有細節的取得方式只剩例外（無官方說明、或說明被遮名）", bad.length === 0,
    bad.length ? bad.slice(0, 5).map((e) => `No.${e.number} ${e.name}〔${e.sources.map((s) => s.type).join("+")}〕`).join("、") : `例外 ${typeOnly.length} 首`);
}

// ③ 官方說明句式的細節，類型要一致
{
  /* 「分類角度不同」不算錯：官方說明寫的是「在哪換」（XX交換／出售→商店），社群分類寫的是「貨幣從哪來」
     （天書奇談、危命任務的雙色寶石、部族幣、金碟幣…）。兩者都對，所以官方推出「商店」而類型是這幾種貨幣來源時接受。 */
  const CURRENCY_ORIGIN = new Set(["天書奇談", "危命任務", "部族任務", "金碟", "節慶活動", "狩獵", "新月島", "宇宙探索", "博茲雅", "尤雷卡", "探索航行", "伊修加德重建", "無人島"]);
  let n = 0;
  const bad = [];
  for (const e of D) for (const s of e.sources || []) {
    if (!s.detail) continue;
    const t = typeOfDesc(s.detail, duties);
    if (!t) continue;
    n++;
    const ok = s.type === t || (t === "副本掉落" && DUTYLIKE.has(s.type)) || (t === "商店" && CURRENCY_ORIGIN.has(s.type));
    if (!ok) bad.push(`No.${e.number} ${e.name}〔${s.type}〕${s.detail}`);
  }
  push("③ 細節是官方說明句式的來源，類型與說明推出的一致", n > 250 && bad.length === 0, bad.length ? bad.slice(0, 4).join("；") : `${n} 筆`);
}

// ④ 不印遮名的「？？」
{
  const bad = D.filter((e) => (e.sources || []).some((s) => /？？/.test(String(s.detail || ""))));
  push("④ 取得方式的細節沒有「？？」（遊戲防雷遮掉的副本名）", bad.length === 0, bad.map((e) => `No.${e.number}`).join("、"));
}

// ⑤ 釘幾首看得到的案例
{
  const s0 = (n) => byNo.get(n)?.sources?.[0] || {};
  push("案例：No.717 自然的禮物 → 探索航行「潛水艇探索獲得」（原本標副本掉落）", s0(717).type === "探索航行" && s0(717).detail === "潛水艇探索獲得", JSON.stringify(s0(717)));
  push("案例：No.226 勝利或是死亡 → 商店「多瑪飛地出售」（原本是 nameEn 那首的節慶活動／商城）", s0(226).type === "商店" && s0(226).detail === "多瑪飛地出售", JSON.stringify(s0(226)));
  push("案例：No.17 揮汗如雨＝When a Tree Falls、No.18 堅毅＝Tenacity（原本錯開一首）", byNo.get(17)?.nameEn === "When a Tree Falls" && byNo.get(18)?.nameEn === "Tenacity");
  push("案例：No.698 孤獨之路 → 製作（說明遮名，原本標危命任務），細節留空", s0(698).type === "製作" && s0(698).detail == null);
  push("案例：No.52 瑪托雅的洞穴 → 商店目錄連結仍在（改寫來源後由 patch-collection-shop-links 依道具重接）", Array.isArray(s0(52).shop) && s0(52).shop.length > 0);
}

// ⑥ 本機才有的一層：每一首的官方說明都已經用上
{
  const cacheDir = join(ROOT, "out_data/cache/tc-datamining");
  const has = existsSync(cacheDir) && readdirSync(cacheDir).some((d) => existsSync(join(cacheDir, d, "Orchestrion.csv")));
  if (!has) push("⑥ 官方說明都已用上（需要客戶端快取，CI 上略過）", true, "沒有 out_data/cache/tc-datamining，略過");
  else {
    const { loadTcSheet } = await import("./lib/tc-datamining.mjs");
    const item = new Map((await loadTcSheet("Item", { offline: true })).map((r) => [r.id, r]));
    const orch = new Map((await loadTcSheet("Orchestrion", { offline: true })).map((r) => [r.id, r]));
    const descOf = (id) => (orch.get(Number(item.get(id)?.AdditionalData || 0))?.Description || "").replace(/\s*\n\s*/g, " ").trim();
    const miss = [];
    for (const e of D) {
      const d = descOf(e.itemId);
      if (!d || /？？/.test(d)) continue;
      const src = e.sources || [];
      const detailed = src.some((s) => s.detail != null && s.detail !== d);
      if (!detailed && !src.some((s) => s.detail === d)) miss.push(`No.${e.number} ${e.name}`);
    }
    push("⑥ 沒有細節的條目都已換成官方說明（本機，讀客戶端快取）", miss.length === 0, miss.slice(0, 5).join("、") || `${D.length} 首核過`);
  }
}

let fail = 0;
for (const [n, ok, d] of results) { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${n}${d ? `（${d}）` : ""}`); }
console.log(`\n${results.length - fail}/${results.length} 通過`);
process.exit(fail ? 1 : 0);
