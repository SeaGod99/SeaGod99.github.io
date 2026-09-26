// build-extra-sources.mjs — 產生 data/extra-sources.json（理符報酬＋收藏品交納）
//
// ── 為什麼要獨立一支 ──────────────────────────────────────────────────
// `obtainable-methods` 這份上游**完全沒有 `leve` 與 `collectable` 兩型**
// （實測 21 種 type 裡沒有它們）。而這兩條是真的取得管道：
//   · 理符報酬：1,155 件相異物品，**其中 1,114 件出現在配方裡**——
//     市場頁湊材料時很可能就是答案。
//   · 收藏品交納：127 件，重疊配方的只有 16 件，但裡面全是
//     「工具改良用零件」「輝煌／卓越工具加工組件」這類最常被問「這哪來的」的東西。
// 兩個消費端（`build-market-sources.mjs` 與 `build-item-sources.mjs`）都要用，
// 所以資料在這裡產一次，兩邊合併——不要各自抓一次，那就是兩份會漂的規則。
//
// ── 理符報酬的鏈 ──────────────────────────────────────────────────────
//   Leve.LeveRewardItem → LeveRewardItem.LeveRewardItemGroup[] → Group.{Item[9], Count[9]}
// ⚠ **`?limit=` 不指名 `fields` 時這兩張表回的是空物件**（`{}`），會讓人以為表是空殼。
// 逐列取（`/api/sheet/LeveRewardItem/180`）就看得到欄位。同一個雷見 CLAUDE.md 的 XIVAPI 那條。
//
// ⚠ **報酬是「池子裡隨機給一項」，不是全給。** 所以措辭一律寫「隨機報酬之一」，
// 不可以寫成「可獲得 X」——那會讓人跑去做一輪然後拿到別的東西。
//
// ── 收藏品交納 ────────────────────────────────────────────────────────
// 來源 Teamcraft `collectables.json`。`reward` 是**真的物品 id**（不是票券代號），
// `base/mid/high` 的 `scrip` 是該收藏價值級距給幾個。
// ⚠ **`collectable` 欄位不是物品 id**（整份都是 1，是個旗標），
// 所以**講不出「要交哪一件收藏品」**，只講得出等級與收藏價值門檻。措辭要如實。
// 這與知識庫 §4.81（票券身分對不回來）不衝突：那邊要的是「這個群組給哪種票」，
// 這邊要的是「這個物品從哪來」，後者資料裡直接有。
//
// 執行（repo 根目錄）：
//   node scripts/build-extra-sources.mjs            # dry-run，印覆蓋率
//   node scripts/build-extra-sources.mjs --apply    # 寫入
//   node scripts/build-extra-sources.mjs --offline  # 只用快取

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { xiv } from "./lib/xivapi.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache");

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const TC_COLLECTABLES =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/collectables.json";

/** 同一件物品最多列幾個理符。一件低階素材可能出現在十幾張理符的池子裡，
 *  全列會把「去採」「去買」這些確定的管道擠出 `normalizeEntries` 的額度。
 *  取**等級最低的**——那是最便宜做得到的一張。 */
const MAX_LEVES_PER_ITEM = 2;

/** 出現在超過這麼多張理符的池子裡就**整條不收**。
 *  實測「火之碎晶」有 520 張理符可能給、「冰之碎晶」400 張——
 *  對這種東西講「理符報酬」等於沒講（而且它們本來就到處都拿得到），
 *  只會把有用的管道從 `normalizeEntries` 的額度裡擠掉。
 *  這一型只有在「答案很具體」的時候才有資訊量。 */
const MAX_POOLS_FOR_SIGNAL = 20;

async function collectables() {
  const cache = join(CACHE, "tc-collectables.json");
  if (offline) return JSON.parse(await readFile(cache, "utf8"));
  try {
    const res = await fetch(TC_COLLECTABLES);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    await writeFile(cache, JSON.stringify(j));
    return j;
  } catch (e) {
    console.log(`  ⚠ Teamcraft collectables.json 抓不到（${e.message}），改用快取`);
    return JSON.parse(await readFile(cache, "utf8"));
  }
}

