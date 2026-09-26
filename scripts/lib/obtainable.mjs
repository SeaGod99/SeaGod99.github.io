// obtainable.mjs — 取得管道（obtainable-methods）→ 前端可讀條目的共用轉換
//
// 為什麼要抽出來：`data/obtainable-methods.json` 是站內最完整的取得方式庫
// （36,336 件物品、21 種管道），但它 7.7MB，前端載不動，所以一定要有一層
// 「挑欄位、翻成人話、排優先序」的轉換。這層原本只存在於 build-market-sources.mjs 裡，
// 而依賴它的提案有七個（item-source-hub、housing-furniture-codex、
// market-source-enrichment、leveling-gear-route、collection-festival-badge、
// glamour-event-availability、seasonal-items-data-layer）。
// 七案各抄一份＝七種「兌換」的寫法、七種優先序。
//
// 這支只負責**單筆管道 → 一個顯示條目**，不決定收哪些物品、也不決定怎麼切檔，
// 那是各腳本自己的事（市場頁只要配方相關的、分片層要全部的）。
//
// 條目形狀：{ t: 類型, d: 說明, w?: 地點/NPC, map?: mapId }
// 欄位名刻意用單字母——這些檔案是前端整份載入的，欄位名佔的位元組不比值少。

// 生產職的 ClassJob row id → 繁中名。值取自 data/equip.json 的 names 表
// （CLAUDE.md 指定的職業名權威來源），這裡只是把它固定下來避免每次都載那份檔。
import { twOnly as twText } from "./tw-text.mjs";

const JOB_TW = { 8: '刻木匠', 9: '鍛鐵匠', 10: '鑄甲匠', 11: '雕金匠', 12: '製革匠', 13: '裁衣匠', 14: '煉金術士', 15: '烹調師' };

/** 顯示優先序：能自己去拿的排前面，靠運氣或已淘汰的排後面。 */
export const ORDER = [
  '採集', '軍票兌換', '兌換', 'NPC商店', '無人島', '園藝', '副本', '危命任務',
  '任務獎勵', '雇員探險', '遠航探索', '寶箱/容器', '怪物掉落', '精製獲得', '分解獲得', '成就獎勵',
  '可製作', '商城購買',
];

// 兩個消費端要略過的東西不一樣，所以 SKIP 是參數不是常數：
//
//   SKIP_MARKET（市場頁「我要湊材料」）
//     craft      前端自己有 recipes.json，會畫成配方樹，這裡再講一次是雜訊
//     masterbook 秘籍是製作的前置，不是取得管道
//     mogstation 商城要花現金，湊材料時不是選項
//
//   SKIP_CATALOG（分片層「這東西哪來的」）
//     只略過語意含糊的兩種。**製作與商城在這裡是有效答案**——
//     房屋家具 1,486 件裡有 701 件只能製作、154 件只在商城，
//     把它們濾掉的話那些物品會顯示成「查無取得方式」，那是錯的。
//
// requirement／alarm 兩邊都略過：前者是「被什麼需要」（反向關係），後者沒有座標。
export const SKIP_MARKET = new Set(['craft', 'masterbook', 'mogstation', 'requirement', 'alarm']);
export const SKIP_CATALOG = new Set(['requirement', 'alarm']);
export const SKIP = SKIP_MARKET;   // 相容舊呼叫

// 鐵則：查不到台服名就不顯示，**絕不落英文**。
// `obtainable-methods.json` 的 shopName／questName／fateName／npc.name 有 2,444 處是英文
// （Immortal Flames、Gemstone Trader、Scrip Exchange…），那是上游 dump 的語系缺口，
// 不是台服真的這樣叫。這裡一律擋掉，能補的用 tw-locales 補、補不到就整段不印。
// 守門在 lib/tw-text.mjs（全站唯一一份）。**不要在這裡重寫成 `/[一-鿿]/`**——
// 那個版本只要字串裡任何一處有漢字就整串放行，混了假名的日文原文會直接上畫面
// （「コメンデーションクリスタルの取引」有「取引」就過了）。
const twOnly = twText;

export function npcNames(m) {
  if (!Array.isArray(m.npcs) || !m.npcs.length) return null;
  const uniq = [...new Set(m.npcs.map((n) => twOnly(n?.name)).filter(Boolean))];
  return uniq.length ? uniq.slice(0, 3).join('、') : null;
}

/** 單筆 obtainable method → 顯示條目；不該顯示的回 null。 */
/**
 * @param m       一筆 obtainable method
 * @param opts.skip    要略過的 type 集合（SKIP_MARKET／SKIP_CATALOG，兩者用途不同）
 * @param opts.twShop  shopId → 台服店名（補 om 自帶的英文店名）
 * @param opts.vendor  **這個物品**在 data/vendor-prices.json 的那一筆（補 vendor 型的販售者）
 */
