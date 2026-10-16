// client-names.mjs — 台服名稱「客戶端優先、Teamcraft 備援」的查詢表（2026-10-11）
//
// 站內慣例（知識庫 §4.98）：台服名的權威是**台服客戶端解包**（thewakingsands/ffxiv-datamining-tc，
// 讀取走 ./tc-datamining.mjs），Teamcraft 的台服語系檔（tw-locales、places.msgpack 的 twPlaces、
// tw-quests）是備援。兩邊有三種落差，而且都不會報錯：
//   ① 中點：Teamcraft 多用「·」，客戶端是「・」（地名 33、怪物 271 筆只差這個）
//   ② 用字：客戶端改譯過、Teamcraft 沒跟上（日升門→日昇門、熏香丘陵→薰香丘陵、顧尼圖→顧尼特、
//      魔導死亡爪→魔導死亡厲爪…；地名 5、怪物 120 筆）
//   ③ 新版本的條目 Teamcraft 還沒有（客戶端有就補上）
//
// 用法——回傳的表與 twName() 相容（`{ [id]: { tw } }`，巢狀的 `{ name: { tw } }` 也保留形狀），
// 呼叫端只要把表換掉，其餘照舊：
//   import { preferClient } from "./lib/client-names.mjs";
//   const mobs = await preferClient(tw.mobs, "mob", { offline });
//   twName(mobs, baseId)
//   statsOf(mobs)   // { client, kept, same, dot, diff, added, examples }
//
// ⚠ 不要拿來取代「拿客戶端驗 Teamcraft」的那幾處（validate-achievements 的一致率閘門）——
//   疊過的表兩邊永遠一致，閘門會變成恆真。

import { loadTcSheet } from "./tc-datamining.mjs";
import { isTranslated } from "./tw-text.mjs";

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** 客戶端字串清洗：拿掉私用區圖示字（任務名前的圖示）、CRLF 統一成 LF、每行去頭尾空白。 */
export function cleanName(s) {
  if (s == null) return "";
  let out = "";
  for (const ch of String(s)) {
    const k = ch.codePointAt(0);
    if (k >= 0xe000 && k <= 0xf8ff) continue;
    out += ch;
  }
  return out.split(CR + LF).join(LF).split(CR).join(LF).split(LF).map((l) => l.trim()).join(LF).trim();
}

/** 能不能當台服名用：非空、過 tw-text 守門（擋假名與內部佔位列）、不是整串問號。 */
export function usable(s) {
  if (typeof s !== "string" || s.trim() === "" || !isTranslated(s)) return false;
  return !/^[？?\s]+$/.test(s);
}

const fold = (s) => s.replace(/[·・‧•]/g, "・");

const DOT = String.fromCharCode(0xb7);   // 「·」U+00B7（Teamcraft／社群站的寫法）
const SPACE_LIKE = new Set([" ", String.fromCharCode(0x3000), CR, LF, String.fromCharCode(9)]);

/**
 * 名稱內部的「·」換成台服官方的「・」。2026-10-11 實測：台服客戶端的 14 張名稱表（NPC、地名、物品、怪物、
 * 任務、成就、坐騎、寵物、狀態、技能、FATE、理符、道具、副本）**一個「·」都沒有**，全是「・」——
 * 站上的「·」都是 Teamcraft／社群站帶進來的。
 * 只換「前後都不是空白」的：「季節活動報酬 · 幸運彩蛋2016」這種兩側有空白的是我們自己產的分隔符，不動。
 */
export function officialDots(s) {
  if (typeof s !== "string" || !s.includes(DOT)) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    out += c === DOT && i > 0 && i < s.length - 1 && !SPACE_LIKE.has(s[i - 1]) && !SPACE_LIKE.has(s[i + 1]) ? "・" : c;
  }
  return out;
}

/** kind → [表名, 欄名]。欄名是 SaintCoinach 匯出的欄名（BNpcName／ENpcResident／EventItem 用 Singular）。 */
export const CLIENT_SHEETS = {
  mob: ["BNpcName", "Singular"],
  place: ["PlaceName", "Name"],
  npc: ["ENpcResident", "Singular"],
  quest: ["Quest", "Name"],
  fate: ["Fate", "Name"],
  leve: ["Leve", "Name"],
  eventItem: ["EventItem", "Singular"],
  status: ["Status", "Name"],
  action: ["Action", "Name"],
  trait: ["Trait", "Name"],
  weather: ["Weather", "Name"],
};

const _maps = new Map();

