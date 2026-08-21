// 產生 data/fashion-report.json（schema 2）— 時尚品鑑週更的唯一產出腳本。
//
// ── 這支取代了什麼 ─────────────────────────────────────────────
// 舊流程是照 SOP 半手工跑，每週由人挑推薦裝、再手寫一段 note 描述「其餘部位怎麼辦」。
// 後果是**每週版型都不一樣**：440 週給 4 件、441～443 給 3 件＋一段散文，
// 沒被推薦到的部位有時有講有時沒講，使用者每週都要重新讀一次才知道要幹嘛。
// 現在改成：答案一律表達為**涵蓋所有計分部位的完整配裝表**，由程式解最佳化，不再人工挑件。
//
// ── 推薦標準（2026-07-25 重訂）────────────────────────────────
// 舊標準只排「取得管道」的優先序（NPC＞市場＞製作＞副本），完全沒把染色算進成本，
// 於是出現「省事 80 分只要 116 金幣」這種結論——實際上它要染的萄乾棕卡在蜥蜴人族聲望，
// 而 100 分方案要的東洲藍是刻木匠製作限定且不可交易。標價便宜，門檻卻可能高到做不到。
// 新標準把一套方案的代價拆成兩層，**依序**比較：
//   ① 門檻數（部族聲望／製作職業／限時活動／看運氣）—— 能不能做到
//   ② 金幣總額（裝備 + 染劑，染劑每染一格算一支）—— 要花多少
//   ③ 要湊的件數 —— 要跑幾趟
// 並且同時輸出「最省方案」與「完全無門檻方案」，讓使用者自己選；若某個分數線根本沒有
// 無門檻解，就直說沒有，不要假裝便宜。
//
// ── 計分模型 ─────────────────────────────────────────────────
// base 68（本週無飾品提示）／70（有飾品提示）＋ 提示部位命中：防具 +8、飾品 +6
// ＋ 六個左側部位染上指定精確色各 +2（同色系 +1，本站不推薦這條，見 note）；上限 100。
// 每次執行都會拿 fashionreportxiv 自家的 easy80／easy100 回頭驗算這個公式，
// 對不上就中止不出檔（例如遇到罕見的 +9 提示時會立刻被抓到）。
//
// 執行：node scripts/build-fashion-report.mjs           （抓線上資料）
//       node scripts/build-fashion-report.mjs --dry-run （只印結果不寫檔）
//       node scripts/build-fashion-report.mjs --offline （用 out_data/cache 的上次回應）

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as OpenCC from "opencc-js";
import { loadIndexes, resolveSources, describeSource, accessOf, SLOT_TC } from "./lib/game-sources.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const D = (f) => join(ROOT, "data", f);
const CACHE_DIR = join(ROOT, "out_data", "cache");
const OUT = D("fashion-report.json");

const dryRun = process.argv.includes("--dry-run");
const offline = process.argv.includes("--offline");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

/* ── 週次時鐘（與前端 tools/fashion-report/index.html 必須一致）───────
   week 440 起點 = 2026-06-30（二）16:00 UTC+8；每 7 天 +1；起點 +3 天 = 週五 16:00 評分開放。
   官方時刻是 PST 12:00 a.m.（固定 UTC-8，不套夏令時），故台北時間全年固定 16:00。 */
const ANCHOR = Date.UTC(2026, 5, 30, 8, 0, 0);
const WEEK = 6048e5, DAY = 864e5;
const weekAt = (t) => 440 + Math.floor((t - ANCHOR) / WEEK);

/* ── 計分常數 ──────────────────────────────────────────────── */
const SCORING = {
  baseNoAcc: 68, baseWithAcc: 70, armorHint: 8, accHint: 6, dyeExact: 2, dyeFamily: 1, max: 100,
};
/* 飾品部位（提示 +6、且不吃染色分）。鍵名照來源站字彙，見 SLOT_TC 的註解。 */
const ACCESSORY_SLOTS = new Set(["ear", "neck", "wrist", "ring", "left_ring"]);
/** 版型固定的部位順序——每週都照這個順序列，缺的補「不影響分數」。 */
const ROW_ORDER = ["weapon", "head", "body", "hands", "legs", "feet", "ear", "neck", "wrist", "ring", "left_ring"];
/** 來源站可能出現的所有部位。出現表外的值＝對方改了字彙，**寧可中止也不要猜**
    （猜錯就是把飾品當防具算，基礎分與提示分兩邊都會錯，而且不會有任何錯誤訊息）。 */
