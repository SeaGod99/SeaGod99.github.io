// shops.mjs — 商店表的共用正規化層
//
// 為什麼要這支：`out_data/shops.msgpack` 與 Teamcraft 的 `shops.json` 是站內十個提案的
// 共同原料（多幣種變現、金碟價目、季節商店、NPC 商店目錄、市場取得管道、軍票成本、
// 練級裝備、古武、部族聲望…），但目前只有兩支腳本各自解過它，而且解法不同：
//   build-gc-shop.mjs      讀 out_data/shops.msgpack（本機 dump，**停在舊版本**）
//   build-currency-shop.mjs 讀 Teamcraft shops.json（隨 staging 更新）
// 十案各寫一份解析＝十份會漂的規則。這支把它收斂成一種形狀。
//
// ── 資料來源的取捨（實測，2026-09-25）──────────────────────────────────
//   結構    Teamcraft `shops.json`（2,253 間，隨 staging 更新）
//           **不用** out_data/shops.msgpack：那是舊 dump，7.21 之後的兌換品不在裡面。
//   台服店名 out_data/tw-locales.msgpack 的 `shops`（1,875 間有名）
//           實測完全涵蓋 msgpack 的 twShops（1,815 間）且多 60 間，沒有反向缺口。
//   NPC／地點 data/npcs.json（有繁中名與座標者）＋ data/maps.json
//
// ── 貨幣 vs 商品 ─────────────────────────────────────────────────────
// trade 的 `currencies` 是付出去的、`items` 是拿回來的。**`currencies` 不一定是貨幣**：
// 交換所也會要你拿道具換道具。要判斷「這是不是一種貨幣」用 isCurrency()：
// 不是金幣、在 items.json 裡、且**不能上市場板**（ItemSearchCategory === 0）。
// 注意 `items.json` 的 `marketable` 欄位**不是**這個意思（§4.46），別拿它判。
//
// 用法：
//   import { loadShops } from "./lib/shops.mjs";
//   const S = await loadShops({ root, offline });
//   S.shops                    // 正規化後的全部商店
//   S.byCurrency.get(20)       // 用軍票買得到的 [{shop, trade, unit}]
//   S.byItem.get(5594)         // 哪些商店賣這件東西
//   S.byNpc.get(1002387)       // 這個 NPC 開的店
//   S.shopName(262151)         // 台服官方店名（查不到回 null，不要自己編）

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadTwLocales, twName } from "./tw-locales.mjs";

const TC_SHOPS =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/shops.json";

/**
 * @param opts { root, offline?, refresh? }
 */
