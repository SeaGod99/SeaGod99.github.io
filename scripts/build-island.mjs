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
// 用 baseId 硬對會撞號撈到錯的東西（「緊張的聲音」之類）。故動物名不可自動推導，
// 只能由 island-names-tw.json 人工提供；來源與對位方法記在該檔的 _animalSource。
//
// 動物的出現時段／天氣／座標同樣不在 datamine，但那是**觀測數值不是譯名**，不受
// 台服譯名鐵則限制，任何可靠來源皆可；一樣寫在 island-names-tw.json（animalSpawns）。
// 天氣名會在此驗證必須出現在 maps.json id 772 的 weatherRates 內，寫錯即 throw。
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
  "MJICraftworksObject", "MJICraftworksObjectTheme",
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
  animalSpawns: {}, // MJIAnimals row id -> { x, y, start?, end?, weather?[], note? }
  buildings: {},    // MJIText row id -> 台服建築名
  categories: {},   // MJIItemCategory row id -> 台服素材分類名
  areas: {},        // MJIName row id -> 台服島嶼地區名
  themes: {},       // MJICraftworksObjectTheme row id -> 台服工坊製作主題名
};
function loadOverride() {
  if (!existsSync(OVERRIDE_PATH)) {
    writeFileSync(OVERRIDE_PATH, JSON.stringify(OVERRIDE_TEMPLATE, null, 2) + "\n");
    return OVERRIDE_TEMPLATE;
  }
  const o = JSON.parse(readFileSync(OVERRIDE_PATH, "utf8"));
  for (const k of ["animals", "animalSpawns", "buildings", "categories", "areas", "themes"]) o[k] = o[k] || {};
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
    // ⚠️ 這是「採集區域」不是「單一採集點」：欄位帶 Radius（75~200 世界單位），
    // 遊戲裡同一種素材在該區域內散佈著很多個可採集物件。前端務必以圓形範圍呈現，
    // 不要畫成一個精確的點——那會誤導使用者以為只有一處可採。
    // 每個採集物件的逐點座標 datamine 拿不到（MJIGathering 的 484 列只有
    // GatheringObject 參照、沒有座標）。
    gather.set(itemId, {
      tool: num(g.Tool) || null,           // MJIGatheringTool row（0＝空手）
      // Map 欄實測只有 0/1 兩種值（島嶼地區 MJIName 有 6 個，故這欄不是地區）。
      // 0 的 39 筆是地上、1 的 9 筆全是洞窟產物（燈火茸／幻影石／水晶層…）→ 1 ＝ 洞窟。
      mapLayer: num(g.Map),
      layerName: num(g.Map) === 1 ? "洞窟" : "地上",
      // 區域中心與半徑，換算成遊戲內地圖座標系（半徑同樣是地圖座標單位）
      area: {
        mapId: ISLAND_MAP_ID,
        x: worldToMapCoord(num(g.X), ISLAND_MAP.offsetX),
        y: worldToMapCoord(num(g.Y), ISLAND_MAP.offsetY),
        radius: Math.round(num(g.Radius) * 41 / 2048 * 10) / 10,
      },
      // datamine 原始世界座標（保留供日後校驗）
      raw: { x: num(g.X), y: num(g.Y), radius: num(g.Radius) },
    });
  }
  // ⚠️ 方向容易搞反：MJIItemPouch 的 Crop 欄不為 0 者，**該素材本身是種子／芽塊**
  // （如「海島甘藍的種子」），它指向的 MJICropSeed.Item 才是種下去收成的作物
  // （海島甘藍）。故欄位命名為 growsIntoItemId，不要叫 seedItemId。
  const cropProduce = new Map();
  for (const c of S.MJICropSeed) cropProduce.set(mainKey(c._key), num(c.Item));

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
        growsIntoItemId: cropRow ? cropProduce.get(cropRow) || null : null,
        gathering: gather.get(itemId) || null,
      };
    });
  // ── 採集區域（一級概念）──
  // 一個區域裡通常可以採到**好幾種**素材（實測 48 個素材只分佈在 26 個區域，
  // 最多的一區有 4 種）。前端要以區域為單位呈現，不要一種素材畫一個圈。
  const areaMap = new Map();
  for (const r of rows) {
    if (!r.gathering) continue;
    const a = r.gathering.area;
    const key = `${a.x},${a.y},${a.radius},${r.gathering.mapLayer}`;
    if (!areaMap.has(key)) {
      areaMap.set(key, {
        id: areaMap.size + 1,
        mapId: a.mapId, x: a.x, y: a.y, radius: a.radius,
        mapLayer: r.gathering.mapLayer, layerName: r.gathering.layerName,
        items: [],
      });
    }
    const area = areaMap.get(key);
    area.items.push({ itemId: r.itemId, name: r.name, tool: r.gathering.tool });
    r.gathering.areaId = area.id;          // 讓素材反查能連回區域
  }
  const areaRows = Array.from(areaMap.values());
  report.push(["island-gather-areas", write("island-gather-areas.json", "island-gather-areas", areaRows),
    areaRows.length]);

  report.push(["island-materials", write("island-materials.json", "island-materials", rows),
    rows.filter((r) => r.name).length]);
}

