// 建置無人島開拓（6.2 實裝）的資料層：由 datamining-cn 的 MJI* 表產出 data/island-*.json。
//
// 為什麼走 CSV 而不是 XIVAPI v2：v2 有 40 個 MJI* sheet，但它的 schema 沒有為這些
// sheet 命名欄位（實測 MJIAnimals 只吐得出 Icon，MJIRank／MJIItemPouch 是空物件）。
// thewakingsands/ffxiv-datamining-cn 的 CSV 第 2 行帶欄位名、第 3 行帶型別與外鍵，
// 是目前唯一拿得到完整欄位的來源。
//
// ── 繁中名策略（遵守專案鐵則）──
// 物品類（素材／作物／畜產／成品／建築素材）全部是 itemId，一律連 data/items.json
// 取台服官方名；對不到＝台服未開放 → name=null + nameMissing，前端不顯示。
// 非物品的敘述字串（建築名 MJIText、素材分類 MJIItemCategory、地區名 MJIName）在
// datamining-cn 只有簡中，**絕不簡轉繁**：簡中放 nameCn 僅供人工比對，name 留 null。
// 動物名更麻煩：MJIAnimals 只給 BNpcBase，實測 BNpcBase→BNpcName 這條鏈在
// Teamcraft monsters.json（只收有狩獵座標的 2333 隻）是 0/43，我們的 monsters.json
// 用 baseId 硬對會撞號撈到錯的東西（「緊張的聲音」之類）。故動物名一律留 null。
//
// ── 人工補台服名 ──
// 把台服遊戲內抄到的名字寫進 data/island-names-tw.json（本腳本會自動產生空白樣板），
// 重跑本腳本即會合併進各檔的 name 欄。格式見該檔的 _readme。
//
// 執行：
//   node scripts/build-island.mjs              下載（帶本機快取）並產出
//   node scripts/build-island.mjs --offline    只用 out_data/mji-csv/ 的快取，不連網
//   node scripts/build-island.mjs --refresh    忽略快取，強制重新下載

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "mji-csv");
const CDN = "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/";

const OFFLINE = process.argv.includes("--offline");
const REFRESH = process.argv.includes("--refresh");

const SHEETS = [
  "MJIAnimals", "MJIItemPouch", "MJIItemCategory", "MJICropSeed",
  "MJIGatheringItem", "MJIGatheringTool", "MJIKeyItem",
  "MJIRecipe", "MJIRecipeMaterial",
  "MJIBuilding", "MJILandmark", "MJIText", "MJIName",
  "MJIRank", "MJIDisposalShopItem",
];

/* ── CSV 解析 ──
   datamining-cn 的格式：第 1 行 key,0,1,2…；第 2 行欄位名；第 3 行型別；第 4 行起是資料。
   欄位值可能帶引號且內含逗號。
   ⚠️ **row 0 不一定是空的預設值列**：MJI 這組表裡 MJIItemPouch／MJIRecipe／
   MJIDisposalShopItem 的 row 0 都是真資料。一律用「內容是否解析得出」判斷，
   不要用 key>0 過濾，否則會安靜地少掉一筆（實測會少掉無人島棕櫚葉與開拓用石斧）。 */
