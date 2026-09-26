// triple-triad-map.mjs — 幻卡的「卡片 row ↔ 道具 id ↔ 台服卡名」對照，單一來源
//
// 為什麼要抽出來：站內有三支腳本要這份對照，而它們各自用了**不同的方法**：
//   build-triple-triad-all.mjs      把九宮幻卡道具照 id 排序，取第 n 個當第 n 張卡
//   patch-triple-triad-new-cards.mjs 同上（而且拿這個當「驗證」）
//   patch-triple-triad-sources.mjs   Item.AdditionalData → TripleTriadCard（可證）
//
// 前兩種是序位巧合（§4.10 明文禁止的那種），2026-09-25 實測已經對不上了：
// 編號 256 在資料庫是「巨人掌」、照序位取到的道具是「巨人掌怪」——**兩張不同的卡**。
// 台服現有 439 張卡片道具，序位法從第 256 張起整串偏移。
//
// 這支只認 `Item.AdditionalData`：幻卡道具的 AdditionalData 直接指向 TripleTriadCard 的 row id，
// 是遊戲自己記的關聯。對不上的道具寧可不收，也不要用位置猜。
//
// 用法：
//   import { loadCardMap } from "./lib/triple-triad-map.mjs";
//   const m = await loadCardMap({ root, cache, offline });
//   m.cardToItem.get(1)      // → 道具 id
//   m.itemToCard.get(9808)   // → 卡片 row id
//   m.cardToTwName.get(1)    // → 「渡渡鳥」（已去掉「九宮幻卡：」前綴）
//   m.cardIds                // → v2 TripleTriadCard 的全部 row id（不含 0）

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { xiv } from "./xivapi.mjs";

const PREFIX = "九宮幻卡：";

/**
 * @param opts { root: repo 根目錄, cache?: 快取檔路徑, offline?: boolean }
 */
export async function loadCardMap({ root, cache, offline } = {}) {
  if (!root) throw new Error("loadCardMap 需要 root");

  const items = JSON.parse(await readFile(join(root, "data/items.json"), "utf8")).data;
  const cardItems = items.filter((i) => i.category === "九宮幻卡");

  // 道具 → 卡片 row（可證關聯）
  const fields = await xiv.rows("Item", cardItems.map((i) => i.id), "AdditionalData@as(raw)", {
    chunk: 100, cache, offline, label: "  幻卡道具 AdditionalData：",
  });

  const itemToCard = new Map();
  const cardToItem = new Map();
  const cardToTwName = new Map();
  const cardToPatch = new Map();
  const unmapped = [];

  for (const it of cardItems) {
    const card = fields.get(it.id)?.["AdditionalData@as(raw)"] || 0;
    if (!card) { unmapped.push(it); continue; }
    itemToCard.set(it.id, card);
    // 同一張卡理論上只對一個道具；真的撞到就留第一個並記下來，不要安靜覆蓋
    if (!cardToItem.has(card)) {
      cardToItem.set(card, it.id);
      cardToTwName.set(card, it.name.startsWith(PREFIX) ? it.name.slice(PREFIX.length) : it.name);
      cardToPatch.set(card, it.patch ?? null);
    } else {
      unmapped.push(it);
    }
  }

  // v2 的卡片全表（row 0 是空列，不算）
  const cards = await xiv.sheet("TripleTriadCard", "Name", { limit: 500 });
  const cardIds = cards.map((c) => c.id).filter((id) => id > 0);
  const cardNameEn = new Map(cards.filter((c) => c.id > 0).map((c) => [c.id, c.f.Name]));

  return { itemToCard, cardToItem, cardToTwName, cardToPatch, cardIds, cardNameEn, unmapped, cardItems };
}

/** 報告用：一行說明這份對照解出多少、缺多少 */
export function describeCardMap(m) {
  return [
    `台服幻卡道具 ${m.cardItems.length} 件 → 對到卡片 ${m.cardToItem.size} 張`,
    `v2 TripleTriadCard 共 ${m.cardIds.length} 張（含台服未開放）`,
    m.unmapped.length ? `無 AdditionalData 或重複而未收 ${m.unmapped.length} 件` : null,
  ].filter(Boolean).join("；");
}