/* 4) 動物：體型／稀有度／掉落素材出自 datamine；名稱與出現條件由人工表合併，見檔頭說明 */
{
  const SIZE = { 1: "小", 2: "中", 3: "大" };
  // 島上只會出現這 6 種天氣，拿它當 animalSpawns.weather 的白名單，打錯字直接炸掉
  const ISLAND_WEATHERS = new Set((ISLAND_MAP.weatherRates || []).map((w) => w.weather));
  const rows = S.MJIAnimals
    .filter((r) => mainKey(r._key) > 0 && num(r.BNpcBase))
    .map((r) => {
      const id = mainKey(r._key);
      const rewards = [num(r["Reward[0]"]), num(r["Reward[1]"])]
        .filter(Boolean)
        .map((itemId) => ({ itemId, name: twName(itemId) }));
      const name = OV.animals[id] || null;
      const ob = OV.animalSpawns[id] || null;
      if (ob) {
        for (const w of ob.weather || []) {
          if (!ISLAND_WEATHERS.has(w)) {
            throw new Error(`animalSpawns[${id}] 的天氣「${w}」不在無名島天氣表內：` +
              [...ISLAND_WEATHERS].join("／"));
          }
        }
        // 時間一律 24 小時制。外部來源常寫 am/pm，而 12am／12pm 極易看錯（原始來源就錯過
        // 一次：星點栗鼠寫 9am-12am ＝ 09:00-00:00，實為 09:00-12:00）。這裡把「0–23 的整點」
        // 變成機器強制，轉錄時若忘了換算就會炸在這裡而不是安靜地產出錯資料。
        if ((ob.start == null) !== (ob.end == null)) {
          throw new Error(`animalSpawns[${id}] 的 start／end 必須成對出現`);
        }
        for (const [k, v] of [["start", ob.start], ["end", ob.end]]) {
          if (v == null) continue;
          if (!Number.isInteger(v) || v < 0 || v > 23) {
            throw new Error(`animalSpawns[${id}].${k} = ${JSON.stringify(v)}：` +
              `必須是 0–23 的整數（24 小時制），不接受 am/pm 或非整點`);
          }
        }
        if (ob.start != null && ob.start === ob.end) {
          throw new Error(`animalSpawns[${id}] 的 start 與 end 相同（${ob.start}），時窗長度為 0`);
        }
      }
      return {
        id,
        name, nameMissing: !name,
        bnpcBaseId: num(r.BNpcBase),
        size: num(r.Size), sizeName: SIZE[num(r.Size)] || null,
        rarity: num(r.Rarity),
        sort: num(r.Sort),
        icon: num(r.Icon) || null,
        rewards,
        // 出現條件：兩者皆無＝常駐。start/end 是艾歐澤亞時間的整點半開區間 [start, end)
        spawn: ob && ob.start != null ? { startHour: ob.start, endHour: ob.end } : null,
        weather: ob && ob.weather ? ob.weather : null,
        coords: ob ? { x: ob.x, y: ob.y } : null,
        note: (ob && ob.note) || null,
        obsMissing: !ob,
      };
    });
  report.push(["island-animals", write("island-animals.json", "island-animals", rows,
    { animalSource: OV._animalSource || null }),
    rows.filter((r) => r.name).length]);
}

