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
 *
 * ⚠ 成本相同時**優先挑不會隨機失敗的配方**（2026-08-29 補）。137 組配方裡有 28 組帶 `alsoYields`
 *   ＝配下去可能得到另一種東西（等於這輪沒配到）。原本的 `h < cur` 是嚴格小於，同成本時保留先找到
 *   的那組，於是克里耶蘿蔔三組配方都是 120h，卻挑到會隨機的那組——而薩維奈圓蔥的最省路徑正好
 *   經過它，旗艦範例白白夾了一個可以零成本避開的隨機步驟。全庫有 3 種作物踩到這個平手。
 *
 * ⚠ 總工期是「最快」不是「保證」：路徑上若有隨機步驟，沒配到就得把該株重種一輪。頁面不猜機率
 *   （沒有可靠的機率資料，猜了會變成假精確），只誠實標出「重來一輪要多久」。
 */
(function () {
  'use strict';

  var DATA_URL = '../../data/gardening.json';
  var META_URL = '../../data/_meta.json';
  var ICON_BASE = 'https://xivapi.com/i/';

  /* localStorage：key 一律 `ffxiv_` 開頭，否則首頁的「匯出全站進度」掃不到（知識庫 §2.3）。
     這頁本來是全站唯一沒有任何 ffxiv_ key 的工具頁——算得出 28 天的計畫，關掉分頁就全沒了。 */
  var LS_PLAN = 'ffxiv_gardening_plan';   // { target, startAt, overrides:{seedId:idx}, done:{key:1} }
  var LS_VIEW = 'ffxiv_gardening_view';   // { tab, species, kind, q, sort }

  var DB = null;          // 完整信封（含 rules）
  var ROWS = [];          // 已過版本閘門的作物
  var BY_SEED = new Map();
  var BY_PRODUCT = new Map();
  var COST = new Map();   // 種子 id → 取得該種子的最短時數（0＝可直接取得）
  var BEST = new Map();   // 種子 id → 最省的配方 index
  var OVERRIDE = new Map(); // 使用者手動挑的配方：種子 id → 配方 index
  /* 已完成的步驟／照料點。**依目標分開存**：步驟的 key 是種子 id，換目標後同一顆種子
     可能出現在別的計畫裡，共用一份會把新計畫誤標成已完成；分開存則是切走再切回來進度還在。 */
  var DONE_ALL = Object.create(null);  // 目標 productId → { key: 1 }
  var DONE = Object.create(null);      // 目前目標的那一份（見 useDone）
  var STATE = { tab: 'plan', target: null, species: null, kind: 'all', q: '', sort: 'name' };

  // ── localStorage ──────────────────────────────────────────────────────
  // 全部包 try/catch：私密視窗與「封鎖網站資料」下 localStorage 會直接 throw，
  // 不能讓存檔失敗把整頁帶下去。
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 存不了就算了，功能不依賴它 */ }
  }
  function savePlan() {
    var ov = {};
    OVERRIDE.forEach(function (v, k) { ov[k] = v; });
    lsSet(LS_PLAN, {
      target: STATE.target,
      startAt: $('startAt') ? $('startAt').value : '',
      overrides: ov,
      doneByTarget: DONE_ALL
    });
  }
  /** 把 DONE 指向目前目標的那一份進度（沒有就開一份空的）。 */
  function useDone(productId) {
    if (!DONE_ALL[productId]) DONE_ALL[productId] = Object.create(null);
    DONE = DONE_ALL[productId];
  }
  function saveView() {
    lsSet(LS_VIEW, { tab: STATE.tab, species: STATE.species, kind: STATE.kind, q: STATE.q, sort: STATE.sort });
  }

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

  /** 這組配方會不會隨機配出別的東西（＝這輪可能沒配到，要重種一輪）。 */
  function rngRecipe(c) { return !!(c && c.alsoYields && c.alsoYields.length); }

  /** 用某一組配方取得該種子要多少時數（子節點沿用各自的 BEST）。 */
  function recipeCost(c) {
    var baseCrop = BY_SEED.get(c.baseSeedId);
    if (!baseCrop) return Infinity;
    var cb = COST.has(c.baseSeedId) ? COST.get(c.baseSeedId) : 0;
    var ca = COST.has(c.adjacentSeedId) ? COST.get(c.adjacentSeedId) : 0;
    return Math.max(cb, ca) + baseCrop.duration;
  }

  /** 定點迭代求每個種子的最短取得時數與最省配方。 */
  function solveCosts() {
    ROWS.forEach(function (p) { COST.set(p.seedId, directOK(p.seedId) ? 0 : Infinity); });
    for (var pass = 0; pass < ROWS.length; pass++) {
      var changed = false;
      ROWS.forEach(function (p) {
        if (directOK(p.seedId)) return;
        var cur = COST.has(p.seedId) ? COST.get(p.seedId) : Infinity;
        var bi = BEST.has(p.seedId) ? BEST.get(p.seedId) : -1;
        // 還沒選過任何配方時，把「目前這組是隨機的」設為 true，好讓第一組非隨機的配方能勝出
        var curRng = bi >= 0 ? rngRecipe(p.crossBreeds[bi]) : true;
        p.crossBreeds.forEach(function (c, i) {
          var baseCrop = BY_SEED.get(c.baseSeedId);
          if (!baseCrop) return;
          var cb = COST.has(c.baseSeedId) ? COST.get(c.baseSeedId) : 0;
          var ca = COST.has(c.adjacentSeedId) ? COST.get(c.adjacentSeedId) : 0;
          var h = Math.max(cb, ca) + baseCrop.duration;
          // 成本更低 → 換；成本一樣但目前這組會隨機、新的不會 → 也換（見檔頭）。
          // 平手只會換一次（換完 curRng 就是 false），不會讓迭代永遠 changed=true。
          if (h < cur || (h === cur && curRng && !rngRecipe(c))) {
            COST.set(p.seedId, h); BEST.set(p.seedId, i);
            cur = h; curRng = rngRecipe(c); changed = true;
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

  /* focusPanel＝這次切換是「從內容裡的按鈕」觸發的（看配種路徑／看 9 色配方／父本連結）。
     那顆按鈕切完就被 hidden 了，焦點會掉回 <body>：鍵盤使用者下一個 Tab 從整頁最上面重來，
     手機上則是畫面完全沒動、內容卻整個換掉，看到的是新結果的中段。
     由頁籤鈕本身觸發時不要做這件事——ARIA APG 的頁籤行為維持原樣才對。 */
  function showTab(tab, skipHash, focusPanel) {
    STATE.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.hidden = p.id !== 'p-' + tab;
    });
    if (focusPanel) {
      var panel = $('p-' + tab);
      if (panel) {
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }
    if (!skipHash) writeHash();
    saveView();
  }

  /* 深層連結：#/plan/8166、#/flower/21876、#/rules，
     以及 #/all?kind=flower&q=鬱&sort=duration——「全部作物」的篩選／搜尋／排序也要能分享與重整，
     否則調了半天的條件一重整就沒了（其他三個檢視都有，就它沒有）。

     配種路徑另帶 `?t=` 開始時間與 `?r=` 換過的配方（`種子id:配方index,…`）。
     **開始時間不進網址的話，同一個連結今天開跟後天開算出來的收成時刻不一樣卻沒有任何提示**，
     分享給朋友更是各看各的（朋友看到的是「他自己的現在 + 480 小時」）。 */
  function writeHash() {
    var h = '#/' + STATE.tab;
    var qs = [];
    if (STATE.tab === 'plan') {
      if (STATE.target) h += '/' + STATE.target;
      var t = $('startAt') ? $('startAt').value : '';
      if (t) qs.push('t=' + encodeURIComponent(t));
      var ov = [];
      OVERRIDE.forEach(function (v, k) { ov.push(k + ':' + v); });
      if (ov.length) qs.push('r=' + ov.join(','));
    }
    if (STATE.tab === 'flower' && STATE.species) h += '/' + STATE.species;
    if (STATE.tab === 'all') {
      if (STATE.kind !== 'all') qs.push('kind=' + STATE.kind);
      if (STATE.q) qs.push('q=' + encodeURIComponent(STATE.q));
      if (STATE.sort !== 'name') qs.push('sort=' + STATE.sort);
    }
    if (qs.length) h += '?' + qs.join('&');
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function hashParams(raw) {
    var qi = raw.indexOf('?');
    return new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
  }

  function applyHash() {
    var raw = location.hash || '';
    var m = raw.match(/^#\/(plan|flower|all|rules)(?:\/(\d+))?/);
    // 沒有 hash＝直接開頁：還原上次存的狀態（分享來的連結才有 hash，優先序 hash > localStorage）
    if (!m) { restoreSaved(); return; }
    var params = hashParams(raw);
    showTab(m[1], true);
    if (m[1] === 'plan') {
      var t = params.get('t');
      if (t && $('startAt')) $('startAt').value = t;
      OVERRIDE.clear();
      (params.get('r') || '').split(',').forEach(function (pair) {
        var kv = pair.split(':');
        if (kv.length === 2 && kv[0] && kv[1]) OVERRIDE.set(Number(kv[0]), Number(kv[1]));
      });
      if (m[2]) selectTarget(Number(m[2]), { skipHash: true, keepOverride: true });
    }
    if (m[1] === 'flower' && m[2]) selectSpecies(Number(m[2]), { skipHash: true });
    if (m[1] === 'all') {
      STATE.kind = params.get('kind') || 'all';
      STATE.q = (params.get('q') || '').toLowerCase();
      STATE.sort = params.get('sort') || 'name';
      syncAllControls(params.get('q') || '');
      renderAll();
    }
  }

  /** 把「全部作物」的搜尋框／排序／篩選鈕同步成 STATE 的值。 */
  function syncAllControls(rawQ) {
    var si = $('allSearch'), so = $('allSort');
    if (si) si.value = rawQ != null ? rawQ : STATE.q;
    if (so) so.value = STATE.sort;
    document.querySelectorAll('#allFilters [data-kind]').forEach(function (x) {
      x.setAttribute('aria-pressed', x.dataset.kind === STATE.kind ? 'true' : 'false');
    });
  }

  /** 直接開頁（網址沒有 hash）時，還原上次離開的狀態。 */
  function restoreSaved() {
    var v = lsGet(LS_VIEW), pl = lsGet(LS_PLAN);

    if (v.kind) STATE.kind = v.kind;
    if (v.q) STATE.q = String(v.q).toLowerCase();
    if (v.sort) STATE.sort = v.sort;
    syncAllControls(v.q || '');
    renderAll();

    // 目標先還原（會強制切到 plan 分頁），最後再切回上次待著的分頁
    if (pl.target && BY_PRODUCT.has(pl.target)) {
      OVERRIDE.clear();
      Object.keys(pl.overrides || {}).forEach(function (k) { OVERRIDE.set(Number(k), pl.overrides[k]); });
      selectTarget(pl.target, { skipHash: true, keepOverride: true });
    }
    if (v.species && BY_PRODUCT.has(v.species)) selectSpecies(v.species, { skipHash: true });

    showTab(v.tab && document.getElementById('p-' + v.tab) ? v.tab : 'plan', true);
  }

  // ── 配種路徑 ──────────────────────────────────────────────────────────
  /** 現在時刻的 datetime-local 字串（本地時區，不是 UTC）。 */
  function nowLocal() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function initPlan() {
    /* 開始時間的優先序是 hash > localStorage > 現在（hash 在 applyHash 覆蓋）。
       原本是無條件寫成「現在」，於是同一份計畫每次重整收成時刻都不一樣、又分享不出去。 */
    var saved = lsGet(LS_PLAN);
    if (saved.doneByTarget && typeof saved.doneByTarget === 'object') {
      Object.keys(saved.doneByTarget).forEach(function (k) { DONE_ALL[k] = saved.doneByTarget[k] || {}; });
    }
    $('startAt').value = saved.startAt || nowLocal();
    $('startAt').addEventListener('change', function () {
      savePlan(); writeHash();
      if (STATE.target) renderPlan();
    });
    // 「現在」改成明確動作，而不是每次載入的隱形副作用
    $('startNow').addEventListener('click', function () {
      $('startAt').value = nowLocal();
      savePlan(); writeHash();
      if (STATE.target) renderPlan();
    });

    initCombo();
    renderQuick();

    $('planQuick').addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (b) { selectTarget(Number(b.dataset.id)); return; }
      var t = e.target.closest('[data-tab]');
      if (t) showTab(t.dataset.tab, false, true);
    });

    $('planResult').addEventListener('click', function (e) {
      var alt = e.target.closest('[data-alt-seed]');
      if (alt) {
        OVERRIDE.set(Number(alt.dataset.altSeed), Number(alt.dataset.altIdx));
        savePlan(); writeHash(); rerenderPlan();
        return;
      }
      var chk = e.target.closest('[data-done]');
      if (chk) {
        var k = chk.dataset.done;
        if (DONE[k]) delete DONE[k]; else DONE[k] = 1;
        savePlan(); rerenderPlan();
        return;
      }
      var ics = e.target.closest('[data-ics]');
      if (ics) { downloadIcs(); return; }
      var cc = e.target.closest('[data-copy-care]');
      if (cc) { copyText(cc, careText()); return; }
      var jump = e.target.closest('[data-goto]');
      if (jump) { selectTarget(Number(jump.dataset.goto), { focus: true }); return; }
      var fl = e.target.closest('[data-flower]');
      if (fl) { selectSpecies(Number(fl.dataset.flower), { focus: true }); return; }
      var cp = e.target.closest('[data-copy]');
      if (cp) copyText(cp, cp.dataset.copy);
    });
  }

  /** 重畫但留住捲動位置——勾一格進度不該把正在看的那一列捲跑掉（同 market.js 的處置）。 */
  function rerenderPlan() {
    var y = window.scrollY;
    renderPlan();
    window.scrollTo(0, y);
  }

  /* ── 捷徑：依「你想要什麼」分組 ────────────────────────────────────────
     原本是單一列的「最花時間的目標」，排序鍵是總工期。結果 4 隻**只能靠園藝取得**的寵物
     （茄子騎士 12d／番茄國王 13d／曼德拉王后 17d／亞拉戈西瓜 7d）因為工期短，一隻都排不進去
     ——而「寵物圖鑑差那 4 隻」正是最多人來這頁的原因。工期排行留成最後一組。 */
  function renderQuick() {
    function btn(p) {
      return '<button class="quick-btn" type="button" data-id="' + p.productId + '">' +
        icon(p.icon, 'sm') + esc(p.name) + ' <span class="num">' + Math.round(totalEffort(p) / 24) + ' 天</span></button>';
    }
    var byEffort = function (a, b) { return totalEffort(b) - totalEffort(a); };
    var groups = [];

    var pets = ROWS.filter(function (p) { return p.minion && p.minion.gardeningOnly; }).sort(byEffort);
    if (pets.length) groups.push({ label: '🐾 只能靠園藝的寵物', html: pets.map(btn).join('') });

    var choco = ROWS.filter(function (p) { return p.useNote; }).sort(byEffort);
    if (choco.length) groups.push({ label: '🐦 陸行鳥夥伴', html: choco.map(btn).join('') });

    var flowers = ROWS.filter(function (p) { return p.flower; });
    if (flowers.length) {
      groups.push({
        label: '🌸 花色',
        html: '<button class="quick-btn" type="button" data-tab="flower">' + flowers.length +
              ' 種花 × 9 色的油粕配方 →</button>'
      });
    }

    var hot = ROWS.filter(function (p) { return p.seed.crossOnly && p.crossBreeds.length; })
      .sort(byEffort).slice(0, 4);
    if (hot.length) groups.push({ label: '⏳ 最硬的挑戰', html: hot.map(btn).join('') });

    $('planQuick').innerHTML = groups.map(function (g) {
      return '<div class="quick-group"><span class="quick-label">' + g.label + '</span>' + g.html + '</div>';
    }).join('');
  }

  /* ── 目標輸入：自製 combobox ──────────────────────────────────────────
     原本是 <input list="planList"> ＋ `p.name === input.value` 的完全相等比對：
     貼「薩維奈圓蔥種子」、打「Thavnairian」、打錯一個字，一律靜默無反應，看起來像頁面壞了；
     iOS Safari 的 datalist 下拉幾乎不能用，等於變成必須一字不差手打的輸入框。
     這裡比照「全部作物」分頁的比對範圍（作物名／種子名／英文名），並補上找不到時的指路。 */
  var comboHits = [], comboActive = -1;

  function matchRows(q) {
    if (!q) return [];
    var s = q.toLowerCase();
    var scored = [];
    ROWS.forEach(function (p) {
      var name = p.name.toLowerCase();
      if (searchHay(p).indexOf(s) < 0) return;
      // 作物名開頭命中最相關，其次作物名內含，最後才是靠種子名／英文名撈到的
      scored.push({ p: p, rank: name.indexOf(s) === 0 ? 0 : (name.indexOf(s) >= 0 ? 1 : 2) });
    });
    scored.sort(function (a, b) {
      return a.rank - b.rank || totalEffort(b.p) - totalEffort(a.p) || a.p.name.localeCompare(b.p.name, 'zh-TW');
    });
    return scored.slice(0, 12).map(function (x) { return x.p; });
  }

  function closeCombo() {
    comboHits = []; comboActive = -1;
    var list = $('planSuggest');
    list.hidden = true; list.innerHTML = '';
    $('planTarget').setAttribute('aria-expanded', 'false');
    $('planTarget').removeAttribute('aria-activedescendant');
  }

  function renderCombo(q) {
    var input = $('planTarget'), list = $('planSuggest'), hint = $('planHint');
    comboHits = matchRows(q);
    comboActive = -1;
    if (!q) { closeCombo(); hint.textContent = ''; return; }
    if (!comboHits.length) {
      closeCombo();
      // 打了字卻沒有結果一定要說話——這是原本最容易讓人以為頁面壞掉的地方
      hint.innerHTML = '找不到「' + esc(q) + '」　' +
        '<button type="button" class="plant-link" style="min-height:auto" id="planToAll">到「全部作物」找找看 →</button>';
      var toAll = $('planToAll');
      if (toAll) toAll.addEventListener('click', function () {
        STATE.q = q.toLowerCase();
        syncAllControls(q);
        renderAll();
        showTab('all', false, true);
      });
      return;
    }
    hint.textContent = '';
    list.innerHTML = comboHits.map(function (p, i) {
      return '<li role="option" id="sg-' + i + '" aria-selected="false" data-id="' + p.productId + '">' +
        icon(p.icon, 'sm') + '<span>' + esc(p.name) + '</span>' +
        '<span class="sg-sub">' + esc(p.seedName) + '</span>' +
        '<span class="sg-eff num">約 ' + Math.round(totalEffort(p) / 24) + ' 天</span></li>';
    }).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function moveCombo(delta) {
    if (!comboHits.length) return;
    comboActive = (comboActive + delta + comboHits.length) % comboHits.length;
    var list = $('planSuggest');
    Array.prototype.forEach.call(list.children, function (li, i) {
      li.setAttribute('aria-selected', i === comboActive ? 'true' : 'false');
      if (i === comboActive) li.scrollIntoView({ block: 'nearest' });
    });
    $('planTarget').setAttribute('aria-activedescendant', 'sg-' + comboActive);
  }

  function initCombo() {
    var input = $('planTarget'), list = $('planSuggest');

    input.addEventListener('input', function () { renderCombo(input.value.trim()); });
    input.addEventListener('focus', function () { if (input.value.trim()) renderCombo(input.value.trim()); });
    // 用 mousedown 而不是 click：blur 會先關掉清單，click 就永遠打不到了
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('[data-id]');
      if (!li) return;
      e.preventDefault();
      selectTarget(Number(li.dataset.id));
      closeCombo();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) renderCombo(input.value.trim()); moveCombo(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCombo(-1); }
      else if (e.key === 'Escape') { closeCombo(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var pick = comboHits[comboActive >= 0 ? comboActive : 0];
        if (pick) { selectTarget(pick.productId); closeCombo(); }
      }
    });
    input.addEventListener('blur', function () {
      // 延遲關閉，讓清單上的 mousedown 先跑完
      setTimeout(closeCombo, 120);
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

  function selectTarget(productId, opts) {
    opts = opts || {};
    var p = BY_PRODUCT.get(productId);
    if (!p) return;
    STATE.target = productId;
    if (!opts.keepOverride) OVERRIDE.clear();
    useDone(productId);
    $('planTarget').value = p.name;
    closeCombo();
    showTab('plan', true, opts.focus);
    renderPlan();
    savePlan();
    if (!opts.skipHash) writeHash();
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

  /* ── 進度勾選 ─────────────────────────────────────────────────────────
     這頁算出來的是一份要跨三到四週執行的清單（魔蕨菜 28 天／5 步／13 個照料點），
     原本卻只負責「算」不負責「追」——種到第 12 天打開頁面，13 列時間點裡前 6 列早就過了，
     沒有任何「你在這裡」的標示。key 依目標分開存，見 DONE_ALL。 */
  var FINAL_KEY = 'final';
  function stepKey(s) { return 's' + s.seedId; }
  function careKey(h) { return 'c' + h; }
  function chkBtn(key, label) {
    var on = !!DONE[key];
    return '<button type="button" class="chk" data-done="' + esc(key) + '" aria-pressed="' + (on ? 'true' : 'false') +
      '" aria-label="' + esc(label) + (on ? '（已完成）' : '') + '" title="' + esc(label) + '">' + (on ? '✓' : '') + '</button>';
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
        // 帶 ?q= 直接落在那一隻上。寵物圖鑑有 500 多筆，落到首頁還要再搜尋一次
        // （collection-tracker.js 的 applyURL() 直接吃這個參數）
        '　<a href="../../minions/?q=' + encodeURIComponent(p.name) + '">到寵物圖鑑看 →</a></span></div>');
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

  /* ── 隨機步驟的警告 ───────────────────────────────────────────────────
     137 組配方裡有 28 組帶 alsoYields＝配下去可能得到另一種東西（等於這輪沒配到）。
     步驟卡本來就有一顆警告籌碼，但**總覽的「20 天」被當成確定值**，而它其實是最快的情況。
     這裡不猜機率（沒有可靠的機率資料，猜了會變成假精確），只講「重來一輪要多久」，
     並在有非隨機替代配方時把代價一起標出來，讓使用者自己決定要賭還是要穩。 */
  function rngBlock(rngSteps) {
    if (!rngSteps.length) return '';
    var rows = rngSteps.map(function (s) {
      var alt = null;
      s.p.crossBreeds.forEach(function (c, i) {
        if (i === s.idx || rngRecipe(c)) return;
        var h = recipeCost(c);
        if (isFinite(h) && (!alt || h < alt.h)) alt = { h: h, c: c };
      });
      var extra = alt ? Math.max(0, alt.h - recipeCost(s.recipe)) : 0;
      return '<li>配 <b>' + esc(s.p.seedName) + '</b> 時也可能配出 ' +
        s.recipe.alsoYields.map(function (a) { return esc(a.name); }).join('、') +
        '（＝這輪沒配到）→ 重種一輪 <b class="num">+' + s.wait + '</b> 小時' +
        (alt
          ? '。<span class="note">這顆種子有不會隨機的配方，改用要多花 <b class="num">' + dur(extra) +
            '</b>——在下面的步驟卡按「換一組配方」。</span>'
          : '。<span class="note">這顆種子沒有不會隨機的配方。</span>') +
        '</li>';
    }).join('');
    return '<div class="card" style="margin-top:0.5rem">' +
      '<div class="step-line">🎲 <b>這條路徑有 ' + rngSteps.length + ' 步是隨機的</b>' +
      '<span class="chip warn">總工期是最快值，不是保證</span></div>' +
      '<ul class="note" style="padding-left:1.1rem;margin-top:0.4rem;display:flex;flex-direction:column;gap:0.3rem">' +
      rows + '</ul></div>';
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

    // 路徑上會隨機失敗的步驟。求解器已經在成本相同時避開它們了（見 solveCosts），
    // 剩下的是「非走不可、或走了比較快」的——那就要誠實講重試代價。
    var rngSteps = steps.filter(function (s) { return rngRecipe(s.recipe); });
    var doneSteps = steps.filter(function (s) { return DONE[stepKey(s)]; }).length + (DONE[FINAL_KEY] ? 1 : 0);

    // 摘要
    html += '<h2>總覽</h2><dl class="summary">' +
      '<div><dt>總工期' + (rngSteps.length ? '（最快）' : '') + '</dt><dd class="hl num">' + dur(total) + '</dd></div>' +
      '<div><dt>其中「湊出種子」</dt><dd class="num">' + dur(seedReady) + '</dd></div>' +
      '<div><dt>目前進度</dt><dd class="num">' + doneSteps + ' / ' + (steps.length + 1) + ' 步</dd></div>' +
      '<div><dt>至少需要</dt><dd class="num">' + peakBeds(steps) + ' 格 <small>同時佔用</small></dd></div>' +
      (t0 ? '<div><dt>預計收成</dt><dd style="font-size:0.95rem">' + at(t0, total) + '</dd></div>' : '') +
      '</dl>' +
      '<p class="note" style="margin-top:0.6rem">配種一律鋪 <b>' + esc(DB.rules.soils[0].grades[2].name) +
      '</b>（' + esc(DB.rules.soils[0].effect) + '）。同一階段的步驟可以並行，時間不疊加。</p>' +
      rngBlock(rngSteps);

    // 步驟（依可開始的時間分階段；同階段可並行）
    html += '<h2>步驟</h2>';
    var stages = [];
    steps.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (s) {
      var last = stages[stages.length - 1];
      if (last && last.start === s.start) last.items.push(s);
      else stages.push({ start: s.start, items: [s] });
    });

    // 「進行中」＝第一個還有步驟沒勾的階段。除了 accent 邊框，標題也會多一顆籌碼，不靠顏色表意。
    var curStage = -1;
    stages.forEach(function (st, i) {
      if (curStage < 0 && st.items.some(function (s) { return !DONE[stepKey(s)]; })) curStage = i;
    });

    stages.forEach(function (st, i) {
      html += '<div class="stage' + (i === curStage ? ' current' : '') + '"><div class="stage-head">' +
        '<span class="stage-no">第 ' + (i + 1) + ' 階段</span>' +
        '<span class="stage-time num">' + (st.start ? '從第 ' + dur(st.start) + ' 起' : '立刻開始') +
        (t0 ? ' · ' + at(t0, st.start) : '') + '</span>' +
        (i === curStage ? '<span class="chip ok">進行中</span>' : '') +
        (st.items.length > 1 ? '<span class="chip">' + st.items.length + ' 步可並行</span>' : '') +
        '</div>';
      st.items.forEach(function (s) { html += stepCard(s, t0); });
      html += '</div>';
    });

    // 最後一步：把配到的種子種下去
    var finDone = !!DONE[FINAL_KEY];
    html += '<div class="stage' + (curStage < 0 && !finDone ? ' current' : '') + '"><div class="stage-head">' +
      '<span class="stage-no">最後一步</span>' +
      '<span class="stage-time num">從第 ' + dur(seedReady) + ' 起' + (t0 ? ' · ' + at(t0, seedReady) : '') + '</span>' +
      (curStage < 0 && !finDone ? '<span class="chip ok">進行中</span>' : '') + '</div>' +
      '<div class="step' + (finDone ? ' done' : '') + '">' +
      chkBtn(FINAL_KEY, '把 ' + p.seedName + ' 種下去') +
      icon(p.icon) + '<div class="step-body"><div class="step-line">' +
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
    say('planStatus', p.name + '：總工期' + (rngSteps.length ? '最快 ' : ' ') + dur(total) + '，' +
      steps.length + ' 個配種步驟，至少需要 ' + peakBeds(steps) + ' 格園圃' +
      (rngSteps.length ? '；其中 ' + rngSteps.length + ' 步是隨機的，沒配到要重種一輪' : '') +
      '；已完成 ' + doneSteps + ' / ' + (steps.length + 1) + ' 步' +
      (t0 ? '，預計 ' + at(t0, total) + ' 收成' : ''));
  }

  /* ── 照料時程 ──────────────────────────────────────────────────────────
     規則在 rules.care：多數作物 48h 沒照料會枯萎、再 24h 枯死；可收成後就不會枯死。
     所以每一段「種下 → 收成」中間，每 48 小時要回來一次。這裡把時刻直接算出來。 */
  // 最後一次算出來的照料時程。匯出 .ics／複製時程都讀這份，不必重算。
  var CARE = { groups: [], t0: null, target: '', harvestH: 0 };

  function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  function careBlock(steps, seedReady, product, t0) {
    var W = DB.rules.care.wiltHours;
    var jobs = steps.map(function (s) {
      /* baseCrop 查不到就退回配方裡記的名字。父本被版本閘門擋掉時 BY_SEED 撈不到它，
         原本這裡直接讀 .name 會 TypeError 讓整頁白掉——stepCard 早有同樣的護欄，只有這裡漏了。
         （目前的資料閘門只擋掉 2 筆佔位、沒有配方參照到它們，所以是潛在而非現行的破口。） */
      return { at: s.start, till: s.end, what: s.baseCrop ? s.baseCrop.name : s.recipe.baseSeedName };
    });
    jobs.push({ at: seedReady, till: seedReady + product.duration, what: product.name });

    var marks = [];
    jobs.forEach(function (j) {
      for (var h = j.at + W; h < j.till; h += W) marks.push({ h: h, what: j.what });
    });

    CARE = { groups: [], t0: t0, target: product.name, harvestH: seedReady + product.duration };

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
    CARE.groups = groups;

    // 「現在」在時程上的位置。已經過了時間卻還沒勾＝作物可能正在枯萎，要看得出來。
    var nowH = t0 ? (Date.now() - t0) / 3600000 : null;

    return '<h2>照料時程</h2><div class="card">' +
      '<p class="note">作物 <b class="num">' + W + '</b> 小時沒照料就枯萎、再 <b class="num">' +
      DB.rules.care.witherHours + '</b> 小時枯死。以下是<b>最晚</b>要回來的時間點（提早照料只會更安全，' +
      '長到可收成之後就不會再枯死）。</p>' +
      '<div class="care-list">' + groups.map(function (g) {
        var k = careKey(g.h);
        var done = !!DONE[k];
        var overdue = !done && nowH != null && g.h < nowH;
        var names = uniq(g.what);
        return '<div class="care-row' + (done ? ' done' : '') + (overdue ? ' overdue' : '') + '">' +
          chkBtn(k, '照料 ' + names.join('、')) +
          '<span class="care-when num">' + (t0 ? at(t0, g.h) : '第 ' + dur(g.h)) + '</span>' +
          '<span class="care-what">照料 ' + names.map(esc).join('、') +
          (t0 ? '（第 ' + dur(g.h) + '）' : '') + '</span>' +
          (overdue ? '<span class="care-tag">已逾時</span>' : '') +
          '</div>';
      }).join('') + '</div>' +
      /* 算得出 13 個跨 28 天的時刻，卻帶不走等於沒算：關掉分頁就沒了，只能手抄 13 筆進手機。
         站上 fishing／gathering 那套「分頁開著才會響」的鈴聲對 48 小時間隔沒有用，
         真正需要的是丟進手機行事曆。 */
      '<div class="care-actions">' +
        (t0
          ? '<button type="button" class="copy-btn" data-ics="1">📅 匯出照料行事曆（.ics）</button>' +
            '<button type="button" class="copy-btn" data-copy-care="1">複製時程</button>'
          : '<span class="note">填上「開始種的時間」才算得出實際時刻，也才能匯出行事曆。</span>') +
      '</div></div>';
  }

  /* ── 匯出 .ics ────────────────────────────────────────────────────────
     純前端產檔（Blob + a.download），做法同 collection-tracker.js 的進度匯出。
     每筆 15 分鐘、預設提前 2 小時提醒；最後再加一筆收成。 */
  function icsTime(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
  function icsEsc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }
  /* RFC 5545 的 75 octet 折行。中文一字 3 bytes，一行 20 個字就超了。
     依 UTF-8 位元組數計算，且**不從字元中間切**，否則中文會變亂碼。
     內容一律不放 emoji：代理對是 4 bytes、切在中間會直接壞掉。 */
  function icsFold(line) {
    var out = [], cur = '', len = 0;
    for (var i = 0; i < line.length; i++) {
      var code = line.charCodeAt(i);
      var b = code < 0x80 ? 1 : (code < 0x800 ? 2 : 3);
      if (len + b > 73) { out.push(cur); cur = ' '; len = 1; }
      cur += line[i]; len += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function downloadIcs() {
    if (!CARE.t0 || !CARE.groups.length) return;
    var W = DB.rules.care.wiltHours, WH = DB.rules.care.witherHours;
    var stamp = icsTime(Date.now());
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SeaGod Toolbox//Gardening//ZH-TW',
             'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

    function event(uid, startMsAbs, minutes, summary, desc) {
      L.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp,
             'DTSTART:' + icsTime(startMsAbs), 'DTEND:' + icsTime(startMsAbs + minutes * 60000));
      L.push(icsFold('SUMMARY:' + icsEsc(summary)));
      L.push(icsFold('DESCRIPTION:' + icsEsc(desc)));
      L.push('BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY',
             icsFold('DESCRIPTION:' + icsEsc(summary)), 'END:VALARM');
      L.push('END:VEVENT');
    }

    CARE.groups.forEach(function (g) {
      var names = uniq(g.what).join('、');
      event('garden-' + STATE.target + '-c' + g.h + '@seagod99.github.io',
        CARE.t0 + g.h * 3600000, 15,
        'FF14 園藝：照料 ' + names,
        '目標：' + CARE.target + '\n這是最晚要回來的時間——' + W + ' 小時沒照料會枯萎，再 ' + WH +
        ' 小時就枯死。\n水神的工具箱 · 園藝配種計算');
    });
    event('garden-' + STATE.target + '-harvest@seagod99.github.io',
      CARE.t0 + CARE.harvestH * 3600000, 15,
      'FF14 園藝：收成 ' + CARE.target,
      '長到可收成之後就不會再枯死，可以放著慢慢收。\n水神的工具箱 · 園藝配種計算');

    L.push('END:VCALENDAR');

    var blob = new Blob([L.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '園藝照料-' + CARE.target + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    say('planStatus', '已匯出 ' + (CARE.groups.length + 1) + ' 筆行事曆事件。');
  }

  /** 給「複製時程」用的純文字版（貼進 Discord 或記事本）。 */
  function careText() {
    if (!CARE.groups.length) return '';
    var lines = ['【' + CARE.target + '】園藝照料時程'];
    CARE.groups.forEach(function (g) {
      lines.push((CARE.t0 ? at(CARE.t0, g.h) : '第 ' + dur(g.h)) + '　照料 ' + uniq(g.what).join('、'));
    });
    lines.push((CARE.t0 ? at(CARE.t0, CARE.harvestH) : '第 ' + dur(CARE.harvestH)) + '　收成 ' + CARE.target);
    lines.push('— 水神的工具箱 · 園藝配種計算');
    return lines.join('\n');
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
  /* 可點的配方列。目前採用的那組標 aria-pressed="true"（不是只靠顏色）。
     **一定要標時數**：COST／BEST 早就算好了，但原本三行只印種子名，使用者看到的是三行幾乎一樣的
     字，點下去整塊重畫、總覽的天數變了，得自己記住上一個數字再心算差額；想比第三組要再點一次。
     這裡直接標「最省」與相對差額，三行一眼可比。 */
  function recipeButton(c, active, seedId, idx, best) {
    var h = recipeCost(c);
    var tag;
    if (!isFinite(h)) tag = '—';
    else if (h === best) tag = '最省 · ' + dur(h);
    else tag = '+' + dur(h - best);
    return '<button type="button" class="alt-btn" data-alt-seed="' + seedId + '" data-alt-idx="' + idx +
      '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
      (active ? '<span class="chip ok">目前採用</span>' : '') + recipeBody(c) +
      '<span class="alt-cost num">' + tag + '</span></button>';
  }

  function stepCard(s, t0) {
    var c = s.recipe;
    var done = !!DONE[stepKey(s)];
    var also = c.alsoYields && c.alsoYields.length
      ? '<span class="chip warn">⚠ 這組也可能配出 ' + c.alsoYields.map(function (a) { return esc(a.name); }).join('、') +
        '（隨機）· 沒配到重來一輪 +' + s.wait + ' 小時</span>'
      : '';
    var costs = s.p.crossBreeds.map(recipeCost).filter(isFinite);
    var best = costs.length ? Math.min.apply(null, costs) : 0;
    var alts = s.p.crossBreeds.length > 1
      ? '<details class="alts" data-alts-key="' + s.seedId + '"><summary>換一組配方（共 ' +
        s.p.crossBreeds.length + ' 組）</summary><div class="alt-list">' +
        s.p.crossBreeds.map(function (cc, i) { return recipeButton(cc, i === s.idx, s.seedId, i, best); }).join('') +
        '</div></details>' : '';

    return '<div class="step' + (done ? ' done' : '') + '">' +
      chkBtn(stepKey(s), '配出 ' + s.p.seedName) +
      icon(s.p.seedIcon) + '<div class="step-body">' +
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

  function selectSpecies(productId, opts) {
    opts = opts || {};
    var p = BY_PRODUCT.get(productId);
    if (!p || !p.flower) return;
    STATE.species = productId;
    showTab('flower', true, opts.focus);
    document.querySelectorAll('#speciesGrid [data-id]').forEach(function (b) {
      b.setAttribute('aria-pressed', Number(b.dataset.id) === productId ? 'true' : 'false');
    });
    renderFlower(p);
    saveView();
    if (!opts.skipHash) writeHash();
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
      renderAll(); writeHash(); saveView();
    });
    $('allSearch').addEventListener('input', function () { STATE.q = this.value.trim().toLowerCase(); renderAll(); writeHash(); saveView(); });
    $('allSort').addEventListener('change', function () { STATE.sort = this.value; renderAll(); writeHash(); saveView(); });
    // 兩顆鈕都走同一個委派，不要在每次重繪後逐個 addEventListener（原本 [data-flower] 是那樣綁的）
    $('allGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-goto]');
      if (b) { selectTarget(Number(b.dataset.goto), { focus: true }); return; }
      var f = e.target.closest('[data-flower]');
      if (f) selectSpecies(Number(f.dataset.flower), { focus: true });
    });
    renderAll();
  }

  /* 搜尋字串：作物名／種子名／英文名，**外加 9 個花色的完整道具名**。
     花色（紅色三色堇…）在遊戲裡是獨立道具，市場頁的「園藝」管道標的就是它們；
     不收進來的話，從市場頁帶著花色名連過來會落在一片空白上。 */
  var HAY = new Map();
  function searchHay(p) {
    if (!HAY.has(p.productId)) {
      HAY.set(p.productId, (p.name + ' ' + p.seedName + ' ' + (p.nameEn || '') + ' ' + (p.seedNameEn || '') +
        (p.flower ? ' ' + p.flower.colors.map(function (c) { return c.name; }).join(' ') : '')).toLowerCase());
    }
    return HAY.get(p.productId);
  }

  function renderAll() {
    var list = ROWS.filter(function (p) {
      if (STATE.kind === 'cross') { if (!p.seed.crossOnly || !p.crossBreeds.length) return false; }
      else if (STATE.kind === 'minion') { if (!p.minion) return false; }
      else if (STATE.kind !== 'all' && p.kind !== STATE.kind) return false;
      if (!STATE.q) return true;
      return searchHay(p).indexOf(STATE.q) >= 0;
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
