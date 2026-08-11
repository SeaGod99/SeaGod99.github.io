/* 水神的工具箱 — Universalis 市場資料共用用戶端
 *
 * 封裝對 Universalis API（https://universalis.app）的查詢，供市場查價、製作清單、
 * 時尚品鑑等需要即時市場價格的工具共用。比照 eorzea-weather.js 為全站共用模組。
 *
 * 用法（頁面以 <script src="REL/assets/js/universalis.js"></script> 引入，REL 依深度）：
 *   const data = await Universalis.fetchListings('dc', [5057, 5056], { listings: 10 });
 *   const agg  = await Universalis.fetchAggregated(4034, [5057]);
 *   const hist = await Universalis.fetchHistory('dc', [5057], { entries: 80, days: 30 });
 *   const q    = Universalis.fillQuote(data.items[5057], 120, { hq: false, cap: 30 });
 *
 * ⚠ 要「買 N 個」的成本一律用 fillQuote，不要 `最低價 × N`——最便宜那筆常常只有
 *   幾個，乘法會系統性低估，且低估幅度隨數量放大（見該函式註解）。
 *
 * 繁中服只有一個資料中心「陸行鳥」（region 繁中服），底下 8 個世界（4028–4035）。
 * scope 參數可為 'dc'（整個陸行鳥 DC，跨服比價）或某個世界 id（單一伺服器）。
 *
 * 內建 sessionStorage 快取（TTL 預設 10 分鐘），同一 scope+物品+listings 數量短時間內
 * 不重複打 API。clearCache() 供「重新整理」按鈕清除。失敗回傳 null，不丟例外。
 */