const KNOWN_SLOTS = new Set(ROW_ORDER);
/** 吃染色分的六個部位（飾品不能染）。版型的固定骨架就是這六列＋被提示點到的飾品列。 */
const DYEABLE_SLOTS = ["weapon", "head", "body", "hands", "legs", "feet"];
/* 門檻折算成「金幣當量」，和實際花費加在一起比。
   為什麼不是純粹的優先序（week 446 踩到）：原本門檻嚴重度**絕對優先**於金幣，
   結果為了躲掉「去金碟兌換寶石紅染劑」這種小門檻，推薦器選了 94,000 金幣的
   煤玉黑染劑，總價衝到 96,332。門檻要能跟錢換算才比得出來，不能字典序輾壓。

   數字是**本站訂的估值、不是遊戲數據**，意思是「你大概願意花多少錢換掉這個麻煩」：
     5,000  肯花時間就一定拿得到（詩學／軍票／金碟／振興票）
    20,000  要先養別的東西（部族聲望／製作職業／PvP／不明貨幣）
   200,000  可能根本拿不到（零式戰利品／限時活動／隨機掉落／一次性任務）
   要調整就改這裡，別去動比較器。 */
const GATE_GIL = {
  tome: 5000, grind: 5000, content: 5000,
  currency: 20000, tribe: 20000, craft: 20000, pvp: 20000,
  event: 200000, raid: 200000, rng: 200000, once: 200000,
};

async function getJson(url, cacheName) {
  const cachePath = join(CACHE_DIR, cacheName);
  if (offline) {
    if (!existsSync(cachePath)) throw new Error(`--offline 但沒有快取：${cachePath}`);
    return JSON.parse(readFileSync(cachePath, "utf8"));
  }
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const json = await res.json();
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(json), "utf8");
  return json;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 1. 抓本週狀態，並判斷 predicted / verified ────────────────── */
const state = await getJson("https://fashionreportxiv.com/api/report-state", "frx-report-state.json");
const apiWeek = Number(state.lastOptions.week);
const nowWeek = weekAt(Date.now());
/* 三個新鮮度旗標要分開看，不能併成一個 fresh。
   準備期（週二 16:00 提示揭曉 ～ 週五 16:00 評分開放）來源站只會更新 hints，
   dyeData 與 easy80/easy100 都還是**上一週的殘值**，而且 API 不會另外告訴你——
   week 447 實測：hints 已是 447，但六個顏色與 easy 解原封不動還是 446 的。
   照單全收就會把上週的顏色當本週發佈，而且計分驗算會拿上週的解驗本週的公式、
   剛好通過，把問題蓋掉。 */
const dyesFresh = !!state.dyesFresh;
const solutionsFresh = !!(state.easy80Fresh && state.easy100Fresh);
const fresh = dyesFresh && solutionsFresh;

if (apiWeek !== nowWeek) {
  // 來源自己還沒換週（週二 16:00 換週後站方要一段時間才更新）。硬寫下去會蓋掉正確資料。
  throw new Error(
    `來源尚未換週：API week=${apiWeek}，本站時鐘 week=${nowWeek}。\n` +
      `這是換週後的正常真空期，請稍後再跑（前端此時會顯示「第 ${nowWeek} 週尚未收錄」並保留存檔）。`
  );
}
const status = fresh ? "verified" : "predicted";

/* ── 2. 讀站內資料 ───────────────────────────────────────────── */
const ix = loadIndexes();
const dyeDb = new Map(JSON.parse(readFileSync(D("dyes.json"), "utf8")).data.map((d) => [d.nameEn.toLowerCase(), d]));
const fillers = JSON.parse(readFileSync(D("fashion-fillers.json"), "utf8"));
const themes = JSON.parse(readFileSync(D("fashion-themes.json"), "utf8"));
const equipJson = JSON.parse(readFileSync(D("equip.json"), "utf8"));
const jobName = (code) => equipJson.names[code] ?? code;
/** id → 英文名。en-items.msgpack 是 build 期資產不進前端，故寫進資料檔，
    讓前端能提供「複製英文名」（對照國際服攻略、跨服查資料時要用）。 */
const enName = ix.enName;

/* ── 2b. 提示分類繁中化 ────────────────────────────────────────
   提示詞（「Animal Instincts」）是 FashionCheckThemeCategory 表的一列。台服沒有公開的
   對照，故走「XIVAPI 英文表對出 row → 陸服 CSV 同 row 取簡中 → OpenCC 轉繁」，
   與主題名同一條路。屬簡轉繁、非台服官方譯名，故資料檔會標 hintSource: "cn-hant"。 */
