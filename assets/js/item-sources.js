/* item-sources.js — 「這東西去哪拿」的前端查詢層
 *
 * 搭配 data/item-sources/（由 scripts/build-item-sources.mjs 產生）。
 * 36,335 件物品的取得管道共 2.2MB，整份載入不可能，所以切成 45 片，
 * **片號直接由 id 算出**（itemId >> 10），查詢時只抓需要的那片。
 *
 * 為什麼不用 _index.json 決定去哪抓：那會讓每次查詢先付一次索引往返。
 * 片號是算得出來的，索引只給「有哪些片、各片多大」這種維運問題用。
 *
 * 用法：
 *   const rows = await ItemSources.get(5594);        // [{t,d,w?,map?}] 或 []
 *   const map  = await ItemSources.getMany([1,2,3]); // Map<id, rows>，同片只抓一次
 *   ItemSources.render(rows)                          // → HTML 字串（可選，樣式在 common.css）
 *
 * 查不到就回空陣列——**空陣列的意思是「本站資料沒有收」，不是「遊戲裡拿不到」**。
 * 呼叫端顯示時請照這個語意寫文案（站內既有頁面都寫「本站資料未收錄」）。
 */
(function () {
  'use strict';

  var SHARD_BITS = 10;                       // 必須與 build-item-sources.mjs 的常數一致
  var me = document.currentScript;
  var ROOT = me ? me.src.replace(/assets\/js\/item-sources\.js.*$/, '') : '/';

  var cache = {};       // 片號 → Promise<{id: rows}>
  var failed = {};      // 片號 → true（抓失敗過就別一直重試，查詢應該安靜地沒有結果）

  function shardOf(id) { return id >> SHARD_BITS; }

  function loadShard(s) {
    if (failed[s]) return Promise.resolve({});
    if (!cache[s]) {
      cache[s] = fetch(ROOT + 'data/item-sources/' + s + '.json')
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { return j.data || {}; })
        .catch(function () { failed[s] = true; delete cache[s]; return {}; });
    }
    return cache[s];
  }

  function get(id) {
    id = Number(id);
    if (!id) return Promise.resolve([]);
    return loadShard(shardOf(id)).then(function (d) { return d[id] || []; });
  }

  function getMany(ids) {
    var uniq = [];
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var n = Number(ids[i]);
      if (n && !seen[n]) { seen[n] = 1; uniq.push(n); }
    }
    var shards = {};
    uniq.forEach(function (id) { shards[shardOf(id)] = 1; });
    return Promise.all(Object.keys(shards).map(loadShard)).then(function (parts) {
      var merged = {};
      parts.forEach(function (p) { for (var k in p) merged[k] = p[k]; });
      var out = new Map();
      uniq.forEach(function (id) { out.set(id, merged[id] || []); });
      return out;
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 副本來源帶 du（data/dungeons.json 的 id）時，每個副本名各自連到副本圖鑑（2026-10-03）。
     d 與 du 由建置端（scripts/lib/obtainable.mjs）保證同序、同數量；對不上就退回純文字。 */
  function descHtml(r) {
    if (!r.du || !r.du.length) return esc(r.d);
    var names = String(r.d).split('、');
    if (names.length !== r.du.length) return esc(r.d);
    return names.map(function (n, i) {
      return '<a href="' + ROOT + 'tools/duty-codex/?id=duty:' + r.du[i] + '">' + esc(n) + '</a>';
    }).join('、');
  }
  // 條目列表 → HTML。樣式 .is-row / .is-type / .is-desc / .is-where 在 common.css。
  function render(rows) {
    if (!rows || !rows.length) return '';
    return rows.map(function (r) {
      return '<div class="is-row">' +
        '<span class="is-type">' + esc(r.t) + '</span>' +
        '<span class="is-desc">' + descHtml(r) + '</span>' +
        (r.w ? '<span class="is-where">' + esc(r.w) + '</span>' : '') +
        '</div>';
    }).join('');
  }

  window.ItemSources = {
    get: get,
    getMany: getMany,
    render: render,
    shardOf: shardOf,
    // 測試與維運用：目前已載入哪幾片
    _loaded: function () { return Object.keys(cache).map(Number); }
  };
})();
