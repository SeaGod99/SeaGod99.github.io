/* item-names.js — 物品四語名稱查詢（英／日／簡中 → 台服繁中）
 *
 * 搭配 data/item-names/（由 scripts/build-item-names.mjs 產生）。
 * 45,546 件物品、177,593 個查詢鍵，整份 gzip 3.8MB，所以依**查詢鍵的雜湊**切成 256 片，
 * 一次查詢只抓需要的那一片（約 15KB）。
 *
 * ⚠ 下面的 normalizeName() 與 shardOf() **必須與 scripts/build-item-names.mjs 完全一致**。
 *   不一致的徵狀是「明明有的東西查不到」，而且不會報任何錯——所以
 *   scripts/validate-item-names.mjs 會拿真實資料逐筆比對兩邊的輸出。
 *
 * 同一套分片規則現在服務兩份資料，由 NameLookup 工廠產生兩個查詢器：
 *   ItemNames    data/item-names/    物品（k 依語言分：en/ja/cn/tw）
 *   ActionNames  data/action-names/  技能／狀態／特性（k 依型別分：a/s/t，各自再依語言）
 *   TermNames    data/term-names/    副本／地名／怪物／任務（k 依型別分：d/p/m/q，各自再依語言）。
 *                ⚠ 這份的值可能是**陣列**——一個英文名對到好幾個台服名時全部列出（怪物、地名常見），
 *                呼叫端要自己處理 `Array.isArray(hit.tw)`。
 *
 * 用法：
 *   const hit = await ItemNames.lookup('Iron Ingot');     // → { tw:'黑鐵錠', lang:'en' } 或 null
 *   const map = await ItemNames.lookupMany([...names]);   // → Map<原字串, 結果|null>，同片只抓一次
 *   const act = await ActionNames.lookup('Raging Strikes', { kinds: ['a'] });   // 只查技能
 */
(function () {
  'use strict';

  var SHARDS = 256;                          // 必須與 build-item-names.mjs 的常數一致
  var LANGS = ['tw', 'en', 'ja', 'cn'];      // 查詢順序：先試繁中（最可能是站內既有名稱）
  var me = document.currentScript;
  var ROOT = me ? me.src.replace(/assets\/js\/item-names\.js.*$/, '') : '/';

  var cache = {};       // 片號 → Promise<{k:{en,ja,cn,tw}}>
  var failed = {};      // 抓失敗過的片，不重試（查不到比卡住好）

  /** 正規化查詢鍵。**與 build-item-names.mjs 的同名函式必須一致。** */
  function normalizeName(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[]/g, '')                 // HQ／收藏品的私用區符號
      .replace(/\(hq\)/g, '')
      .replace(/[\s　'’\-–—·・]/g, '');
  }

  /** 字串 → 片號（FNV-1a 32 bit）。**與 build-item-names.mjs 必須一致。** */
  function shardOf(key) {
    var h = 0x811c9dc5;
    for (var i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h % SHARDS;
  }

  /* 一個查詢器＝一個資料目錄。兩份資料的片檔結構只差在 k 的形狀：
       item-names   k = { en:{}, ja:{}, cn:{}, tw:{} }
       action-names k = { a:{en,ja,cn,tw}, s:{…}, t:{…} }（多一層型別）
       用 kinds 參數統一：不給就是「整個 k 當一組語言表」，給了就依序查那幾種型別。 */
    function create(dir, defaultKinds) {
      var cache = {};       // 片號 → Promise<k>
      var failed = {};      // 抓失敗過的片，不重試（查不到比卡住好）

    function loadShard(s) {
      if (failed[s]) return Promise.resolve(null);
      if (!cache[s]) {
        cache[s] = fetch(ROOT + dir + '/' + s + '.json')
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (j) { return j.k || null; })
          .catch(function () { failed[s] = true; delete cache[s]; return null; });
      }
      return cache[s];
    }

    function pickIn(table, key, kind) {
      if (!table) return null;
      for (var i = 0; i < LANGS.length; i++) {
        var lang = LANGS[i];
        if (table[lang] && Object.prototype.hasOwnProperty.call(table[lang], key)) {
          return { tw: table[lang][key], lang: lang, kind: kind || null };
        }
      }
      return null;
    }

    function pick(k, key, kinds) {
      if (!k) return null;
      var ks = kinds || defaultKinds;
      if (!ks) return pickIn(k, key);
      for (var i = 0; i < ks.length; i++) {
        var hit = pickIn(k[ks[i]], key, ks[i]);
        if (hit) return hit;
      }
      return null;
    }

    function lookup(name, opts) {
      var key = normalizeName(name);
      if (!key) return Promise.resolve(null);
      var kinds = opts && opts.kinds;
      return loadShard(shardOf(key)).then(function (k) { return pick(k, key, kinds); });
    }

    function lookupMany(names, opts) {
      var jobs = [];
      var keys = [];
      var shards = {};
      for (var i = 0; i < names.length; i++) {
        var key = normalizeName(names[i]);
        keys.push(key);
        if (key) shards[shardOf(key)] = 1;
      }
      Object.keys(shards).forEach(function (s) { jobs.push(loadShard(Number(s))); });
      return Promise.all(jobs).then(function () {
        var out = new Map();
        var pending = [];
        for (var i = 0; i < names.length; i++) {
          (function (i) {
            var key = keys[i];
            if (!key) { out.set(names[i], null); return; }
            pending.push(loadShard(shardOf(key)).then(function (k) { out.set(names[i], pick(k, key, opts && opts.kinds)); }));
        })(i);
      }
      return Promise.all(pending).then(function () { return out; });
    });
  }

    return {
      lookup: lookup,
      lookupMany: lookupMany,
      normalizeName: normalizeName,
      shardOf: shardOf,
      SHARDS: SHARDS,
      _loaded: function () { return Object.keys(cache).map(Number); }
    };
  }

  window.NameLookup = { create: create, normalizeName: normalizeName, shardOf: shardOf, SHARDS: SHARDS };
  window.ItemNames = create('data/item-names', null);
  // 技能／狀態／特性。預設先查技能再查狀態——巨集裡 `/ac` 遠多於 `/statusoff`。
  window.ActionNames = create('data/action-names', ['a', 's', 't']);
  // 副本／地名／怪物／任務。名稱翻譯頁一次只查一種（kinds 由頁面指定），預設順序只是保底。
  window.TermNames = create('data/term-names', ['d', 'p', 'm', 'q']);
})();
