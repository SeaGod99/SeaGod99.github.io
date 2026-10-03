// 全資料庫連結驗證（固化 2026-06-10 的全量檢查；對應 docs/地圖ID統一修正計畫.md 第 1 步）
//
// 用途：每次 build 完跑一次，輸出各庫外鍵的斷鏈計數。
//   node scripts/validate-links.mjs
//
// 驗證項目：
//   mapId 類  ：npcs / monsters.positions / gathering / fishing-spots → maps.id
//   itemId 類 ：recipes 成品+材料、gathering items/hiddenItems、fishes itemId/bait、
//               obtainable-methods key 與 currency → items.id
//   npcId 類  ：triple-triad.sources、obtainable-methods.npcs → npcs.id
//   其他      ：fishes.spotId → fishing-spots、fishing-spots.fishes → fishes.itemId
//
// 備註：台服未開放（tw-items 對不到）造成的斷鏈屬預期內，前端過濾即可；
//       gathering 的 EventItem 偽 id（≥2000000）已於 build 時過濾，此處仍計數以防回歸。

import { readFile } from "node:fs/promises";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");

async function loadDB(name) {
  const j = JSON.parse(await readFile(join(DATA, `${name}.json`), "utf8"));
  return j.data;
}

const rows = [];
function report(link, broken, total, note = "") {
  rows.push({ link, broken, total, note });
}

const maps = await loadDB("maps");
const items = await loadDB("items");
const npcs = await loadDB("npcs");
const monsters = await loadDB("monsters");
const gathering = await loadDB("gathering");
const fishingSpots = await loadDB("fishing-spots");
const fishes = await loadDB("fishes");
const recipes = await loadDB("recipes");
const tripleTriad = await loadDB("triple-triad");
const explorationLog = await loadDB("exploration-log");
const omData = await loadDB("obtainable-methods"); // data 是 { itemId: [methods] } 物件

const mapIds = new Set(maps.map((m) => m.id));
const itemIds = new Set(items.map((i) => i.id));
const npcIds = new Set(npcs.map((n) => n.id));
const spotIds = new Set(fishingSpots.map((s) => s.id));
const fishItemIds = new Set(fishes.map((f) => f.itemId));