function parseCsv(text) {
  const rows = [];
  let cur = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function sheetToObjects(text) {
  const rows = parseCsv(text);
  const names = rows[1] || [];
  const out = [];
  for (let r = 3; r < rows.length; r++) {
    const line = rows[r];
    if (!line || line.length < 2 || line[0] === "") continue;
    const o = { _key: line[0] };
    for (let c = 1; c < line.length; c++) {
      const n = names[c];
      if (!n) continue;             // 未命名欄位跳過
      o[n] = line[c];
    }
    out.push(o);
  }
  return out;
}

async function loadSheet(name) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, name + ".csv");
  if (!REFRESH && existsSync(cached)) return sheetToObjects(readFileSync(cached, "utf8"));
  if (OFFLINE) throw new Error(`--offline 但快取缺 ${name}.csv（先跑一次不帶 --offline）`);
  const res = await fetch(CDN + name + ".csv");
  if (!res.ok) throw new Error(`${name}.csv HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(cached, text);
  return sheetToObjects(text);
}

const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
// 主鍵可能是 "12" 或 subrow 形式 "0.1"
const mainKey = (k) => num(String(k).split(".")[0]);
const subKey = (k) => { const p = String(k).split("."); return p.length > 1 ? num(p[1]) : 0; };

/* ── 台服名：物品走 items.json；非物品走人工對照檔 ── */
const ITEMS = new Map(
  JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data.map((i) => [i.id, i.name])
);
const twName = (itemId) => (itemId ? ITEMS.get(itemId) || null : null);

/* ── 無人島地圖與座標換算 ──
   maps.json id 772「無名島」（nameEn: Unnamed Island）即無人島，底圖 assets/maps/h1m2_01.jpg
   （XIVAPI h1m2/01；02、03 是未開拓地形，01 才是含村莊建設的完整版）。
   MJIGatheringItem 的 X/Y 是**世界座標**（實測 X −248~765、Y −694~246），非遊戲內地圖座標。
   換算走 FFXIV 標準式：frac = ((world + offset) * c + 1024) / 2048，c = sizeFactor/100，
   再 gameCoord = frac * 41 / c + 1（與站內其他頁的 coordFrac 互為逆運算）。
   **驗證方式**：把 48 個採集點畫上底圖，全部落在陸地上，且 mapLayer=1 的 9 筆
   （石炭／堆積岩／燈火茸／氣泡水／幻影石／黃銅礦／金礦／鷹眼砂／水晶層＝洞窟產物）
   緊密聚在東北山區的洞窟位置；把 Y 反轉重畫則有點掉進海裡且洞窟點散開 → 方向正確。 */
const ISLAND_MAP_ID = 772;
const ISLAND_MAP = JSON.parse(readFileSync(join(DATA, "maps.json"), "utf8"))
  .data.find((m) => m.id === ISLAND_MAP_ID);
function worldToMapCoord(world, offset) {
  const c = (ISLAND_MAP.sizeFactor || 100) / 100;
  const frac = ((world + offset) * c + 1024) / 2048;
  return Math.round((frac * 41 / c + 1) * 10) / 10;
}

const OVERRIDE_PATH = join(DATA, "island-names-tw.json");
const OVERRIDE_TEMPLATE = {
  _readme: [
    "無人島非物品名稱的台服官方名人工對照表。datamining-cn 只有簡中，依專案鐵則不可簡轉繁，",
    "故此處留給人工從台服遊戲內抄錄。填好後重跑 node scripts/build-island.mjs 即會合併。",
    "key 皆為該 MJI* 表的 row id；留空或缺鍵者，產出的 name 會是 null（前端不顯示）。",
  ],
  animals: {},      // MJIAnimals row id -> 台服動物名
  buildings: {},    // MJIText row id -> 台服建築名
  categories: {},   // MJIItemCategory row id -> 台服素材分類名
  areas: {},        // MJIName row id -> 台服島嶼地區名
};
function loadOverride() {
  if (!existsSync(OVERRIDE_PATH)) {
    writeFileSync(OVERRIDE_PATH, JSON.stringify(OVERRIDE_TEMPLATE, null, 2) + "\n");
    return OVERRIDE_TEMPLATE;
  }
  const o = JSON.parse(readFileSync(OVERRIDE_PATH, "utf8"));
  for (const k of ["animals", "buildings", "categories", "areas"]) o[k] = o[k] || {};
  return o;
}

const TODAY = new Date().toISOString().slice(0, 10);
const SRC = "datamining-cn MJI* + items.json(tw-items)";
function write(file, schema, rows, extra = {}) {
  const env = { schema, patch: "6.5", updated: TODAY, source: SRC, count: rows.length, ...extra, data: rows };
  writeFileSync(join(DATA, file), JSON.stringify(env, null, 2) + "\n");
  return rows.length;
}

/* ───────────────────────────── main ───────────────────────────── */
const S = {};
for (const n of SHEETS) S[n] = await loadSheet(n);
const OV = loadOverride();

// 素材袋：MJIItemPouch row -> itemId（建築/製作的 Material[] 都是指向這裡，不是直接 itemId）
// 注意：本表的 **row 0 是真資料**（無人島棕櫚葉 37551），不是慣例上的預設值空列。
// 一律以「Item 欄有值」判斷，不要用 key>0 過濾，否則 3 個配方會少掉棕櫚葉。
const pouchItem = new Map();
for (const r of S.MJIItemPouch) if (num(r.Item)) pouchItem.set(mainKey(r._key), num(r.Item));
// 開拓工具 key item：MJIKeyItem row -> itemId
const keyItem = new Map();
for (const r of S.MJIKeyItem) keyItem.set(mainKey(r._key), num(r.Item));
// MJIRecipeMaterial row -> MJIItemPouch row（配方素材一律指向素材袋）
const recipeMat = new Map();
for (const r of S.MJIRecipeMaterial) recipeMat.set(mainKey(r._key), num(r.ItemPouch));
const mjiText = new Map();
for (const r of S.MJIText) mjiText.set(mainKey(r._key), r.Text || "");

const report = [];

/* 1) 素材分類（簡中，待人工補台服名） */
{
  const rows = S.MJIItemCategory
    .filter((r) => mainKey(r._key) > 0 && (r.Singular || "").trim())
    .map((r) => {
      const id = mainKey(r._key);
      return { id, name: OV.categories[id] || null, nameCn: r.Singular, nameMissing: !OV.categories[id] };
    });
  report.push(["island-categories", write("island-categories.json", "island-categories", rows),
    rows.filter((r) => r.name).length]);
}

/* 2) 島嶼地區（草原／溪流／…；簡中，待人工補） */
{
  const rows = S.MJIName
    .filter((r) => mainKey(r._key) > 0 && (r.Singular || "").trim())
    .map((r) => {
      const id = mainKey(r._key);
      return { id, name: OV.areas[id] || null, nameCn: r.Singular, nameMissing: !OV.areas[id] };
    });
  report.push(["island-areas", write("island-areas.json", "island-areas", rows),
    rows.filter((r) => r.name).length]);
}

/* 3) 素材總表：MJIItemPouch ＋ 併入採集資訊（工具／地區／原始座標） */
{
  const gather = new Map();
  for (const g of S.MJIGatheringItem) {
    const itemId = num(g.Item);
    if (!itemId) continue;
    gather.set(itemId, {
      tool: num(g.Tool) || null,           // MJIGatheringTool row（0＝空手）
      // Map 欄實測只有 0/1 兩種值（島嶼地區 MJIName 有 6 個，故這欄不是地區）。
      // 0 的 39 筆是地上、1 的 9 筆全是洞窟產物（燈火茸／幻影石／水晶層…）→ 1 ＝ 洞窟。
      mapLayer: num(g.Map),
      layerName: num(g.Map) === 1 ? "洞窟" : "地上",
      // 遊戲內地圖座標（站內標準格式 {mapId,x,y}），由世界座標換算，已用底圖疊點驗證
      coords: {
        mapId: ISLAND_MAP_ID,
        x: worldToMapCoord(num(g.X), ISLAND_MAP.offsetX),
        y: worldToMapCoord(num(g.Y), ISLAND_MAP.offsetY),
      },
      // datamine 原始世界座標（保留供日後校驗）
      raw: { x: num(g.X), y: num(g.Y), radius: num(g.Radius) },
    });
  }
  const seedItem = new Map();
  for (const c of S.MJICropSeed) seedItem.set(mainKey(c._key), num(c.Item));

  const rows = S.MJIItemPouch
    .filter((r) => num(r.Item))          // row 0 亦為真資料，見上方 pouchItem 註解
    .map((r) => {
      const id = mainKey(r._key), itemId = num(r.Item);
      const name = twName(itemId);
      const cropRow = num(r.Crop);
      return {
        id, itemId, name, nameMissing: !name,
        categoryId: num(r.Category) || null,
        sort: num(r.Sort),
        seedItemId: cropRow ? seedItem.get(cropRow) || null : null,
        gathering: gather.get(itemId) || null,
      };
    });
  report.push(["island-materials", write("island-materials.json", "island-materials", rows),
    rows.filter((r) => r.name).length]);
}

/* 4) 動物：體型／稀有度／掉落素材。名稱與出現時段／天氣不在 datamine，見檔頭說明 */
{
  const SIZE = { 1: "小", 2: "中", 3: "大" };
  const rows = S.MJIAnimals
    .filter((r) => mainKey(r._key) > 0 && num(r.BNpcBase))
    .map((r) => {
      const id = mainKey(r._key);
      const rewards = [num(r["Reward[0]"]), num(r["Reward[1]"])]
        .filter(Boolean)
        .map((itemId) => ({ itemId, name: twName(itemId) }));
      const name = OV.animals[id] || null;
      return {
        id,
        name, nameMissing: !name,
        bnpcBaseId: num(r.BNpcBase),
        size: num(r.Size), sizeName: SIZE[num(r.Size)] || null,
        rarity: num(r.Rarity),
        sort: num(r.Sort),
        icon: num(r.Icon) || null,
        rewards,
        // 以下為社群觀測資料，datamine 沒有；待人工補後前端才能做時鐘
        spawn: null,     // { startHour, endHour }
        weather: null,   // [天氣繁中名]
        coords: null,    // { x, y }
      };
    });
  report.push(["island-animals", write("island-animals.json", "island-animals", rows),
    rows.filter((r) => r.name).length]);
}

/* 5) 人工製作：成品（開拓工具 KeyItem 或袋內素材）＋所需素材 */
{
  // 同樣不能用 key>0 過濾：row 0 是「開拓用石斧」的真配方
  const rows = S.MJIRecipe
    .map((r) => {
      const kiRow = num(r.KeyItem), pouchRow = num(r.ItemPouch);
      const itemId = kiRow ? keyItem.get(kiRow) || 0 : pouchItem.get(pouchRow) || 0;
      const name = twName(itemId);
      const ingredients = [];
      for (let i = 0; i < 5; i++) {
        const matRow = num(r[`Material[${i}]`]);
        const qty = num(r[`Amount[${i}]`]);
        if (!matRow || !qty) continue;
        const pouchRow = recipeMat.get(matRow);
        if (pouchRow == null) continue;
        const mid = pouchItem.get(pouchRow);
        if (!mid) continue;
        ingredients.push({ itemId: mid, name: twName(mid), qty });
      }
      return {
        id: mainKey(r._key), itemId, name, nameMissing: !name,
        order: num(r.Order), ingredients,
      };
    })
    .filter((x) => x.itemId);
  report.push(["island-recipes", write("island-recipes.json", "island-recipes", rows),
    rows.filter((r) => r.name).length]);
}

/* 6) 建築與地標：改建素材（Material[] 指向 MJIItemPouch row） */
{
  function buildRows(sheet, type) {
    // 又是 row 0 陷阱：MJIBuilding 的 key 是 "主列.子列"，"0.0"（小島木屋 I）是真資料。
    // 只用「有沒有解析出素材」判斷即可。
    return S[sheet]
      .map((r) => {
        const materials = [];
        for (let i = 0; i < 5; i++) {
          const pouchRow = num(r[`Material[${i}]`]);
          const qty = num(r[`Amount[${i}]`]);
          if (!pouchRow || !qty) continue;
          const itemId = pouchItem.get(pouchRow);
          if (!itemId) continue;
          materials.push({ itemId, name: twName(itemId), qty });
        }
        if (!materials.length) return null;
        const textRow = num(r.Name);
        const nameCn = mjiText.get(textRow) || null;
        const name = OV.buildings[textRow] || null;
        return {
          id: `${type}-${r._key}`, type,
          // 子列 0 起算，對應遊戲內的等級 I／II／III…（等級也寫在 nameCn 尾巴）
          level: subKey(r._key) + 1,
          name, nameCn, nameMissing: !name,
          textId: textRow || null,
          icon: num(r.Icon) || null,
          materials,
        };
      })
      .filter(Boolean);
  }
  const rows = buildRows("MJIBuilding", "building").concat(buildRows("MJILandmark", "landmark"));
  report.push(["island-buildings", write("island-buildings.json", "island-buildings", rows),
    rows.filter((r) => r.name).length]);
}

/* 7) 開拓等級：升級所需經驗與累計 */
{
  let cum = 0;
  const rows = S.MJIRank
    .filter((r) => mainKey(r._key) > 0)
    .map((r) => {
      const level = mainKey(r._key);
      const expToNext = num(r.ExpToNext);
      const row = { level, expToNext, cumulativeExp: cum };
      cum += expToNext;
      return row;
    });
  report.push(["island-ranks", write("island-ranks.json", "island-ranks", rows), rows.length]);
}

/* 8) 素材收購（島嶼素材 → 貝幣） */
{
  // Item 欄是 MJIItemPouch 的 row 參照（不是 itemId），且 row 0 有效 → 不可用 0 當空值判斷
  const rows = S.MJIDisposalShopItem
    .map((r) => {
      const pouchRow = num(r.Item);
      const itemId = pouchItem.get(pouchRow) || 0;
      const name = twName(itemId);
      return {
        id: mainKey(r._key), itemId, name, nameMissing: !name,
        price: num(r.Count), categoryId: num(r.Category) || null, sort: num(r.Sort),
      };
    })
    .filter((x) => x.itemId);
  report.push(["island-shop", write("island-shop.json", "island-shop", rows),
    rows.filter((r) => r.name).length]);
}

/* ── 報告 ── */
console.log("檔案".padEnd(20), "筆數".padStart(6), "有台服名".padStart(10));
console.log("-".repeat(40));
for (const [file, n, named] of report) {
  console.log(file.padEnd(20), String(n).padStart(6), `${named}/${n}`.padStart(10));
}
console.log();
const need = [];
const animals = JSON.parse(readFileSync(join(DATA, "island-animals.json"), "utf8")).data;
if (animals.some((a) => a.nameMissing)) need.push(`動物名 ${animals.filter((a) => a.nameMissing).length}/${animals.length}`);
if (animals.every((a) => !a.spawn)) need.push("動物出現時段／天氣（datamine 無，需社群或實機）");
const bld = JSON.parse(readFileSync(join(DATA, "island-buildings.json"), "utf8")).data;
if (bld.some((b) => b.nameMissing)) need.push(`建築名 ${bld.filter((b) => b.nameMissing).length}/${bld.length}`);
if (need.length) {
  console.log("待人工補台服資料（填 data/island-names-tw.json 後重跑）：");
  need.forEach((n) => console.log("  ·", n));
}
console.log("\n✅ 完成");
