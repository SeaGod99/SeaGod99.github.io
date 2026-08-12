/* 園藝配種計算 — 頁面邏輯
 *
 * 這頁回答的問題只有一個：「我想要 X，到底要做什麼、要多久。」
 *
 * 為什麼要算，不只是查表（2026-08-12 重做）：
 *  ① 配種收到的是**種子**，不是作物——本株田仍然長本株自己的東西，只是收成時額外掉出
 *     目標種子，**還要再種一輪**才有目標作物。舊版只印一個 `240h`，實際上薩維奈圓蔥要 480h。
 *  ② 父本自己往往也是配種產物（薩維奈圓蔥的兩個父本都只能配），一層配方等於沒回答問題。
 *  ③ 同一個目標有多組配方，成本差很多（薩維奈圓蔥的三組是 264 / 264 / 240 小時），
 *     要挑最省的那組，不是隨便列出來讓人自己算。
 *
 * 成本模型：cost(種子) = 0 若能直接買／採；否則
 *           min over 配方 of  max(cost(本株), cost(鄰株)) + 本株作物的培育時數。
 * 用**定點迭代**求解而不是遞迴 memo——配種關係有環（血椒↔魔蕨菜那一區），
 * 遞迴會把環上的 Infinity 記進 memo，結果整條鏈都變成無解。
 *
 * 「直接可得」只認 NPC 商店／採集／任務等固定管道，**不認市場板**：市場板對每個種子都成立，
 * 認了它整棵樹會縮成一層，等於沒算。市場板另外標在節點上當捷徑提示。
 */
