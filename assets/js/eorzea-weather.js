// ============================================================
// 艾歐澤亞天氣共用模組
// 來源：eorzea-weather npm 套件 v3.2.0 的種子演算法
// 天氣表優先讀取 data/maps.json 的 weatherRates（台服官方天氣名），
// 少數無 weatherRates 的特殊區域（優雷卡/波茲雅/帝亞德姆等 instance 地圖）
// 使用內建備援表 FALLBACK_TABLES（英文 key，需配合 WEATHER_INFO 顯示）。
// ============================================================

export const WEATHER_PERIOD = 1400000; // 8 ET 小時 = 1400 現實秒

/**
 * 對應 eorzea-weather 套件的種子演算法
 * @param {Date} date
 * @returns {number} 0-99
 */
export function calcSeed(date) {
  const n = Math.floor(date.getTime() / 1000);
  const r = n / 175;
  const a = (n / 4200) << 32 >>> 0; // = Math.floor(n/4200)
  const t = 100 * a + (r + 8 - r % 8) % 24;
  const s = (t << 11 ^ t) >>> 0;
  return ((s >>> 8 ^ s) >>> 0) % 100;
}

export function periodStart(ms) {
  return Math.floor(ms / WEATHER_PERIOD) * WEATHER_PERIOD;
}

// ============================================================
// 天氣中文名稱、英文 key、icon 對照
// key 為內部統一識別碼（與舊版 W 表英文 key 相容），
// name 為台服官方中文（對應 maps.json weatherRates.weather）
// ============================================================
export const WEATHER_INFO = {
  clearSkies:   { name: '碧空', icon: '🌤️' },
  fairSkies:    { name: '晴朗', icon: '☀️' },
  clouds:       { name: '陰天', icon: '⛅' },
  fog:          { name: '薄霧', icon: '🌫️' },
  wind:         { name: '強風', icon: '💨' },
  gales:        { name: '疾風', icon: '🌬️' },
  rain:         { name: '小雨', icon: '🌧️' },
  showers:      { name: '驟雨', icon: '🌦️' },
  thunderstorms:{ name: '暴雨', icon: '⛈️' },
  thunder:      { name: '打雷', icon: '🌩️' },
  snow:         { name: '降雪', icon: '❄️' },
  blizzards:    { name: '暴雪', icon: '🌨️' },
  heatWaves:    { name: '熱浪', icon: '🔥' },
  dustStorms:   { name: '揚沙', icon: '🌪️' },
  gloom:        { name: '妖霧', icon: '🌑' },
  umbralWind:   { name: '靈風', icon: '🌀' },
  umbralStatic: { name: '放電現象', icon: '⚡' },
  astromagneticStorms: { name: 'Astromagnetic Storms', icon: '🌌' }, // 遺塵之地，台服譯名待確認
};

// 中文名稱 → key 的反查表（用於把 maps.json weatherRates.weather 轉成內部 key）
const NAME_TO_KEY = Object.fromEntries(
  Object.entries(WEATHER_INFO).map(([key, info]) => [info.name, key])
);

/**
 * 取得天氣顯示資訊 { name, icon }
 * @param {string} key
 */
export function wi(key) {
  return WEATHER_INFO[key] || { name: key, icon: '❓' };
}

/**
 * 把 maps.json 某張地圖的 weatherRates 陣列轉成累積機率表
 * [[累積上限, key], ...]
 * @param {Array<{weather:string, rate:number}>} weatherRates
 * @returns {Array<[number,string]>}
 */
export function buildTableFromWeatherRates(weatherRates) {
  if (!weatherRates || !weatherRates.length) return null;
  let acc = 0;
  const table = [];
  for (const w of weatherRates) {
    acc += w.rate;
    const key = NAME_TO_KEY[w.weather] || w.weather;
    table.push([acc, key]);
  }
  // 確保最後一筆涵蓋到 100（rate 加總理論上應為 100，容錯處理）
  if (acc < 100) table[table.length - 1] = [100, table[table.length - 1][1]];
  return table;
}

// ============================================================
// 備援天氣表（英文 key）：給 maps.json 無 weatherRates 的特殊區域
// 目前僅優雷卡四區、波茲雅戰線、扎德諾爾、帝亞德姆使用
// ============================================================
export const FALLBACK_TABLES = {
  eurekaAnemos:        [[30,'fairSkies'],[60,'gales'],[90,'showers'],[100,'snow']],
  eurekaPagos:         [[10,'fairSkies'],[28,'fog'],[46,'heatWaves'],[64,'snow'],[82,'thunder'],[100,'blizzards']],
  eurekaPyros:         [[10,'fairSkies'],[28,'heatWaves'],[46,'thunder'],[64,'blizzards'],[82,'umbralWind'],[100,'snow']],
  eurekaHydatos:       [[12,'fairSkies'],[34,'showers'],[56,'gloom'],[78,'thunderstorms'],[100,'snow']],
  bozjanSouthernFront: [[52,'fairSkies'],[64,'rain'],[76,'wind'],[88,'thunder'],[100,'dustStorms']],
  zadnor:              [[60,'fairSkies'],[70,'rain'],[80,'wind'],[90,'thunder'],[100,'snow']],
  theDiadem:           [[30,'fairSkies'],[60,'fog'],[90,'wind'],[100,'umbralWind']],
};

