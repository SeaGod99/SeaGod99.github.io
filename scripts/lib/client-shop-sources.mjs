// 收藏品「在哪裡、用什麼換」——台服升版時，給新增的收藏條目補取得方式用
//
// 為什麼需要：收藏頁的取得方式原本靠 ffxiv-collection-tc 與 out_data/obtainable-methods（Teamcraft），
// 兩者都沒有台服新版的內容（前者最後一次 commit 2026-03-25）。新條目只剩 ffxivcollect 給的類型
// （「新月島」「部族任務」），細節是空的——而取得方式是收藏頁最優先的資訊（知識庫 §2.1）。
//
// 各欄位的來源（都不憑印象）：
//   商店結構   Teamcraft 全球 shops.json（lib/shops.mjs 的 loadShops；代價類型已解開，§4.47：不要自己掃 SpecialShop）。
//              商店結構與語言無關，國際服早就有台服新版的商店，所以 Teamcraft 台服語系檔落後時照樣拿得到。
//   NPC 台服名 先查 data/npcs.json（Teamcraft 台服），查不到再查台服客戶端 ENpcResident.Singular（過 isTranslated）。
//   NPC 位置   out_data/npcs.msgpack 的 npcs（Teamcraft 全球，position.map／zoneid／x／y）。
//   地名       data/maps.json 的 name（依 map）→ 台服客戶端 PlaceName（依 zoneid）。都查不到就不寫地點。
//   mapId      只在 maps.json 有這張圖時才寫；沒收的（新月島南部 967、渴望灣 1003…）記 null、只留地名與座標
//              （與 system-unlocks「實例地圖只有地名」同一個慣例；前端 sourceWhere() 本來就只用地名與座標，
//              validate-links 的「收藏頁 sources[].at.mapId → maps」要 0 斷鏈）。
//   代價名稱   data/items.json（台服名）。查不到台服名的代價，整筆交易不收（不落英文）。
//
// 產出形狀與 NPC 商店類來源相同，collection-tracker.js 的 sourceWhere() 會畫成
// 「🧍 兌換：調查隊的古錢鑑定師　📍 新月島南部 (38.2, 7.1)」＋複製 /coord 鈕：
//   { type, detail: "力之魔石 ×99", issuer: { name, verb: "兌換" }, at: { mapId, mapName, x, y } }
// 金幣（id 1）寫成「金幣」、動詞用「販售」（§4.67）。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decode } from "@msgpack/msgpack";
import { loadShops } from "./shops.mjs";
import { loadTcSheet } from "./tc-datamining.mjs";
import { isTranslated } from "./tw-text.mjs";
import { twName } from "./tw-locales.mjs";

const fmt = (n) => Number(n).toLocaleString("en-US");