export async function loadShops({ root, offline = false, refresh = false } = {}) {
  if (!root) throw new Error("loadShops 需要 root");
  const cache = join(root, "out_data/cache/tc-shops.json");

  let raw;
  if (!refresh && existsSync(cache)) {
    raw = JSON.parse(await readFile(cache, "utf8"));
  } else if (offline) {
    throw new Error(`--offline 但找不到 ${cache}`);
  } else {
    const r = await fetch(TC_SHOPS);
    if (!r.ok) throw new Error(`Teamcraft shops.json HTTP ${r.status}`);
    raw = await r.json();
    await mkdir(join(root, "out_data/cache"), { recursive: true });
    await writeFile(cache, JSON.stringify(raw));
  }

  const tw = await loadTwLocales();
  const items = JSON.parse(await readFile(join(root, "data/items.json"), "utf8")).data;
  const npcs = JSON.parse(await readFile(join(root, "data/npcs.json"), "utf8")).data;
  const maps = JSON.parse(await readFile(join(root, "data/maps.json"), "utf8")).data;

  const itemById = new Map(items.map((i) => [i.id, i]));
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const mapById = new Map(maps.map((m) => [m.id, m]));

  const shopName = (id) => twName(tw.shops, id);

  // NPC → { id, name, at }。查不到繁中名就整個不給（鐵則：不落英文）
  function npcInfo(id) {
    const n = npcById.get(id);
    if (!n || !n.name) return null;
    const m = n.coords ? mapById.get(n.coords.mapId) : null;
    return {
      id,
      name: n.name,
      at: n.coords ? { mapId: n.coords.mapId, mapName: m?.name ?? null, x: n.coords.x, y: n.coords.y } : null,
    };
  }

  /* 開發用的除錯商店。遊戲資料裡留著兩間（1769474「測試：交換貨幣」、1769524「測試用商店」），
     賣的是 1 金碟幣買治療劑這種東西——**不是真的價錢**，但欄位長得跟正常商店一模一樣，
     所以任何吃商店表的功能都會安靜地把它們當真。2026-09-26 金碟價目表的最便宜五件
     全是這兩間貢獻的，截圖才看出來。
     用店名判定而不是寫死 id：台服沒有任何正常商店叫「測試」，而新的除錯店會沿用同樣的命名。 */
  const isDebugShop = (sh) => /測試|テスト/.test(sh.name || "") || /^Test/i.test(sh.name || "");

  const shops = [];
  let dropped = 0;
  for (const s of raw) {
    const npcList = (s.npcs || []).map(npcInfo).filter(Boolean);
    shops.push({
      id: s.id,
      type: s.type,                        // GilShop / SpecialShop / GCShop / …
      name: shopName(s.id),                // 台服官方店名，查不到是 null
      gc: s.gc ?? null,                    // 大國防聯軍（GCShop 才有）
      npcIds: s.npcs || [],
      npcs: npcList,                       // 只含查得到繁中名的
      trades: (s.trades || []).map((t) => ({
        cost: (t.currencies || []).map((c) => ({ itemId: c.id, amount: c.amount })),
        gives: (t.items || []).map((i) => ({ itemId: i.id, amount: i.amount })),
        requiredGCRank: t.requiredGCRank ?? null,
      })),
    });
  }

  // 除錯商店整間剔除（連同它的交易），在建索引之前
  const kept = shops.filter((sh) => {
    if (isDebugShop(sh)) { dropped++; return false; }
    return true;
  });
  shops.length = 0;
  shops.push(...kept);

  // ── 索引 ──
  const byCurrency = new Map();   // 付出去的道具 id → [{ shop, trade, unit }]
  const byItem = new Map();       // 拿回來的道具 id → [{ shop, trade }]
  const byNpc = new Map();        // NPC id → [shop]
  for (const shop of shops) {
    for (const id of shop.npcIds) {
      if (!byNpc.has(id)) byNpc.set(id, []);
      byNpc.get(id).push(shop);
    }
    for (const trade of shop.trades) {
      for (const c of trade.cost) {
        if (!byCurrency.has(c.itemId)) byCurrency.set(c.itemId, []);
        // unit＝這筆交易裡，一個單位的商品要付多少（商品數量為 0 時不除）
        const qty = trade.gives.reduce((a, g) => a + g.amount, 0) || 1;
        byCurrency.get(c.itemId).push({ shop, trade, unit: c.amount / qty });
      }
      for (const g of trade.gives) {
        if (!byItem.has(g.itemId)) byItem.set(g.itemId, []);
        byItem.get(g.itemId).push({ shop, trade });
      }
    }
  }

  return { shops, byCurrency, byItem, byNpc, shopName, itemById, npcInfo, raw, droppedDebug: dropped };
}

/**
 * 這個道具 id 是不是一種「貨幣」。
 * 判準＝不是金幣、在 items.json 裡、且**不能上市場板**。
 * 上不上市場板要問 XIVAPI 的 `ItemSearchCategory`（0 ＝不能），
 * **不要用 items.json 的 `marketable`**——那是「玩家之間可不可交易」，兩者不同（§4.46）：
 * 雙色寶石／狼印戰績／詩學／軍票的 marketable 都是 true，但它們都上不了市場板。
 *
 * @param listable  Set<itemId> 或 (id)=>boolean，能上市場板的集合（呼叫端自備／快取）
 */
export function isCurrency(id, { itemById, listable }) {
  if (id === 1) return false;                      // 金幣
  if (!itemById.has(id)) return false;
  const ok = typeof listable === "function" ? listable(id) : listable.has(id);
  return !ok;
}

/** 報告用一行摘要 */
export function describeShops(S) {
  const named = S.shops.filter((s) => s.name).length;
  const withNpc = S.shops.filter((s) => s.npcs.length).length;
  const trades = S.shops.reduce((a, s) => a + s.trades.length, 0);
  return `商店 ${S.shops.length} 間（有台服店名 ${named}、有繁中 NPC ${withNpc}）、交易 ${trades} 筆、` +
    `可付出的道具 ${S.byCurrency.size} 種、買得到的道具 ${S.byItem.size} 種` +
    (S.droppedDebug ? `；已剔除除錯商店 ${S.droppedDebug} 間` : "");
}