// FALLBACK_TABLES 對應的 maps.json mapId（供前端用 mapId 查表時 fallback）
export const FALLBACK_MAP_IDS = {
  414: 'eurekaAnemos',          // 優雷卡常風之地
  467: 'eurekaPagos',           // 優雷卡恆冰之地
  484: 'eurekaPyros',           // 優雷卡湧火之地
  515: 'eurekaHydatos',         // 優雷卡豐水之地
  // 波茲雅/扎德諾爾/帝亞德姆 mapId 待補（maps.json 目前未收錄這些地圖）
};

// ============================================================
// 天氣表快取（由 maps.json 載入後建立，key 為 mapId）
// ============================================================
let _tableCache = null; // Map<mapId, Array<[number,string]>>
let _mapsData = null;

/**
 * 從 data/maps.json 初始化天氣表快取
 * @param {string} mapsJsonPath data/maps.json 的相對路徑
 */
export async function initWeatherTables(mapsJsonPath) {
  if (_tableCache) return _tableCache;
  const res = await fetch(mapsJsonPath);
  const db = await res.json();
  _mapsData = db.data;
  _tableCache = new Map();
  for (const m of db.data) {
    const table = buildTableFromWeatherRates(m.weatherRates);
    if (table) _tableCache.set(m.id, table);
  }
  // 補上備援表（優雷卡等無 weatherRates 的地圖）
  for (const [mapId, fbKey] of Object.entries(FALLBACK_MAP_IDS)) {
    if (!_tableCache.has(Number(mapId)) && FALLBACK_TABLES[fbKey]) {
      _tableCache.set(Number(mapId), FALLBACK_TABLES[fbKey]);
    }
  }
  return _tableCache;
}

/** 取得已載入的 maps.json data 陣列（需先呼叫 initWeatherTables） */
export function getMapsData() {
  return _mapsData;
}

/**
 * 依 seed 查表得到天氣 key
 * @param {Array<[number,string]>} table
 * @param {number} seed 0-99
 */
export function lookupWeather(table, seed) {
  if (!table) return 'fairSkies';
  for (const [lim, key] of table) { if (seed < lim) return key; }
  return table[table.length - 1][1];
}

/**
 * 取得某地圖在指定時間點的天氣 key
 * @param {number} mapId data/maps.json 的 id（= 遊戲 Map sheet row id）
 * @param {number} ms 時間戳（毫秒）
 * @returns {string|null} 天氣 key，若該地圖無天氣表回傳 null
 */
export function getWeatherAt(mapId, ms) {
  if (!_tableCache) throw new Error('eorzea-weather: 請先呼叫 initWeatherTables()');
  const table = _tableCache.get(mapId);
  if (!table) return null;
  return lookupWeather(table, calcSeed(new Date(periodStart(ms))));
}

/** 取得某地圖的天氣表（給多步驟搜尋用，避免重複查 Map） */
export function getWeatherTable(mapId) {
  if (!_tableCache) throw new Error('eorzea-weather: 請先呼叫 initWeatherTables()');
  return _tableCache.get(mapId) || null;
}

// ============================================================
// 格式化工具
// ============================================================

/** 現實時間 ms → Eorzea Time 字串 "HH:MM" */
export function fmtET(ms) {
  const etSec = ms / 1000 * (24 * 3600 / 4200);
  const h = String(Math.floor(etSec / 3600) % 24).padStart(2, '0');
  const m = String(Math.floor(etSec / 60) % 60).padStart(2, '0');
  return `ET ${h}:${m}`;
}

/** 現實時間 ms → 現實時間字串 "M/D HH:MM" */
export function fmtRT(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 毫秒差 → "N分 SS秒後" */
export function fmtCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}分 ${String(ss).padStart(2, '0')}秒後`;
}

/** 現實時間 ms → ET 整點數（0-23），供採集節點 spawns 比對用 */
export function etHourAt(ms) {
  const etSec = ms / 1000 * (24 * 3600 / 4200);
  return Math.floor(etSec / 3600) % 24;
}

/** 1 ET 小時 = 多少現實毫秒 */
export const ET_HOUR_MS = 4200000 / 24; // = 175000ms