export async function createShopSources({ root, offline = true } = {}) {
  const S = await loadShops({ root, offline });
  const enpc = new Map((await loadTcSheet("ENpcResident", { offline })).map((r) => [r.id, r.Singular]));
  const place = new Map((await loadTcSheet("PlaceName", { offline })).map((r) => [r.id, r.Name]));
  const npcPos = decode(await readFile(join(root, "out_data/npcs.msgpack"))).npcs || {};
  const maps = JSON.parse(await readFile(join(root, "data/maps.json"), "utf8")).data;
  const mapName = new Map(maps.map((m) => [m.id, m.name]));

  const ok = (s) => typeof s === "string" && s.trim() !== "" && isTranslated(s);

  /** NPC → { name, at } ；查不到台服名回 null */
  function npc(id) {
    const fromSite = S.npcInfo(id);
    if (fromSite) return fromSite;
    const name = enpc.get(id);
    if (!ok(name)) return null;
    const p = npcPos[id]?.position;
    let at = null;
    if (p) {
      const nm = mapName.get(p.map) ?? place.get(p.zoneid);
      if (ok(nm)) at = { mapId: mapName.has(p.map) ? p.map : null, mapName: nm, x: p.x ?? null, y: p.y ?? null };
    }
    return { id, name: name.trim(), at };
  }

  /** 代價文字；有任何一項查不到台服名就回 null */
  function costText(cost) {
    const parts = [];
    for (const c of cost) {
      if (c.itemId === 1) { parts.push(`${fmt(c.amount)} 金幣`); continue; }
      const n = S.itemById.get(c.itemId)?.name;
      if (!ok(n)) return null;
      parts.push(`${n} ×${fmt(c.amount)}`);
    }
    return parts.length ? parts.join("＋") : null;
  }

  /**
   * 這件道具可以向誰換／買。回傳最多 maxNpcs 筆來源（同一位 NPC、同樣代價只算一次），沒有就回 []。
   * @param type  來源類型（沿用條目原本的類型，例如「新月島」；沒有就用「兌換」）
   */
  function sourcesFor(itemId, { type = "兌換", maxNpcs = 3 } = {}) {
    const out = [];
    const seen = new Set();
    const hits = (S.byItem.get(itemId) || []).slice().sort((a, b) => a.shop.id - b.shop.id);
    for (const { shop, trade } of hits) {
      const detail = costText(trade.cost);
      if (!detail) continue;
      const gil = trade.cost.length === 1 && trade.cost[0].itemId === 1;
      for (const nid of shop.npcIds.slice().sort((a, b) => a - b)) {
        const n = npc(nid);
        if (!n) continue;
        const key = `${n.name}|${detail}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const src = { type, detail, issuer: { name: n.name, verb: gil ? "販售" : "兌換" } };
        if (n.at) src.at = n.at;
        out.push(src);
        if (out.length >= maxNpcs) return out;
      }
    }
    return out;
  }

  /**
   * 某間商店（SpecialShop／GilShop id，與 Teamcraft／取得方式摘要的 shopId 相同）在哪些 NPC 身上——
   * 取得方式分片層的兌換條目沒有 NPC 時用它補「誰＠哪裡」（2026-10-10：7.25 的 13 間店 om 裡 npcs 全是 null）。
   * 回傳最多 max 個 { name, at }，查不到台服名的 NPC 不收。
   */
  const shopById = new Map();
  for (const list of S.byItem.values()) for (const { shop } of list) if (!shopById.has(shop.id)) shopById.set(shop.id, shop);
  function npcsForShop(shopId, max = 2) {
    const shop = shopById.get(Number(shopId));
    if (!shop) return [];
    const out = [];
    for (const nid of shop.npcIds.slice().sort((a, b) => a - b)) {
      const n = npc(nid);
      if (n && !out.some((x) => x.name === n.name)) out.push(n);
      if (out.length >= max) break;
    }
    return out;
  }

  return { sourcesFor, npcsForShop, npc, S };
}

/**
 * 取得方式（obtainable-methods）轉換器用的兩個解析器，給 build-item-sources.mjs 與 build-market-sources.mjs 共用：
 *   twShop(shopId)    店名：台服客戶端 SpecialShop.Name 優先（7.25 的 13 間店 Teamcraft 台服語系檔沒有）→ tw-locales
 *   shopWhere(shopId) 「NPC＠地名 (x, y)」：npcsForShop（最多 2 位）
 * @param twLocales  scripts/lib/tw-locales.mjs 的 loadTwLocales() 結果（後備店名）
 */
export async function createOmShopResolvers({ root, offline = true, twLocales = null } = {}) {
  const res = await createShopSources({ root, offline });
  const strip = (s) => String(s || "").split("").filter((c) => { const k = c.charCodeAt(0); return k < 0xe000 || k > 0xf8ff; }).join("").trim();
  const tcShop = new Map((await loadTcSheet("SpecialShop", { offline })).map((r) => [r.id, strip(r.Name)]));
  const ok = (s) => typeof s === "string" && s.trim() !== "" && isTranslated(s);
  const twShop = (id) => {
    const c = tcShop.get(Number(id));
    if (ok(c)) return c;
    const t = twLocales ? twName(twLocales.shops, id) : null;
    return ok(t) ? t : null;
  };
  const shopWhere = (id) => {
    const ns = res.npcsForShop(id, 2);
    if (!ns.length) return null;
    return ns.map((n) => (n.at ? `${n.name}＠${n.at.mapName}${n.at.x != null ? ` (${n.at.x}, ${n.at.y})` : ""}` : n.name)).join("、");
  };
  return { twShop, shopWhere };
}
