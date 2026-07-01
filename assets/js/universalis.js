/* 水神的工具箱 — Universalis 市場資料共用用戶端
 *
 * 封裝對 Universalis API（https://universalis.app）的查詢，供市場查價、製作清單、
 * 時尚品鑑等需要即時市場價格的工具共用。比照 eorzea-weather.js 為全站共用模組。
 *
 * 用法（頁面以 <script src="REL/assets/js/universalis.js"></script> 引入，REL 依深度）：
 *   const data = await Universalis.fetchListings('dc', [5057, 5056], { listings: 10 });
 *   const agg  = await Universalis.fetchAggregated(4034, [5057]);
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

  function uniqIds(ids) {
    var seen = {}, out = [];
    (ids || []).forEach(function (id) {
      var n = Number(id);
      if (Number.isFinite(n) && !seen[n]) { seen[n] = 1; out.push(n); }
    });
    return out;
  }

  async function getJSON(url) {
    var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
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
      var out = { items: merged, lastUploadTime: lastUpload };
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
      var out = { items: merged };
      cacheSet(key, out);
      return out;
    } catch (e) {
      return null;
    }
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

  window.Universalis = {
    DC: DC,
    WORLDS: WORLDS,
    fetchListings: fetchListings,
    fetchAggregated: fetchAggregated,
    minPrice: minPrice,
    worldName: worldName,
    fmtGil: fmtGil,
    clearCache: clearCache
  };
})();