/** kind 的客戶端名表：Map<id, 名稱>（只收 usable 的）。 */
export async function clientNameMap(kind, { offline = true } = {}) {
  const def = CLIENT_SHEETS[kind];
  if (!def) throw new Error(`client-names：不認得的種類 ${kind}`);
  if (_maps.has(kind)) return _maps.get(kind);
  const [sheet, col] = def;
  const rows = await loadTcSheet(sheet, { offline, require: [col] });   // 欄名變了就中止（loadTcSheet 的 require）
  const m = new Map();
  for (const r of rows) {
    const n = cleanName(r[col]);
    if (usable(n)) m.set(r.id, n);
  }
  _maps.set(kind, m);
  return m;
}

const STATS = Symbol("client-names-stats");
const nameIn = (row) => (row ? (typeof row.tw === "string" ? row.tw : row.name?.tw) : null);

/**
 * 把客戶端名疊在 Teamcraft 形狀的表上，回傳新表（不改原表）。
 * 客戶端沒有、或客戶端那列不能用的 id，保留 Teamcraft 的值——但 Teamcraft 那個值也不能用（假名、
 * 內部佔位、整串問號）的話整列拿掉。
 */
export async function preferClient(table, kind, { offline = true } = {}) {
  return overlayNames(table, await clientNameMap(kind, { offline }));
}

/**
 * 同 preferClient()，但客戶端名表由呼叫端給（Map<id, 名稱>）——給「名字不在同一張表」的類別用，
 * 例如副本：Teamcraft 的 instances 以 InstanceContent id 為鍵，台服名在 ContentFinderCondition.Name
 * （見 instanceNameMap()）。傳進來的名稱一樣要先 cleanName()＋usable() 過濾。
 */
export function overlayNames(table, client) {
  const out = {};
  for (const [id, row] of Object.entries(table || {})) out[id] = row;
  const st = { client: 0, kept: 0, same: 0, dot: 0, diff: 0, added: 0, examples: [] };
  for (const [id, name] of client) {
    const row = out[id];
    const old = nameIn(row);
    const oldClean = old == null ? null : cleanName(old);
    if (oldClean == null || !usable(oldClean)) st.added++;
    else if (oldClean === name) st.same++;
    else if (fold(oldClean) === fold(name)) st.dot++;
    else { st.diff++; if (st.examples.length < 8) st.examples.push(`${id}「${oldClean}」→「${name}」`); }
    st.client++;
    out[id] = row && typeof row.name === "object" && row.name ? { ...row, name: { ...row.name, tw: name } } : { ...(row || {}), tw: name };
  }
  /* 客戶端沒有的列：Teamcraft 的值也要能用才留（「？？？？」這種佔位 twName() 擋不到，這裡拿掉） */
  st.dropped = 0;
  for (const id of Object.keys(out)) {
    if (client.has(Number(id))) continue;
    const n = nameIn(out[id]);
    if (n == null || !usable(cleanName(n))) { delete out[id]; st.dropped++; }
  }
  st.kept = Object.keys(out).length - st.client;
  Object.defineProperty(out, STATS, { value: st });
  return out;
}

/**
 * 副本名：InstanceContent id → 台服客戶端 ContentFinderCondition.Name（ContentLinkType 1 的列）。
 * ⚠ 不要拿 CFC 的 row id 當鍵：Teamcraft instances 與 duty-map 用的是 InstanceContent id。
 */
export async function instanceNameMap({ offline = true } = {}) {
  const rows = await loadTcSheet("ContentFinderCondition", { offline });
  if (rows.length && !("ContentLinkType" in rows[0] && "Content" in rows[0])) throw new Error("client-names：ContentFinderCondition.csv 欄名變了");
  const m = new Map();
  for (const r of rows) {
    if (Number(r.ContentLinkType) !== 1) continue;
    const n = cleanName(r.Name);
    const ic = Number(r.Content);
    if (ic && usable(n) && !m.has(ic)) m.set(ic, n);
  }
  return m;
}

/** preferClient() 回傳表的統計（不是那種表就回 null）。 */
export function statsOf(table) {
  return table?.[STATS] ?? null;
}

/** 印一行摘要，給建置腳本用。 */
export function logStats(label, table) {
  const s = statsOf(table);
  if (!s) return;
  console.log(`  ${label}：客戶端 ${s.client}（與 Teamcraft 相同 ${s.same}、只差中點 ${s.dot}、用字不同 ${s.diff}、Teamcraft 沒有 ${s.added}）＋僅 Teamcraft ${s.kept}（佔位或未翻譯而拿掉 ${s.dropped}）`);
  if (s.examples.length) console.log(`    用字不同例：${s.examples.slice(0, 4).join("　")}`);
}
