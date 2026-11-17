// 升台服版本前的放行檢查（唯讀）：列出「gamePatch 改成 --to 之後會新出現在畫面上的條目」與它們的名稱狀態
//
// 為什麼需要：版本閘門（assets/js/patch-gate.js）只比 patch 標籤，不管名字。升版時只要有一筆條目
// 標籤進了窗口、名字卻還沒補上，它就會用英文、null 或 `#12345` 直接上畫面（知識庫 §4.5：釣魚頁
// `f.name || f.nameEn` 曾把英文魚名放出去）。validate-data 也擋不到這件事。這支在改版本號之前先證明：
// 窗口裡的每一筆都有台服名。
//
// 執行：
//   node scripts/check-gate-release.mjs                 # 窗口＝(_meta.gamePatch, _meta.gamePatch]：檢查目前已放行的最新一版
//   node scripts/check-gate-release.mjs --to 7.25       # 窗口＝(_meta.gamePatch, 7.25]：升到 7.25 會新放出哪些
//   node scripts/check-gate-release.mjs --from 7.21 --to 7.25
// 有任何一筆沒有台服名就 exit 1。
//
// 「有台服名」的判斷：名稱欄是字串、不是 `#數字` 佔位、過 isTranslated（不是日文原文或內部佔位），
// 而且**不等於英文名**——除非它本身含中日韓字（台服官方本來就有拉丁字的名字，例如寵物「Nano Lord」，
// 那種要加進 ALLOW_LATIN 並寫理由）。配方沒有名稱欄，用成品的物品名判斷。

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isTranslated, isTw } from "./lib/tw-text.mjs";
import { pnum } from "./lib/tw-releases.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const meta = JSON.parse(readFileSync(join(DATA, "_meta.json"), "utf8"));
const FROM = arg("--from") ?? meta.gamePatch;
const TO = arg("--to") ?? meta.gamePatch;

// 台服官方就是拉丁字的名稱（file:id → 理由）。加之前先對台服客戶端確認。
const ALLOW_LATIN = new Map([]);

// 只建置用、前端不載的檔：版本閘門不作用在它們身上
const BUILD_ONLY = new Set(["npcs.json", "monsters.json", "obtainable-methods.json", "maps.json"]);

/* 頁面本身會把「沒有台服名」的條目藏起來的檔：這種條目放行了也看不到（鐵則：查不到台服名＝不顯示），
   列出來但不算失敗。2026-11-17 升 7.3 時加的：Teamcraft 先出了台服 7.3、客戶端解包還沒出，
   坐騎／寵物／表情的名字只有客戶端的 Mount／Companion／Emote 表有（從物品說明推坐騎名在已知 194 隻裡錯 10 隻，不推）。
   **每一條都對頁面原始碼驗那個擋法還在**——找不到就退回嚴格判定，免得頁面改了這裡還在放行。 */
const ROOT = join(__dirname, "..");
const HIDES_UNNAMED = [
  // 坐騎頁沒有自訂 include，走引擎預設：e.name && e.name !== e.nameEn
  { file: "mounts.json", src: [["collections/mounts/index.html", null], ["assets/js/collection-tracker.js", "e.name && e.name !== e.nameEn"]],
    hidden: (s) => s === "無名" || s === "同英文" },
  { file: "emotes.json", src: [["collections/emotes/index.html", "e.name !== null"]], hidden: (s, e) => s === "無名" && e.name === null },
  { file: "minions.json", src: [["minions/index.html", "!(m._noTwName && m.name === m.nameEn)"]],
    hidden: (s, e) => s === "無名" || (s === "同英文" && e._noTwName === true) },
].filter((h) => h.src.every(([f, snip]) => {
  const t = readFileSync(join(ROOT, f), "utf8");
  return snip == null ? !/\binclude\s*:/.test(t) : t.includes(snip);
}));
const hiddenRule = new Map(HIDES_UNNAMED.map((h) => [h.file, h.hidden]));

const items = new Map();
for (const it of JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data) items.set(it.id, it);

function nameOf(file, e) {
  if (file === "recipes.json") return { name: items.get(e.itemId)?.name ?? null, en: null };
  return { name: e.name ?? null, en: e.nameEn ?? null };
}
/* 名字本身就是台服物品名的一段（樂譜＝「管弦樂琴樂譜：」後面那段、幻卡＝「九宮幻卡：」後面那段）：台服官方就用拉丁字的
   （FFXI 聯動的「Ronfaure」、幻卡「Kam'lanaut」）只要台服物品名逐字是「前綴＋這個名字」，就是官方名，不必逐筆登記 ALLOW_LATIN。
   2026-11-17 升 7.3 時加的（樂譜 20 首、幻卡 2 張）。 */
const ITEM_PREFIX = { "orchestrion.json": "管弦樂琴樂譜：", "triple-triad.json": "九宮幻卡：" };
const itemNames = new Set([...items.values()].map((it) => it.name));
const officialLatin = (file, name) => ITEM_PREFIX[file] != null && itemNames.has(ITEM_PREFIX[file] + name);