const catEn = await getJson("https://v2.xivapi.com/api/sheet/FashionCheckThemeCategory?limit=400&fields=Name", "xivapi-theme-category.json");
const catRowByEn = new Map((catEn.rows || []).map((r) => [String(r.fields?.Name ?? "").trim().toLowerCase(), r.row_id]));
const catCsvText = await (async () => {
  const p = join(CACHE_DIR, "FashionCheckThemeCategory.csv");
  if (offline) {
    if (!existsSync(p)) throw new Error(`--offline 但沒有快取：${p}`);
    return readFileSync(p, "utf8");
  }
  const r = await fetch("https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/FashionCheckThemeCategory.csv");
  if (!r.ok) throw new Error(`提示分類 CSV HTTP ${r.status}`);
  const t = await r.text();
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(p, t, "utf8");
  return t;
})();
const catCn = new Map();
for (const line of catCsvText.split(/\r?\n/)) {
  const i = line.indexOf(",");
  if (i < 0) continue;
  const key = line.slice(0, i).replace(/^﻿/, "").trim();
  if (!/^\d+$/.test(key)) continue;
  catCn.set(Number(key), line.slice(i + 1).trim().replace(/^"|"$/g, ""));
}
const toTw = OpenCC.Converter({ from: "cn", to: "twp" });
/** 英文提示 → { name(繁中), categoryId }；對不到就退回英文並記進 quality。 */
const hintMissTc = [];
function hintTc(en) {
  const row = catRowByEn.get(String(en).trim().toLowerCase());
  const cn = row != null ? catCn.get(row) : null;
  if (!cn) { hintMissTc.push(en); return { name: en, categoryId: row ?? null }; }
  return { name: toTw(cn), categoryId: row };
}

/* ── 3. 抓四個部位的接受裝備清單 ──────────────────────────────── */
const hints = state.lastOptions.hints;
// 未知部位一律中止：認不出是防具還是飾品，基礎分（68/70）與提示分（+8/+6）會一起錯，
// 而且算得出一個看似正常的數字、不會有任何警告。week 446 就是這樣被計分驗算抓到的。
const badSlots = hints.map((h) => h.slot).filter((s) => !KNOWN_SLOTS.has(s));
if (badSlots.length) {
  throw new Error(
    `來源站出現未知部位代碼：${badSlots.join("、")}。\n` +
      `已知字彙＝${[...KNOWN_SLOTS].join("、")}。請先確認該部位是防具還是飾品，` +
      `再更新 SLOT_TC／ACCESSORY_SLOTS／ROW_ORDER，不要讓它用預設值跑過去。`
  );
}
const hintLists = [];
for (const h of hints) {
  const url = `https://fashionreportxiv.com/api/hint?hint=${encodeURIComponent(h.hint)}&slot=${h.slot}`;
  const list = await getJson(url, `frx-hint-${h.slot}.json`);
  hintLists.push({ ...h, raw: Array.isArray(list) ? list : list.items ?? [] });
  if (!offline) await sleep(1000); // 對無文件 API 的禮貌延遲
}

/* ── 4. 英文名 → itemId → 台服名（驗收門檻：一件都不能漏）────────── */

/* 來源站的品名偶爾會掉所有格：week 444 的腿部清單送來 "Picaroon Trousers of Maiming"，
   但遊戲裡叫 "Picaroon's Trousers of Maiming"（已用 XIVAPI 確認沒有不帶所有格的同名物品）。
   同一份清單裡的 "Flame Private's Sarouel" 卻是好的，所以不是整站規則、是零星髒資料。
   對策：精確比對失敗才退而求其次，用「拿掉所有格後相同」的寬鬆鍵再找一次，
   且**只接受唯一解**——配到兩件以上寧可讓它掛掉，也不要默默選錯一件。
   每次動用寬鬆比對都會列進 loose[] 印出來，讓週更的人知道有東西在飄。 */
