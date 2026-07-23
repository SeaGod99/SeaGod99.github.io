/* 水神的工具箱 — 收藏追蹤共用引擎（collection-tracker.js）
 *
 * 把各收藏頁共通的：資料載入＋台服版本過濾、進度條＋首頁快照、工具列
 * （搜尋／擁有切換／排序／批次標記／匯入匯出／清除）、標籤篩選、格線渲染、
 * 鍵盤與 ARIA、以及「可分享網址（URL 狀態）」全部收進單一引擎。
 * 各頁只需提供一份設定（資料位置、卡片樣板、篩選規則），呼叫：
 *
 *   CollectionTracker.init({
 *     mount: '#ct-root',                       // 控制面掛載點（預設 #ct-root）
 *     dataUrl: '../../data/mounts.json',
 *     metaUrl: '../../data/_meta.json',
 *     storageKey: 'ffxiv_mounts_owned',        // 沿用各頁既有 key（保留使用者進度）
 *     snapKey: 'mounts',                        // 首頁快照 ffxiv_snap_<snapKey>
 *     schema: 'mounts-progress',                // 匯出檔 schema（預設 <snapKey>-progress）
 *     verb: '擁有',                              // 已擁有／已解鎖／已習得 的動詞
 *     unit: '隻',                                // 結果統計單位（隻／個／張／首…）
 *     noun: '坐騎',                              // 空狀態、訊息用名詞
 *     searchPlaceholder: '搜尋坐騎名稱…',
 *     keyOf(e), include(e, gp), alwaysOwned(e), searchText(e), prepare(list),
 *     filters: [ { id, label, options(list)->[{value,label}], match(e,value) },
 *                { kind:'patch', of?:e=>e.patch } ],
 *     sorts: [ 'name', 'patch-desc', 'patch-asc', {value,label,cmp} ],
 *     card(e) -> innerHTML,
 *     onError(err)  // 選用
 *   });
 *
 * 相依：patch-gate.js（PatchGate）。需先於本檔載入。
 */
