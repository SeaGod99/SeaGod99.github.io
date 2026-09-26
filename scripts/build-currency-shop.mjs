// 建立 data/currency-shop.json — 多幣種變現排行（/tools/gc-exchange/）的資料來源
//
// 這支是 build-gc-shop.mjs 的一般化版本：那支只處理軍票與雙色寶石兩種貨幣，
// 但遊戲裡還有二十幾種貨幣（詩學／數理神典石、巧手與大地各色票、狼印戰績、
// 蒼天街振興票、狩獵戰利品、同盟徽章、宇宙信用點數、櫟木幣、幻巧葉、
// 謝爾達萊青船幣…），玩家每週都在問「這種票滿了換什麼變現最好」，站內卻只答得出軍票。
//
// ── 為什麼吃 Teamcraft 的 shops.json，不自己掃 XIVAPI SpecialShop ──
// 直接掃 SpecialShop 會掉進 id 空間陷阱（知識庫 §4.10 的同一個坑）：
// 每筆兌換項的 `ItemCost` 只有在 `CostType === 0` 時才真的是道具 id。
//   CostType=2（1,353 筆）：ItemCost 寫 1/2/3，看起來是 Gil／火之碎晶／冰之碎晶，
//                          其實是 Tomestones 的**槽位索引**——「詩學神典石商店」整批
//                          會被誤判成「用 Gil 買」。
//   CostType=3（2,374 筆）：ItemCost 寫 2/4/6/7，看起來是四種碎晶，其實是各色票的索引，
//                          「火之碎晶能換 218 件」這種假貨幣就是這樣冒出來的。
// Teamcraft 的 shops.json 已經把這層解開（詩學 2,078 筆、巧手紫票 1,521 筆都解得出來），
// 所以改吃它，不重造一次輪子也不重踩一次坑。
//
// 做法：
//   1. 抓 Teamcraft shops.json（約 9.4MB，快取在 out_data/cache/）
//   2. 只取**成本只有一種貨幣**的兌換項（複合成本如「A×3 ＋ B×1」換算不成單一幣值，
//      硬算會誤導，直接跳過）
//   3. 同一件兌換品跨商店取「每單位貨幣最划算」的一筆
//   4. 「是貨幣」的判準＝**它自己掛不上市場板**（見下方 isCurrency）
//
// 鐵則：兌換品無台服繁中名或掛不上市場板者一律剔除（前端另套 PatchGate）。
//
// 執行（repo 根目錄）：
//   node scripts/build-currency-shop.mjs            # dry-run，只印統計
//   node scripts/build-currency-shop.mjs --apply    # 寫入 data/currency-shop.json
//   node scripts/build-currency-shop.mjs --offline  # 用 out_data/cache 的快取，不連網

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadShops, describeShops } from "./lib/shops.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "out_data", "cache");
const SHOPS_CACHE = join(CACHE, "tc-shops.json");
const SEARCHCAT_CACHE = join(CACHE, "item-search-category.json");
const API = "https://v2.xivapi.com/api";
const TC_SHOPS = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/shops.json";

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

// 一種貨幣至少要能換到這麼多件「可上市場板＋有台服名」的東西才做成分頁，
// 否則排行只有兩三列，開一個分頁反而礙事（金碟幣 1,355 筆兌換項只有 7 件可交易，因此不收）。
const MIN_ITEMS = 10;

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

const items = JSON.parse(await readFile(join(ROOT, "data/items.json"), "utf8")).data;
const byId = new Map(items.map((x) => [x.id, x]));
const nameOf = (id) => byId.get(id)?.name || null;
const hasTwName = (id) => {
  const it = byId.get(id);
  return !!(it && it.name && isTw(it.name));
};

/* ── 1. 商店表（共用層 scripts/lib/shops.mjs，十個提案吃同一份解析）── */
const S = await loadShops({ root: ROOT, offline });
console.log(describeShops(S));

