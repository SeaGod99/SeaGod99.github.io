// 「名稱本來就是物品名」的欄位，跟著 items.json 的台服名走（台服改譯或改中點時同步）
//
// 為什麼需要：patch-tw-names.mjs 只補缺名、**不覆蓋**（刻意保護社群校正名，§4.1）。但下面這幾個欄位
// 建置時就是直接取物品名，沒有任何社群名的成分；台服改版改了物品名（7.25：27 件改譯、1,126 個「·」→「・」），
// 它們就該一起變，否則同一件東西在市場頁與收藏頁長得不一樣。
//   fishes.json      name      ＝ items[itemId].name
//   gardening.json   name      ＝ items[productId].name；seedName ＝ items[seedId].name
//   hairstyles.json  name      ＝ items[id].name（髮型樣式道具，含「髮型樣式：」前綴）
//   fishes.json 的 bait[]／predators[] 裡的 name ＝ items[itemId].name（餌與前置魚）
//   fishes.json 的 folkloreBook.name ＝ items[folkloreBook.itemId].name（傳承錄書）
//   gardening.json 的 crossBreeds[].baseSeedName／adjacentSeedName ＝ 對應種子的物品名
// 樂譜名 orchestrion.json name ＝ 樂譜道具名去掉「管弦樂琴樂譜：」（舊列的名字來自社群站）：
//   只差中點的直接跟（10-10）；**用字不同的也跟、舊名進 aliases**（10-11 站主決定「社群名衝突以台服客戶端為準」，
//   例：呐喊→吶喊、明日複明日→明日復明日——後者是簡轉繁錯字；客戶端 Orchestrion 表同字）。
// 下面這類**只認「摺疊中點後完全相同」**（2026-10-10 加）——它不是定義上的物品名，可能是社群譯名：
//   收藏頁 sources[].detail 整串（或「名稱 ×數量」）就是某個物品名的（表情的「演技教材·百萬火光」…）
// **不包含**鳥鞍、坐騎、寵物、表情的 name：那些名稱不是物品名，客戶端另有表（patch-collection-names-client.mjs）。
//
// 冪等。執行：node scripts/patch-names-follow-items.mjs [--apply]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isTw } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const APPLY = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);

const items = new Map(JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data.map((i) => [i.id, i.name]));
const fold = (s) => String(s || "").replace(/[・·•‧]/g, "・");
/* 摺疊中點後 → 現在的物品名。兩個不同的物品名摺疊後撞在一起的，記成 null（不猜）。 */
const byFold = new Map();
for (const n of items.values()) {
  if (!n || !isTw(n)) continue;
  const k = fold(n);
  byFold.set(k, byFold.has(k) && byFold.get(k) !== n ? null : n);
}
const ORCH_PREFIX = "管弦樂琴樂譜：";
const SOURCE_FILES = ["mounts.json", "minions.json", "emotes.json", "orchestrion.json", "barding.json",
  "hairstyles.json", "ornaments.json", "triple-triad.json", "blue-magic.json"];

const JOBS = [
  { file: "fishes.json", fields: [["name", "itemId"]] },
  { file: "gardening.json", fields: [["name", "productId"], ["seedName", "seedId"]] },
  { file: "hairstyles.json", fields: [["name", "id"]] },
  { file: "orchestrion.json", fields: [] },
  ...SOURCE_FILES.filter((f) => !["hairstyles.json", "orchestrion.json"].includes(f)).map((file) => ({ file, fields: [] })),
];

/** 只差中點時回傳現在的物品名，否則 null（detail 允許「名稱 ×數量」） */
function dotFollow(s) {
  if (typeof s !== "string" || !s) return null;
  const m = s.match(/^(.*?)( ×\d+)?$/);
  const n = byFold.get(fold(m[1]));
  return n && n !== m[1] ? n + (m[2] || "") : null;
}