// ---------- mapId 類 ----------
{
  let broken = 0;
  for (const n of npcs) if (n.coords?.mapId && !mapIds.has(n.coords.mapId)) broken++;
  report("npcs.coords.mapId → maps", broken, npcs.length);
}
{
  let broken = 0, total = 0;
  for (const m of monsters)
    for (const p of m.positions || []) {
      total++;
      if (p.mapId && !mapIds.has(p.mapId)) broken++;
    }
  report("monsters.positions[].mapId → maps", broken, total);
}
{
  let broken = 0, zero = 0;
  for (const g of gathering) {
    const id = g.coords?.mapId;
    if (id === 0) { zero++; continue; }
    if (id && !mapIds.has(id)) broken++;
  }
  report("gathering.coords.mapId → maps", broken, gathering.length, `另 mapId=0 共 ${zero} 筆（無地圖資訊，不計斷鏈）`);
}
{
  let broken = 0, missing = 0;
  for (const s of fishingSpots) {
    const id = s.coords?.mapId;
    if (id == null) { missing++; continue; }
    if (!mapIds.has(id)) broken++;
  }
  report("fishing-spots.coords.mapId → maps", broken, fishingSpots.length, missing ? `另 ${missing} 筆完全沒有 mapId 欄位` : "");
}
{
  // 探索筆記座標（2026-09-23 由 patch-exploration-coords.mjs 補；
  // coords=null 的是 maps.json 沒收的室內子地圖，不計斷鏈）
  let broken = 0, missing = 0;
  for (const e of explorationLog) {
    if (!e.coords) { missing++; continue; }
    if (!mapIds.has(e.coords.mapId)) broken++;
  }
  report("exploration-log.coords.mapId → maps", broken, explorationLog.length, missing ? `另 ${missing} 筆無座標（室內子地圖，maps.json 無底圖）` : "");
}
{
  // 收藏頁任務來源的接取點（patch-collection-quest-npc.mjs 補的）
  let broken = 0, total = 0;
  for (const f of ["mounts", "minions", "orchestrion", "barding", "emotes"]) {
    for (const e of await loadDB(f)) for (const s of e.sources || []) {
      if (!s.at) continue;
      total++;
      if (!mapIds.has(s.at.mapId)) broken++;
    }
  }
  report("收藏頁 sources[].at.mapId → maps", broken, total);
}
{
  // 收藏頁商店來源 → NPC 商店目錄（patch-collection-shop-links.mjs，2026-10-03）：
  // 每一處都要是「那張圖的那位 NPC 真的有一筆交易給出這件物品」，否則點過去找不到
  const { loadShopIndex } = await import("./patch-collection-shop-links.mjs");
  const idx = loadShopIndex();
  let broken = 0, total = 0;
  for (const f of ["mounts", "minions", "orchestrion", "barding", "emotes", "ornaments"]) {
    for (const e of await loadDB(f)) for (const s of e.sources || []) for (const [mapId, npc] of s.shop || []) {
      total++;
      if (!(idx.get(+e.itemId) || []).some((x) => x.mapId === mapId && x.npc === npc)) broken++;
    }
  }
  report("收藏頁 sources[].shop → npc-shops 真的賣這件", broken, total);
}
{
  // 系統解鎖與職業行會的任務接取點（mapId=null 是副本／室內的實例地圖，只有地名沒有座標）
  const su = JSON.parse(await readFile(join(DATA, "system-unlocks.json"), "utf8"));
  let broken = 0, total = 0, inst = 0;
  const check = (q) => {
    if (!q || !q.at) return;
    if (q.at.mapId == null) { inst++; return; }
    total++;
    if (!mapIds.has(q.at.mapId)) broken++;
  };
  for (const s of su.data) for (const q of s.quests) check(q);
  for (const j of su.jobs) check(j.quest);
  report("system-unlocks 任務 at.mapId → maps", broken, total, inst ? `另 ${inst} 筆是實例地圖（只有地名）` : "");
}
{
  // NPC 金幣直購價的賣家位置（build-vendor-prices.mjs 產）。
  // 這條斷了的話「去哪買」會指向不存在的地圖，而畫面上只會少一個地名。
  const vp = JSON.parse(await readFile(join(DATA, "vendor-prices.json"), "utf8")).data;
  let broken = 0, total = 0;
  for (const x of Object.values(vp)) {
    if (x.mi == null) continue;
    total++;
    if (!mapIds.has(x.mi)) broken++;
  }
  report("vendor-prices 賣家 mapId → maps", broken, total);
}

// ---------- itemId 類 ----------
{
  let broken = 0;
  for (const r of recipes) if (!itemIds.has(r.itemId)) broken++;
  report("recipes.itemId → items", broken, recipes.length, "台服未開放成品屬預期內");
}
{
  let broken = 0, total = 0;
  for (const r of recipes)
    for (const ing of r.ingredients || []) {
      total++;
      if (!itemIds.has(ing.itemId)) broken++;
    }
  report("recipes.ingredients[].itemId → items", broken, total, "台服未開放素材屬預期內");
}
{
  let broken = 0, eventItem = 0, total = 0;
  const seen = new Set();
  for (const g of gathering)
    for (const id of [...(g.items || []), ...(g.hiddenItems || [])]) {
      total++;
      if (!itemIds.has(id)) {
        broken++;
        if (id >= 2000000 && !seen.has(id)) { seen.add(id); eventItem++; }
      }
    }
  report("gathering items/hiddenItems → items", broken, total, eventItem ? `含 ${eventItem} 個 EventItem 偽 id（≥2000000，應為 0）` : "");
}
{
  let broken = 0;
  for (const f of fishes) if (!itemIds.has(f.itemId)) broken++;
  report("fishes.itemId → items", broken, fishes.length, "台服未開放魚屬預期內");
}
{
  let broken = 0, total = 0;
  for (const f of fishes)
    for (const b of f.bait || []) {
      total++;
      if (!itemIds.has(b.itemId)) broken++;
    }
  report("fishes.bait[].itemId → items", broken, total, "台服未開放餌屬預期內");
}
{
  let broken = 0, nullSpot = 0;
  for (const f of fishes) {
    if (f.spotId == null) { nullSpot++; continue; }
    if (!spotIds.has(f.spotId)) broken++;
  }
  report("fishes.spotId → fishing-spots", broken, fishes.length, `spots 只收有繁中資料者；另 spotId=null ${nullSpot} 筆`);
}

