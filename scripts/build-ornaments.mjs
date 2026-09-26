// build-ornaments.mjs — 產生 data/ornaments.json（時尚配飾收藏庫）
//
// 站內原本沒有這一類收藏。時尚配飾（陽傘、背包、火炬…）在遊戲裡是獨立的收藏櫃，
// 和坐騎／寵物一樣是「用道具解鎖、永久持有」。
//
// ── 怎麼找到它的 ──────────────────────────────────────────────────
// `Ornament` sheet 有 59 列，**但沒有 Name 欄**（只有 Icon 與 Transient），
// 所以名字一定要從解鎖道具來。關聯走的是坐騎那套已驗證的路子：
// XIVAPI search API 查 `Item.ItemAction.Action=<N>`，`ItemAction.Data[0]` ＝ 收藏 id。
//
// 坐騎笛是 Action 1322。配飾的 Action 是 **20086**，找法是把整張 ItemAction（3,051 列）
// 依 Action 分組，挑「筆數落在 40–120 且 Data[0] 幾乎全在 1..59」的——
// 20086 是 56 筆且 Data[0] 全在範圍內，逐件對過名字（陽傘／油紙傘／背包／火炬）確認無誤。
// **不要用猜的試 Action id**：另外幾個候選（845、2136、1013）筆數也接近，但 Data[0]
// 的分佈對不上。
//
// ── 台服名 ────────────────────────────────────────────────────────
// 56 件解鎖道具裡 **43 件有台服繁中名**，其餘 13 件台服未開放（Pixie Parasol、
// Mizutsune Parasol…）→ 照鐵則整筆不收，不用英文補。
//
// 執行（repo 根目錄）：
//   node scripts/build-ornaments.mjs            # dry-run，印報告
//   node scripts/build-ornaments.mjs --apply    # 寫入
//   node scripts/build-ornaments.mjs --offline  # 只用 out_data/cache 的快照

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTw } from "./lib/tw-text.mjs";
import { convertOm, normalizeEntries, SKIP_CATALOG } from "./lib/obtainable.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache", "ornament-items.json");

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const SEARCH = "https://v2.xivapi.com/api/search";
const ORNAMENT_ACTION = 20086;   // 見檔頭：怎麼確定是這個

async function fetchUnlockItems() {
  if (offline) {
    if (!existsSync(CACHE)) throw new Error(`--offline 但找不到快取 ${CACHE}`);
    return JSON.parse(await readFile(CACHE, "utf8"));
  }
  const url = `${SEARCH}?sheets=Item&query=${encodeURIComponent(`ItemAction.Action=${ORNAMENT_ACTION}`)}` +
    `&fields=Name,ItemAction.Data&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  const j = await res.json();
  const rows = (j.results || []).map((r) => ({
    itemId: r.row_id,
    nameEn: r.fields?.Name ?? null,
    ornamentId: r.fields?.ItemAction?.fields?.Data?.[0] ?? null,
  }));
  await writeFile(CACHE, JSON.stringify(rows, null, 1));
  return rows;
}

async function main() {
  const raw = await fetchUnlockItems();
  console.log(`解鎖道具 ${raw.length} 件（ItemAction.Action=${ORNAMENT_ACTION}）`);

  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const byId = new Map(items.map((i) => [i.id, i]));
  const om = JSON.parse(await readFile(join(DATA, "obtainable-methods.json"), "utf8")).data;
  /* 上游的 om 對 vendor 型幾乎只有英文 NPC 名（被 twOnly 擋掉），不補的話畫面上會是
     「NPC商店：NPC 販售（未記錄販售者）」——那句話等於沒說。`vendor-prices.json`
     有 4,641 種的賣家繁中名＋座標（知識庫 §4.64）。 */
  const vendors = JSON.parse(await readFile(join(DATA, "vendor-prices.json"), "utf8")).data;

  const out = [];
  const stat = { noTw: [], noItem: [], noSrc: 0, withSrc: 0 };

  for (const r of raw) {
    if (!r.ornamentId) continue;
    const it = byId.get(r.itemId);
    /* 不在主庫＝台服未開放。`items.json` 本身就只收台服有的東西，所以這一關擋掉的
       跟下一關（台服名查無）是同一件事，只是先在這裡落掉——報告要講清楚，
       不然看起來像「主庫漏收」而去追一個不存在的 bug。 */
    if (!it) { stat.noItem.push(r.nameEn); continue; }
    // 台服未開放＝整筆不收（鐵則）。`isTw()` 同時擋掉未翻譯的日文原文與內部佔位列。
    if (!isTw(it.name)) { stat.noTw.push(it.name || r.nameEn); continue; }

    const methods = om[r.itemId] || [];
    const sources = normalizeEntries(
      methods.map((m) => convertOm(m, { skip: SKIP_CATALOG, vendor: vendors[r.itemId] || null })).filter(Boolean)
    ).map((e) => {
      const row = { type: e.t, detail: e.d || null };
      /* NPC 商店的賣家輸出成 issuer/at 的結構，讓共用的 `CollectionTracker.sourceWhere()`
         連座標鈕一起排版（動詞給「販售」）。`convertOm` 的 `e.w` 是給沒有結構化座標的
         情況用的純字串，兩者不重複出。 */
      const v = e.t === 'NPC商店' ? vendors[r.itemId] : null;
      if (v && v.n && v.mi != null) {
        row.issuer = { name: v.n, verb: '販售' };
        row.at = { mapId: v.mi, mapName: v.m, x: v.x, y: v.y };
      } else if (e.w) {
        row.where = e.w;
      }
      return row;
    });
    if (sources.length) stat.withSrc++; else stat.noSrc++;

    out.push({
      id: r.ornamentId,
      name: it.name,
      nameEn: r.nameEn || it.nameEn || null,
      itemId: r.itemId,
      // `items.json` 只有 icon 路徑（/i/058000/058001.png），沒有完整網址——
      // 前端自己補 CDN 前綴，同市場頁的 iconUrl() 慣例
      icon: it.icon || null,
      patch: it.patch || null,
      sources,
    });
  }

  out.sort((a, b) => a.id - b.id);

  console.log(`\n收錄 ${out.length} 件時尚配飾`);
  console.log(`  有取得方式 ${stat.withSrc} 件／待補充 ${stat.noSrc} 件`);
  const skipped = [...stat.noItem, ...stat.noTw];
  console.log(`  台服未開放而跳過 ${skipped.length} 件（不在 items.json ${stat.noItem.length}、有道具但無台服名 ${stat.noTw.length}）：`);
  console.log(`    ${skipped.slice(0, 8).join("、")}${skipped.length > 8 ? "…" : ""}`);
  const byPatch = {};
  for (const o of out) byPatch[o.patch || "?"] = (byPatch[o.patch || "?"] || 0) + 1;
  console.log(`  版本分佈：${Object.entries(byPatch).sort().map(([p, n]) => `${p}×${n}`).join("、")}`);
  console.log(`\n前 5 件：\n  ${out.slice(0, 5).map((o) => `#${o.id} ${o.name}（${(o.sources[0] || {}).type || "待補充"}）`).join("\n  ")}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "ornaments",
    updated: new Date().toISOString().slice(0, 10),
    source: `XIVAPI v2 search（Item.ItemAction.Action=${ORNAMENT_ACTION}）＋ data/items.json ＋ data/obtainable-methods.json`,
    count: out.length,
    data: out,
  };
  await writeFile(join(DATA, "ornaments.json"), JSON.stringify(db));
  console.log(`\n✓ data/ornaments.json（${out.length} 件，直寫 minified）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
