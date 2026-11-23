// collection-owners.mjs — 「這件物品是哪本收藏圖鑑的哪一格」的對照表（單一來源）
//
// 用途：兌換清單要標出「這件是收藏品、你有沒有」時，前端得知道兩件事——
//   ① 進度存在哪個 localStorage key（storageKey）
//   ② 那本圖鑑用什麼格式記這一格（keyOf 的輸出）
// 兩者都必須與該收藏頁的實際設定**逐字一致**，否則讀不到進度，而且**不會報錯**：
// 畫面只會安靜地把你已經有的東西算成「還缺」。
//
// ⚠ 2026-11-23 抽出來之前，這張表寫在 build-gold-saucer.mjs 裡，幻卡的 storageKey 寫成
//   "ffxiv_triple_triad_owned"——幻卡頁實際用的是 "ffxiv_triadcards_owned"。金碟頁 36 張
//   幻卡從上線起就永遠顯示「還沒有」。`validate-currency-shop.mjs` 現在會逐頁比對原始碼。
//
// keyOf **不統一格式**：多數頁是 'id:<id>'（collection-tracker 的預設）、寵物頁是純數字、
// 臉部配件是 'glasses:<款式 id>'。那是使用者的存檔鍵，改它會動到進度（知識庫 §2.5）。
//
// 用法：
//   import { loadCollectionOwners } from "./lib/collection-owners.mjs";
//   const owner = await loadCollectionOwners({ root: ROOT, offline });
//   owner.get(itemId)  // → { collection, label, path, storageKey, key, name, patch } 或 undefined
//
// 不收的：髮型（hairstyles.json 沒有解鎖道具 id）、成就、討伐筆記這類不是「一件道具解鎖一格」的。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCardMap } from "./triple-triad-map.mjs";

// 以解鎖道具 itemId 對應的圖鑑。path 是站內相對路徑（不含開頭的 /）。
export const COLLECTIONS = [
  { file: "mounts", label: "坐騎", path: "collections/mounts/", storageKey: "ffxiv_mounts_owned", keyOf: (e) => "id:" + e.id },
  { file: "minions", label: "寵物", path: "minions/", storageKey: "ffxiv_minions_owned", keyOf: (e) => String(e.id) },
  { file: "orchestrion", label: "樂譜", path: "collections/orchestrion/", storageKey: "ffxiv_orchestrion_owned", keyOf: (e) => "id:" + e.id },
  { file: "barding", label: "鳥鞍", path: "collections/barding/", storageKey: "ffxiv_barding_owned", keyOf: (e) => "id:" + e.id },
  { file: "emotes", label: "表情", path: "collections/emotes/", storageKey: "ffxiv_emotes_owned", keyOf: (e) => "id:" + e.id },
  { file: "ornaments", label: "時尚配飾", path: "collections/ornaments/", storageKey: "ffxiv_ornaments_owned", keyOf: (e) => "id:" + e.id },
  // 臉部配件與時尚配飾同一頁、同一個 storageKey，靠前綴分開（collections/ornaments/index.html 的 keyOf）
  { file: "facewear", label: "時尚配飾", path: "collections/ornaments/", storageKey: "ffxiv_ornaments_owned", keyOf: (e) => "glasses:" + e.id },
];

// 幻卡沒有 itemId 欄位，走可證對照（Item.AdditionalData → TripleTriadCard，§4.10）
export const TRIAD = { file: "triple-triad", label: "幻卡", path: "collections/triple-triad/", storageKey: "ffxiv_triadcards_owned", keyOf: (c) => "id:" + c.id };

/**
 * @returns Map<itemId, { collection, label, path, storageKey, key, name, patch }>
 */
export async function loadCollectionOwners({ root, offline = false } = {}) {
  const DATA = join(root, "data");
  const owner = new Map();
  for (const c of COLLECTIONS) {
    const db = JSON.parse(await readFile(join(DATA, `${c.file}.json`), "utf8")).data;
    for (const e of db) {
      if (!e.itemId) continue;
      owner.set(e.itemId, { collection: c.file, label: c.label, path: c.path, storageKey: c.storageKey, key: c.keyOf(e), name: e.name, patch: e.patch ?? null });
    }
  }
  const cardMap = await loadCardMap({ root, cache: join(root, "out_data/cache/tt-card-items.json"), offline });
  const triad = JSON.parse(await readFile(join(DATA, "triple-triad.json"), "utf8")).data;
  const triadById = new Map(triad.map((c) => [c.id, c]));
  for (const [card, itemId] of cardMap.cardToItem) {
    const c = triadById.get(card);
    if (!c) continue;
    owner.set(itemId, { collection: TRIAD.file, label: TRIAD.label, path: TRIAD.path, storageKey: TRIAD.storageKey, key: TRIAD.keyOf(c), name: c.name, patch: c.patch ?? null });
  }
  return owner;
}

/** 前端用的精簡形狀（金碟頁與貨幣變現排行共用同一種 `own` 欄位） */
export const ownField = (o) => ({ c: o.collection, label: o.label, path: o.path, sk: o.storageKey, k: o.key });