// ---------- obtainable-methods ----------
{
  const keys = Object.keys(omData);
  let keyBroken = 0, curBroken = 0, curTotal = 0, npcBroken = 0, npcTotal = 0;
  for (const k of keys) {
    if (!itemIds.has(Number(k))) keyBroken++;
    for (const m of omData[k]) {
      if (m.currency?.itemId != null) {
        curTotal++;
        if (!itemIds.has(m.currency.itemId)) curBroken++;
      }
      for (const n of m.npcs || []) {
        npcTotal++;
        if (!npcIds.has(n.id)) npcBroken++;
      }
    }
  }
  report("obtainable-methods key → items", keyBroken, keys.length);
  report("obtainable-methods currency.itemId → items", curBroken, curTotal, "台服未開放貨幣屬預期內");
  report("obtainable-methods npcs[].id → npcs", npcBroken, npcTotal, "npcs 只收有繁中名+座標者");
}

// ---------- 其他 ----------
{
  let broken = 0, total = 0;
  for (const t of tripleTriad)
    for (const s of t.sources || []) {
      if (s.npcId == null) continue;
      total++;
      if (!npcIds.has(s.npcId)) broken++;
    }
  report("triple-triad.sources[].npcId → npcs", broken, total, "npcs 只收有繁中名+座標者");
}
{
  let broken = 0, total = 0;
  for (const s of fishingSpots)
    for (const fid of s.fishes || []) {
      total++;
      if (!fishItemIds.has(fid)) broken++;
    }
  report("fishing-spots.fishes[] → fishes.itemId", broken, total);
}