/* 5) 人工製作（MJIRecipe）：開拓工具／人偶設備／捕獸具／飼料。
      經濟型製作（工坊生產）是另一套機制，走 MJICraftworksObject，見下一段。 */
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
        id: mainKey(r._key),
        itemId, name, nameMissing: !name,
        order: num(r.Order), ingredients,
      };
    })
    .filter((x) => x.itemId);

  report.push(["island-recipes", write("island-recipes.json", "island-recipes", rows),
    rows.filter((r) => r.name).length]);
}

/* 5b) 工坊生產（經濟型製作）：MJICraftworksObject
   ── 使用情境 ──
   這不是玩家自己合成的配方，而是**工坊排程生產**的品項：指派後經過 CraftingTime
   小時產出，賣掉換取貨幣。玩家實際要決定的是「這一輪排什麼」，判斷依據是
   所需素材（手上有沒有）、製作時數（幾小時一輪）、Value（基礎價值）、
   以及 Theme（連續生產同主題會有效率加成），外加工房等級門檻 LevelReq。
   故本表輸出這些欄位；**每週浮動的歡迎度／需求係數刻意不做**（需週更維護，
   見 docs/無人島攻略工具規劃.md §1）。 */
{
  const themeName = new Map();
  for (const t of S.MJICraftworksObjectTheme) {
    const id = mainKey(t._key);
    if (id > 0 && (t.Name || "").trim()) themeName.set(id, t.Name);
  }
  const themeRows = Array.from(themeName.entries()).map(([id, cn]) => ({
    id, name: OV.themes[id] || null, nameCn: cn, nameMissing: !OV.themes[id],
  }));
  report.push(["island-themes", write("island-themes.json", "island-themes", themeRows),
    themeRows.filter((r) => r.name).length]);

  const rows = S.MJICraftworksObject
    .map((r) => {
      const itemId = num(r.Item);
      if (!itemId) return null;
      const name = twName(itemId);
      const materials = [];
      for (let i = 0; i < 4; i++) {
        const pouchRow = num(r[`Material[${i}]`]);
        const qty = num(r[`Amount[${i}]`]);
        if (!qty) continue;                        // pouchRow 0 有效，只能用 qty 判空
        const mid = pouchItem.get(pouchRow);
        if (!mid) continue;
        materials.push({ itemId: mid, name: twName(mid), qty });
      }
      const themes = [num(r["Theme[0]"]), num(r["Theme[1]"])]
        .filter((t) => t > 0)
        .map((t) => ({ id: t, name: OV.themes[t] || null, nameCn: themeName.get(t) || null }));
      return {
        id: mainKey(r._key), itemId, name, nameMissing: !name,
        themes, materials,
        levelReq: num(r.LevelReq) || null,
        craftingTime: num(r.CraftingTime) || null,   // 小時
        value: num(r.Value) || null,                 // 基礎價值
      };
    })
    .filter((x) => x && x.materials.length);
  report.push(["island-craftworks", write("island-craftworks.json", "island-craftworks", rows),
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

/* 8) 素材收購：MJIDisposalShopItem。
   ⚠️ `Currency` 欄只是個 byte，datamine 沒有給貨幣名稱，**不要自己編一個**
   （初版曾憑印象寫「貝幣」，是錯的）。在拿到台服官方貨幣名之前，
   前端不顯示這份資料；此檔僅保留 itemId 與數值供日後接上。 */
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
if (animals.some((a) => a.obsMissing)) need.push(`動物出現條件 ${animals.filter((a) => a.obsMissing).length}/${animals.length}（datamine 無，需社群或實機）`);
const bld = JSON.parse(readFileSync(join(DATA, "island-buildings.json"), "utf8")).data;
if (bld.some((b) => b.nameMissing)) need.push(`建築名 ${bld.filter((b) => b.nameMissing).length}/${bld.length}`);
if (need.length) {
  console.log("待人工補台服資料（填 data/island-names-tw.json 後重跑）：");
  need.forEach((n) => console.log("  ·", n));
}
console.log("\n✅ 完成");