// currencyId -> Map(itemId -> { cost, count })
// 只收「單一貨幣成本」的兌換項：複合成本（要同時交兩種東西）排不出每單位變現值。
const byCurrency = new Map();
let skippedMulti = 0, trades = 0;
for (const shop of S.shops) {
  for (const t of shop.trades) {
    const cur = t.cost.filter((c) => c && c.itemId && c.amount);
    if (cur.length !== 1) { if (cur.length > 1) skippedMulti++; continue; }
    const got = t.gives[0];
    if (!got || !got.itemId) continue;
    trades++;
    const curId = cur[0].itemId, cost = cur[0].amount, count = got.amount || 1;
    if (!byCurrency.has(curId)) byCurrency.set(curId, new Map());
    const m = byCurrency.get(curId);
    const prev = m.get(got.itemId);
    // 每單位貨幣能拿到幾個，越多越划算
    const rank = t.requiredGCRank || 0;      // 軍票商店才有：軍銜門檻
    if (!prev || count / cost > prev.count / prev.cost) m.set(got.itemId, { cost, count, rank });
  }
}
console.log(`單一貨幣成本的兌換項 ${trades} 筆；跳過複合成本 ${skippedMulti} 筆；相異成本貨幣 ${byCurrency.size} 種`);

/* ── 2. ItemSearchCategory（市場板判準）── */
// ⚠ 不要用 items.json 的 `marketable` 判斷「能不能掛市場板」。
// 那個欄位是 build-items.mjs 由 `IsUntradable === false` 推的＝**玩家之間可否交易**，
// 與「可否在市場板掛賣」是兩回事：雙色寶石／狼印戰績／詩學神典石／軍票／蒼天街振興票
// 全都 IsUntradable=false（所以 marketable=true）但 ItemSearchCategory=0，掛不上市場板。
// 市場板判準只有一個：`ItemSearchCategory > 0`。
const searchCat = new Map();
if (existsSync(SEARCHCAT_CACHE)) {
  for (const [k, v] of Object.entries(JSON.parse(await readFile(SEARCHCAT_CACHE, "utf8")))) searchCat.set(Number(k), v);
  console.log(`ItemSearchCategory 快取 ${searchCat.size} 筆`);
}
async function loadSearchCat(ids) {
  const want = [...new Set(ids)].filter((id) => id && !searchCat.has(id));
  if (!want.length) return;
  if (offline) { console.log(`  ⚠ --offline 但有 ${want.length} 筆沒有快取，這些會被當成不可上市`); return; }
  for (let i = 0; i < want.length; i += 100) {
    const d = await getJSON(`${API}/sheet/Item?rows=${want.slice(i, i + 100).join(",")}&fields=${encodeURIComponent("ItemSearchCategory@as(raw)")}`);
    for (const r of d.rows) searchCat.set(r.row_id, r.fields["ItemSearchCategory@as(raw)"] || 0);
    process.stdout.write(`\r  ItemSearchCategory: 新抓 ${searchCat.size}`);
  }
  process.stdout.write("\n");
  await mkdir(CACHE, { recursive: true });
  await writeFile(SEARCHCAT_CACHE, JSON.stringify(Object.fromEntries(searchCat)));
}
console.log("取 ItemSearchCategory…");
await loadSearchCat([...byCurrency.keys(), ...[...byCurrency.values()].flatMap((m) => [...m.keys()])]);

const listable = (id) => (searchCat.get(id) || 0) > 0;
const usable = (id) => (hasTwName(id) && listable(id) ? byId.get(id) : null);

// 「是貨幣」的判準：**它自己掛不上市場板**。
// 能掛市場板的東西要變現直接賣就好，不需要排行。
const isCurrency = (id) => id !== 1 && byId.has(id) && !listable(id);

/* ── 3. 組裝 ── */
function buildList(map) {
  const out = [];
  for (const [id, v] of map) {
    const it = usable(id);
    if (!it) continue;
    out.push({ id, name: it.name, category: it.category, patch: it.patch, cost: v.cost, count: v.count, ...(v.rank ? { rank: v.rank } : {}) });
  }
  // 排序鍵用「每單位成本」，同值再用物品 id——不可用會變動的市價（§3.19）
  out.sort((a, b) => a.cost / a.count - b.cost / b.count || a.id - b.id);
  return out;
}