let touched = 0;
for (const job of JOBS) {
  const raw = readFileSync(join(DATA, job.file), "utf8");
  const db = JSON.parse(raw);
  const rows = Array.isArray(db) ? db : db.data;
  const changes = [];
  for (const e of rows) {
    for (const [nameKey, idKey] of job.fields) {
      const n = items.get(e[idKey]);
      // 只在原本就有名字、而且物品名是台服名時才跟（缺名交給 patch-tw-names；佔位 #id 也交給它）
      if (!n || !isTw(n) || !e[nameKey] || /^#\d+$/.test(e[nameKey]) || e[nameKey] === n) continue;
      changes.push(`${e[idKey]}：${e[nameKey]} → ${n}`);
      e[nameKey] = n;
    }
  }
  // 巢狀的物品參照：魚的餌（bait）與前置魚（predators）都是 { itemId, name }，name 就是物品名
  if (job.file === "fishes.json") {
    for (const e of rows) {
      for (const arr of [e.bait, e.predators]) {
        for (const x of Array.isArray(arr) ? arr : []) {
          if (!x || typeof x !== "object" || x.itemId == null || !x.name) continue;
          /* ⚠ 名稱含「／」的是「這一段 A 或 B 皆可」（知識庫 §4.9，例：「嘭嘭擬餌／紅蛆」）——
             itemId 只記其中一個，名稱卻是兩個都列。照物品名覆蓋會把另一個可用的餌刪掉（2026-10-10 差點發生）。 */
          if (x.name.includes("／")) continue;
          const n = items.get(x.itemId);
          if (!n || !isTw(n) || x.name === n) continue;
          changes.push(`${e.itemId} 的 ${arr === e.bait ? "餌" : "前置魚"} ${x.itemId}：${x.name} → ${n}`);
          x.name = n;
        }
      }
      // 傳承錄書（{ itemId, name }）
      const fb = e.folkloreBook;
      if (fb && fb.itemId != null && fb.name) {
        const n = items.get(fb.itemId);
        if (n && isTw(n) && fb.name !== n) { changes.push(`${e.itemId} 的傳承錄 ${fb.itemId}：${fb.name} → ${n}`); fb.name = n; }
      }
    }
  }
  // 園藝配種：本株與鄰株的種子名
  if (job.file === "gardening.json") {
    for (const e of rows) {
      for (const cb of Array.isArray(e.crossBreeds) ? e.crossBreeds : []) {
        for (const [nk, ik] of [["baseSeedName", "baseSeedId"], ["adjacentSeedName", "adjacentSeedId"]]) {
          const n = items.get(cb[ik]);
          if (!n || !isTw(n) || !cb[nk] || cb[nk] === n) continue;
          changes.push(`${e.productId ?? e.id} 的配種 ${cb[ik]}：${cb[nk]} → ${n}`);
          cb[nk] = n;
        }
      }
    }
  }
  // 樂譜名：道具名去掉前綴。只差中點的直接跟；用字不同的也跟，舊名（社群譯名）收進 aliases 讓搜尋找得到
  if (job.file === "orchestrion.json") {
    for (const e of rows) {
      const it = items.get(e.itemId);
      if (!it || !isTw(it) || !it.startsWith(ORCH_PREFIX) || !e.name) continue;
      const n = it.slice(ORCH_PREFIX.length);
      if (e.name === n) continue;
      if (fold(e.name) === fold(n)) { changes.push(`${e.itemId}：${e.name} → ${n}（只差中點）`); e.name = n; continue; }
      const aliases = Array.isArray(e.aliases) ? e.aliases : [];
      if (!aliases.includes(e.name)) aliases.push(e.name);
      e.aliases = aliases;
      changes.push(`${e.itemId}：${e.name} → ${n}（社群譯名→官方，舊名進 aliases）`);
      e.name = n;
    }
  }
  // 收藏頁取得方式裡「整串就是物品名」的 detail：只差中點才跟
  if (SOURCE_FILES.includes(job.file)) {
    for (const e of rows) {
      for (const s of Array.isArray(e.sources) ? e.sources : []) {
        const n = s && dotFollow(s.detail);
        if (!n) continue;
        changes.push(`${e.id ?? e.itemId} 的取得方式：${s.detail} → ${n}（只差中點）`);
        s.detail = n;
      }
    }
  }
  console.log(`${job.file.padEnd(18)} 跟上物品名 ${changes.length} 筆`);
  for (const c of changes.slice(0, 40)) console.log(`    ${c}`);
  if (changes.length > 40) console.log(`    …另 ${changes.length - 40} 筆`);
  if (APPLY && changes.length) {
    if (!Array.isArray(db)) db.updated = today;
    await writeFile(join(DATA, job.file), raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
    touched++;
  }
}
console.log(APPLY ? `\n✅ 已寫入 ${touched} 個檔` : "\n（dry-run，未寫入；加 --apply 套用）");
