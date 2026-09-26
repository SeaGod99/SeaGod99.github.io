// build-seasonal-shop.mjs — 產生 data/seasonal-shop.json（季節活動商店查詢的資料層）
//
// 回答兩個問題：
//   ① 「我錯過那個活動了，那套衣服還買得到嗎？」
//      → 報酬管理人（Calamity Salvager）的 9 間「再次購買季節活動報酬」商店，
//        307 件過往活動裝備仍可用**金幣**買回（多半 39–59 gil，便宜到不像話）。
//   ② 「我手上這張活動票券能換什麼？」
//      → 47 種季節活動貨幣的兌換品反查。
//
// 資料來源：
//   out_data/cache/tc-shops.json（Teamcraft shops.json，由 build-currency-shop.mjs 快取）
//   out_data/tw-locales.msgpack 的 tw-shops（台服官方店名，活動名就從店名括號裡取）
//   data/items.json（物品台服名／分類／圖示；無台服名者不收）
//
// 活動名不是我翻的：店名「再次購買季節活動報酬（紅蓮祭1）」本身就是台服官方字串，
// 括號內就是活動名，數字尾碼（紅蓮祭1／紅蓮祭2）合併成同一個活動。
//
// 執行（repo 根目錄）：
//   node scripts/build-seasonal-shop.mjs            # dry-run
//   node scripts/build-seasonal-shop.mjs --apply    # 寫入

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { loadShops, describeShops } from "./lib/shops.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const SHOPS_CACHE = join(ROOT, "out_data", "cache", "tc-shops.json");
const TC_SHOPS = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/shops.json";
const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");   // 商店表只用快取，不連網

// 報酬管理人的季節活動商店（9 間，連號）。店名由 tw-shops 取，不寫死。
const SALVAGER_SHOPS = [262626, 262627, 262628, 262629, 262630, 262631, 262632, 262633, 262634];

async function main() {
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const byId = new Map(items.map((i) => [i.id, i]));
  const tw = await loadTwLocales();

  // 商店表走共用層（scripts/lib/shops.mjs）。這裡只需要原始結構，故用 S.raw，
  // 但快取／抓取／容錯的規則與其他吃商店的腳本共用同一份。
  const S = await loadShops({ root: ROOT, offline });
  console.log(describeShops(S));
  const shopById = new Map(S.raw.map((s) => [s.id, s]));

  const usable = (id) => {
    const it = byId.get(id);
    return it && it.name && isTw(it.name) ? it : null;
  };

  /* ── ① 報酬管理人：過往活動裝備可用金幣買回 ── */
  const events = new Map();   // 活動名 → { name, items:[] }
  const stats = { trades: 0, kept: 0, noTw: [] };
  for (const shopId of SALVAGER_SHOPS) {
    const shop = shopById.get(shopId);
    if (!shop) { console.log(`  ⚠ 找不到商店 ${shopId}`); continue; }
    const shopName = twName(tw.shops, shopId);
    if (!shopName) { console.log(`  ⚠ 商店 ${shopId} 無台服店名，跳過`); continue; }
    // 「再次購買季節活動報酬（紅蓮祭1）」→ 取括號內，去掉尾碼數字
    const m = shopName.match(/（(.+?)）/);
    const evName = (m ? m[1] : shopName).replace(/\d+$/, "");

    if (!events.has(evName)) events.set(evName, { name: evName, shops: [], items: [] });
    const ev = events.get(evName);
    ev.shops.push({ id: shopId, name: shopName });

    for (const t of shop.trades || []) {
      const got = (t.items || [])[0];
      const cost = (t.currencies || [])[0];
      if (!got || !cost) continue;
      stats.trades++;
      const it = usable(got.id);
      if (!it) { stats.noTw.push(got.id); continue; }
      ev.items.push({
        id: it.id, name: it.name, category: it.category, icon: it.icon,
        gil: cost.id === 1 ? cost.amount : null,   // 這幾間都是金幣商店；非金幣就留 null 不猜
        patch: it.patch || null,
      });
      stats.kept++;
    }
  }
  // 同一件可能在兩間店重複（紅蓮祭 1／2），依 id 去重
  for (const ev of events.values()) {
    const seen = new Set();
    ev.items = ev.items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .sort((a, b) => a.id - b.id);   // 固定排序鍵，不用會變的值（§3.19）
  }

  /* ── ② 活動貨幣反查 ── */
  const curMap = new Map();   // 貨幣 itemId → Map(兌換品 id → 數量/成本)
  for (const s of S.raw) {
    for (const t of s.trades || []) {
      const cs = (t.currencies || []).filter((c) => c && c.id && c.amount);
      if (cs.length !== 1) continue;          // 複合成本換算不成單一幣值，跳過
      const cur = byId.get(cs[0].id);
      if (!cur || cur.category !== "雜貨（季節活動）") continue;
      const got = (t.items || [])[0];
      if (!got) continue;
      const it = usable(got.id);
      if (!it) continue;
      if (!curMap.has(cs[0].id)) curMap.set(cs[0].id, new Map());
      const m = curMap.get(cs[0].id);
      const prev = m.get(it.id);
      const cand = { cost: cs[0].amount, count: got.amount || 1 };
      if (!prev || cand.count / cand.cost > prev.count / prev.cost) m.set(it.id, cand);
    }
  }
  const currencies = [];
  for (const [curId, m] of curMap) {
    const cur = usable(curId);
    if (!cur) continue;
    currencies.push({
      id: curId, name: cur.name, icon: cur.icon, patch: cur.patch || null,
      items: [...m].map(([id, v]) => {
        const it = byId.get(id);
        return { id, name: it.name, category: it.category, icon: it.icon, cost: v.cost, count: v.count, patch: it.patch || null };
      }).sort((a, b) => a.cost / a.count - b.cost / b.count || a.id - b.id),
    });
  }
  currencies.sort((a, b) => b.items.length - a.items.length || a.id - b.id);

  const evList = [...events.values()].sort((a, b) => b.items.length - a.items.length);
  console.log(`\n① 報酬管理人（金幣買回過往活動裝備）：${evList.length} 個活動、${stats.kept}/${stats.trades} 件`);
  for (const e of evList) console.log(`  ${e.name.padEnd(8)} ${String(e.items.length).padStart(3)} 件（${e.shops.length} 間店）`);
  if (stats.noTw.length) console.log(`  無台服名而略過：${stats.noTw.length} 件（${[...new Set(stats.noTw)].slice(0, 6).join(", ")}）`);

  console.log(`\n② 活動貨幣反查：${currencies.length} 種貨幣、${currencies.reduce((n, c) => n + c.items.length, 0)} 筆兌換品`);
  for (const c of currencies.slice(0, 8)) console.log(`  ${c.name.padEnd(18)} ${c.items.length} 件`);
  if (currencies.length > 8) console.log(`  …還有 ${currencies.length - 8} 種`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  await writeFile(join(DATA, "seasonal-shop.json"), JSON.stringify({
    schema: "seasonal-shop",
    updated: new Date().toISOString().slice(0, 10),
    source: "Teamcraft shops.json（報酬管理人 shopId 262626–262634）+ tw-shops 台服店名 + data/items.json",
    note: "活動名取自台服官方店名括號內的字串，非自行翻譯；無台服物品名者不收",
    count: evList.length,
    data: { events: evList, currencies },
  }));
  console.log(`\n✓ data/seasonal-shop.json（${evList.length} 個活動、${currencies.length} 種貨幣）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
