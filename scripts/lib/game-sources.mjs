// 共用模組：把「一個物品怎麼拿到、要付出什麼」解析成統一結構。
// 染劑（build-dyes.mjs）、時尚品鑑週更（build-fashion-report.mjs）、填充裝表都吃這支，
// 免得同一套規則在三個地方各寫一份然後慢慢長歪。
//
// ── 兩條硬規則（都是踩過雷才立的）─────────────────────────────
// ① **只採台服查得到的商店**：out_data 的 datamining 含國際服才有的內容。曾把「草布半指手套
//    最低價 42 金幣」指到 map 1003 的 NPC「Godgyth」——那是台服未開放的區域，寫上去等於騙人。
//    判準：該商店至少要有一個 NPC 在 data/npcs.json（台服 NPC 名表）或 out_data 的 twNpcs 裡
//    查得到繁中名，且地圖在 data/maps.json 內。查不到就整間店跳過，改用次便宜的店。
// ② **價格與販賣者必須同源**：不能拿 A 店的價格配 B 店的 NPC。所以索引是「以商店為單位」蒐集，
//    最後才挑出價格最低的合格商店。
//
// ── 國際服版本落差（2026-07-25 記）────────────────────────────
// 國際服 7.5 把大部分單色染劑整併成通用染劑並下架，Garland Tools／XIVAPI／英文 wiki 現在
// 都查不到那些染劑的取得方式。台服停在 7.15，舊染劑仍在，所以**染劑的取得方式只能用本站
// 7.2 離線資料**，不要再回頭問國際服來源。裝備類則兩邊仍一致。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const D = (f) => join(ROOT, "data", f);
const O = (f) => join(ROOT, "out_data", f);

/* 有隱形門檻的販賣 NPC：金幣標價再低，沒有聲望就是買不到。 */
export const VENDOR_GATES = {
  1005554: { kind: "tribe", label: "蜥蜴人族聲望", note: "需先解蜥蜴人族每日任務累積聲望才會開放販售" },
  1008907: { kind: "tribe", label: "魚人族聲望", note: "需先解魚人族每日任務累積聲望才會開放販售" },
  1009205: { kind: "tribe", label: "鳥人族聲望", note: "需先解鳥人族每日任務累積聲望才會開放販售" },
  1005569: { kind: "tribe", label: "風精靈族聲望", note: "需先解風精靈族每日任務累積聲望才會開放販售" },
  1008909: { kind: "tribe", label: "地靈族聲望", note: "需先解地靈族每日任務累積聲望才會開放販售" },
};

/* 兌換貨幣的門檻。數量不能跨貨幣互比（「4 張慶典證書」跟「750 金碟聲譽」不是同一回事），
   所以排序看的是這張表的門檻種類，不是數字大小。 */
export const CURRENCY_GATES = {
  21075: { kind: "tribe", label: "風精靈族聲望", note: "金葉幣由風精靈族每日任務取得" },
  21076: { kind: "tribe", label: "蜥蜴人族聲望", note: "白鋼刀幣由蜥蜴人族每日任務取得" },
  21077: { kind: "tribe", label: "魚人族聲望", note: "虹貝殼幣由魚人族每日任務取得" },
  21078: { kind: "tribe", label: "地靈族聲望", note: "鈷鐵錘幣由地靈族每日任務取得" },
  28063: { kind: "content", label: "蒼天街重建", note: "振興票需參與蒼天街復興工程" },
  33870: { kind: "event", label: "限時活動", note: "慶典參加證書只在莫古力寶物庫等限時活動期間發放" },
  37549: { kind: "content", label: "無人島開拓", note: "青船幣需先開放無人島" },
  41629: { kind: "content", label: "金碟遊樂場", note: "金碟聲譽需在金碟遊樂場累積" },
};

/* obtainable-methods 的 craft.jobId → 製作職業繁中名。
   對照由「obtainable-methods 有 jobId 且 recipes.json 也有配方」的約 1 萬件物品交叉統計得出
   （8→刻木匠 1304 件、14→煉金術士 1107 件…），每個 jobId 對到的職業名唯一。 */
export const CRAFT_JOB = {
  0: "工會工坊", 8: "刻木匠", 9: "鍛鐵匠", 10: "鑄甲匠", 11: "雕金匠",
  12: "製革匠", 13: "裁衣匠", 14: "煉金術士", 15: "烹調師", "-10": "無人島",
};