// 軍票三團（黑渦團 20／雙蛇黨 21／不滅隊 22）品項相同，合併成一種呈現
const GC_SEALS = [20, 21, 22];
const currencies = [];
const skipped = { notCurrency: [], noTwName: [], belowMin: [] };

const sealMerged = new Map();
for (const id of GC_SEALS) {
  for (const [itemId, v] of byCurrency.get(id) || []) {
    const prev = sealMerged.get(itemId);
    if (!prev || v.count / v.cost > prev.count / prev.cost) sealMerged.set(itemId, v);
  }
}
const sealList = buildList(sealMerged);
if (sealList.length >= MIN_ITEMS) {
  currencies.push({ id: GC_SEALS[0], ids: GC_SEALS, name: "軍票", note: "三個大國防聯軍的軍票品項相同，合併呈現；部分品項另有軍銜門檻", items: sealList });
}

for (const [curId, m] of byCurrency) {
  if (GC_SEALS.includes(curId)) continue;
  const list = buildList(m);
  if (list.length < MIN_ITEMS) { if (list.length) skipped.belowMin.push([curId, list.length]); continue; }
  if (!isCurrency(curId)) { skipped.notCurrency.push([curId, list.length]); continue; }
  if (!hasTwName(curId)) { skipped.noTwName.push([curId, list.length]); continue; }
  const cur = byId.get(curId);
  // 季節活動貨幣（幸運彩蛋、落芒星…）現在拿不到了，頁面要分開擺免得誤導。
  // 只認 items.json 自己標的分類，不自己判斷哪個活動還在辦。
  const isEvent = cur.category === "雜貨（季節活動）";
  currencies.push({ id: curId, name: cur.name, category: cur.category, patch: cur.patch, ...(isEvent ? { event: true } : {}), items: list });
}

// 分頁順序：品項多的排前面
currencies.sort((a, b) => b.items.length - a.items.length);

console.log(`\n收錄 ${currencies.length} 種貨幣（門檻：可上市品項 ≥ ${MIN_ITEMS}、且該貨幣本身掛不上市場板）：`);
for (const c of currencies) console.log(`  ${String(c.items.length).padStart(4)} 件  ${c.name}（id ${c.id}）`);

const fmt = (list) => list.sort((a, b) => b[1] - a[1]).map(([id, n]) => `${nameOf(id) || id}(${n})`).join("、");
if (skipped.notCurrency.length) console.log(`\n達門檻但自己能掛市場板，故不算貨幣（要變現直接賣就好）：\n  ${fmt(skipped.notCurrency)}`);
if (skipped.noTwName.length) console.log(`\n達門檻但無台服名（台服未開放，依鐵則不收）：\n  ${fmt(skipped.noTwName)}`);
if (skipped.belowMin.length) console.log(`\n未達 ${MIN_ITEMS} 件門檻：\n  ${fmt(skipped.belowMin.slice(0, 20))}`);

const out = {
  schema: "currency-shop@1",
  updated: new Date().toISOString().slice(0, 10),
  source: "Teamcraft shops.json（已解開 SpecialShop 的 CostType 索引）＋ XIVAPI v2 Item.ItemSearchCategory；名稱取自 data/items.json",
  note: `只收成本為單一貨幣的兌換項；貨幣＝自己掛不上市場板者；每種至少 ${MIN_ITEMS} 件可上市品項才收錄`,
  count: currencies.length,                                        // validate-data 要求 count === data.length
  itemCount: currencies.reduce((n, c) => n + c.items.length, 0),
  data: currencies,
};

if (!apply) {
  console.log(`\n合計 ${out.itemCount} 筆兌換品；（dry-run，未寫入；加 --apply 才寫）`);
} else {
  await writeFile(join(ROOT, "data/currency-shop.json"), JSON.stringify(out), "utf8");
  console.log(`\n✓ data/currency-shop.json（${currencies.length} 種貨幣、${out.itemCount} 筆兌換品）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}