(function () {
  'use strict';

  var PATCH_BANDS = [
    { label: '2.x 原初之地',   min: '2.0', max: '2.9' },
    { label: '3.x 蒼天之禁地', min: '3.0', max: '3.9' },
    { label: '4.x 紅蓮之狂潮', min: '4.0', max: '4.9' },
    { label: '5.x 暗影之逆焰', min: '5.0', max: '5.9' },
    { label: '6.x 曉月之終途', min: '6.0', max: '6.9' },
    { label: '7.x 金曦之遺輝', min: '7.0', max: '7.9' }
  ];

  var BUILTIN_SORTS = {
    'name':       { value: 'name',       label: '依名稱' },
    'patch-desc': { value: 'patch-desc', label: '版本新→舊' },
    'patch-asc':  { value: 'patch-asc',  label: '版本舊→新' }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pv(p) { return parseFloat(p) || 0; }

  function CollectionTracker(cfg) {
    var self = this;
    this.cfg = cfg;

    // ── 設定預設值 ──
    this.mountSel = cfg.mount || '#ct-root';
    this.verb = cfg.verb || '擁有';
    this.unit = cfg.unit || '個';
    this.noun = cfg.noun || '項目';
    this.snapKey = cfg.snapKey;
    this.schema = cfg.schema || (cfg.snapKey + '-progress');
    this.fileBase = cfg.fileBase || cfg.snapKey;   // 匯出檔名 <fileBase>-progress.json
    this.storageKey = cfg.storageKey;
    // 格線與卡片的 class 可覆寫（多數頁用 .col-grid/.col-card；髮型頁用自訂橫向卡）
    this.gridClass = cfg.gridClass || 'col-grid';
    this.cardClass = cfg.cardClass || 'col-card';

    this.keyOf = cfg.keyOf || function (e) { return e.id != null ? 'id:' + e.id : 'name:' + e.name; };
    this.include = cfg.include || function (e, gp) {
      return e.name && e.name !== e.nameEn && PatchGate.released(e.patch, gp);
    };
    this.alwaysOwned = cfg.alwaysOwned || function () { return false; };
    this.searchText = cfg.searchText || function (e) {
      var parts = [e.name, e.nameEn];
      (e.sources || []).forEach(function (s) { if (s && s.detail) parts.push(s.detail); });
      return parts.filter(Boolean).join(' ').toLowerCase();
    };
    this.nameOf = cfg.nameOf || function (e) { return e.name || e.nameEn || ''; };

    // ── 狀態 ──
    this.LIST = [];
    this.owned = new Set();
    try { this.owned = new Set(JSON.parse(localStorage.getItem(this.storageKey) || '[]')); } catch (e) {}
    this.filterOwn = 'all';        // all | owned | missing
    this.filterState = {};         // filterId -> value|null
    this.searchQ = '';
    this.sortBy = 'default';

    // 正規化 filters（展開 kind:'patch'）
    this.filters = (cfg.filters || []).map(function (f) {
      if (f.kind === 'patch') {
        var of = f.of || function (e) { return e.patch; };
        return {
          id: f.id || 'patch',
          label: f.label || '版本',
          _patch: true, _of: of,
          options: function (list) {
            return PATCH_BANDS.filter(function (b) {
              return list.some(function (e) { var p = of(e); return p && p >= b.min && p <= b.max; });
            }).map(function (b) { return { value: b.label, label: b.label, _band: b }; });
          },
          match: function (e, value) {
            var b = PATCH_BANDS.filter(function (x) { return x.label === value; })[0];
            var p = of(e);
            return b ? (p && p >= b.min && p <= b.max) : true;
          }
        };
      }
      return f;
    });
    this.filters.forEach(function (f) { self.filterState[f.id] = null; self._opts = self._opts || {}; });
    this._opts = {};  // filterId -> [{value,label}]

    // 正規化 sorts
    this.sorts = (cfg.sorts || []).map(function (s) {
      if (typeof s === 'string') {
        var b = BUILTIN_SORTS[s];
        if (!b) return null;
        return b;
      }
      return s;
    }).filter(Boolean);
  }

  CollectionTracker.prototype.$ = function (id) { return this.root.querySelector('#' + id); };

  CollectionTracker.prototype.renderShell = function () {
    var host = document.querySelector(this.mountSel);
    if (!host) throw new Error('找不到掛載點 ' + this.mountSel);
    this.root = host;
    var ownLabel = '已' + this.verb, missLabel = '未' + this.verb;
    host.innerHTML =
      '<div class="progress-bar-wrap">' +
        '<div class="progress-info"><span id="ct-owned">0</span> / <span id="ct-total">0</span> <span>' + ownLabel + '</span></div>' +
        '<div class="progress-track"><div class="progress-fill" id="ct-fill" style="width:0%"></div></div>' +
        '<div class="progress-pct" id="ct-pct">0%</div>' +
      '</div>' +
      '<div class="toolbar">' +
        '<div class="search-wrap"><span class="search-icon">🔍</span>' +
          '<input class="search-input" id="ct-search" type="text" autocomplete="off" placeholder="' +
            esc(this.cfg.searchPlaceholder || ('搜尋' + this.noun + '名稱…')) + '"></div>' +
        '<div class="own-toggle" id="ct-own">' +
          '<button class="own-btn active" data-own="all">全部</button>' +
          '<button class="own-btn" data-own="owned">' + ownLabel + '</button>' +
          '<button class="own-btn" data-own="missing">' + missLabel + '</button>' +
        '</div>' +
        '<select class="sort-select" id="ct-sort" title="排序方式"></select>' +
        '<button class="icon-btn" id="ct-markAll" title="將目前篩選結果全部標記為' + ownLabel + '">✓ 標記全部</button>' +
        '<button class="icon-btn" id="ct-unmarkAll" title="取消目前篩選結果的' + ownLabel + '標記">✗ 取消全部</button>' +
        '<button class="icon-btn" id="ct-export">匯出進度</button>' +
        '<button class="icon-btn" id="ct-import">匯入進度</button>' +
        '<input type="file" id="ct-importFile" accept="application/json" style="display:none">' +
        '<button class="icon-btn clear-btn" id="ct-clear">清除進度</button>' +
      '</div>' +
      '<div id="ct-filters"></div>' +
      '<div class="result-meta" id="ct-meta"></div>' +
      '<div class="' + esc(this.gridClass) + '" id="ct-grid"></div>' +
      '<div class="empty-state" id="ct-empty" style="display:none">找不到符合條件的' + esc(this.noun) + '</div>';
  };

  CollectionTracker.prototype.buildSortOptions = function () {
    var sel = this.$('ct-sort');
    var html = '<option value="default">預設排序</option>';
    this.sorts.forEach(function (s) { html += '<option value="' + esc(s.value) + '">' + esc(s.label) + '</option>'; });
    sel.innerHTML = html;
  };

  CollectionTracker.prototype.buildFilterOptions = function () {
    var self = this;
    this.filters.forEach(function (f) {
      var opts = typeof f.options === 'function' ? f.options(self.LIST) : (f.options || []);
      self._opts[f.id] = opts || [];
    });
  };

  CollectionTracker.prototype.renderFilters = function () {
    var self = this;
    var host = this.$('ct-filters');
    host.innerHTML = '';
    this.filters.forEach(function (f) {
      var opts = self._opts[f.id] || [];
      if (!opts.length) return;
      var sec = document.createElement('div');
      sec.className = 'filter-section';
      var lab = document.createElement('div');
      lab.className = 'filter-label'; lab.textContent = f.label;
      var tags = document.createElement('div');
      tags.className = 'filter-tags';
      opts.forEach(function (o) {
        var btn = document.createElement('button');
        btn.className = 'filter-tag' + (self.filterState[f.id] === o.value ? ' active' : '');
        btn.textContent = o.label;
        btn.addEventListener('click', function () {
          self.filterState[f.id] = self.filterState[f.id] === o.value ? null : o.value;
          self.pushURL();
          self.renderFilters();
          self.renderGrid();
        });
        tags.appendChild(btn);
      });
      sec.appendChild(lab); sec.appendChild(tags);
      host.appendChild(sec);
    });
  };

  CollectionTracker.prototype.isOwned = function (e) {
    return this.alwaysOwned(e) || this.owned.has(this.keyOf(e));
  };

  CollectionTracker.prototype.save = function () {
    try { localStorage.setItem(this.storageKey, JSON.stringify([].concat(Array.from(this.owned)))); } catch (e) {}
  };

  CollectionTracker.prototype.updateProgress = function () {
    var total = this.LIST.length;
    var count = this.LIST.filter(this.isOwned.bind(this)).length;
    var pct = total ? Math.round(count / total * 100) : 0;
    this.$('ct-owned').textContent = count;
    this.$('ct-total').textContent = total;
    this.$('ct-fill').style.width = pct + '%';
    this.$('ct-pct').textContent = pct + '%';
    try { localStorage.setItem('ffxiv_snap_' + this.snapKey, JSON.stringify({ c: count, t: total })); } catch (e) {}
  };

  CollectionTracker.prototype.toggle = function (e) {
    if (this.alwaysOwned(e)) return;
    var k = this.keyOf(e);
    if (this.owned.has(k)) this.owned.delete(k); else this.owned.add(k);
    this.save();
    this.updateProgress();
    this.renderGrid();
  };

  CollectionTracker.prototype.filtered = function () {
    var self = this;
    return this.LIST.filter(function (e) {
      var own = self.isOwned(e);
      if (self.filterOwn === 'owned' && !own) return false;
      if (self.filterOwn === 'missing' && own) return false;
      for (var i = 0; i < self.filters.length; i++) {
        var f = self.filters[i], v = self.filterState[f.id];
        if (v != null && !f.match(e, v)) return false;
      }
      if (self.searchQ) {
        if (self.searchText(e).indexOf(self.searchQ) < 0) return false;
      }
      return true;
    });
  };

  CollectionTracker.prototype.sortList = function (list) {
    if (this.sortBy === 'default') return list;
    var s = this.sorts.filter(function (x) { return x.value === this.sortBy; }, this)[0];
    var arr = list.slice();
    var nameOf = this.nameOf;
    if (s && s.cmp) { arr.sort(s.cmp); return arr; }
    if (this.sortBy === 'name') arr.sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b), 'zh-Hant'); });
    else if (this.sortBy === 'patch-asc') arr.sort(function (a, b) { return pv(a.patch) - pv(b.patch); });
    else if (this.sortBy === 'patch-desc') arr.sort(function (a, b) { return pv(b.patch) - pv(a.patch); });
    return arr;
  };

  CollectionTracker.prototype.renderGrid = function () {
    var self = this;
    var list = this.sortList(this.filtered());
    var grid = this.$('ct-grid'), empty = this.$('ct-empty'), meta = this.$('ct-meta');

    if (list.length === 0) { grid.style.display = 'none'; empty.style.display = ''; }
    else { grid.style.display = ''; empty.style.display = 'none'; }

    var ownedInView = list.filter(this.isOwned.bind(this)).length;
    meta.innerHTML = '顯示 <em>' + list.length + '</em> / ' + this.LIST.length + ' ' + this.unit +
      ' · 已' + this.verb + ' <em>' + ownedInView + '</em> / ' + list.length;

    var frag = document.createDocumentFragment();
    list.forEach(function (e) {
      var owned = self.isOwned(e);
      var locked = self.alwaysOwned(e);
      var card = document.createElement('div');
      card.className = self.cardClass + (owned ? ' owned' : '') + (locked ? ' locked' : '');
      card.innerHTML = self.cfg.card(e);
      if (!locked) {
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-pressed', owned ? 'true' : 'false');
        card.addEventListener('click', function (ev) {
          // 卡片內互動元素（如幻卡的 📍 開地圖）可攔截點擊：回傳 true 即不切換擁有
          if (self.cfg.onCardClick && self.cfg.onCardClick(e, ev)) return;
          self.toggle(e);
        });
        card.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); self.toggle(e); }
        });
      }
      // 卡片建立後鉤子：讓各頁掛額外互動（如寵物頁的 hover 提示框、ⓘ 釘選）
      if (self.cfg.onCardCreate) self.cfg.onCardCreate(e, card);
      frag.appendChild(card);
    });
    grid.innerHTML = '';
    grid.appendChild(frag);
  };

  // ── 匯出／匯入 ──
  CollectionTracker.prototype.exportProgress = function () {
    var payload = { schema: this.schema, exported: new Date().toISOString(), owned: Array.from(this.owned) };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = this.fileBase + '-progress.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  CollectionTracker.prototype.importProgress = function (file) {
    var self = this;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!Array.isArray(data) && data.schema !== self.schema) {
          alert('匯入失敗：這不是「' + self.noun + '收藏」的進度檔'); return;
        }
        var list = Array.isArray(data) ? data : data.owned;
        if (!Array.isArray(list)) throw new Error('格式錯誤');
        if (self.owned.size && !confirm('匯入將以檔案內容（' + list.length + ' 筆）取代目前的 ' + self.owned.size + ' 筆記錄，確定嗎？')) return;
        self.owned = new Set(list);
        self.save(); self.updateProgress(); self.renderGrid();
        alert('匯入成功，共 ' + self.owned.size + ' 筆已' + self.verb + '記錄');
      } catch (err) { alert('匯入失敗：檔案格式不正確'); }
    };
    reader.readAsText(file);
  };

  // ── URL 狀態（可分享）──
  CollectionTracker.prototype.buildQuery = function () {
    var p = new URLSearchParams();
    if (this.searchQ) p.set('q', this.cfg._rawSearch || this.searchQ);
    if (this.filterOwn !== 'all') p.set('own', this.filterOwn);
    if (this.sortBy !== 'default') p.set('sort', this.sortBy);
    var self = this;
    this.filters.forEach(function (f) {
      if (self.filterState[f.id] != null) p.set('f_' + f.id, self.filterState[f.id]);
    });
    var s = p.toString();
    return s ? '?' + s : location.pathname;
  };
  CollectionTracker.prototype.pushURL = function () {
    try { history.pushState(null, '', this.buildQuery()); } catch (e) {}
  };
  CollectionTracker.prototype.replaceURL = function () {
    try { history.replaceState(null, '', this.buildQuery()); } catch (e) {}
  };
  CollectionTracker.prototype.applyURL = function () {
    var self = this;
    var p = new URLSearchParams(location.search);
    var q = p.get('q') || '';
    this.cfg._rawSearch = q;
    this.searchQ = q.trim().toLowerCase();
    this.filterOwn = p.get('own') === 'owned' || p.get('own') === 'missing' ? p.get('own') : 'all';
    var sort = p.get('sort');
    this.sortBy = (sort && (sort === 'default' || this.sorts.some(function (s) { return s.value === sort; }))) ? sort : 'default';
    this.filters.forEach(function (f) {
      var v = p.get('f_' + f.id);
      // 僅接受確實存在於選項中的值
      var ok = v != null && (self._opts[f.id] || []).some(function (o) { return o.value === v; });
      self.filterState[f.id] = ok ? v : null;
    });
    // 同步 UI 控件
    var si = this.$('ct-search'); if (si) si.value = q;
    var ss = this.$('ct-sort'); if (ss) ss.value = this.sortBy;
    Array.prototype.forEach.call(this.root.querySelectorAll('#ct-own .own-btn'), function (b) {
      b.classList.toggle('active', b.dataset.own === self.filterOwn);
    });
  };

  // ── 事件綁定 ──
  CollectionTracker.prototype.wire = function () {
    var self = this;
    Array.prototype.forEach.call(this.root.querySelectorAll('#ct-own .own-btn'), function (btn) {
      btn.addEventListener('click', function () {
        self.filterOwn = btn.dataset.own;
        Array.prototype.forEach.call(self.root.querySelectorAll('#ct-own .own-btn'), function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.pushURL();
        self.renderGrid();
      });
    });
    this.$('ct-search').addEventListener('input', function (e) {
      self.cfg._rawSearch = e.target.value;
      self.searchQ = e.target.value.trim().toLowerCase();
      self.replaceURL();     // 打字用 replace，避免灌爆歷史
      self.renderGrid();
    });
    this.$('ct-sort').addEventListener('change', function (e) {
      self.sortBy = e.target.value;
      self.pushURL();
      self.renderGrid();
    });
    this.$('ct-export').addEventListener('click', function () { self.exportProgress(); });
    this.$('ct-import').addEventListener('click', function () { self.$('ct-importFile').click(); });
    this.$('ct-importFile').addEventListener('change', function (e) {
      var file = e.target.files[0]; if (file) self.importProgress(file); e.target.value = '';
    });
    this.$('ct-clear').addEventListener('click', function () {
      if (!self.owned.size) { alert('目前沒有已' + self.verb + '記錄'); return; }
      if (!confirm('確定要清除全部 ' + self.owned.size + ' 筆' + self.verb + '記錄嗎？\n將先自動下載一份備份檔以防誤刪。')) return;
      self.exportProgress();
      self.owned.clear(); self.save(); self.updateProgress(); self.renderGrid();
    });
    this.$('ct-markAll').addEventListener('click', function () {
      var toAdd = self.filtered().filter(function (e) { return !self.isOwned(e); });
      if (!toAdd.length) { alert('目前篩選結果都已標記'); return; }
      if (!confirm('將目前篩選結果中未標記的 ' + toAdd.length + ' 筆標記為已' + self.verb + '？')) return;
      toAdd.forEach(function (e) { if (!self.alwaysOwned(e)) self.owned.add(self.keyOf(e)); });
      self.save(); self.updateProgress(); self.renderGrid();
    });
    this.$('ct-unmarkAll').addEventListener('click', function () {
      var toDel = self.filtered().filter(function (e) { return self.owned.has(self.keyOf(e)); });
      if (!toDel.length) { alert('目前篩選結果沒有可取消的標記'); return; }
      if (!confirm('取消目前篩選結果中 ' + toDel.length + ' 筆的已' + self.verb + '標記？')) return;
      toDel.forEach(function (e) { self.owned.delete(self.keyOf(e)); });
      self.save(); self.updateProgress(); self.renderGrid();
    });
    window.addEventListener('popstate', function () {
      self.applyURL(); self.renderFilters(); self.renderGrid();
    });
  };

  CollectionTracker.prototype.start = function () {
    var self = this;
    this.renderShell();
    this.buildSortOptions();
    this.wire();
    fetch(this.cfg.dataUrl)
      .then(function (res) { if (!res.ok) throw new Error('無法載入資料 (' + res.status + ')'); return res.json(); })
      .then(function (json) {
        var raw = (json && json.data) ? json.data : (Array.isArray(json) ? json : []);
        return PatchGate.loadGamePatch(self.cfg.metaUrl).then(function (gp) {
          self.LIST = raw.filter(function (e) { return self.include(e, gp); });
          if (self.cfg.prepare) self.LIST = self.cfg.prepare(self.LIST) || self.LIST;
          self.buildFilterOptions();
          self.applyURL();          // 依網址還原狀態（需在選項建好後）
          self.renderFilters();
          self.updateProgress();
          self.renderGrid();
        });
      })
      .catch(function (err) {
        var empty = self.$('ct-empty'), grid = self.$('ct-grid');
        if (grid) grid.style.display = 'none';
        if (empty) { empty.style.display = ''; empty.textContent = '資料載入失敗：' + err.message; }
        if (self.cfg.onError) self.cfg.onError(err);
      });
    return this;
  };

  window.CollectionTracker = {
    init: function (cfg) { return new CollectionTracker(cfg).start(); },
    PATCH_BANDS: PATCH_BANDS,
    esc: esc
  };
})();