async function main() {
  const leves = await xiv.sheet(
    "Leve",
    "ClassJobLevel,LeveRewardItem@as(raw),ClassJobCategory.Name,PlaceNameIssued@as(raw)",
    { limit: 500, cache: "out_data/cache/leve-extra.json", offline, label: "  Leve：" }
  );
  const rewardItems = await xiv.sheet(
    "LeveRewardItem",
    "LeveRewardItemGroup@as(raw)",
    { limit: 500, cache: "out_data/cache/leve-reward-item-f.json", offline, label: "  RewardItem：" }
  );
  const groups = await xiv.sheet(
    "LeveRewardItemGroup",
    "Item@as(raw),Count",
    { limit: 500, cache: "out_data/cache/leve-reward-group-f.json", offline, label: "  Group：" }
  );

  const tw = await loadTwLocales();
  const twPlaces = decode(await readFile(join(ROOT, "out_data", "places.msgpack"))).twPlaces;
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const maps = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8")).data;
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  /* 發布地是 PlaceName，而我們要的 mapId 在 maps.json。用**地名**對回去——
     PlaceName 的 row id 不是 mapId（同 §4.10 那類坑）。 */
  const mapIdByName = new Map();
  for (const m of maps) if (!mapIdByName.has(m.name)) mapIdByName.set(m.name, m.id);

  const out = {};                        // itemId → entries[]
  const add = (id, e) => { (out[id] = out[id] || []).push(e); };

  // ── 理符報酬 ────────────────────────────────────────
  const riById = new Map(rewardItems.map((r) => [r.id, r.f["LeveRewardItemGroup@as(raw)"] || []]));
  const grpById = new Map(groups.map((g) => [g.id, g.f]));
  const byItem = new Map();              // itemId → [{ lv, name, place, mapId }]
  const stat = { leves: 0, leveNoTw: 0, leveItems: 0, leveTooMany: 0, colItems: 0, colRows: 0 };

  for (const lv of leves) {
    const ri = lv.f["LeveRewardItem@as(raw)"];
    if (!ri) continue;
    const name = twName(tw.leves, lv.id);
    if (!isTw(name)) { stat.leveNoTw++; continue; }     // 台服未開放＝不顯示（鐵則）
    const gids = riById.get(ri);
    if (!gids || !gids.length) continue;
    const job = (lv.f.ClassJobCategory && lv.f.ClassJobCategory.fields &&
      lv.f.ClassJobCategory.fields.Name) || "";
    const place = twName(twPlaces, lv.f["PlaceNameIssued@as(raw)"]) || null;
    const mapId = place && mapIdByName.has(place) ? mapIdByName.get(place) : null;
    let any = false;
    for (const gid of gids) {
      const g = grpById.get(gid);
      if (!g) continue;
      const itemIds = g["Item@as(raw)"] || [];
      for (const iid of itemIds) {
        if (!iid || !itemName.has(iid)) continue;
        if (!byItem.has(iid)) byItem.set(iid, new Map());
        /* **同一張理符只算一次。** 一張理符的 `LeveRewardItem` 可以指到多個 group，
           而同一件物品常常同時在好幾個 group 裡——不以理符 id 去重的話，
           畫面上會出現兩三行一模一樣的字。 */
        byItem.get(iid).set(lv.id, { lv: lv.f.ClassJobLevel || 0, name, place, mapId, job });
        any = true;
      }
    }
    if (any) stat.leves++;
  }

  for (const [iid, m] of byItem) {
    const list = [...m.values()];
    if (list.length > MAX_POOLS_FOR_SIGNAL) { stat.leveTooMany++; continue; }
    // 等級最低的那張最便宜做得到；同級的用理符名穩定排序（不要留給引擎的不定行為）
    list.sort((a, b) => a.lv - b.lv || a.name.localeCompare(b.name, "zh-Hant"));
    const total = list.length;
    for (const l of list.slice(0, MAX_LEVES_PER_ITEM)) {
      add(iid, {
        t: "理符報酬",
        /* **「隨機報酬之一」不可省。** 池子裡有最多 9 件，一次只給一項。
           寫成「可獲得」會讓人跑一趟然後拿到別的東西。 */
        d: `${l.name}（Lv.${l.lv}，隨機報酬之一${total > MAX_LEVES_PER_ITEM ? `；另有 ${total - MAX_LEVES_PER_ITEM} 張理符也可能給` : ""}）`,
        ...(l.place ? { w: l.place } : {}),
        ...(l.mapId != null ? { map: l.mapId } : {}),
      });
    }
    stat.leveItems++;
  }

  // ── 收藏品交納 ──────────────────────────────────────
  const col = await collectables();
  const byReward = new Map();            // rewardItemId → [{ lvMin, lvMax, base, mid, high, qty }]
  for (const row of Object.values(col)) {
    if (!row || !row.reward || !itemName.has(row.reward)) continue;
    stat.colRows++;
    if (!byReward.has(row.reward)) byReward.set(row.reward, []);
    byReward.get(row.reward).push(row);
  }
  for (const [iid, rows] of byReward) {
    rows.sort((a, b) => (a.levelMin || 0) - (b.levelMin || 0));
    const r = rows[0];
    /* ⚠ 有 184 筆的 `levelMin`／`rewardType` 是空的（蒼天街振興那批），
       直接插值會印出 `Lvundefined`——而那看起來像資料壞了。
       等級跨多個帶時取全體的 min–max，一個都拿不到就整個不寫。 */
    const lvs = rows.map((x) => x.levelMin ?? x.level).filter((x) => x != null);
    const lvMaxs = rows.map((x) => x.levelMax ?? x.level).filter((x) => x != null);
    const lo = lvs.length ? Math.min(...lvs) : null;
    const hi = lvMaxs.length ? Math.max(...lvMaxs) : null;
    const lvTxt = lo == null ? '收藏品' : (lo === hi ? `Lv${lo} 收藏品` : `Lv${lo}–${hi} 收藏品`);
    const ratings = [r.base, r.mid, r.high].filter(Boolean);
    const rating = ratings.map((x) => x.rating).join("／");
    const qty = ratings.map((x) => x.scrip).join("／");
    add(iid, {
      t: "收藏品交納",
      /* ⚠ **講不出「要交哪一件收藏品」**——`collectable` 欄位整份都是 1，是旗標不是 id。
         所以只寫等級與收藏價值門檻，不要編一個物品名出來。 */
      d: `交納 ${lvTxt}（收藏價值 ${rating} → ${qty} 個）` +
         (rows.length > 1 ? `；共 ${rows.length} 個等級帶，價值越高給越多` : ""),
    });
    stat.colItems++;
  }

  // ── 報告 ────────────────────────────────────────────
  const recipes = JSON.parse(await readFile(join(DATA, "recipes.json"), "utf8")).data;
  const wanted = new Set();
  for (const r of recipes) { wanted.add(r.itemId); for (const g of r.ingredients) wanted.add(g.itemId); }
  const ids = Object.keys(out).map(Number);
  const inRecipe = ids.filter((i) => wanted.has(i)).length;

  console.log(`\n共 ${ids.length} 件物品有額外管道（其中 ${inRecipe} 件出現在配方裡）`);
  console.log(`  理符報酬   ${stat.leveItems} 件（來自 ${stat.leves} 張有台服名的理符；無台服名而略過 ${stat.leveNoTw} 張）`);
  console.log(`             出現在 >${MAX_POOLS_FOR_SIGNAL} 張理符池子裡而**整條不收**的：${stat.leveTooMany} 件（碎晶那類，講了等於沒講）`);
  console.log(`  收藏品交納 ${stat.colItems} 件（${stat.colRows} 筆等級帶）`);
  const sample = ids.filter((i) => out[i].some((e) => e.t === "理符報酬")).slice(0, 2);
  for (const i of sample) {
    console.log(`\n  ${itemName.get(i)}：`);
    for (const e of out[i]) console.log(`    ${e.t}｜${e.d}${e.w ? `｜${e.w}` : ""}`);
  }
  const cs = ids.filter((i) => out[i].some((e) => e.t === "收藏品交納")).slice(0, 2);
  for (const i of cs) {
    console.log(`\n  ${itemName.get(i)}：`);
    for (const e of out[i]) console.log(`    ${e.t}｜${e.d}`);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "extra-sources",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 Leve→LeveRewardItem→LeveRewardItemGroup ＋ Teamcraft collectables.json ＋ tw-locales(leves) ＋ places.msgpack(twPlaces)",
    note: "obtainable-methods 沒有 leve／collectable 兩型，這份補上。理符報酬是**池子裡隨機給一項**，措辭一律「隨機報酬之一」。收藏品交納**講不出要交哪一件**（collectable 欄位是旗標不是 id），只講等級與收藏價值門檻。",
    count: ids.length,
    data: out,
  };
  await writeFile(join(DATA, "extra-sources.json"), JSON.stringify(db));
  console.log(`\n✓ data/extra-sources.json（${ids.length} 件）`);
  console.log("  接著跑：node scripts/build-market-sources.mjs && node scripts/build-item-sources.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