const looseKey = (s) => String(s).trim().toLowerCase().replace(/[''`']s\b/g, "").replace(/[''`']/g, "").replace(/\s+/g, " ");
const enToIdsLoose = new Map();
for (const [name, ids] of ix.enToIds) {
  const k = looseKey(name);
  if (!enToIdsLoose.has(k)) enToIdsLoose.set(k, new Set());
  for (const i of ids) enToIdsLoose.get(k).add(i);
}

const loose = [];
function toItemId(nameEn) {
  let ids = ix.enToIds.get(String(nameEn).trim().toLowerCase()) || [];
  if (!ids.length) {
    const cand = [...(enToIdsLoose.get(looseKey(nameEn)) || [])];
    const withTw = cand.filter((i) => ix.byId.get(i)?.name);
    const pick = withTw.length ? withTw : cand;
    if (pick.length === 1) {
      ids = pick;
      loose.push(`${nameEn} → ${ix.enName(pick[0]) ?? "?"}（${ix.byId.get(pick[0])?.name ?? "無台服名"}・id ${pick[0]}）`);
    }
  }
  const withTw = ids.filter((i) => ix.byId.get(i)?.name);
  return { id: withTw[0] ?? ids[0] ?? null, ambiguous: withTw.length > 1, hasTw: withTw.length > 0 };
}

const mapFail = [], ambiguous = [], noTw = [];
const slotsOut = [];
for (const hl of hintLists) {
  const items = [];
  for (const raw of hl.raw) {
    const nameEn = raw.name ?? raw;
    const { id, ambiguous: amb, hasTw } = toItemId(nameEn);
    if (id == null) { mapFail.push(nameEn); continue; }
    if (amb) ambiguous.push(nameEn);
    if (!hasTw) { noTw.push(nameEn); continue; } // 台服未開放 → 不顯示，不用英文補
    items.push({ id, nameEn });
  }
  const tc = hintTc(hl.hint);
  slotsOut.push({ slot: hl.slot, hint: tc.name, hintEn: hl.hint, categoryId: tc.categoryId, ringNote: hl.ringNote ?? null, items });
}
if (mapFail.length) throw new Error(`英文名對不到物品 ${mapFail.length} 件：${mapFail.join("、")}（資料源出了新裝，需更新 en-items.msgpack）`);

/* ── 5. 批次查 DyeCount / 性別種族限制（XIVAPI，一次 50 筆）───────── */
const allIds = [...new Set(slotsOut.flatMap((s) => s.items.map((i) => i.id)))];
const extra = new Map();
for (let i = 0; i < allIds.length; i += 50) {
  const chunk = allIds.slice(i, i + 50);
  const j = await getJson(
    `https://v2.xivapi.com/api/sheet/Item?rows=${chunk.join(",")}&fields=DyeCount,EquipRestriction`,
    `xivapi-item-${i}.json`
  );
  for (const r of j.rows || []) extra.set(r.row_id, r.fields);
  if (!offline) await sleep(200);
}

/** EquipRestriction → 「僅限女性」之類的標籤；無限制回 null。 */
function restrictLabel(f) {
  const r = f?.EquipRestriction?.fields;
  if (!r) return null;
  const races = ["Hyur", "Elezen", "Lalafell", "Miqote", "Roegadyn", "AuRa", "Hrothgar", "Viera"];
  const RACE_TC = { Hyur: "人族", Elezen: "精靈族", Lalafell: "拉拉菲爾族", Miqote: "貓魅族", Roegadyn: "魯加族", AuRa: "敖龍族", Hrothgar: "硌獅族", Viera: "維埃拉族" };
  const okRaces = races.filter((k) => r[k]);
  const parts = [];
  if (r.Male && !r.Female) parts.push("僅限男性");
  else if (r.Female && !r.Male) parts.push("僅限女性");
  if (okRaces.length && okRaces.length < races.length) parts.push(`僅限${okRaces.map((k) => RACE_TC[k]).join("／")}`);
  return parts.length ? parts.join("・") : null;
}

/* ── 6. 逐件加值：取得方式、價格、門檻、可染、職業、等級 ───────────── */
function enrich(id, slot) {
  const it = ix.byId.get(id);
  const eq = ix.equipment[id];
  const sources = resolveSources(id, ix);
  const best = sources[0] ?? null;
  const gil = sources.find((s) => s.type === "npc-gil" && !s.gate)?.price ?? null;
  const f = extra.get(id) ?? {};
  const jobs = eq?.jobs ?? null;
  return {
    id,
    name: it.name,
    nameEn: enName(id),
    slot,
    icon: it.icon ?? null,
    ilvl: it.ilvl ?? null,
    patch: it.patch ?? null,
    marketable: !!it.marketable,
    equipLevel: eq?.level ?? null,
    jobs: jobs ? (jobs.includes("ADV") ? null : jobs.map(jobName)) : null, // null ＝ 全職業
    jobLabel: !jobs ? null : jobs.includes("ADV") ? "全職業" : `${jobs.length} 種職業`,
    dyeCount: f.DyeCount ?? null,
    restrict: restrictLabel(f),
    srcType: best?.type ?? "other",
    how: describeSource(best),
    gil,
    access: accessOf(best),
    gate: best?.gate ?? null,
    vendor: best?.npcs?.[0] ?? null,
    currency: best?.currency ?? null,
    // 其他管道只留一行摘要（不帶 NPC 物件）——84 件 × 完整來源會讓資料檔膨脹三倍，
    // 而使用者真正要看的販賣者只有最佳那條（§4.6 只為用得到的欄位出資料）
    altSources: sources.slice(1, 4).map((s) => ({ type: s.type, how: describeSource(s), gate: s.gate?.label ?? null })),
  };
}

for (const s of slotsOut) {
  s.slotName = SLOT_TC[s.slot] ?? s.slot;
  s.items = s.items.map((i) => enrich(i.id, s.slot));
  // 清單預設就照「好不好拿」排：無門檻→有門檻→看運氣，同級再比金幣
  s.items.sort((a, b) =>
    ({ open: 0, gated: 1, rng: 2, unreleased: 3, none: 3 })[a.access] - ({ open: 0, gated: 1, rng: 2, unreleased: 3, none: 3 })[b.access] ||
    (a.gil ?? 9e9) - (b.gil ?? 9e9) || (a.equipLevel ?? 0) - (b.equipLevel ?? 0));
}

/* ── 7. 染色資料（接上 dyes.json 的取得方式與成本）──────────────── */
const dyes = {};
// 染色未公布時一格都不要收——寧可頁面說「本週染色尚未公布」，也不要顯示上週的顏色
for (const [slot, d] of Object.entries(dyesFresh ? state.dyeData : {})) {
  if (slot.startsWith("_")) continue;
  const db = dyeDb.get(String(d.plus2).toLowerCase());
  if (!db) throw new Error(`染劑對不到 data/dyes.json：「${d.plus2}」（可能是台服未實裝的新染劑，需人工確認）`);
  dyes[slot] = {
    slot, slotName: SLOT_TC[slot],
    id: db.id, name: db.short, fullName: db.name, nameEn: db.nameEn,
    color: db.color, family: d.plus1, marketable: db.marketable,
    access: db.access, gil: db.gil, gate: db.bestGate,
    how: describeSource(db.best), vendor: db.best?.npcs?.[0] ?? null, currency: db.best?.currency ?? null,
  };
}

/* ── 7b. 只能靠市場板的件，去 Universalis 撈參考價 ─────────────────
   為什麼一定要撈：最佳化器要比較「多買一件提示裝」和「多染一格」哪個划算，
   但沒有 NPC 標價的件（製作品／市場板限定染劑）在離線資料裡是 null。
   把 null 當成「未知」丟給比較器排序，會逼出荒謬解——week 444 第一版就這樣
   選了 12,680 金幣的兩件提示裝，只為了避開一支市場板染劑，而實際上
   「一件 42 金幣的提示裝 + 武器染 40 金幣 + 腳部染市價」便宜兩個數量級。
   價格會浮動，所以只當**排序用的參考值**存進 marketRef，前端顯示時另有即時查價。 */
const needPrice = [
  ...slotsOut.flatMap((s) => s.items.filter((i) => i.gil == null && i.marketable)),
  ...Object.values(dyes).filter((d) => d.gil == null && d.marketable),
];
let priceAt = null;
if (needPrice.length && offline) {
  // 離線時沒有市價，市場板的件在成本模型裡會變成 0 元，最佳解會被帶偏
  // （week 447 實測：86 分方案從 180 金幣「變便宜」成 100，其實只是把沒查到價的件當免費）。
  // --offline 只該用來改邏輯時反覆測，**不要拿它的輸出當正式週更結果**。
  console.warn(`   ⚠️ --offline 略過 Universalis 查價：${needPrice.length} 件市場板物品會以「價格不明」參與排序，推薦結果不可作準`);
}
if (needPrice.length && !offline) {
  const ids = [...new Set(needPrice.map((x) => x.id))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const j = await getJson(
        `https://universalis.app/api/v2/${encodeURIComponent("陸行鳥")}/${chunk.join(",")}?listings=1&entries=0`,
        `universalis-${i}.json`
      );
      const map = j.items ?? (j.itemID ? { [j.itemID]: j } : {});
      for (const [id, v] of Object.entries(map)) {
        const p = v?.minPriceNQ || v?.minPrice || v?.listings?.[0]?.pricePerUnit || null;
        if (p) for (const x of needPrice) if (x.id === Number(id)) x.marketGil = Math.round(p);
      }
      priceAt = new Date().toISOString();
    } catch (e) {
      console.warn(`   ⚠️ Universalis 查價失敗（${e.message}），這批件只能以「價格不明」參與排序`);
    }
  }
}
/** 這件東西實際要花多少金幣：NPC 標價優先，其次市場板參考價，都沒有才是 null。 */
const effGil = (x) => x?.gil ?? x?.marketGil ?? null;

// 有了市場參考價，清單排序也要跟著用實際花費，不然「無標價」永遠沉到最後
for (const s of slotsOut) {
  s.items.sort((a, b) =>
    ({ open: 0, gated: 1, rng: 2, unreleased: 3, none: 3 })[a.access] - ({ open: 0, gated: 1, rng: 2, unreleased: 3, none: 3 })[b.access] ||
    (effGil(a) ?? 9e9) - (effGil(b) ?? 9e9) || (a.equipLevel ?? 0) - (b.equipLevel ?? 0));
}

/* ── 8. 成本最佳化推薦器 ─────────────────────────────────────── */
const hintSlots = slotsOut.map((s) => s.slot);
const hasAcc = hintSlots.some((s) => ACCESSORY_SLOTS.has(s));
const base = hasAcc ? SCORING.baseWithAcc : SCORING.baseNoAcc;
const dyeSlots = Object.keys(dyes);

/** 每個提示部位選一件：先無門檻、再便宜、再低等級。另備一件「最便宜可交易」當替代。 */
const hintPick = {};
for (const s of slotsOut) {
  const pool = s.items.filter((i) => i.access !== "unreleased");
  hintPick[s.slot] = {
    slot: s.slot,
    hint: s.hint,
    points: ACCESSORY_SLOTS.has(s.slot) ? SCORING.accHint : SCORING.armorHint,
    item: pool[0] ?? null,
    openItem: pool.find((i) => i.access === "open") ?? null,
    marketAlt: pool.find((i) => i.marketable && i !== pool[0]) ?? null,
  };
}

const gateKey = (g) => (g ? `${g.kind}:${g.label}` : null);
const gateCost = (g) => (g ? (GATE_GIL[g.kind] ?? 20000) : 0);

/**
 * 列舉「要湊哪幾件提示裝 × 要染哪幾格」的所有組合（最多 2^10 = 1024 種），
 * 挑出達標且代價最小的一組。openOnly = true 時只用無門檻的件與染劑。
 */
function solve(target, { openOnly = false } = {}) {
  const H = hintSlots.length, Dn = dyeSlots.length;
  let bestPlan = null;
  for (let mask = 0; mask < 1 << (H + Dn); mask++) {
    let score = base, gil = 0, pieces = 0, unknown = 0, gates = new Map(), ok = true;
    const useHints = [], useDyes = [], market = [];
    for (let i = 0; i < H && ok; i++) {
      if (!(mask & (1 << i))) continue;
      const p = hintPick[hintSlots[i]];
      const item = openOnly ? p.openItem : p.item;
      if (!item) { ok = false; break; }
      score += p.points; pieces++;
      // 有市場參考價就照它計費；連參考價都沒有（製作品且無人上架）才算「價格不明」
      const c = effGil(item);
      if (c == null) unknown++;
      else gil += c;
      if (item.gil == null) market.push({ slot: p.slot, id: item.id, name: item.name, how: item.how, marketGil: item.marketGil ?? null });
      if (item.gate) gates.set(gateKey(item.gate), { ...item.gate, where: `${SLOT_TC[p.slot]}裝備` });
      useHints.push({ slot: p.slot, item });
    }
    for (let i = 0; i < Dn && ok; i++) {
      if (!(mask & (1 << (H + i)))) continue;
      const d = dyes[dyeSlots[i]];
      if (openOnly && d.access !== "open") { ok = false; break; }
      score += SCORING.dyeExact; pieces++;
      const c = effGil(d);
      if (c == null) unknown++;
      else gil += c;
      if (d.gil == null) market.push({ slot: d.slot, id: d.id, name: d.fullName, how: d.how, marketGil: d.marketGil ?? null });
      if (d.gate) gates.set(gateKey(d.gate), { ...d.gate, where: `${d.slotName}染劑` });
      useDyes.push(d);
    }
    if (!ok || Math.min(score, SCORING.max) < target) continue;
    // 門檻折成金幣當量後與實際花費相加，得到可比較的「總代價」。同一種門檻
    // （例如兩件都要詩學）只算一次——跑一趟就順手換完，不該罰兩次。
    const gateScore = [...gates.values()].reduce((s, g) => s + gateCost(g), 0);
    const effort = gil + gateScore;
    const cand = { score: Math.min(score, SCORING.max), gil, pieces, unknown, market, gates: [...gates.values()], gateScore, effort, useHints, useDyes };
    // 依序比：總代價（金幣＋門檻當量）→ 純金幣 → 完全查不到價的件數 → 件數。
    // 金幣要排在「價格不明」前面：市場板參考價已經補進 gil，剩下的 unknown 是真的
    // 查不到價（無人上架），拿它當第一順位會像 week 444 那樣選出貴兩個數量級的解。
    const better = (a, b) =>
      a.effort !== b.effort ? a.effort < b.effort :
      a.gil !== b.gil ? a.gil < b.gil :
      a.unknown !== b.unknown ? a.unknown < b.unknown : a.pieces < b.pieces;
    if (!bestPlan || better(cand, bestPlan)) bestPlan = cand;
  }
  return bestPlan;
}

/** 把解算結果攤成「每個計分部位一列」的固定版型。 */
function toPlan(id, title, target, sol, subtitle) {
  if (!sol) return null;
  const hintBySlot = new Map(sol.useHints.map((h) => [h.slot, h.item]));
  const dyeBySlot = new Map(sol.useDyes.map((d) => [d.slot, d]));
  const rows = [];
  let fillerGil = 0;
  for (const slot of ROW_ORDER) {
    const isHintSlot = hintSlots.includes(slot);
    const isDyeSlot = DYEABLE_SLOTS.includes(slot);
    // 版型固定的重點：**六個吃染色的部位永遠有一列**，就算本週染色還沒公布也一樣，
    // 否則準備期的表會從 6～7 列塌成 4 列——那正是改版要消滅的「每週長得不一樣」。
    // 飾品部位只有被提示點到才佔版面（飾品不吃染色分）。
    if (!isHintSlot && !isDyeSlot) continue;
    const item = hintBySlot.get(slot) ?? null;
    const dye = dyeBySlot.get(slot) ?? null;
    let gear;
    if (item) {
      gear = { kind: "hint", ...item };
    } else if (dye) {
      // 要染這一格但沒指定提示裝 → 用自己現有的（需可染），並附上便宜填充裝的退路
      const f = fillers.data[slot] ?? null;
      if (f) fillerGil += f.price;
      gear = { kind: "own", filler: f, note: "穿你現有的可染裝備即可；沒有可染的就買下面這件" };
    } else {
      gear = { kind: "none", note: "穿什麼都行，不影響分數" };
    }
    rows.push({
      slot, slotName: SLOT_TC[slot],
      hint: isHintSlot ? slotsOut.find((s) => s.slot === slot).hint : null,
      gear, dye,
      points: (item ? hintPick[slot].points : 0) + (dye ? SCORING.dyeExact : 0),
    });
  }
  return {
    id, title, subtitle, target, score: sol.score,
    rows,
    cost: {
      gil: sol.gil,
      fillerGil,          // 完全沒有可染裝備時，另外要花的填充裝錢
      dyeCount: sol.useDyes.length,
      itemCount: sol.useHints.length,
      /** 沒有 NPC 固定價、要自己製作或上市場板議價的件——金幣總額沒把它們算進去 */
      market: sol.market,
      gates: sol.gates,
      gateFree: sol.gates.length === 0,
    },
  };
}

const plans = [];
for (const [id, title, target] of [["mgp80", "拿滿 MGP", 80], ["perfect100", "滿分", 100]]) {
  const cheapest = solve(target);
  const openOnly = solve(target, { openOnly: true });
  const main = toPlan(id, title, target, cheapest,
    cheapest?.gates.length ? "代價最小的作法（含門檻，見下方標示）" : "代價最小的作法・完全無門檻");
  if (!main) continue;
  // 最省解有門檻時，另外給一條「完全不需要聲望／製作職業」的路；沒有就誠實說沒有
  if (cheapest.gates.length) {
    main.openAlternative = openOnly
      ? toPlan(`${id}-open`, `${title}・無門檻版`, target, openOnly, "不需要任何聲望／製作職業，但比較貴")
      : null;
    main.openAlternativeNote = openOnly ? null : `本週沒有完全無門檻就能達到 ${target} 分的作法`;
  }
  plans.push(main);
}

/* ── 9. 拿來源自家的 easy80／easy100 回頭驗算計分公式 ─────────────── */
const audit = [];
// 社群解未出時 state.easy* 是上週殘值，拿它驗本週公式沒有意義（且多半會剛好通過）
for (const [key, want] of (solutionsFresh ? [["easy80", 80], ["easy100", 100]] : [])) {
  const blk = state[key];
  if (!blk?.itemPairs?.length) continue;
  const nDye = Object.values(blk.dyes || {}).filter(Boolean).length;
  const nHintArmor = blk.itemPairs.filter((p) => !ACCESSORY_SLOTS.has(p.slot)).length;
  const nHintAcc = blk.itemPairs.length - nHintArmor;
  const calc = Math.min(SCORING.max, base + nHintArmor * SCORING.armorHint + nHintAcc * SCORING.accHint + nDye * SCORING.dyeExact);
  audit.push({ key, want, calc, items: blk.itemPairs.length, dyes: nDye, ok: calc >= want });
  if (calc < want) {
    throw new Error(
      `計分公式驗算失敗：${key} 依公式只有 ${calc} 分（應 ≥ ${want}）。\n` +
        `組成＝base ${base} + 防具提示 ${nHintArmor}×${SCORING.armorHint} + 飾品提示 ${nHintAcc}×${SCORING.accHint} + 染色 ${nDye}×${SCORING.dyeExact}。\n` +
        `代表本週有公式沒涵蓋的規則（例如罕見的 +9 提示），請人工確認後再更新 SCORING。`
    );
  }
}

/* ── 10. 出檔 ────────────────────────────────────────────────── */
const theme = themes.data[String(apiWeek)] ?? null;
const out = {
  schema: 2,
  week: apiWeek,
  status,
  /* 準備期（提示已揭曉、評分尚未開放）來源站只有 hints 是本週的。這兩個旗標讓前端
     能誠實說「本週染色尚未公布」，而不是拿上週的顏色充數或整頁空白。 */
  dyesPending: !dyesFresh,
  solutionsPending: !solutionsFresh,
  source: "fashionreportxiv.com",
  updated: new Date().toISOString().slice(0, 10),
  generatedBy: "scripts/build-fashion-report.mjs",
  theme: {
    name: theme?.name ?? state.lastOptions.reportTitle,
    nameEn: state.lastOptions.reportTitle,
    nameSource: theme ? "cn-hant" : "en", // cn-hant ＝簡轉繁、非台服官方譯名，前端要標註
  },
  scoring: { ...SCORING, base, hasAccessoryHint: hasAcc, hintSlots, dyeSlots, audit },
  plans,
  fillerNote: fillers.weaponNote,
  dyes,
  slots: slotsOut,
  links: state.links ?? {},
  hintSource: "cn-hant", // 提示分類為簡轉繁、非台服官方譯名
  quality: {
    mapped: allIds.length,
    hintNotTranslated: [...new Set(hintMissTc)],
    ambiguous: [...new Set(ambiguous)],
    noTwName: [...new Set(noTw)],
    looseMatched: [...new Set(loose)], // 靠所有格容錯救回來的，每次都要人看一眼
    marketRefAt: priceAt, // 市場板參考價的抓取時間（只用於排序，顯示以前端即時查價為準）
  },
};

if (dryRun) {
  console.log(JSON.stringify({ ...out, slots: `(${slotsOut.reduce((n, s) => n + s.items.length, 0)} 件略)` }, null, 2).slice(0, 4000));
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
}

console.log(`✅ week ${apiWeek}「${out.theme.name}」${status}`);
console.log(`   接受清單 ${slotsOut.map((s) => `${s.slotName}${s.items.length}`).join("／")}，共 ${allIds.length} 件；台服未開放 ${out.quality.noTwName.length} 件`);
if (out.quality.looseMatched.length) {
  console.log(`   ⚠️ 來源品名少了所有格、以寬鬆比對救回 ${out.quality.looseMatched.length} 件（請確認對得沒錯）：`);
  for (const l of out.quality.looseMatched) console.log(`      ${l}`);
}
for (const p of plans) {
  const g = p.cost.gates.map((x) => x.label).join("、") || "無門檻";
  console.log(`   ${p.title}：${p.score} 分・${p.cost.gil.toLocaleString("en-US")} 金幣・${p.cost.itemCount} 件裝備 + ${p.cost.dyeCount} 支染劑・門檻＝${g}`);
  if (p.openAlternative) console.log(`     └ 無門檻版：${p.openAlternative.cost.gil.toLocaleString("en-US")} 金幣`);
  if (p.cost.market.length) console.log(`     └ 另有 ${p.cost.market.length} 件需製作／市場板：${p.cost.market.map((m) => m.name).join("、")}`);
  if (p.openAlternativeNote) console.log(`     └ ${p.openAlternativeNote}`);
}
console.log(`   計分驗算：${out.scoring.audit.map((a) => `${a.key} ${a.calc}分`).join("／")}`);