/* 取得管道權重：數字越小越好拿。best 的挑選與推薦器排序都吃這個。 */
export const SRC_RANK = {
  "npc-gil": 1, market: 2, "npc-trade": 3, craft: 4, gather: 5,
  treasure: 6, quest: 6, instance: 6, drop: 6, other: 9,
};

/** out_data/equipment.msgpack 的 equipSlotCategory → 本站 slot 代號。
    對照由已知物品實測：草布短手套=5(手)、棉布垮褲=7(腿)、飛龍革禦敵鬃盔=3(頭)、
    真麻精準外套=4(身)、青銅步兵劍=1(主手)。6（腰帶）已從遊戲移除故不存在。 */
export const SLOT_OF_CATEGORY = {
  1: "weapon", 2: "offhand", 3: "head", 4: "body", 5: "hands", 7: "legs", 8: "feet",
  9: "ears", 10: "neck", 11: "wrists", 12: "finger", 13: "weapon",
};

export const SLOT_TC = {
  weapon: "武器", offhand: "副手", head: "頭部", body: "身體", hands: "手部",
  legs: "腿部", feet: "腳部", ears: "耳飾", neck: "項鍊", wrists: "手鐲", finger: "戒指",
};

export function loadIndexes() {
  const items = JSON.parse(readFileSync(D("items.json"), "utf8"));
  const byId = new Map(items.data.map((i) => [i.id, i]));
  const obtain = JSON.parse(readFileSync(D("obtainable-methods.json"), "utf8")).data;
  const maps = new Map(JSON.parse(readFileSync(D("maps.json"), "utf8")).data.map((m) => [m.id, m]));
  const npcJson = new Map(JSON.parse(readFileSync(D("npcs.json"), "utf8")).data.map((n) => [n.id, n]));
  const npcPack = decode(readFileSync(O("npcs.msgpack")));
  const shops = decode(readFileSync(O("shops.msgpack")));
  const equipment = decode(readFileSync(O("equipment.msgpack")));
  const enItems = decode(readFileSync(O("en-items.msgpack")));

  // 英文名（trim + 小寫）→ id[]。Stain 名偶有尾空白，兩邊都 trim 才對得上。
  const enToIds = new Map();
  for (const [id, v] of Object.entries(enItems)) {
    const n = (v?.en || "").trim().toLowerCase();
    if (!n) continue;
    if (!enToIds.has(n)) enToIds.set(n, []);
    enToIds.get(n).push(Number(id));
  }

  /** NPC → 台服可用資訊。查不到繁中名或地圖 ⇒ 回 null（＝台服沒這個 NPC，見硬規則①）。 */
  function npcInfo(id) {
    const a = npcJson.get(id);
    const name = a?.name || npcPack.twNpcs?.[id]?.tw || null;
    if (!name) return null;
    const pos = a?.coords ?? (npcPack.npcs?.[id]?.position
      ? { mapId: npcPack.npcs[id].position.map, x: npcPack.npcs[id].position.x, y: npcPack.npcs[id].position.y }
      : null);
    const map = pos ? maps.get(pos.mapId) : null;
    if (!map) return null;
    return { id, name, title: a?.title || null, mapId: pos.mapId, map: map.name, x: pos.x, y: pos.y };
  }

  /* 金幣商店索引：itemId → [{price, npcs[]}]，**只收台服查得到 NPC 的商店**，價格由低到高。 */
  const gilShop = new Map();
  for (const key of Object.keys(shops.shops)) {
    const s = shops.shops[key];
    if (s.type !== "GilShop") continue;
    const vendors = [...new Set(s.npcs || [])].map(npcInfo).filter(Boolean);
    if (!vendors.length) continue; // 台服查不到販賣者的店整間跳過
    for (const t of s.trades || []) {
      const cur = (t.currencies || [])[0];
      if (!cur || cur.id !== 1) continue;
      for (const it of t.items || []) {
        if (!gilShop.has(it.id)) gilShop.set(it.id, []);
        gilShop.get(it.id).push({ price: cur.amount, npcs: vendors });
      }
    }
  }
  for (const list of gilShop.values()) list.sort((a, b) => a.price - b.price);

  /** id → 英文原名（保留大小寫）。前端要「複製英文名」查國際服攻略時用得到。 */
  const enName = (id) => enItems[id]?.en ?? null;

  return { items, byId, obtain, maps, npcInfo, gilShop, shops, equipment, enToIds, enName };
}

/**
 * 把一個物品的所有取得管道解析成統一結構。
 * @returns {{type,released,gate,...}[]} 依「台服有→無門檻→管道權重→價格」排序
 */
