// 產生 data/fashion-fillers.json — 每個部位「最便宜且可染色」的填充裝。
//
// 為什麼要這支：時尚品鑑的建議常寫「其餘部位穿任意裝備並染成指定色」。這句話有兩個坑——
//   ① **不是所有裝備都能染色**。實測：頭部最便宜的三件（質樸／陸行鳥／迷彩蛋殼帽，11～28 金幣）
//      DyeCount 全部是 0，照著買會發現根本染不上去。
//   ② 新玩家手上不見得有可染的裝，「任意裝備」等於沒講。
// 所以本站改成每個部位都給**具體一件**：全職業可穿、Lv1 就能穿、NPC 直購、確定可染。
// 這張表跨週不變，故獨立成一份資料，週更時直接引用。
//
// 篩選條件（全部可離線驗證，唯一連外是 XIVAPI 查 DyeCount）：
//   ・equipSlotCategory 對應該部位（對照見 lib/game-sources.mjs）
//   ・可裝備職業含 ADV（冒險者）＝ 全職業通用，含製作採集職
//   ・有**無門檻**的金幣商店（台服查得到販賣 NPC 與地圖；蠻族商人不算）
//   ・DyeCount ≥ 1
//   ・同分時取價格低者、再取需求等級低者
//
// 執行：node scripts/build-fashion-fillers.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadIndexes, resolveSources, SLOT_TC } from "./lib/game-sources.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "fashion-fillers.json");

/** 吃染色分的五個防具部位（武器另有職業限制，不做通用填充，見信封的 weaponNote）。 */
const SLOTS = [
  { slot: "head", cat: 3 },
  { slot: "body", cat: 4 },
  { slot: "hands", cat: 5 },
  { slot: "legs", cat: 7 },
  { slot: "feet", cat: 8 },
];
const CANDIDATES_PER_SLOT = 8; // 每部位先取最便宜的 N 件送去查 DyeCount

const ix = loadIndexes();

// ── 1. 離線初選 ────────────────────────────────────────────
const shortlist = new Map();
for (const { slot, cat } of SLOTS) {
  const cands = [];
  for (const key of Object.keys(ix.equipment)) {
    const e = ix.equipment[key];
    if (e.equipSlotCategory !== cat) continue;
    if (!e.jobs?.includes("ADV")) continue; // 全職業通用才有資格當填充裝
    const id = Number(key);
    const it = ix.byId.get(id);
    if (!it?.name) continue; // 台服未開放
    const sources = resolveSources(id, ix, { includeMarket: false });
    const gil = sources.find((s) => s.type === "npc-gil" && !s.gate);
    if (!gil) continue;
    cands.push({ id, name: it.name, price: gil.price, level: e.level, icon: it.icon, patch: it.patch, marketable: !!it.marketable, vendor: gil.npcs[0] ?? null, vendors: gil.npcs });
  }
  cands.sort((a, b) => a.price - b.price || a.level - b.level);
  shortlist.set(slot, cands.slice(0, CANDIDATES_PER_SLOT));
}

// ── 2. 查 DyeCount（一次批次請求）────────────────────────────
const ids = [...shortlist.values()].flat().map((c) => c.id);
const res = await fetch(`https://v2.xivapi.com/api/sheet/Item?rows=${ids.join(",")}&fields=DyeCount`);
if (!res.ok) throw new Error(`XIVAPI Item HTTP ${res.status}`);
const dyeCount = new Map((await res.json()).rows.map((r) => [r.row_id, r.fields.DyeCount ?? 0]));

// ── 3. 每部位挑出最便宜的可染件 ─────────────────────────────
const data = {};
const rejected = [];
for (const { slot } of SLOTS) {
  const cands = shortlist.get(slot);
  const pick = cands.find((c) => (dyeCount.get(c.id) ?? 0) >= 1);
  for (const c of cands) {
    if (c === pick) break;
    rejected.push({ slot, id: c.id, name: c.name, price: c.price, reason: "不可染色（DyeCount 0）" });
  }
  if (!pick) throw new Error(`${SLOT_TC[slot]}：前 ${CANDIDATES_PER_SLOT} 名候選全部不可染色，請調大 CANDIDATES_PER_SLOT`);
  data[slot] = {
    slot,
    slotName: SLOT_TC[slot],
    id: pick.id,
    name: pick.name,
    price: pick.price,
    level: pick.level,
    dyeCount: dyeCount.get(pick.id),
    icon: pick.icon,
    patch: pick.patch,
    marketable: pick.marketable,
    jobs: "全職業",
    vendor: pick.vendor,
    alsoAt: pick.vendors.slice(1, 4).map((v) => v.name),
  };
}

const total = Object.values(data).reduce((s, v) => s + v.price, 0);

writeFileSync(OUT, JSON.stringify({
  schema: "fashion-fillers",
  patch: ix.items.patch,
  updated: new Date().toISOString().slice(0, 10),
  source: "out_data/equipment.msgpack + out_data/shops.msgpack + data/items.json + XIVAPI Item.DyeCount",
  note:
    "每個部位一件：全職業（含製作採集職）可穿、NPC 金幣直購、無門檻、確定可染色。" +
    "用途是時尚品鑑「其餘部位染色補分」時的具體建議，取代空泛的「穿任意裝備」。",
  weaponNote:
    "武器部位不做通用填充：武器一定有職業限制，沒有一件所有職業都能拿的可染武器。" +
    "武器的染色分請用你自己該職業的武器（多數職業武器可染），若手上武器不可染就放棄武器那 2 分。",
  totalGil: total,
  rejected, // 被剔除的更便宜候選（不可染色）——留著當「便宜不等於能用」的證據
  data,
}, null, 2) + "\n", "utf8");

console.log(`✅ data/fashion-fillers.json：5 個部位，全套 ${total} 金幣`);
for (const v of Object.values(data)) {
  console.log(`   ${v.slotName}　${v.name}（${v.price} 金幣・Lv${v.level}・${v.vendor?.name ?? "?"}＠${v.vendor?.map ?? "?"}）`);
}
if (rejected.length) console.log(`   （剔除 ${rejected.length} 件更便宜但不可染色的：${rejected.map((r) => r.name).join("、")}）`);