(function () {
  'use strict';

  var DATA_URL = '../../data/gardening.json';
  var META_URL = '../../data/_meta.json';
  var ICON_BASE = 'https://xivapi.com/i/';

  var DB = null;          // 完整信封（含 rules）
  var ROWS = [];          // 已過版本閘門的作物
  var BY_SEED = new Map();
  var BY_PRODUCT = new Map();
  var COST = new Map();   // 種子 id → 取得該種子的最短時數（0＝可直接取得）
  var BEST = new Map();   // 種子 id → 最省的配方 index
  var OVERRIDE = new Map(); // 使用者手動挑的配方：種子 id → 配方 index
  var STATE = { tab: 'plan', target: null, species: null, kind: 'all', q: '', sort: 'name' };

  // ── 小工具 ────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(path, cls) {
    if (!path) return '<span class="ico ' + (cls || '') + '" aria-hidden="true"></span>';
    return '<img class="ico ' + (cls || '') + '" src="' + ICON_BASE + esc(String(path).replace(/^\/i\//, '')) +
           '" alt="" loading="lazy" width="28" height="28">';
  }
  function $(id) { return document.getElementById(id); }

  /** 小時 → 「20 天」「3 天 12 小時」「18 小時」 */
  function dur(h) {
    if (!isFinite(h)) return '—';
    if (h <= 0) return '0 小時';
    var d = Math.floor(h / 24), r = h % 24;
    if (!d) return r + ' 小時';
    return d + ' 天' + (r ? ' ' + r + ' 小時' : '');
  }
  /** 起始時刻 + N 小時 → 「8/31（日）14:00」。全站一律 24 小時制。 */
  function at(startMs, h) {
    if (!startMs || !isFinite(h)) return '';
    var d = new Date(startMs + h * 3600000);
    var wd = '日一二三四五六'[d.getDay()];
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + wd + '）' +
           String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function startMs() {
    var v = $('startAt').value;
    var t = v ? new Date(v).getTime() : NaN;
    return isNaN(t) ? null : t;
  }

  // ── 載入 ──────────────────────────────────────────────────────────────
  Promise.all([
    fetch(DATA_URL).then(function (r) { return r.json(); }),
    window.PatchGate ? PatchGate.loadGamePatch(META_URL) : Promise.resolve(null)
  ]).then(function (res) {
    DB = res[0];
    var gp = res[1];
    // 沒有台服名（`#12345` 佔位）或版本尚未開放 → 台服拿不到，直接不顯示。
    ROWS = (DB.data || []).filter(function (p) {
      if (!p.name || /^#\d+$/.test(p.name)) return false;
      return !window.PatchGate || PatchGate.released(p.patch, gp);
    });
    ROWS.forEach(function (p) { BY_SEED.set(p.seedId, p); BY_PRODUCT.set(p.productId, p); });
    solveCosts();
    initTabs();
    initPlan();
    initFlower();
    initAll();
    renderRules();
    applyHash();
  }).catch(function (e) {
    $('planResult').innerHTML = '<p class="empty">資料載入失敗，請重新整理。<br><small>' + esc(e.message) + '</small></p>';
  });

  /** 種子能不能不靠配種就拿到（NPC／採集／任務…；市場板不算，見檔頭）。 */
  function directOK(seedId) {
    var p = BY_SEED.get(seedId);
    return !p || (p.seed && p.seed.sources && p.seed.sources.length > 0);
  }

  /** 定點迭代求每個種子的最短取得時數與最省配方。 */
  function solveCosts() {
    ROWS.forEach(function (p) { COST.set(p.seedId, directOK(p.seedId) ? 0 : Infinity); });
    for (var pass = 0; pass < ROWS.length; pass++) {
      var changed = false;
      ROWS.forEach(function (p) {
        if (directOK(p.seedId)) return;
        p.crossBreeds.forEach(function (c, i) {
          var baseCrop = BY_SEED.get(c.baseSeedId);
          if (!baseCrop) return;
          var cb = COST.has(c.baseSeedId) ? COST.get(c.baseSeedId) : 0;
          var ca = COST.has(c.adjacentSeedId) ? COST.get(c.adjacentSeedId) : 0;
          var h = Math.max(cb, ca) + baseCrop.duration;
          if (h < (COST.has(p.seedId) ? COST.get(p.seedId) : Infinity)) {
            COST.set(p.seedId, h); BEST.set(p.seedId, i); changed = true;
          }
        });
      });
      if (!changed) break;
    }
  }

  /** 這個作物從零開始到收成的總時數（拿到種子 + 培育）。 */
  function totalEffort(p) {
    var c = COST.has(p.seedId) ? COST.get(p.seedId) : 0;
    return c + p.duration;
  }

  // ── 頁籤 ──────────────────────────────────────────────────────────────
  function initTabs() {
    var btns = Array.prototype.slice.call(document.querySelectorAll('.tab-btn'));
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { showTab(b.dataset.tab); });
      // ARIA APG 的頁籤鍵盤行為：左右鍵移動、Home/End 跳頭尾
      b.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = btns[(i + 1) % btns.length];
        else if (e.key === 'ArrowLeft') n = btns[(i - 1 + btns.length) % btns.length];
        else if (e.key === 'Home') n = btns[0];
        else if (e.key === 'End') n = btns[btns.length - 1];
        if (!n) return;
        e.preventDefault(); n.focus(); showTab(n.dataset.tab);
      });
    });
    window.addEventListener('hashchange', applyHash);
  }

  function showTab(tab, skipHash) {
    STATE.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.hidden = p.id !== 'p-' + tab;
    });
    if (!skipHash) writeHash();
  }

  /* 深層連結：#/plan/8166、#/flower/21876、#/rules，
     以及 #/all?kind=flower&q=鬱&sort=duration——「全部作物」的篩選／搜尋／排序也要能分享與重整，
     否則調了半天的條件一重整就沒了（其他三個檢視都有，就它沒有）。 */
  function writeHash() {
    var h = '#/' + STATE.tab;
    if (STATE.tab === 'plan' && STATE.target) h += '/' + STATE.target;
    if (STATE.tab === 'flower' && STATE.species) h += '/' + STATE.species;
    if (STATE.tab === 'all') {
      var qs = [];
      if (STATE.kind !== 'all') qs.push('kind=' + STATE.kind);
      if (STATE.q) qs.push('q=' + encodeURIComponent(STATE.q));
      if (STATE.sort !== 'name') qs.push('sort=' + STATE.sort);
      if (qs.length) h += '?' + qs.join('&');
    }
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function applyHash() {
    var raw = location.hash || '';
    var m = raw.match(/^#\/(plan|flower|all|rules)(?:\/(\d+))?/);
    if (!m) { showTab('plan', true); return; }
    showTab(m[1], true);
    if (m[1] === 'plan' && m[2]) selectTarget(Number(m[2]), true);
    if (m[1] === 'flower' && m[2]) selectSpecies(Number(m[2]), true);
    if (m[1] === 'all') {
      var qi = raw.indexOf('?');
      var params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
      STATE.kind = params.get('kind') || 'all';
      STATE.q = (params.get('q') || '').toLowerCase();
      STATE.sort = params.get('sort') || 'name';
      var si = $('allSearch'), so = $('allSort');
      if (si) si.value = params.get('q') || '';
      if (so) so.value = STATE.sort;
      document.querySelectorAll('#allFilters [data-kind]').forEach(function (x) {
        x.setAttribute('aria-pressed', x.dataset.kind === STATE.kind ? 'true' : 'false');
      });
      renderAll();
    }
  }

  // ── 配種路徑 ──────────────────────────────────────────────────────────
  function initPlan() {
    var now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    $('startAt').value = now.toISOString().slice(0, 16);
    $('startAt').addEventListener('change', function () { if (STATE.target) renderPlan(); });

    $('planList').innerHTML = ROWS.slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-TW'); })
      .map(function (p) { return '<option value="' + esc(p.name) + '"></option>'; }).join('');

    var input = $('planTarget');
    input.addEventListener('input', function () {
      var hit = ROWS.filter(function (p) { return p.name === input.value; })[0];
      if (hit) selectTarget(hit.productId);
    });

    /* 捷徑：真正需要配種、而且最花時間的幾個——會來查這頁的十之八九就是為了它們。 */
    var hot = ROWS.filter(function (p) { return p.seed.crossOnly && p.crossBreeds.length; })
      .sort(function (a, b) { return totalEffort(b) - totalEffort(a); }).slice(0, 6);
    $('planQuick').innerHTML = '<span class="note" style="align-self:center">最花時間的目標：</span>' +
      hot.map(function (p) {
        return '<button class="quick-btn" type="button" data-id="' + p.productId + '">' +
               icon(p.icon, 'sm') + esc(p.name) + ' <span class="num">' + Math.round(totalEffort(p) / 24) + ' 天</span></button>';
      }).join('');
    $('planQuick').addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (b) selectTarget(Number(b.dataset.id));
    });

    $('planResult').addEventListener('click', function (e) {
      var alt = e.target.closest('[data-alt-seed]');
      if (alt) {
        OVERRIDE.set(Number(alt.dataset.altSeed), Number(alt.dataset.altIdx));
        renderPlan();
        return;
      }
      var jump = e.target.closest('[data-goto]');
      if (jump) { selectTarget(Number(jump.dataset.goto)); return; }
      var fl = e.target.closest('[data-flower]');
      if (fl) { selectSpecies(Number(fl.dataset.flower)); return; }
      var cp = e.target.closest('[data-copy]');
      if (cp) copyText(cp, cp.dataset.copy);
    });
  }

  /** 複製台服官方繁中名——貼進遊戲內搜尋、市場板或跟朋友講話時直接用。 */
  function copyText(btn, text) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = '已複製 ✓';
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    }
  }

  function selectTarget(productId, skipHash) {
    var p = BY_PRODUCT.get(productId);
    if (!p) return;
    STATE.target = productId;
    OVERRIDE.clear();
    $('planTarget').value = p.name;
    showTab('plan', true);
    renderPlan();
    if (!skipHash) writeHash();
  }

  /** 依目前的（可覆寫的）配方選擇，展開整棵配種樹。 */
  function buildNode(seedId, seen) {
    var p = BY_SEED.get(seedId);
    if (!p) return { kind: 'outside', seedId: seedId };
    if (directOK(seedId)) return { kind: 'direct', seedId: seedId, p: p };
    if (!p.crossBreeds.length) return { kind: 'market', seedId: seedId, p: p };
    if (seen.has(seedId)) return { kind: 'market', seedId: seedId, p: p, looped: true };

    var idx = OVERRIDE.has(seedId) ? OVERRIDE.get(seedId) : (BEST.has(seedId) ? BEST.get(seedId) : 0);
    if (!p.crossBreeds[idx]) idx = 0;
    var c = p.crossBreeds[idx];
    var next = new Set(seen); next.add(seedId);
    var baseCrop = BY_SEED.get(c.baseSeedId);
    return {
      kind: 'cross', seedId: seedId, p: p, recipe: c, idx: idx,
      base: buildNode(c.baseSeedId, next),
      adj: buildNode(c.adjacentSeedId, next),
      baseCrop: baseCrop,
      wait: baseCrop ? baseCrop.duration : 0
    };
  }

  /** 在樹上標出每一步的起訖時數；回傳「這顆種子到手」的時刻。 */
  function schedule(node) {
    if (node.kind !== 'cross') return 0;
    var s = Math.max(schedule(node.base), schedule(node.adj));
    node.start = s;
    node.end = s + node.wait;
    return node.end;
  }
  function collect(node, out) {
    if (node.kind !== 'cross') return out;
    collect(node.base, out); collect(node.adj, out);
    out.push(node);
    return out;
  }

  /** 同時被佔用的最大格數。每個配種步驟從 start 到 end 佔 2 格（本株＋鄰株）。 */
  function peakBeds(steps) {
    var ev = [];
    steps.forEach(function (s) { ev.push([s.start, 2], [s.end, -2]); });
    ev.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cur = 0, max = 0;
    ev.forEach(function (e) { cur += e[1]; if (cur > max) max = cur; });
    return max;
  }

  function seedRef(p, role) {
    var name = p.p ? p.p.seedName : ('#' + p.seedId);
    var ic = p.p ? p.p.seedIcon : null;
    return '<span class="seed-ref ' + (role || '') + '">' + icon(ic, 'sm') + esc(name) + '</span>';
  }

  function sourceChips(node) {
    if (node.kind === 'direct') {
      return node.p.seed.sources.slice(0, 2).map(function (s) {
        // NPC 地點另起一顆籌碼——併進同一顆會變成一條很長的不斷行字串
        return '<span class="chip ok">✓ ' + esc(s.text) + '</span>' +
               (s.npc ? '<span class="chip">' + esc(s.npc) + '</span>' : '');
      }).join('');
    }
    if (node.kind === 'market') {
      return '<span class="chip warn">只能市場板購買或配種</span>';
    }
    return '';
  }

  /** 這個作物到底拿來幹嘛。全部由資料推導，只有陸行鳥那兩條是註記（出處見 docs/gardening-rules.md）。 */
  function usesBlock(p) {
    var rows = [];
    if (p.minion) {
      rows.push('<div class="use-row"><span class="use-tag">寵物</span><span>' +
        '收成後可登錄成寵物「' + esc(p.name) + '」' +
        (p.minion.gardeningOnly ? '，<b>只有園藝這條路</b>' : '') +
        '　<a href="../../minions/">到寵物圖鑑看 →</a></span></div>');
    }
    if (p.useNote) rows.push('<div class="use-row"><span class="use-tag">用途</span><span>' + esc(p.useNote) + '</span></div>');
    if (p.usedIn) {
      rows.push('<div class="use-row"><span class="use-tag">製作素材</span><span>' +
        '<b class="num">' + p.usedIn.count + '</b> 個配方會用到，例如 ' +
        p.usedIn.top.map(function (x) { return esc(x.name); }).join('、') + '…</span></div>');
    }
    if (p.parentOf) {
      var names = p.parentOf.map(function (id) { return BY_PRODUCT.get(id); }).filter(Boolean);
      if (names.length) {
        rows.push('<div class="use-row"><span class="use-tag">配種父本</span><span>' +
          '它的種子是 <b class="num">' + names.length + '</b> 種作物的父本，例如 ' +
          names.slice(0, 4).map(function (x) {
            return '<button type="button" class="plant-link" style="min-height:auto" data-goto="' + x.productId + '">' + esc(x.name) + '</button>';
          }).join('、') + '</span></div>');
      }
    }
    if (p.flower) {
      rows.push('<div class="use-row"><span class="use-tag">花卉</span><span>共 9 個顏色，' +
        '<button type="button" class="plant-link" style="min-height:auto" data-flower="' + p.productId + '">看油粕配方 →</button></span></div>');
    }
    if (!rows.length) return '';
    return '<h2>拿來幹嘛</h2><div class="card"><div class="use-list">' + rows.join('') + '</div></div>';
  }

  /** 收成物自己就買得到／採得到 → 先講，不然使用者白種好幾天。 */
  function shortcutBlock(p) {
    if (!p.productSources) return '';
    return '<div class="card" style="margin-top:0.5rem"><div class="step-line">' +
      '⚡ <b>' + esc(p.name) + '</b> 本身就能直接取得，只是要「量產」或「順便拿種子」才需要種：</div>' +
      '<div class="step-meta">' + p.productSources.map(function (s) {
        return '<span class="chip ok">' + esc(s.text) + '</span>' + (s.npc ? '<span class="chip">' + esc(s.npc) + '</span>' : '');
      }).join('') + '</div></div>';
  }

  function renderPlan() {
    var p = BY_PRODUCT.get(STATE.target);
    if (!p) return;
    var t0 = startMs();
    var html = '';

    // 目標卡。標題用 h2（曾經是 h3，害整頁的標題階層變成 1→3 跳級）
    html += '<h2>目標</h2>' +
      '<div class="card" style="display:flex;gap:0.75rem;align-items:flex-start">' +
      icon(p.icon, 'lg') +
      '<div style="flex:1;min-width:0">' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<div class="plant-meta">' +
          '<span class="chip">種子：' + esc(p.seedName) + '</span>' +
          '<span class="chip">培育 <span class="num">' + p.duration + '</span> 小時</span>' +
          (p.minion ? '<span class="chip gold">寵物</span>' : '') +
          (p.flower ? '<span class="chip gold">花卉 · 9 色</span>' : '') +
          '<button type="button" class="copy-btn" data-copy="' + esc(p.name) + '">複製名稱</button>' +
        '</div>' +
      '</div></div>' +
      shortcutBlock(p) +
      usesBlock(p);

    if (directOK(p.seedId)) {
      // 不必配種：這是最重要的省時提示，放在最前面而不是埋在樹裡
      html += '<h2>不必配種</h2>' +
        '<div class="card"><div class="step-line">' +
          '這個種子可以直接取得，買回來種下去就好。' +
        '</div><div class="step-meta">' + sourceChips({ kind: 'direct', p: p }) + '</div>' +
        '<div class="note" style="margin-top:0.5rem">種下後等 <b class="num">' + p.duration + '</b> 小時' +
        (t0 ? '，約 <b>' + at(t0, p.duration) + '</b>' : '') + ' 可收成。</div></div>';
      if (p.crossBreeds.length) {
        html += '<details class="alts" style="margin-top:0.75rem"><summary>它也配得出來（' + p.crossBreeds.length + ' 組配方）</summary>' +
          '<ul class="alt-list">' + p.crossBreeds.map(function (c) {
            return '<li class="alt-btn" style="cursor:default">' + recipeBody(c) + '</li>';
          }).join('') + '</ul></details>';
      }
      // 種子直接買得到，也就沒有多段培育——照料時程只有這一段
      html += careBlock([], 0, p, t0);
      setHTML('planResult', html);
      say('planStatus', p.name + '：不必配種，種子可直接取得，培育 ' + dur(p.duration) +
        (t0 ? '，預計 ' + at(t0, p.duration) + ' 收成' : ''));
      return;
    }

    var root = buildNode(p.seedId, new Set());
    var seedReady = schedule(root);
    var steps = collect(root, []);
    var total = seedReady + p.duration;

    if (!steps.length) {
      html += '<h2>沒有已知配方</h2><div class="card"><p class="note">' +
        '這個種子在資料裡沒有任何配種組合，只能到市場板購買。</p></div>';
      setHTML('planResult', html);
      say('planStatus', p.name + '：沒有已知配種組合，種子只能到市場板購買。');
      return;
    }

    // 摘要
    html += '<h2>總覽</h2><dl class="summary">' +
      '<div><dt>總工期</dt><dd class="hl num">' + dur(total) + '</dd></div>' +
      '<div><dt>其中「湊出種子」</dt><dd class="num">' + dur(seedReady) + '</dd></div>' +
      '<div><dt>配種步驟</dt><dd class="num">' + steps.length + ' 步</dd></div>' +
      '<div><dt>至少需要</dt><dd class="num">' + peakBeds(steps) + ' 格 <small>同時佔用</small></dd></div>' +
      (t0 ? '<div><dt>預計收成</dt><dd style="font-size:0.95rem">' + at(t0, total) + '</dd></div>' : '') +
      '</dl>' +
      '<p class="note" style="margin-top:0.6rem">配種一律鋪 <b>' + esc(DB.rules.soils[0].grades[2].name) +
      '</b>（' + esc(DB.rules.soils[0].effect) + '）。同一階段的步驟可以並行，時間不疊加。</p>';

    // 步驟（依可開始的時間分階段；同階段可並行）
    html += '<h2>步驟</h2>';
    var stages = [];
    steps.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (s) {
      var last = stages[stages.length - 1];
      if (last && last.start === s.start) last.items.push(s);
      else stages.push({ start: s.start, items: [s] });
    });

    stages.forEach(function (st, i) {
      html += '<div class="stage"><div class="stage-head">' +
        '<span class="stage-no">第 ' + (i + 1) + ' 階段</span>' +
        '<span class="stage-time num">' + (st.start ? '從第 ' + dur(st.start) + ' 起' : '立刻開始') +
        (t0 ? ' · ' + at(t0, st.start) : '') + '</span>' +
        (st.items.length > 1 ? '<span class="chip">' + st.items.length + ' 步可並行</span>' : '') +
        '</div>';
      st.items.forEach(function (s) { html += stepCard(s, t0); });
      html += '</div>';
    });

    // 最後一步：把配到的種子種下去
    html += '<div class="stage"><div class="stage-head">' +
      '<span class="stage-no">最後一步</span>' +
      '<span class="stage-time num">從第 ' + dur(seedReady) + ' 起' + (t0 ? ' · ' + at(t0, seedReady) : '') + '</span></div>' +
      '<div class="step">' + icon(p.icon) + '<div class="step-body"><div class="step-line">' +
        '種下 ' + seedRef({ p: p }, 'base') + '<span class="arrow">→</span>等 <b class="num">' + p.duration +
        '</b> 小時 <span class="arrow">→</span>收成 <b>' + esc(p.name) + '</b>' +
      '</div><div class="step-meta">' +
        '<span class="chip ok">完成 · 第 ' + dur(total) + '</span>' +
        (t0 ? '<span class="chip">' + at(t0, total) + '</span>' : '') +
      '</div></div></div></div>';

    // 照料時程：48 小時沒照料就枯萎、再 24 小時枯死。使用者真正要的不是規則，是「幾點以前要回來」。
    html += careBlock(steps, seedReady, p, t0);

    // 需要先備齊的可直接取得種子
    var leaves = [];
    (function walk(n) {
      if (n.kind === 'cross') { walk(n.base); walk(n.adj); return; }
      if (n.p && !leaves.some(function (x) { return x.seedId === n.seedId; })) leaves.push(n);
    })(root);
    if (leaves.length) {
      html += '<h2>先去備齊這些種子</h2><div class="plant-grid">' +
        leaves.map(function (n) {
          return '<div class="plant-card">' + icon(n.p.seedIcon) + '<div style="flex:1;min-width:0">' +
            '<div class="plant-name">' + esc(n.p.seedName) + '</div>' +
            '<div class="plant-meta">' + (sourceChips(n) || '<span class="chip">市場板</span>') + '</div>' +
            '</div></div>';
        }).join('') + '</div>';
    }

    setHTML('planResult', html);
    say('planStatus', p.name + '：總工期 ' + dur(total) + '，' + steps.length + ' 個配種步驟，至少需要 ' +
      peakBeds(steps) + ' 格園圃' + (t0 ? '，預計 ' + at(t0, total) + ' 收成' : ''));
  }

  /* ── 照料時程 ──────────────────────────────────────────────────────────
     規則在 rules.care：多數作物 48h 沒照料會枯萎、再 24h 枯死；可收成後就不會枯死。
     所以每一段「種下 → 收成」中間，每 48 小時要回來一次。這裡把時刻直接算出來。 */
  function careBlock(steps, seedReady, product, t0) {
    var W = DB.rules.care.wiltHours;
    var jobs = steps.map(function (s) { return { at: s.start, till: s.end, what: s.p.crossBreeds[s.idx] ? s.baseCrop.name : s.p.name }; });
    jobs.push({ at: seedReady, till: seedReady + product.duration, what: product.name });

    var marks = [];
    jobs.forEach(function (j) {
      for (var h = j.at + W; h < j.till; h += W) marks.push({ h: h, what: j.what });
    });
    if (!marks.length) {
      return '<h2>照料時程</h2><div class="card"><p class="note">' +
        '每一段的培育時間都不到 <b class="num">' + W + '</b> 小時，種下去之後不必回來照料就能直接收。</p></div>';
    }
    marks.sort(function (a, b) { return a.h - b.h; });
    // 同一個時間點要顧的併成一列
    var groups = [];
    marks.forEach(function (m) {
      var last = groups[groups.length - 1];
      if (last && last.h === m.h) last.what.push(m.what);
      else groups.push({ h: m.h, what: [m.what] });
    });

    return '<h2>照料時程</h2><div class="card">' +
      '<p class="note">作物 <b class="num">' + W + '</b> 小時沒照料就枯萎、再 <b class="num">' +
      DB.rules.care.witherHours + '</b> 小時枯死。以下是<b>最晚</b>要回來的時間點（提早照料只會更安全，' +
      '長到可收成之後就不會再枯死）。</p>' +
      '<div class="care-list">' + groups.map(function (g) {
        return '<div class="care-row"><span class="care-when num">' +
          (t0 ? at(t0, g.h) : '第 ' + dur(g.h)) + '</span>' +
          '<span class="care-what">照料 ' + [...new Set(g.what)].map(esc).join('、') +
          (t0 ? '（第 ' + dur(g.h) + '）' : '') + '</span></div>';
      }).join('') + '</div></div>';
  }

  /* ── A5：重繪會把展開的 <details> 關掉 ─────────────────────────────────
     換配方會整塊重畫，剛展開的「換一組配方」跟著收合，想比下一組要再點一次。
     用 data-alts-key 記住哪些是開的，畫完再還原。 */
  function setHTML(id, html) {
    var el = $(id);
    var open = {};
    el.querySelectorAll('details.alts[open][data-alts-key]').forEach(function (d) { open[d.dataset.altsKey] = 1; });
    el.innerHTML = html;
    el.querySelectorAll('details.alts[data-alts-key]').forEach(function (d) {
      if (open[d.dataset.altsKey]) d.open = true;
    });
  }

  /** 更新只給讀屏聽的即時播報。 */
  function say(id, text) { var el = $(id); if (el) el.textContent = text; }

  function recipeBody(c) {
    var also = c.alsoYields && c.alsoYields.length
      ? '<span class="chip warn">也可能配出 ' + c.alsoYields.map(function (a) { return esc(a.name); }).join('、') + '</span>' : '';
    return '<span class="role">本株</span>' + esc(c.baseSeedName) +
           '<span class="arrow">×</span><span class="role">鄰株</span>' + esc(c.adjacentSeedName) + also;
  }
  /** 可點的配方列。目前採用的那組標 aria-pressed="true"（不是只靠顏色）。 */
  function recipeButton(c, active, seedId, idx) {
    return '<button type="button" class="alt-btn" data-alt-seed="' + seedId + '" data-alt-idx="' + idx +
      '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
      (active ? '<span class="chip ok">目前採用</span>' : '') + recipeBody(c) + '</button>';
  }

  function stepCard(s, t0) {
    var c = s.recipe;
    var also = c.alsoYields && c.alsoYields.length
      ? '<span class="chip warn">⚠ 這組也可能配出 ' + c.alsoYields.map(function (a) { return esc(a.name); }).join('、') + '（隨機）</span>'
      : '';
    var alts = s.p.crossBreeds.length > 1
      ? '<details class="alts" data-alts-key="' + s.seedId + '"><summary>換一組配方（共 ' +
        s.p.crossBreeds.length + ' 組）</summary><div class="alt-list">' +
        s.p.crossBreeds.map(function (cc, i) { return recipeButton(cc, i === s.idx, s.seedId, i); }).join('') +
        '</div></details>' : '';

    return '<div class="step">' + icon(s.p.seedIcon) + '<div class="step-body">' +
      '<div class="step-line">' +
        '先種 ' + seedRef(s.adj, 'adj') + '<span class="role">（鄰株）</span>' +
        '，旁邊種 ' + seedRef(s.base, 'base') + '<span class="role">（本株）</span>' +
        '<span class="arrow">→</span>等 <b class="num">' + s.wait + '</b> 小時' +
        '<span class="arrow">→</span>收成 ' + esc(s.baseCrop ? s.baseCrop.name : '') +
        ' 時得到 <b>' + esc(s.p.seedName) + '</b>' +
      '</div>' +
      '<div class="step-meta">' +
        '<span class="chip">第 ' + dur(s.end) + '</span>' +
        (t0 ? '<span class="chip">' + at(t0, s.end) + '</span>' : '') +
        also +
      '</div>' + alts +
      '</div></div>';
  }

  // ── 花色配方 ──────────────────────────────────────────────────────────
  function initFlower() {
    var pom = DB.rules.pomace;
    $('flowerIntro').innerHTML =
      '花的顏色<strong>不是配種、也不是土壤決定的，是施油粕染色</strong>。' +
      '每現實小時只能施一次，只對<strong>未成熟</strong>的花有效，' +
      '<strong>與施放順序無關</strong>；花自己的原色在染色過程中視為無色。' +
      '三色全施完可以再開下一輪。';

    var flowers = ROWS.filter(function (p) { return p.flower; })
      .sort(function (a, b) { return a.flower.species.localeCompare(b.flower.species, 'zh-TW'); });
    $('speciesGrid').innerHTML = flowers.map(function (p) {
      return '<button type="button" class="species-btn" data-id="' + p.productId + '" aria-pressed="false">' +
        icon(p.icon) + '<span>' + esc(p.flower.species) + '</span></button>';
    }).join('');
    $('speciesGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (b) selectSpecies(Number(b.dataset.id));
    });
    $('flowerResult').addEventListener('click', function (e) {
      var cp = e.target.closest('[data-copy]');
      if (cp) copyText(cp, cp.dataset.copy);
    });
    if (flowers.length) $('flowerResult').innerHTML = '<p class="empty">選一種花，看它 9 個顏色各要施哪些油粕。</p>';
  }

  function selectSpecies(productId, skipHash) {
    var p = BY_PRODUCT.get(productId);
    if (!p || !p.flower) return;
    STATE.species = productId;
    showTab('flower', true);
    document.querySelectorAll('#speciesGrid [data-id]').forEach(function (b) {
      b.setAttribute('aria-pressed', Number(b.dataset.id) === productId ? 'true' : 'false');
    });
    renderFlower(p);
    if (!skipHash) writeHash();
  }

  function pomChip(key) {
    var pm = DB.rules.pomace.filter(function (x) { return x.key === key; })[0];
    if (!pm) return '';
    return '<span class="pom"><i style="background:' + esc(pm.hex) + '"></i>' + esc(pm.name) + '</span>';
  }

  function renderFlower(p) {
    var f = p.flower;
    // 種子哪裡買、油粕哪裡買——查得到配方卻不知道去哪拿材料，等於還是要再查一次
    var seedSrc = p.seed.sources.length
      ? p.seed.sources.map(function (s) {
          return '<span class="chip ok">' + esc(s.text) + '</span>' + (s.npc ? '<span class="chip">' + esc(s.npc) + '</span>' : '');
        }).join('')
      : '<span class="chip warn">只能市場板購買</span>';

    var html = '<h2>' + esc(f.species) + ' — 9 色配方</h2>' +
      '<div class="card" style="margin-bottom:0.7rem">' +
        '<div class="step-line">原色是 <b>' + esc(f.defaultColor) + '</b>（什麼都不施就是這個顏色）' +
        '　種子：' + esc(p.seedName) + '　培育 <b class="num">' + p.duration + '</b> 小時</div>' +
        '<div class="step-meta">' + seedSrc +
          '<button type="button" class="copy-btn" data-copy="' + esc(p.name) + '">複製名稱</button>' +
        '</div>' +
        '<div class="step-meta" style="margin-top:0.35rem">' +
          DB.rules.pomace.map(function (pm) {
            return '<span class="chip">' + esc(pm.name) + (pm.buy ? '：' + esc(pm.buy) : '') + '</span>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="color-grid">' +
      f.colors.map(function (c) {
        var bg = c.hex === 'linear'
          ? 'conic-gradient(#d0453b,#e08a3c,#d8b13a,#4e9d5b,#3d7fc4,#9163c4,#d0453b)'
          : c.hex;
        var recipe = c.isDefault
          ? '<span class="pom">不必施肥（原色）</span>'
          : c.pomace.map(pomChip).join('') + (c.rng ? '<span class="chip warn">隨機</span>' : '');
        return '<div class="color-card">' +
          '<span class="swatch" style="background:' + esc(bg) + '" aria-hidden="true"></span>' +
          '<div style="min-width:0"><div class="color-name">' + esc(c.color) + '</div>' +
          '<div class="note" style="font-size:0.72rem">' + esc(c.name) + '</div>' +
          '<div class="pomace-row">' + recipe + '</div></div></div>';
      }).join('') + '</div>' +
      '<p class="note" style="margin-top:0.75rem">' +
      '白色／黑色／' + esc(f.colors[8].color) + ' 沒有固定配方：三種油粕都施完之後隨機開出其中一種，' +
      '<b>也可能退回原色</b>，配不到就再跑一輪。</p>';
    $('flowerResult').innerHTML = html;
    say('flowerStatus', f.species + '：原色 ' + f.defaultColor + '，已列出 9 個顏色的油粕配方。');
  }

  // ── 全部作物 ──────────────────────────────────────────────────────────
  var KINDS = [
    { key: 'all', label: '全部' },
    { key: 'crop', label: '作物' },
    { key: 'flower', label: '花卉' },
    { key: 'crystal', label: '晶草' },
    { key: 'cross', label: '需要配種' },
    { key: 'minion', label: '寵物' }
  ];

  function initAll() {
    $('allFilters').innerHTML = KINDS.map(function (k) {
      return '<button type="button" class="filter-btn" data-kind="' + k.key + '" aria-pressed="' +
             (k.key === 'all' ? 'true' : 'false') + '">' + k.label + '</button>';
    }).join('');
    $('allFilters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-kind]');
      if (!b) return;
      STATE.kind = b.dataset.kind;
      document.querySelectorAll('#allFilters [data-kind]').forEach(function (x) {
        x.setAttribute('aria-pressed', x.dataset.kind === STATE.kind ? 'true' : 'false');
      });
      renderAll(); writeHash();
    });
    $('allSearch').addEventListener('input', function () { STATE.q = this.value.trim().toLowerCase(); renderAll(); writeHash(); });
    $('allSort').addEventListener('change', function () { STATE.sort = this.value; renderAll(); writeHash(); });
    $('allGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-goto]');
      if (b) selectTarget(Number(b.dataset.goto));
    });
    renderAll();
  }

  function renderAll() {
    var list = ROWS.filter(function (p) {
      if (STATE.kind === 'cross') { if (!p.seed.crossOnly || !p.crossBreeds.length) return false; }
      else if (STATE.kind === 'minion') { if (!p.minion) return false; }
      else if (STATE.kind !== 'all' && p.kind !== STATE.kind) return false;
      if (!STATE.q) return true;
      return (p.name + ' ' + p.seedName + ' ' + (p.nameEn || '') + ' ' + (p.seedNameEn || ''))
        .toLowerCase().indexOf(STATE.q) >= 0;
    });
    list.sort(function (a, b) {
      if (STATE.sort === 'duration') return a.duration - b.duration || a.name.localeCompare(b.name, 'zh-TW');
      if (STATE.sort === 'effort') return totalEffort(a) - totalEffort(b) || a.name.localeCompare(b.name, 'zh-TW');
      return a.name.localeCompare(b.name, 'zh-TW');
    });

    $('allCount').textContent = '共 ' + list.length + ' 種' + (STATE.q || STATE.kind !== 'all' ? '（已篩選）' : '');
    if (!list.length) { $('allGrid').innerHTML = '<p class="empty">沒有符合的作物。</p>'; return; }

    $('allGrid').innerHTML = list.map(function (p) {
      var need = p.seed.crossOnly && p.crossBreeds.length;
      var src = p.seed.sources.length
        ? '<span class="chip ok">' + esc(p.seed.sources[0].text) + '</span>'
        : (need ? '<span class="chip warn">需配種</span>' : '<span class="chip">市場板</span>');
      return '<div class="plant-card">' + icon(p.icon) + '<div style="flex:1;min-width:0">' +
        '<div class="plant-name">' + esc(p.name) + '</div>' +
        '<div class="note" style="font-size:0.74rem">🌱 ' + esc(p.seedName) + '</div>' +
        '<div class="plant-meta">' +
          '<span class="chip">培育 <span class="num">' + p.duration + '</span>h</span>' + src +
          (p.flower ? '<span class="chip gold">9 色</span>' : '') +
          (p.minion ? '<span class="chip gold">寵物' + (p.minion.gardeningOnly ? '·限園藝' : '') + '</span>' : '') +
          (p.usedIn ? '<span class="chip info">' + p.usedIn.count + ' 配方</span>' : '') +
          (p.parentOf ? '<span class="chip">' + p.parentOf.length + ' 種的父本</span>' : '') +
          (p.productSources ? '<span class="chip ok">產物可直接買／採</span>' : '') +
        '</div>' +
        (need ? '<button type="button" class="plant-link" data-goto="' + p.productId + '">看配種路徑（約 ' +
                Math.round(totalEffort(p) / 24) + ' 天）</button>' : '') +
        (p.flower ? '<button type="button" class="plant-link" data-flower="' + p.productId + '">看 9 色配方</button>' : '') +
        '</div></div>';
    }).join('');

    $('allGrid').querySelectorAll('[data-flower]').forEach(function (b) {
      b.addEventListener('click', function () { selectSpecies(Number(b.dataset.flower)); });
    });
  }

  // ── 機制速查 ──────────────────────────────────────────────────────────

  /** 清田用的墊檔作物：挑培育時數最短、種子又拿得到的那個（現在是虛無界風茄 12h）。 */
  function cheapFiller() {
    var c = ROWS.filter(function (p) { return p.seed.sources.length || p.seed.marketable; })
      .sort(function (a, b) { return a.duration - b.duration; })[0];
    return c ? c.seedName : '任何便宜的種子';
  }

  /** 外圈格位的順時針座標：左上角起 → 上排向右 → 右排向下 → 下排向左 → 左排向上。 */
  function ringCells(cols, rows) {
    var out = [], c, r;
    for (c = 0; c < cols; c++) out.push([0, c]);                       // 上排 →
    for (r = 1; r < rows; r++) out.push([r, cols - 1]);                // 右排 ↓
    for (c = cols - 2; c >= 0; c--) out.push([rows - 1, c]);           // 下排 ←
    for (r = rows - 2; r >= 1; r--) out.push([r, 0]);                  // 左排 ↑
    return out;
  }

  /** 座標 ↔ 格號雙向表。 */
  function patchGrid(x) {
    var ring = ringCells(x.cols, x.rows), at = {}, pos = {};
    ring.forEach(function (rc, i) { at[rc[0] + ',' + rc[1]] = i + 1; pos[i + 1] = rc; });
    return { at: at, pos: pos };
  }

  /* ── 配種怎麼運作：在真實格位上跑一次鄰接檢查 ──────────────────────────
     舊版畫的是抽象的「種在正中央、四周標 1右 2下 3上 4左」。那張圖有兩個問題：
     ① 它長得跟高級園圃一模一樣（3×3），但**真實的 3×3 正中央不是田**，看了會以為中間能種。
     ② 鄰接順序的答案**每一格都不一樣**——角落只有兩個鄰居、上中那格的「下」是中央空洞。
     改成可點的實例：選一格，就在真的格位上標出它會依序檢查哪幾格。 */
  var DIR = [['右', 0, 1], ['下', 1, 0], ['上', -1, 0], ['左', 0, -1]];

  /** 在 patch 上，於 bed 號格種下時的鄰接檢查順序。回傳 [{no, dir}]。 */
  function checkOrder(x, bed) {
    var g = patchGrid(x), p = g.pos[bed], out = [];
    if (!p) return out;
    DIR.forEach(function (d) {
      var n = g.at[(p[0] + d[1]) + ',' + (p[1] + d[2])];
      if (n) out.push({ no: n, dir: d[0] });
    });
    return out;
  }

  function adjacencyDemo(bed) {
    var x = DB.rules.crossbreed.patches.filter(function (p) { return p.verified; })[0]
         || DB.rules.crossbreed.patches[DB.rules.crossbreed.patches.length - 1];
    var g = patchGrid(x);
    var order = checkOrder(x, bed);
    var rank = {};
    order.forEach(function (o, i) { rank[o.no] = { i: i + 1, dir: o.dir }; });

    var cells = [];
    for (var r = 0; r < x.rows; r++) {
      for (var c = 0; c < x.cols; c++) {
        var n = g.at[r + ',' + c];
        if (!n) { cells.push('<div class="pbed hole" aria-hidden="true">·</div>'); continue; }
        var k = rank[n];
        var cls = n === bed ? 'sel' : (k ? 'nb' : '');
        cells.push('<button type="button" class="pbed ' + cls + '" data-bed="' + n + '"' +
          ' aria-pressed="' + (n === bed ? 'true' : 'false') + '">' +
          '<b class="num">' + n + '</b>' +
          '<span>' + (n === bed ? '種下' : (k ? '第 ' + k.i + '（' + k.dir + '）' : '　')) + '</span>' +
          '</button>');
      }
    }

    var sentence = order.length
      ? '在 <b class="num">' + bed + '</b> 號格種下 → 依序檢查 ' +
        order.map(function (o, i) {
          return '<b class="num">' + o.no + '</b> 號（' + o.dir + '）';
        }).join(' → ') + '，<b>停在第一個配得起來的</b>。'
      : '';

    return '<div class="patch-beds demo" style="grid-template-columns:repeat(' + x.cols +
      ',minmax(0,1fr));max-width:' + Math.min(x.cols * 4.6, 14) + 'rem" role="group" aria-label="' +
      esc(x.name + ' 鄰接檢查示意，目前選 ' + bed + ' 號格') + '">' + cells.join('') + '</div>' +
      '<p class="note" style="margin-top:0.5rem">' + sentence +
      '　<span class="patch-note">（點其他格看那一格的順序）</span></p>';
  }

  /** 一款園圃的格位圖：真實外圈排列 ＋ 編號 ＋ 本株／鄰株交替。 */
  function patchDiagram(x) {
    var ring = ringCells(x.cols, x.rows);
    var grid = {};
    ring.forEach(function (rc, i) { grid[rc[0] + ',' + rc[1]] = i + 1; });

    var cells = [];
    for (var r = 0; r < x.rows; r++) {
      for (var c = 0; c < x.cols; c++) {
        var n = grid[r + ',' + c];
        if (!n) { cells.push('<div class="pbed hole" aria-hidden="true">·</div>'); continue; }
        var isBase = n % 2 === 1;
        cells.push('<div class="pbed ' + (isBase ? 'base' : 'adj') + '">' +
          '<b class="num">' + n + '</b><span>' + (isBase ? '本株' : '鄰株') + '</span></div>');
      }
    }
    var size = Math.min(x.cols * 4.2, 13);
    return '<div class="patch">' +
      '<div class="patch-head"><span class="patch-name">' + esc(x.name) + '</span>' +
      '<span class="patch-note num">' + x.beds + ' 格 · 一輪可跑 ' + (x.beds / 2) + ' 組配種</span>' +
      (x.verified ? '' : '<span class="chip warn">排列為推定</span>') +
      '</div>' +
      '<div class="patch-beds" style="grid-template-columns:repeat(' + x.cols + ',minmax(0,1fr));' +
      'max-width:' + size + 'rem" role="img" aria-label="' +
      esc(x.name + '：' + x.rows + ' 列 × ' + x.cols + ' 行的外圈共 ' + x.beds + ' 格，' +
          '編號從左上角順時針；奇數格種本株、偶數格種鄰株' +
          (x.cols === 3 && x.rows === 3 ? '，中央沒有格子' : '')) + '">' +
      cells.join('') + '</div></div>';
  }

  function renderRules() {
    var r = DB.rules;
    // 土壤除了名字，還要寫「去哪弄」——3 級要採集、1～2 級 NPC 就有，差很多
    var soilRows = r.soils.map(function (s) {
      return '<tr><th scope="row">' + esc(s.family) + '</th><td>' + esc(s.effect) + '</td><td>' +
             s.grades.map(function (g) {
               return esc(g.grade + ' 級') + (g.buy ? '　<span class="note">' + esc(g.buy) + '</span>' : '');
             }).join('<br>') + '</td></tr>';
    }).join('') +
    '<tr><th scope="row">' + esc(r.plainSoil.name) + '</th><td>' + esc(r.plainSoil.effect) + '</td><td>' +
      (r.plainSoil.buy ? '<span class="note">' + esc(r.plainSoil.buy) + '</span>' : '—') + '</td></tr>';

    var demoBed = 2; // 預設挑上中那格：它的「下」剛好是中央空洞，最能說明「不是每格都有四個鄰居」

    $('rulesBody').innerHTML =
      '<h2>配種怎麼運作</h2>' +
      '<div class="card"><ul class="note" style="padding-left:1.1rem;display:flex;flex-direction:column;gap:0.35rem">' +
        '<li><strong>配種在「種下的瞬間」判定</strong>，不是收成時。所以要<strong>先把鄰株種好，再種本株</strong>。</li>' +
        '<li><strong>收到的是種子，不是作物。</strong>本株那格仍然長本株自己的作物，只是收成時額外掉出目標種子——' +
          '拿到種子後<strong>還要再種一輪</strong>才有目標作物。</li>' +
        '<li>旁邊是<strong>空床就不會配種</strong>（所以第一株永遠配不出東西）。鄰株只要已經種下即可，不必成熟。</li>' +
        '<li>鄰接檢查有<strong>優先順序：' + r.crossbreed.adjacencyOrder.join(' → ') +
          '</strong>，取第一個配得起來的鄰居。要配的對象請放在優先順序前面的方向。</li>' +
        '<li><strong>花盆不能配種</strong>（沒有相鄰的格子），一定要用園圃。</li>' +
      '</ul>' +
      '<p class="note" style="margin-top:0.8rem"><b>實際跑一次</b>（以高級園圃為例）：' +
      '它是一圈，所以<b>每一格都剛好只有兩個鄰居</b>，只是方向不同——' +
      '例如 2 號格的「下」是中央的空洞，於是只會檢查 3 號和 1 號。' +
      '兩邊都配得起來時，就由優先序決定是哪一邊。</p>' +
      '<div id="adjDemo">' + adjacencyDemo(demoBed) + '</div></div>' +

      '<h2>園圃與種植順序</h2>' +
      '<div class="card">' +
        '<p class="note">三款園圃都是「<b>一個矩形的外圈</b>」，編號從左上角<b>順時針</b>繞。' +
        '<b>高級園圃是 3×3 的外圈，正中央沒有格子</b>。交替種下兩種種子，每一格都會跟隔壁配一次——' +
        '所以 N 格的園圃一輪能同時跑 <b>N ÷ 2</b> 組配種。</p>' +
        r.crossbreed.patches.map(patchDiagram).join('') +
        '<p class="note" style="margin-top:0.9rem"><b>種下去的順序才是重點</b>（配種在種下的瞬間判定）：</p>' +
        '<ol class="note" style="padding-left:1.2rem;display:flex;flex-direction:column;gap:0.3rem;margin-top:0.35rem">' +
          '<li>先在 <b>1 號格</b>種一株不要的作物（例如' + esc(cheapFiller()) + '）＋' + esc(r.plainSoil.name) +
            '，把整塊田清乾淨。第一株旁邊沒東西，本來就配不出任何結果。</li>' +
          '<li><b>2 號格之後交替種</b>本株、鄰株、本株、鄰株……每種下一格就配一次。</li>' +
          '<li>最後把 1 號格那株不要的換掉，補上真正要配的那一株。</li>' +
          '<li>收成時<b>一格一格換</b>，不要整塊清空——空床不會配種，清空了要重來一次。</li>' +
        '</ol>' +
        '<p class="note" style="margin-top:0.6rem">⚠ <b>高級園圃</b>的排列與編號有示意圖可考' +
        '（<a href="https://www.ffxivgardening.com/cross-diagrams" target="_blank" rel="noopener">ffxivgardening 的配種圖</a>：' +
        '圖上就是 3×3 而中央那格拿來放步驟標籤，步驟文字寫「1 號格相鄰的是 2 號與 8 號」「6 號在兩個下角中間」）。' +
        '<b>圓形與方形園圃找不到圖</b>，這裡是依同一條規律推得（2×2 與 3×2 的外圈剛好就是 4 格與 6 格），' +
        '已標「排列為推定」。進遊戲點任一格，對話框會告訴你那是第幾號格。</p>' +
      '</div>' +

      '<h2>土壤</h2>' +
      '<div class="tbl-wrap"><table><caption>配種一律用薩納蘭土壤，等級越高效果越強。</caption>' +
      '<thead><tr><th scope="col">土壤</th><th scope="col">效果</th><th scope="col">等級</th></tr></thead>' +
      '<tbody>' + soilRows + '</tbody></table></div>' +

      '<h2>照料</h2>' +
      '<div class="card"><ul class="note" style="padding-left:1.1rem;display:flex;flex-direction:column;gap:0.35rem">' +
        '<li>多數作物 <b class="num">' + r.care.wiltHours + '</b> 小時沒照料會枯萎，再 <b class="num">' +
          r.care.witherHours + '</b> 小時就枯死；少數 24 小時就要顧一次。<strong>一天看兩次最保險。</strong></li>' +
        '<li>施肥每次減少<strong>剩餘</strong>生長時間的 ' + r.care.fertilizerPercentPerUse + '%，' +
          '所以<strong>越早施越划算</strong>。</li>' +
        '<li>長到可收成之後就<strong>不會再枯死</strong>，可以無限期放著慢慢收。</li>' +
      '</ul></div>' +

      '<h2>花色（油粕染色）</h2>' +
      '<div class="tbl-wrap"><table><caption>每現實小時只能施一次，只對未成熟的花有效，與施放順序無關。</caption>' +
      '<thead><tr><th scope="col">目標色</th><th scope="col">要施的油粕</th></tr></thead><tbody>' +
      '<tr><th scope="row">油粕哪裡買</th><td>' + r.pomace.map(function (p) {
        return esc(p.name) + '：' + esc(p.buy || '市場板');
      }).join('｜') + '</td></tr>' +
      '<tr><th scope="row">原色</th><td>不施（原色因花種而異，多數是紅色）</td></tr>' +
      '<tr><th scope="row">紅 / 藍 / 黃</th><td>' + r.pomace.map(function (p) { return pomChip(p.key); }).join(' 或 ') + '（各 1 次）</td></tr>' +
      '<tr><th scope="row">紫</th><td>' + pomChip('crimson') + pomChip('cerulean') + '</td></tr>' +
      '<tr><th scope="row">橙</th><td>' + pomChip('crimson') + pomChip('golden') + '</td></tr>' +
      '<tr><th scope="row">綠</th><td>' + pomChip('cerulean') + pomChip('golden') + '</td></tr>' +
      '<tr><th scope="row">白 / 黑 / 混色</th><td>' + r.pomace.map(function (p) { return pomChip(p.key); }).join('') +
        ' 三色全施，<b>隨機</b>開出其中一種，也可能退回原色</td></tr>' +
      '</tbody></table></div>' +

      '<p class="srcs">機制來源：' +
      '<a href="https://ffxiv.consolegameswiki.com/wiki/Gardening_Guide" target="_blank" rel="noopener">Gardening Guide（consolegameswiki）</a>、' +
      '<a href="https://ffxiv.consolegameswiki.com/wiki/Gardening" target="_blank" rel="noopener">Gardening（consolegameswiki）</a>、' +
      '<a href="https://www.ffxivgardening.com/flowerpot-colors" target="_blank" rel="noopener">FFXIV Gardening — Flowerpot Colors</a>、' +
      '<a href="https://ff14.17173.com/content/2021-08-02/20210802165309100.shtml" target="_blank" rel="noopener">栽培与杂交入门手册（17173）</a>。' +
      '配方與時數來自 ffxiv-teamcraft，物品名與圖示取自台服官方物品表。</p>';

    // 點格子換示意（只重畫示意圖本身，不重畫整個分頁）
    $('adjDemo').addEventListener('click', function (e) {
      var b = e.target.closest('[data-bed]');
      if (!b) return;
      $('adjDemo').innerHTML = adjacencyDemo(Number(b.dataset.bed));
    });
  }
})();