/* ---------- GitHub Pages 發佈檢查：底線開頭的檔要有 .nojekyll ----------
   **這個問題本機完全測不出來。** `file://` 與任何本機伺服器都正常供應
   `data/_meta.json`、`data/npc-shops/_index.json` 這種檔，但 GitHub Pages 預設跑 Jekyll，
   而 **Jekyll 會把底線開頭的檔案與目錄整個排除在發佈之外** ——線上一律 404，
   而且回的是 HTML 404 頁，所以前端的徵狀是
   `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`。

   2026-09-27 實測：`data/_meta.json`、五個分片層的 `_index.json` 全部線上 404。
   NPC 商店目錄整頁掛掉；`_meta.json` 只是剛好被 `patch-gate.js` 的後備值
   `"7.21"` 蓋過去（那個值正好等於當時的台服版本，所以沒人發現）。

   解法是 repo 根目錄放一個空的 `.nojekyll`。**這條斷言就是在防它被誤刪**——
   刪掉之後本機所有測試都還是綠的，只有線上會壞。 */
{
  const underscore = [];
  const scan = (rel = "") => {
    for (const n of readdirSync(join(DATA, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${n.name}` : n.name;
      if (n.isDirectory()) scan(r);
      else if (n.name.startsWith("_")) underscore.push(`data/${r}`);
    }
  };
  scan();
  const hasNojekyll = existsSync(join(__dirname, "..", ".nojekyll"));
  rows.push({
    link: "底線開頭的資料檔 → 需要 .nojekyll",
    broken: underscore.length && !hasNojekyll ? underscore.length : 0,
    total: underscore.length,
    note: hasNojekyll
      ? "已有 .nojekyll，Jekyll 不會排除它們"
      : "⚠ 沒有 .nojekyll —— 這些檔在 GitHub Pages 上一律 404（本機測不出來）",
  });
}

/* ---------- 有頁尾的頁面要載 common.css ----------
   `.page-footer`／`.footer-text`／`.container` 都定義在 `assets/css/common.css`。
   新頁若只載 tokens／theme／tool-header，頁尾會**完全沒有樣式**——
   文字擠在頁面最底下、沒有分隔線也沒有置中。

   ⚠ **`validate-pages.mjs` 抓不到這個**：沒樣式的文字不會造成水平溢出、
   不會有 console error、點擊目標也沒變小，所以 46 頁 × 3 寬度全綠而畫面是壞的。
   2026-09-27 實測有 9 頁是這樣（全是那一輪新增的工具頁）。

   `<link>` 要排在該頁自己的 `<style>` **之前**——common.css 有 `*`／`body`／`html`
   這些全域規則，順序顛倒會把頁面自己的版面壓掉。 */
{
  const pages = [];
  const scanHtml = (rel = "") => {
    for (const n of readdirSync(join(__dirname, "..", rel), { withFileTypes: true })) {
      if (["node_modules", ".git", "out_data", "assets", "vendor"].includes(n.name)) continue;
      const r = rel ? `${rel}/${n.name}` : n.name;
      if (n.isDirectory()) scanHtml(r);
      else if (n.name.endsWith(".html")) pages.push(r);
    }
  };
  scanHtml();
  const bad = [];
  for (const p of pages) {
    const raw = readFileSync(join(__dirname, "..", p), "utf8");
    if (!/class="page-footer"/.test(raw)) continue;
    /* ⚠ **先把 HTML 註解拿掉再找位置**（§4.90）。那 9 頁的 `<link>` 上方有一段說明
       「必須排在下面那個 <style> 之前」——註解裡的 `<style>` 會被 `indexOf` 當成真的
       標籤，位置比 link 還前面，於是每一頁都被誤判成「順序錯」。第一版就是這樣。 */
    const html = raw.replace(/<!--[\s\S]*?-->/g, "");
    /* 樣式來源有兩種都算數：載 common.css，或頁面自己定義 `.page-footer`
       （`tools/glamour/` 是併進來的子專案，自帶 Bootstrap 與自己的頁尾樣式）。
       要擋的是「兩者皆無」——那才是沒有樣式的裸文字。 */
    if (/\.page-footer\s*[{,]/.test(html)) continue;
    const iCss = html.indexOf("assets/css/common.css");
    const iStyle = html.indexOf("<style>");
    // 沒載，或載在自己的 <style> 之後（後者會把版面壓掉）
    if (iCss < 0 || (iStyle >= 0 && iCss > iStyle)) bad.push(p);
  }
  const withFooter = pages.filter((p) =>
    /class="page-footer"/.test(readFileSync(join(__dirname, "..", p), "utf8"))).length;
  rows.push({
    link: "有 .page-footer 的頁 → 載 common.css",
    broken: bad.length,
    total: withFooter,
    note: bad.length
      ? `⚠ 頁尾沒有樣式：${bad.join("、")}`
      : "頁尾都有樣式（體檢抓不到這個，只能在這裡驗）",
  });
}

// ---------- 輸出 ----------
console.log(`連結驗證報告（${new Date().toISOString().slice(0, 10)}）`);
console.log("".padEnd(78, "─"));
let anyBroken = false;
for (const r of rows) {
  const flag = r.broken > 0 ? "✗" : "✓";
  if (r.broken > 0) anyBroken = true;
  console.log(`${flag} ${r.link.padEnd(46)} ${String(r.broken).padStart(6)} / ${r.total}${r.note ? `　（${r.note}）` : ""}`);
}
console.log("".padEnd(78, "─"));
console.log(anyBroken ? "存在斷鏈：mapId 類應歸零；itemId/npcId 類多為台服未開放（預期內）。" : "全部連結通過。");
