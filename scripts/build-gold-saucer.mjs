// build-gold-saucer.mjs — 產生 data/gold-saucer.json（金碟獎品價目表＋收藏缺口）
//
// 回答的問題：「我這些 MGP 能換什麼、最划算的在哪換、我還缺的那幾件總共要多少？」
// 站內目前查得到「某件坐騎是金碟換的」，但查不到價錢，更算不出「我還差多少 MGP」。
//
// ── 刻意不做變現排行 ─────────────────────────────────────────────────
// 金碟幣不像軍票／詩學——455 種兌換品裡幾乎都不能上市場板（提案階段實測只有 7 件可交易），
// 排「每 MGP 值多少 gil」等於在排 7 件東西，沒有意義。
// 這頁的軸是**收藏缺口**：哪些是你還沒有的、湊齊要多少 MGP。
//
// ── 資料來源 ────────────────────────────────────────────────────────
//   商店     scripts/lib/shops.mjs（共用層；台服店名走 tw-locales）
//   物品     data/items.json（繁中名、icon、分類、patch）
//   收藏對應 scripts/lib/collection-owners.mjs（各收藏庫的 itemId ＋幻卡的可證對照；
//            與貨幣變現排行共用，storageKey／keyOf 只有那一份）
//
// ── 兩種貨幣 ────────────────────────────────────────────────────────
//   金碟幣（MGP, id 29）    主要貨幣，455 種兌換品
//   金碟聲譽（id 41629）    仙人微彩的高額獎勵兌換，23 種
// 兩種都收，前端分頁切換。**單價取同一件商品的最低價**——同一件常常在好幾間店都有。
//
// 執行（repo 根目錄）：
//   node scripts/build-gold-saucer.mjs            # dry-run，印報告
//   node scripts/build-gold-saucer.mjs --apply    # 寫入
//   node scripts/build-gold-saucer.mjs --offline  # 商店表只用快取

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadShops, describeShops } from "./lib/shops.mjs";
import { loadCollectionOwners, ownField } from "./lib/collection-owners.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const CURRENCIES = [
  { id: 29, key: "mgp" },
  { id: 41629, key: "reputation" },
];

async function main() {
  const S = await loadShops({ root: ROOT, offline });
  console.log(describeShops(S));

  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const byId = new Map(items.map((i) => [i.id, i]));

  // 收藏對應：itemId → { collection, label, path, storageKey, key, name }（共用層，§ collection-owners.mjs 檔頭）
  const owner = await loadCollectionOwners({ root: ROOT, offline });

  const out = [];
  const stat = { noTw: 0, byCurrency: {} };

  for (const cur of CURRENCIES) {
    const curItem = byId.get(cur.id);
    if (!curItem) { console.log(`  ⚠ 貨幣 ${cur.id} 不在 items.json，跳過`); continue; }

    // 同一件商品常常好幾間店都有——取最低單價那一筆
    const best = new Map();
    for (const row of S.byCurrency.get(cur.id) || []) {
      const cost = row.trade.cost.find((c) => c.itemId === cur.id);
      if (!cost || row.trade.cost.length !== 1) continue;      // 複合成本不收（算不出單價）
      for (const g of row.trade.gives) {
        const unit = Math.round(cost.amount / (g.amount || 1));
        const prev = best.get(g.itemId);
        if (!prev || unit < prev.unit) {
          best.set(g.itemId, {
            unit,
            shopName: row.shop.name,
            npc: row.shop.npcs[0] || null,
          });
        }
      }
    }

    const list = [];
    for (const [itemId, b] of best) {
      const it = byId.get(itemId);
      // 鐵則：查不到台服名＝台服未開放，不收（也不拿英文頂替）
      if (!it || !it.name || !isTw(it.name)) { stat.noTw++; continue; }
      const own = owner.get(itemId);
      list.push({
        itemId,
        name: it.name,
        icon: it.icon || null,
        category: it.category || null,
        patch: it.patch ?? null,
        cost: b.unit,
        shop: b.shopName || null,
        npc: b.npc ? { id: b.npc.id, name: b.npc.name, at: b.npc.at } : null,
        ...(own ? { own: ownField(own) } : {}),
      });
    }
    list.sort((a, b) => a.cost - b.cost || a.itemId - b.itemId);
    stat.byCurrency[curItem.name] = { total: list.length, collectible: list.filter((x) => x.own).length };
    out.push({ key: cur.key, id: cur.id, name: curItem.name, icon: curItem.icon || null, count: list.length, items: list });
  }

  // ── 報告 ──
  console.log(`\n金碟獎品：`);
  for (const [n, s] of Object.entries(stat.byCurrency)) {
    console.log(`  ${n.padEnd(6)} ${String(s.total).padStart(3)} 種（其中 ${s.collectible} 件對得到收藏頁）`);
  }
  console.log(`  無台服名而不收：${stat.noTw} 件`);

  const byCol = {};
  for (const c of out) for (const x of c.items) if (x.own) {
    byCol[x.own.label] = byCol[x.own.label] || { n: 0, sum: 0 };
    byCol[x.own.label].n++; byCol[x.own.label].sum += x.cost;
  }
  console.log(`\n可用金碟貨幣取得的收藏品：`);
  for (const [k, v] of Object.entries(byCol).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${k.padEnd(4)} ${String(v.n).padStart(3)} 件，全收共 ${v.sum.toLocaleString()}`);
  }
  const mgp = out.find((c) => c.key === "mgp");
  if (mgp) {
    console.log(`\n最貴的五件：` + mgp.items.slice(-5).reverse().map((x) => `${x.name} ${x.cost.toLocaleString()}`).join("、"));
    console.log(`最便宜的五件：` + mgp.items.slice(0, 5).map((x) => `${x.name} ${x.cost.toLocaleString()}`).join("、"));
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const envelope = {
    schema: "gold-saucer",
    updated: new Date().toISOString().slice(0, 10),
    source: "Teamcraft shops.json（經 scripts/lib/shops.mjs）＋ data/items.json ＋ 收藏對應（scripts/lib/collection-owners.mjs：各收藏庫的 itemId；幻卡走 Item.AdditionalData 可證對照）",
    note: "刻意不做變現排行——455 種兌換品幾乎不能上市場板，排每 MGP 值多少 gil 沒有意義。這份的軸是收藏缺口。",
    count: out.length,
    data: out,
  };
  await writeFile(join(DATA, "gold-saucer.json"), JSON.stringify(envelope));
  console.log(`\n✓ data/gold-saucer.json（${out.length} 種貨幣、${out.reduce((a, c) => a + c.items.length, 0)} 件獎品）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