export function convertOm(m, { skip = SKIP_MARKET, twShop = null, vendor = null } = {}) {
  if (skip.has(m.type)) return null;
  switch (m.type) {
    case 'craft': {
      const job = JOB_TW[m.jobId] || null;
      return { t: '可製作', d: job ? `${job} 製作${m.level ? ` Lv.${m.level}` : ''}` : '可自行製作' };
    }
    case 'masterbook':
      return { t: '可製作', d: '需秘籍' };
    case 'mogstation':
      return { t: '商城購買', d: '線上商城' };
    case 'specialshop': {
      // 店名：先問 tw-locales（台服官方店名），再退到 om 自帶的字串，兩者都要是繁中
      const shop = (twShop && m.shopId ? twOnly(twShop(m.shopId)) : null) || twOnly(m.shopName);
      const curName = twOnly(m.currency?.name);
      const amount = m.currency?.amount;
      // 商店名常常就是貨幣名（「白鋼刀幣」的商店也叫「白鋼刀幣」），別印兩次
      const parts = [];
      if (shop) parts.push(shop);
      if (curName && curName !== shop) parts.push(amount ? `${curName} ×${amount}` : curName);
      else if (amount) parts.push(`×${amount}`);
      return { t: '兌換', d: parts.join(' · ') || '特殊商店', w: npcNames(m) };
    }
    case 'vendor': {
      /* 上游 om 的 `npcs` 對 vendor 型幾乎都是空的或只有英文名（加了 twOnly 之後全被擋掉），
         實測 market-sources 的 4,023 筆 NPC商店**每一筆**都印「未記錄販售者」——
         那句話等於沒說。`data/vendor-prices.json` 有 4,641 種的賣家繁中名＋座標，
         呼叫端把對應的那筆傳進來（`vendor`），這裡就補得回 3,774 筆。 */
      const who = npcNames(m) || (vendor && twOnly(vendor.n)) || null;
      if (!who) return { t: 'NPC商店', d: 'NPC 販售（未記錄販售者）', w: null };
      const where = vendor && vendor.m
        ? `${vendor.m}${vendor.x != null ? ` (${vendor.x}, ${vendor.y})` : ''}`
        : null;
      return {
        t: 'NPC商店',
        d: vendor && vendor.p ? `NPC 販售 ${vendor.p} G` : 'NPC 販售',
        w: where ? `${who}＠${where}` : who,
        ...(vendor && vendor.mi != null ? { map: vendor.mi } : {}),
      };
    }
    case 'instance':
      return { t: '副本', d: `${m.totalInstances || 1} 個副本可產出` };
    case 'quest':
      return { t: '任務獎勵', d: twOnly(m.questName) || '任務獎勵' };
    case 'gathering':
      // 詳細座標另外由 gathering.json 補；這裡只當「確實是採集品」的佐證
      return { t: '採集', d: m.level ? `採集 Lv.${m.level}` : '採集獲得' };
    case 'venture':
      return { t: '雇員探險', d: '派遣雇員可帶回' };
    case 'voyage':
      return { t: '遠航探索', d: `${m.totalVoyages || 1} 條航線可產出` };
    case 'treasure':
      return { t: '寶箱/容器', d: `${m.count || 1} 種寶箱／容器開得到` };
    case 'drop':
      return { t: '怪物掉落', d: '怪物掉落' };
    case 'desynth':
      return { t: '精製獲得', d: `${m.count || 1} 種物品精製得到` };
    case 'reduction':
      return { t: '分解獲得', d: `${m.count || 1} 種靈砂分解得到` };
    case 'gardening':
      return { t: '園藝', d: twOnly(m.seedName) ? `種 ${m.seedName}（${m.duration || '?'} 小時）` : '園藝栽培' };
    case 'islandcrop':
      return { t: '無人島', d: twOnly(m.seedName) ? `無人島農作：${m.seedName}` : '無人島農作' };
    case 'islandpasture':
      return { t: '無人島', d: '無人島牧場產出' };
    case 'fate':
      return { t: '危命任務', d: twOnly(m.fateName) ? `${m.fateName}（Lv.${m.level || '?'}）` : `危命任務 Lv.${m.level || '?'}` };
    case 'achievement':
      return { t: '成就獎勵', d: '成就獎勵' };
    default: {
      const nm = twOnly(m.typeName);
      return nm ? { t: nm, d: nm } : null;   // 連類型名都不是繁中就不顯示
    }
  }
}

/** 一組條目：去重 → 依 ORDER 排序 → 砍到上限 → 去掉空欄位 */
export function normalizeEntries(list, { max = 8 } = {}) {
  const uniq = [];
  const seen = new Set();
  for (const e of list) {
    if (!e) continue;
    const k = `${e.t}|${e.d}|${e.w || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }
  uniq.sort((a, b) => {
    const ia = ORDER.indexOf(a.t), ib = ORDER.indexOf(b.t);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  // 空的 w／map 不寫出去——前端本來就用 falsy 判斷，留著只是佔體積
  return uniq.slice(0, max).map((e) => {
    const o = { t: e.t, d: e.d };
    if (e.w) o.w = e.w;
    if (e.map != null) o.map = e.map;
    return o;
  });
}