function status(file, e) {
  const { name, en } = nameOf(file, e);
  if (name == null || String(name).trim() === "") return "無名";
  if (/^#\d+$/.test(String(name))) return "#id";
  if (!isTranslated(String(name))) return "日文／佔位";
  if (en && name === en && !isTw(String(name)) && !ALLOW_LATIN.has(`${file}:${e.id}`) && !officialLatin(file, name)) return "同英文";
  return "ok";
}

const lo = pnum(FROM), hi = pnum(TO);
if (lo == null || hi == null) throw new Error(`版本格式不對：--from ${FROM} --to ${TO}`);
const inWindow = (p) => { const v = pnum(p); return v != null && (FROM === TO ? v === hi : v > lo && v <= hi); };

console.log(`放行窗口：${FROM === TO ? `＝${TO}` : `(${FROM}, ${TO}]`}（_meta.gamePatch＝${meta.gamePatch}）\n`);
let bad = 0, total = 0, hiddenTotal = 0;
for (const file of readdirSync(DATA).filter((f) => f.endsWith(".json") && f !== "_meta.json").sort()) {
  if (BUILD_ONLY.has(file)) continue;
  let db;
  try { db = JSON.parse(readFileSync(join(DATA, file), "utf8")); } catch { continue; }
  const rows = Array.isArray(db) ? db : Array.isArray(db?.data) ? db.data : null;
  if (!rows || !rows.length || typeof rows[0] !== "object") continue;
  const hits = rows.filter((e) => e && inWindow(e.patch));
  if (!hits.length) continue;
  const byStatus = {};
  const badRows = [], hiddenRows = [];
  for (const e of hits) {
    let s = status(file, e);
    if (s !== "ok" && hiddenRule.get(file)?.(s, e)) { hiddenRows.push(`${e.id ?? e.itemId} ${e.nameEn ?? ""}（${s}）`); s = "頁面隱藏"; }
    byStatus[s] = (byStatus[s] || 0) + 1;
    if (s !== "ok" && s !== "頁面隱藏") badRows.push(`${e.id ?? e.itemId} ${nameOf(file, e).name ?? ""}｜${e.nameEn ?? ""}（${s}）`);
  }
  total += hits.length;
  bad += badRows.length;
  hiddenTotal += hiddenRows.length;
  console.log(`${(badRows.length ? "✗" : "✓")} ${file.padEnd(24)} 放出 ${String(hits.length).padStart(4)}：` +
    Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join("、"));
  for (const r of badRows.slice(0, 15)) console.log(`      ${r}`);
  if (badRows.length > 15) console.log(`      …另 ${badRows.length - 15} 筆`);
  if (hiddenRows.length) console.log(`      沒有台服名、頁面會隱藏（等客戶端解包補名）：${hiddenRows.join("、")}`);
}
/* 副本另外對台服客戶端：版本閘門對 patch 是 null 的一律放行（PatchGate.released(null)＝true），
   2026-10-10 前有 23 個國際服 7.3 以後的副本就是這樣上了副本圖鑑與命令面板——它們的名字是簡轉繁，
   上面那套「有沒有台服名」的判斷擋不到（簡轉繁也是中文）。所以這裡要求：頁面看得到的副本
   （有 name、patch 不晚於 --to）都必須是台服客戶端 ContentFinderCondition 有台服名的那一列、而且逐字相同。
   客戶端快取不在就略過（CI 沒有 out_data/cache）。 */
{
  const { existsSync } = await import("node:fs");
  const csv = join(__dirname, "..", "out_data", "cache", "tc-datamining", "ContentFinderCondition.csv");
  if (existsSync(csv)) {
    const { loadTcSheet } = await import("./lib/tc-datamining.mjs");
    const tc = new Map((await loadTcSheet("ContentFinderCondition", { offline: true }))
      .map((r) => [r.id, String(r.Name || "").replace(/[\uE000-\uF8FF]/g, "").trim()]));
    /* \u5BA2\u6236\u7AEF\u89E3\u5305\u843D\u5F8C\u6642\uFF08\u53F0\u670D 7.3\uFF09\uFF1A\u5BA2\u6236\u7AEF\u6C92\u6709\u7684\u526F\u672C\u8A8D Teamcraft \u90A3\u4E00\u7248\u7684\u540D\u5B57\uFF0C\u8207 patch-dungeon-names.mjs \u540C\u4E00\u689D\u5C0D\u61C9\u93C8
       \uFF08XIVAPI CFC \u7684 Content\uFF0BContentLinkType 1 \u2192 Teamcraft tw-instances\uFF09 */
    const { teamcraftAhead, teamcraftNameMap } = await import("./lib/client-names.mjs");
    const xivFile = join(__dirname, "..", "out_data", "cfc-missing-rows.json");
    if (teamcraftAhead && existsSync(xivFile)) {
      const tcInst = await teamcraftNameMap("instance", { offline: true }).catch(() => new Map());
      for (const x of JSON.parse(readFileSync(xivFile, "utf8")))
        if (!tc.get(x.id) && Number(x.linkType) === 1 && tcInst.has(x.contentId)) tc.set(x.id, tcInst.get(x.contentId));
    }
    const duties = JSON.parse(readFileSync(join(DATA, "dungeons.json"), "utf8")).data;
    const visible = duties.filter((d) => d.name && (pnum(d.patch) == null || pnum(d.patch) <= hi));
    const off = visible.filter((d) => tc.get(d.id) !== d.name);
    console.log(`${off.length ? "✗" : "✓"} ${"dungeons.json（對客戶端）".padEnd(24)} 看得到 ${visible.length}：` +
      (off.length ? `不是客戶端台服名 ${off.length}` : "全部是客戶端台服名"));
    for (const d of off.slice(0, 15)) console.log(`      ${d.id} ${d.name}｜客戶端：${tc.get(d.id) || "（沒有台服名）"}`);
    bad += off.length;
  } else console.log("  （沒有台服客戶端 ContentFinderCondition 快取，略過副本對客戶端的檢查）");
}

console.log(`\n共放出 ${total} 筆，沒有台服名 ${bad} 筆` + (hiddenTotal ? `（另 ${hiddenTotal} 筆沒有台服名但頁面會隱藏）` : ""));
if (bad) {
  console.log("✗ 先補名再改版本號（升版 SOP：patch-tw-names、各收藏的客戶端名稱補齊），不要放行");
  process.exit(1);
}
console.log("✓ 窗口裡每一筆都有台服名");