export function resolveSources(id, ix, { includeMarket = true } = {}) {
  const src = [];
  const gil = ix.gilShop.get(id) || [];
  if (gil.length) {
    // 同一件東西可能城市商人也賣、蠻族商人也賣 → 拆成「無門檻」與「有門檻」兩筆才誠實
    const open = gil.find((g) => g.npcs.some((n) => !VENDOR_GATES[n.id]));
    const gated = gil.find((g) => g.npcs.every((n) => VENDOR_GATES[n.id]));
    if (open) {
      src.push({ type: "npc-gil", released: true, price: open.price, npcs: open.npcs.filter((n) => !VENDOR_GATES[n.id]).slice(0, 4), gate: null });
    }
    if (gated && (!open || gated.price < open.price)) {
      src.push({ type: "npc-gil", released: true, price: gated.price, npcs: gated.npcs.slice(0, 4), gate: VENDOR_GATES[gated.npcs[0].id] });
    }
  }

  for (const m of ix.obtain[String(id)] || []) {
    if (m.type === "specialshop") {
      const vendors = [...new Set((m.npcs || []).map((n) => n.id))].map(ix.npcInfo).filter(Boolean);
      const curId = m.currency?.itemId ?? null;
      const curName = m.currency ? m.currency.name || ix.byId.get(curId)?.name || null : null;
      src.push({
        type: "npc-trade",
        released: !m.currency || !!curName, // 貨幣沒有台服名＝該兌換台服未實裝
        currency: m.currency ? { id: curId, name: curName, amount: m.currency.amount } : null,
        shopNameEn: m.shopName || null,
        npcs: vendors.slice(0, 3),
        gate: (curId != null ? CURRENCY_GATES[curId] : null) ?? vendors.map((v) => VENDOR_GATES[v.id]).find(Boolean) ?? null,
      });
    } else if (m.type === "craft") {
      const job = CRAFT_JOB[m.jobId] ?? null;
      src.push({
        type: "craft", released: true, job, level: m.level ?? null, recipeId: m.recipeId ?? null,
        gate: { kind: "craft", label: job ? `${job}製作` : "製作", note: "需該製作職業本人；不可交易的東西請人代做還要面交" },
      });
    } else if (m.type === "instance") {
      src.push({ type: "instance", released: true, detail: "副本掉落", gate: { kind: "rng", label: "副本掉落", note: "沒有固定成本，看運氣" } });
    } else if (m.type === "treasure") {
      src.push({ type: "treasure", released: true, detail: `寶箱／容器（${m.count ?? "?"} 種）`, gate: { kind: "rng", label: "隨機掉落", note: "沒有固定成本，抽到才有" } });
    } else if (m.type === "quest") {
      src.push({ type: "quest", released: true, detail: m.questName || "任務獎勵", gate: { kind: "once", label: "任務一次性", note: "只給一次，用完就沒了" } });
    } else if (m.type === "gathering") {
      src.push({ type: "gather", released: true, detail: "採集", gate: null });
    }
  }

  if (includeMarket && ix.byId.get(id)?.marketable) {
    src.push({ type: "market", released: true, detail: "市場板可購（價格浮動）", gate: null });
  }
  return sortSources(src);
}

export function sortSources(src) {
  return src.slice().sort((a, b) =>
    (a.released === false) - (b.released === false) ||
    (a.gate ? 1 : 0) - (b.gate ? 1 : 0) ||
    (SRC_RANK[a.type] ?? 9) - (SRC_RANK[b.type] ?? 9) ||
    (a.price ?? 0) - (b.price ?? 0));
}

/** 這件東西實際上好不好拿：open（無門檻固定成本）｜gated｜rng｜unreleased｜none */
export function accessOf(best) {
  if (!best) return "none";
  if (best.released === false) return "unreleased";
  if (!best.gate) return "open";
  return best.gate.kind === "rng" || best.gate.kind === "once" ? "rng" : "gated";
}

/** 給人看的一句話取得方式（前端直接顯示這個字串）。 */
export function describeSource(s) {
  if (!s) return "—";
  switch (s.type) {
    case "npc-gil": return `NPC ${s.price.toLocaleString("en-US")} 金幣`;
    case "npc-trade": return s.currency ? `${s.currency.name ?? "貨幣"} ×${s.currency.amount}` : "NPC 兌換";
    case "craft": return s.job ? `${s.job}製作` : "製作";
    case "market": return "市場板";
    case "instance": return "副本掉落";
    case "treasure": return "寶箱";
    case "quest": return "任務獎勵";
    case "gather": return "採集";
    default: return "—";
  }
}