(function () {
  'use strict';

  var API = 'https://universalis.app/api/v2';
  var DC_NAME = '陸行鳥';
  var WORLDS = {
    4028: '伊弗利特', 4029: '迦樓羅', 4030: '利維坦', 4031: '鳳凰',
    4032: '奧汀', 4033: '巴哈姆特', 4034: '拉姆', 4035: '泰坦'
  };
  var DC = { name: DC_NAME, region: '繁中服', worlds: WORLDS };

  var TTL_MS = 10 * 60 * 1000; // 10 分鐘
  var MAX_PER_REQ = 100;       // Universalis 單次物品上限

  // scope -> URL 路徑片段（DC 名要 encode）
  function scopePath(scope) {
    if (scope == null || scope === 'dc' || scope === DC_NAME) return encodeURIComponent(DC_NAME);
    return String(scope); // world id
  }

  // 快取 key 用原始 scope 字面，避免 encode 差異
  function scopeKey(scope) {
    if (scope == null || scope === 'dc' || scope === DC_NAME) return 'dc';
    return String(scope);
  }

  function cacheGet(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || (Date.now() - obj.t) > TTL_MS) { sessionStorage.removeItem(key); return null; }
      return obj.v;
    } catch (e) { return null; }
  }

  function cacheSet(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) { /* 配額滿/私密視窗：忽略 */ }
  }

  function clearCache() {
    try {
      var rm = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf('uni:') === 0) rm.push(k);
      }
      rm.forEach(function (k) { sessionStorage.removeItem(k); });
    } catch (e) { /* 忽略 */ }
  }

  function chunk(arr, n) {
    var out = [];
    for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function uniqIds(ids) {
    var seen = {}, out = [];
    (ids || []).forEach(function (id) {
      var n = Number(id);
      if (Number.isFinite(n) && !seen[n]) { seen[n] = 1; out.push(n); }
    });
    return out;
  }

  // 帶重試的 GET。網路錯誤或暫時性狀態（429／5xx）以指數退避重試，
  // 最多 RETRIES 次；4xx（除 429）視為永久錯誤，直接丟出不重試。
  var RETRIES = 2;          // 首次之外再試 2 次（共 3 次）
  var BACKOFF_MS = 600;     // 600ms → 1200ms
  async function getJSON(url) {
    var lastErr = null;
    for (var attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt) await sleep(BACKOFF_MS * attempt);
      try {
        var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.ok) return res.json();
        // 4xx（非 429）為永久錯誤，重試無意義
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error('HTTP ' + res.status);
        }
        lastErr = new Error('HTTP ' + res.status); // 429／5xx → 續試
      } catch (e) {
        lastErr = e; // 網路層錯誤（離線／逾時／CORS）→ 續試
      }
    }
    throw lastErr || new Error('fetch failed');
  }

  // 把單筆或多筆回應統一成 { '5057': {...}, '5056': {...} }
  // 注意 Universalis 的回應形狀依「單/多物品」與「current/aggregated」而不同：
  //   多物品 current data → { items: { id: {...} } }
  //   aggregated（單或多）→ { results: [ { itemId, nq, hq, ... } ] }
  //   單物品 current data → 頂層即該物件，且 id 欄位為 itemID（大寫 D）
  function normItems(json, requestedIds) {
    if (!json) return {};
    if (json.items) return json.items;
    if (json.results) {
      var r = {};
      json.results.forEach(function (x) { r[x.itemId != null ? x.itemId : x.itemID] = x; });
      return r;
    }
    var id = json.itemID != null ? json.itemID : (json.itemId != null ? json.itemId : (requestedIds && requestedIds[0]));
    if (id != null && (json.listings || json.recentHistory || json.lastUploadTime != null)) {
      var o = {}; o[id] = json; return o;
    }
    return json; // 後備：本身就是 id->obj
  }

  /* 即時在架明細（含每筆 listing 的 worldName）。
   * 回傳 { items: { id: { listings:[], lastUploadTime } }, lastUploadTime } 或 null。 */
  async function fetchListings(scope, itemIds, opts) {
    opts = opts || {};
    var listings = opts.listings != null ? opts.listings : 10;
    var ids = uniqIds(itemIds);
    if (!ids.length) return { items: {}, lastUploadTime: 0 };
    var sp = scopePath(scope);
    var key = 'uni:list:' + scopeKey(scope) + ':' + listings + ':' + ids.join(',');
    var cached = cacheGet(key);
    if (cached) return cached;

    try {
      var merged = {}; var lastUpload = 0;
      var groups = chunk(ids, MAX_PER_REQ);
      for (var g = 0; g < groups.length; g++) {
        var url = API + '/' + sp + '/' + groups[g].join(',') +
          '?listings=' + listings + '&entries=0';
        var json = await getJSON(url);
        var map = normItems(json, groups[g]);
        Object.keys(map).forEach(function (id) {
          merged[id] = map[id];
          if (map[id] && map[id].lastUploadTime > lastUpload) lastUpload = map[id].lastUploadTime;
        });
        if (json && json.lastUploadTime > lastUpload) lastUpload = json.lastUploadTime;
      }
      var out = { items: merged, lastUploadTime: lastUpload, fetched: Date.now() };
      cacheSet(key, out);
      return out;
    } catch (e) {
      return null;
    }
  }

  /* 聚合摘要（最便宜世界、近期成交均價、銷量速度）。
   * 回傳 { results: { id: {...} } } 風格的 map，或 null。 */
  async function fetchAggregated(scope, itemIds) {
    var ids = uniqIds(itemIds);
    if (!ids.length) return { items: {} };
    var sp = scopePath(scope);
    var key = 'uni:agg:' + scopeKey(scope) + ':' + ids.join(',');
    var cached = cacheGet(key);
    if (cached) return cached;

    try {
      var merged = {};
      var groups = chunk(ids, MAX_PER_REQ);
      for (var g = 0; g < groups.length; g++) {
        var url = API + '/aggregated/' + sp + '/' + groups[g].join(',');
        var json = await getJSON(url);
        var map = normItems(json, groups[g]);
        Object.keys(map).forEach(function (id) { merged[id] = map[id]; });
      }
      var out = { items: merged, fetched: Date.now() };
      cacheSet(key, out);
      return out;
    } catch (e) {
      return null;
    }
  }

  /* 近期成交紀錄（供價格走勢與「目前價位在近 N 筆的第幾百分位」）。
   * Universalis 的 /history 回應形狀與 current data 相同（單/多物品兩種），
   * 故沿用 normItems。回傳 { items: { id: { entries:[{pricePerUnit,quantity,hq,timestamp}] } } }。
   * ⚠ entries 的 timestamp 是**秒**，不是毫秒——與 lastUploadTime（毫秒）不同單位。 */
  async function fetchHistory(scope, itemIds, opts) {
    opts = opts || {};
    var entries = opts.entries != null ? opts.entries : 80;
    var days = opts.days != null ? opts.days : 30;
    var ids = uniqIds(itemIds);
    if (!ids.length) return { items: {} };
    var sp = scopePath(scope);
    var key = 'uni:hist:' + scopeKey(scope) + ':' + entries + ':' + days + ':' + ids.join(',');
    var cached = cacheGet(key);
    if (cached) return cached;

    try {
      var merged = {};
      var groups = chunk(ids, MAX_PER_REQ);
      for (var g = 0; g < groups.length; g++) {
        var url = API + '/history/' + sp + '/' + groups[g].join(',') +
          '?entriesToReturn=' + entries + '&statsWithin=' + (days * 86400000);
        var json = await getJSON(url);
        var map = normItems(json, groups[g]);
        Object.keys(map).forEach(function (id) { merged[id] = map[id]; });
      }
      var out = { items: merged, fetched: Date.now() };
      cacheSet(key, out);
      return out;
    } catch (e) {
      return null;
    }
  }

  // 市場板交易稅 5%：**買方負擔**，成交時另外加在標價之上。
  // 也就是掛牌 1000 G 的東西，買家實際付 1050 G，賣家收到 1000 G。
  // ⚠ 方向弄反會讓利潤試算兩邊都錯（成本少算 5%、收入又多扣 5%），
  //   合計偏差約 10%。fillQuote 回傳的是**未稅**市價，稅由呼叫端加。
  var TAX_RATE = 0.05;

  /* 「買 N 個實際要花多少」——逐筆吃掉掛單，而不是拿最低價乘以數量。
   *
   * 最便宜那筆常常只有 1～3 個，用 `最低價 × N` 會系統性低估採購成本，
   * 而且**低估幅度隨數量放大**，正好是「買 vs 自製」決策最關鍵的輸入。
   *
   * opts:
   *   hq   true＝偏好 HQ／false＝偏好 NQ／null＝不分（偏好而非硬條件：
   *        想要的品質完全沒在架時退回另一種，並回報 hqFallback）
   *   cap  當初向 API 要了幾筆 listings。取滿代表資料被截斷，此時湊不滿
   *        不是「在架量不足」而是「超出取樣範圍」，兩者的處置完全不同。
   *
   * 回傳 null（完全無在架）或統計物件；湊不滿時餘量以最後一筆單價外推，
   * 並以 short／estimated 分別標示「真的不夠」與「只是沒取樣到」。
   */
  function fillQuote(itemData, need, opts) {
    opts = opts || {};
    var all = (itemData && itemData.listings) || [];
    if (!all.length || !(need > 0)) return null;
    var cap = opts.cap || 0;
    var want = opts.hq;

    var pick = function (hq) {
      return all.filter(function (l) { return hq == null ? true : (hq ? !!l.hq : !l.hq); });
    };
    var pool = pick(want), hqFallback = false;
    if (!pool.length && want != null) { pool = pick(!want); hqFallback = pool.length > 0; }
    if (!pool.length) return null;
    var hqUsed = want == null ? null : (hqFallback ? !want : want);

    pool = pool.slice().sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });

    var left = need, total = 0, filled = 0, lines = [], worlds = [];
    for (var i = 0; i < pool.length && left > 0; i++) {
      var l = pool[i];
      var take = Math.min(left, l.quantity);
      total += take * l.pricePerUnit;
      filled += take; left -= take;
      lines.push({ p: l.pricePerUnit, q: take, w: l.worldName || null, hq: !!l.hq });
      if (l.worldName && worlds.indexOf(l.worldName) < 0) worlds.push(l.worldName);
    }

    // 湊不滿：餘量用「最後（最貴）一筆」的單價外推，至少不會低估。
    // capped＝API 回應已被 listings 上限截斷，看不到的掛單不算「不足」。
    var capped = cap > 0 && all.length >= cap;
    var short = 0, estimated = false;
    if (left > 0) {
      total += left * pool[pool.length - 1].pricePerUnit;
      estimated = true;
      if (!capped) short = left;
    }

    return {
      total: total, unit: total / need, minUnit: pool[0].pricePerUnit, minQty: pool[0].quantity,
      lines: lines, worlds: worlds, filled: filled, short: short, estimated: estimated,
      hqUsed: hqUsed, hqFallback: hqFallback, capped: capped
    };
  }

  /* 由 fetchListings 結果取某物品在該 scope 內最低單價。
   * hq: true 只看 HQ、false 只看 NQ、null 兩者皆可。找不到回傳 null。 */
  function minPrice(itemData, hq) {
    if (!itemData || !itemData.listings || !itemData.listings.length) return null;
    var best = null;
    for (var i = 0; i < itemData.listings.length; i++) {
      var l = itemData.listings[i];
      if (hq === true && !l.hq) continue;
      if (hq === false && l.hq) continue;
      if (best == null || l.pricePerUnit < best.pricePerUnit) best = l;
    }
    return best; // { pricePerUnit, worldName, quantity, hq, ... } 或 null
  }

  function worldName(id) { return WORLDS[id] || ('#' + id); }

  function fmtGil(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  // 把 Universalis 的 lastUploadTime（毫秒 epoch）轉成「X 前」相對時間，
  // 供頁面標示市價新鮮度。傳入 0／null 回傳「無上傳紀錄」。
  function fmtAge(uploadMs) {
    if (!uploadMs || !Number.isFinite(uploadMs)) return '無上傳紀錄';
    var sec = Math.max(0, Math.floor((Date.now() - uploadMs) / 1000));
    if (sec < 60) return '剛剛';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + ' 分鐘前';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + ' 小時前';
    var day = Math.floor(hr / 24);
    return day + ' 天前';
  }

  window.Universalis = {
    DC: DC,
    WORLDS: WORLDS,
    fetchListings: fetchListings,
    fetchAggregated: fetchAggregated,
    fetchHistory: fetchHistory,
    minPrice: minPrice,
    fillQuote: fillQuote,
    TAX_RATE: TAX_RATE,
    worldName: worldName,
    fmtGil: fmtGil,
    fmtAge: fmtAge,
    clearCache: clearCache
  };
})();
