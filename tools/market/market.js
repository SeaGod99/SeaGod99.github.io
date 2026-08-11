/* 水神的工具箱 — 市場查價 / 比價（tools/market/index.html 的頁面邏輯）
 *
 * 原本內嵌在 index.html 裡（近 2900 行），與 600 行 <style> 擠在同一個檔案，
 * 搜尋、跳行、diff 都很痛苦。抽成獨立檔後 index.html 只剩結構與樣式。
 *
 * 依賴（載入順序不可調換，見 index.html 底部）：
 *   assets/js/theme.js        亮/暗色主題
 *   assets/js/patch-gate.js   版本閘門
 *   assets/js/universalis.js  Universalis 用戶端（fillQuote / fetchHistory / TAX_RATE）
 *
 * SW 對同源 .js 走 network-first，改完立刻生效，不必 bump CACHE_VERSION
 * （那支腳本只雜湊 assets/ 下的共用資產）。
 */
(function () {
  'use strict';

  var ICON_CDN = 'https://xivapi.com';
  // localStorage key 一律 `ffxiv_` 開頭，否則首頁的「匯出全站進度」掃不到
  // （它只收 ffxiv_* 前綴）。本頁原本用 sgt-market-*，使用者的清單與草稿
  // 因此從來沒被全站備份帶走過；改名並在 loadState 一次性搬移舊 key。
  var LS_LISTS = 'ffxiv_market_lists';
  var LS_SCOPE = 'ffxiv_market_scope';   // 已停用（保留常數，loadState 會拿它推主伺服器）
  var LS_HOME = 'ffxiv_market_home';
  var LS_FOLD = 'ffxiv_market_panelopen';
  var LS_DRAFT = 'ffxiv_market_draft';
  var LS_OPTS = 'ffxiv_market_opts';
  var LS_CVIEW = 'ffxiv_market_craftview';
  var LS_GOT = 'ffxiv_market_got';
  var LS_PVIEW = 'ffxiv_market_planview';
  var LS_HQO = 'ffxiv_market_hqoverride';
  var LS_POVR = 'ffxiv_market_priceoverride';
  var LS_MIGRATED = 'ffxiv_market_migrated';
  // 舊 key → 新 key（2026-08-10 改名；保留對照表供一次性搬移，勿刪）
  var LS_LEGACY = {
    'sgt-market-lists': LS_LISTS, 'sgt-market-scope': LS_SCOPE, 'sgt-market-draft': LS_DRAFT,
    'sgt-market-opts': LS_OPTS, 'sgt-market-craftview': LS_CVIEW, 'sgt-market-got': LS_GOT,
    'sgt-market-planview': LS_PVIEW
  };
  var PAGE_SIZE = 60;                // 每頁筆數（結果總數不設上限）
  var MAX_DEPTH = 12;
  var MAX_CRAFT_ITEMS = 10;          // 製作清單至多 10 件，避免合併樹狀圖過大
  // 向 Universalis 要幾筆在架明細。成本要「逐筆吃單」算（見 fillQuote），
  // 8 筆對動輒上百個的材料需求根本不夠——最便宜那幾筆常常各只有 1～3 個。
  var LISTINGS_CAP = 30;
  // 市場板交易稅：**買賣兩邊都被抽，各 5%**。
  //   買方：在成交價之上「額外」付 5% 手續費（購買確認畫面會一併列出）
  //   賣方：成交價「之中」被扣 5% 交易稅（交易完成時從貨款扣除）
  // 所以一買一賣的價差要跨過約 10% 才有利潤——方向或邊數弄錯，
  // 利潤試算會整整偏掉一成。
  //
  // （已知但刻意不做進 UI：雇員登記數少的市場會有 2%／5% 的限時減稅活動，
  //   幅度與期限只在遊戲內該市場的出售列表下方看得到，外部 API 拿不到，
  //   做成介面只會變成一個永遠不準的欄位。）
  var taxBuy = Universalis.TAX_RATE;        // 0.05，買方額外付
  var taxSell = Universalis.TAX_RATE;       // 0.05，賣方被扣
  var STALE_MS = 3 * 86400000;       // 超過 3 天沒人上傳＝資料可能不可信
  var BAIT_RATIO = 1.25;             // 加權均價高於最低價這個倍數＝最低價是誘餌單

  // ---- 狀態 ----
  var items = [];
  var itemById = new Map();
  var recipesByItem = null;          // itemId -> 配方（延後載入）
  var usedInByItem = null;           // ingredientId -> Set<成品 itemId>（反查「向上」用途）
  var recipeJobsByItem = null;       // itemId -> Map<職業名, {job, level, stars}>（同職業取最低等級配方）
  var gamePatch = '7.15';
  // 買與賣的範圍**不是同一個**：採購可以跨伺服器（世界訪問），所以 scope 預設全 DC；
  // 但掛售只能在自己角色所在的伺服器，所以售價與利潤一律以 homeWorld 為準。
  // 兩者混用會讓賺錢排行拿「別的伺服器的最低價」當你的售價，那個價你根本掛不上去。
  // 採購一律全 DC——買東西本來就能跨伺服器，讓使用者選「查價範圍」只是逼他做
  // 一個沒有意義的決定（選單服只會看到比較貴或根本沒貨的結果）。保留這個常數是
  // 因為底下十幾處 fetch 都吃它，寫死成 'dc' 比逐處刪乾淨。
  var scope = 'dc';
  var homeWorld = null;              // world id（數字）；null＝尚未設定，賣價無從算起
  var craft = [];                    // [{itemId, qty}]
  var lists = [];                    // 具名清單
  // itemId -> { listings:[原始在架], upload:該物品最後上傳時間, nq/hq/nqWorld/hqWorld:最低價 }
  // 存整份 listings（不只最低價）是為了讓 quote() 能逐筆吃單算真實採購成本。
  var priceMap = new Map();
  // 已查過的價格快取：scope -> Map<id, 上面那個物件>。勾「我有了」只是改計算前提，
  // 不該把整棵樹的價格重查一遍——命中這裡就完全不碰網路，也不重新 parse。
  var priceStore = new Map();
  var lastUpload = 0;
  var excludeCrystals = true;        // 省略水晶（不列入樹與成本），預設開
  var hqProduct = true;              // 可製作成品以 HQ 市價比較，預設開
  var craftView = 'simple';          // 製作清單子分頁：simple（簡易清單）/ tree（樹狀分析）
  var gotMap = {};                   // 「手上已有」的數量：itemId -> 已有數。**會參與計畫計算**：
                                     // 標記已有的節點整個子樹會從計畫消失（清空清單時一併重設）
  var planIndex = new Map();         // 目前計畫每個物品的合計 {qty, need}，供「✓ 我有了」一次補滿
  var planOpen = new Map();          // 計畫清單展開狀態的個別覆寫：path -> 是否展開（不持久化）
  var planAll = null;                // 全部展開／收合：true／false／null＝各自照預設
  var planView = 'tree';             // 製作計畫檢視：tree 階層／direct 直接材料／all 全部素材／base 基礎素材／mid 中間物
  var craftToken = 0;                // 製作清單渲染競態守門（切換檢視時放棄舊的非同步渲染）
  var hqOverride = {};               // 逐物品的 HQ/NQ 覆寫：itemId -> 'hq'｜'nq'（沒設＝跟隨 hqProduct 全域開關）
  var priceOverride = {};            // 「我實際買到的價」：itemId -> 單價。設了就完全取代市價參與計算
  var worldCompare = null;           // 8 服一站購足比較結果（按鈕觸發後才有；換 scope／清單即失效）
  var worldCompareBusy = false;
  var lastBuyList = [];              // 最近一次算出的採買彙總（供「複製清單」用）
  var lastRouteGroups = [];          // 同上，但已依伺服器分好組

  // ---- 工具 ----
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var fmt = function (n) { return Universalis.fmtGil(n); };
  var pctTxt = function (r) { return (Math.round(r * 1000) / 10) + '%'; };
  function iconUrl(it) { return it && it.icon ? ICON_CDN + it.icon : ''; }

  /* 把 items-market.json 的陣列列展開回本頁其餘程式吃的物件形狀。
     列格式：[id, name, categoryIndex, iconNo, marketable(0/1), patch]
     icon 路徑由編號組回——格式固定是 /i/<編號/1000*1000>/<編號>.png，
     build 腳本已對 43748 筆驗證過資料夾都推得回來（不符就會中止不產檔）。 */
  function expandMarketItems(db) {
    var cats = db.categories || [];
    return db.data.map(function (r) {
      var no = r[3];                       // -1 ＝沒有 icon；0 是合法編號，不能當假值判斷
      var icon = no < 0 ? null
        : '/i/' + String(Math.floor(no / 1000) * 1000).padStart(6, '0') + '/' + String(no).padStart(6, '0') + '.png';
      return {
        id: r[0], name: r[1],
        category: cats[r[2]] || null,      // 空字串還原成 null，與 items.json 一致
        icon: icon, marketable: !!r[4], patch: r[5] || null
      };
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function relTime(ms) {
    if (!ms) return '';
    var d = Date.now() - ms, m = Math.round(d / 60000);
    if (m < 1) return '剛剛';
    if (m < 60) return m + ' 分鐘前';
    var h = Math.round(m / 60); if (h < 24) return h + ' 小時前';
    return Math.round(h / 24) + ' 天前';
  }
  function scopeLabel() { return scope === 'dc' ? '全DC（陸行鳥）' : Universalis.worldName(Number(scope)); }
  function isDcMode() { return scope === 'dc'; }

  // ---- localStorage ----
  // 舊 sgt-market-* → 新 ffxiv_market_*。只搬一次（記在 LS_MIGRATED），
  // 且**不刪舊 key**：使用者可能在別的分頁開著舊版頁面，刪掉會讓那邊當場失去資料。
  function migrateLegacyKeys() {
    try {
      if (localStorage.getItem(LS_MIGRATED)) return;
      Object.keys(LS_LEGACY).forEach(function (old) {
        var v = localStorage.getItem(old);
        if (v != null && localStorage.getItem(LS_LEGACY[old]) == null) localStorage.setItem(LS_LEGACY[old], v);
      });
      localStorage.setItem(LS_MIGRATED, '1');
    } catch (e) {}
  }
  function loadState() {
    migrateLegacyKeys();
    // 舊版的「查價範圍」若存的是單一伺服器，順勢當成他的主伺服器——
    // 會去選單服的人，多半就是在看自己那一服。
    try {
      var h = localStorage.getItem(LS_HOME);
      if (h == null) { var old = localStorage.getItem(LS_SCOPE); if (old && old !== 'dc') h = old; }
      var hn = Number(h);
      if (Number.isFinite(hn) && Universalis.WORLDS[hn]) homeWorld = hn;
    } catch (e) {}
    try { lists = JSON.parse(localStorage.getItem(LS_LISTS) || '[]'); } catch (e) { lists = []; }
    try { craft = JSON.parse(localStorage.getItem(LS_DRAFT) || '[]'); } catch (e) { craft = []; }
    try { var o = JSON.parse(localStorage.getItem(LS_OPTS) || '{}'); if (o && typeof o === 'object') { if (o.excludeCrystals != null) excludeCrystals = !!o.excludeCrystals; if (o.hqProduct != null) hqProduct = !!o.hqProduct; } } catch (e) {}
    try { var cv = localStorage.getItem(LS_CVIEW); if (cv === 'simple' || cv === 'tree') craftView = cv; } catch (e) {}
    try { gotMap = JSON.parse(localStorage.getItem(LS_GOT) || '{}'); } catch (e) { gotMap = {}; }
    try { var pv = localStorage.getItem(LS_PVIEW); if (pv && ['tree', 'direct', 'all', 'base', 'mid'].indexOf(pv) >= 0) planView = pv; } catch (e) {}
    try { hqOverride = JSON.parse(localStorage.getItem(LS_HQO) || '{}'); } catch (e) { hqOverride = {}; }
    try { priceOverride = JSON.parse(localStorage.getItem(LS_POVR) || '{}'); } catch (e) { priceOverride = {}; }
    try {
      var fo = JSON.parse(localStorage.getItem(LS_FOLD) || '{}');
      if (fo && typeof fo === 'object') Object.keys(panelOpen).forEach(function (k) { if (fo[k] != null) panelOpen[k] = !!fo[k]; });
    } catch (e) {}
    if (!gotMap || typeof gotMap !== 'object' || Array.isArray(gotMap)) gotMap = {};
    if (!hqOverride || typeof hqOverride !== 'object' || Array.isArray(hqOverride)) hqOverride = {};
    if (!priceOverride || typeof priceOverride !== 'object' || Array.isArray(priceOverride)) priceOverride = {};
    if (!Array.isArray(lists)) lists = [];
    if (!Array.isArray(craft)) craft = [];
  }
  function saveLists() { try { localStorage.setItem(LS_LISTS, JSON.stringify(lists)); } catch (e) {} }
  function saveDraft() { try { localStorage.setItem(LS_DRAFT, JSON.stringify(craft)); } catch (e) {} }
  function saveHome() { try { localStorage.setItem(LS_HOME, homeWorld == null ? '' : String(homeWorld)); } catch (e) {} }
  function saveOpts() { try { localStorage.setItem(LS_OPTS, JSON.stringify({ excludeCrystals: excludeCrystals, hqProduct: hqProduct })); } catch (e) {} }
  function saveCview() { try { localStorage.setItem(LS_CVIEW, craftView); } catch (e) {} }
  function saveGot() { try { localStorage.setItem(LS_GOT, JSON.stringify(gotMap)); } catch (e) {} }
  function savePview() { try { localStorage.setItem(LS_PVIEW, planView); } catch (e) {} }
  function saveHqo() { try { localStorage.setItem(LS_HQO, JSON.stringify(hqOverride)); } catch (e) {} }
  function savePovr() { try { localStorage.setItem(LS_POVR, JSON.stringify(priceOverride)); } catch (e) {} }
  function gotOf(id) { var v = Number(gotMap[id]); return isFinite(v) && v > 0 ? Math.floor(v) : 0; }
  function ovrOf(id) { var v = Number(priceOverride[id]); return isFinite(v) && v > 0 ? v : null; }

  function isCrystal(id) { var it = itemById.get(id); return !!(it && it.category === '水晶'); }
  function getQty(id) { var c = craft.find(function (x) { return x.itemId === id; }); return c ? c.qty : 1; }
  function copyName(name) {
    // clipboard API 失敗時退回 execCommand（非安全環境／遊戲內瀏覽器）
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = name;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(name).catch(fallback);
    } else {
      fallback();
    }
  }

  // 採買清單轉純文字。玩家實際是對著第二螢幕邊看邊買的，逐筆點「複製名稱」太慢；
  // 依伺服器分組的版本則對應「跑一趟買一批」的實際動線。
  function planText(mode) {
    var head = '【FF14 採買清單】採購範圍：' + scopeLabel() + '　' + new Date().toLocaleString('zh-TW');
    if (mode === 'world' && lastRouteGroups.length) {
      return head + '\n' + lastRouteGroups.map(function (e) {
        return '\n── ' + e[0] + '（' + fmt(e[1].sub) + ' G）──\n' +
          e[1].items.map(function (r) { return r.name + ' ×' + r.qty; }).join('\n');
      }).join('\n');
    }
    var sum = lastBuyList.reduce(function (a, r) { return a + (r.sub || 0); }, 0);
    return head + '\n' + lastBuyList.map(function (r) {
      return r.name + ' ×' + r.qty + '　' + (r.sub != null ? fmt(r.sub) + ' G' : '（無市價）');
    }).join('\n') + '\n合計 ' + fmt(sum) + ' G';
  }

  // ---- 延遲載入工具：promise 記憶化（背景預載與使用時同呼叫不重複抓取；失敗清空可重試）----
  function lazyJson(url) {
    var p = null;
    return function () {
      if (!p) p = fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
        return r.json();
      }).catch(function (e) { p = null; throw e; });
      return p;
    };
  }

  // ---- 取得管道（market-sources.json：{ id: [{t,d,w,map}] }）----
  // 由 scripts/build-market-sources.mjs 從 obtainable-methods／gathering／gc-shop
  // 壓縮而來（7.7MB → 52KB gzip），只收配方會用到的物品。延遲載入：開了某個物品的
  // 詳情才抓，不影響首屏。
  var sourcesDb = null;
  var loadSourcesRaw = lazyJson('../../data/market-sources.json');
  function ensureSources() {
    return loadSourcesRaw().then(function (d) { sourcesDb = d.data || {}; return sourcesDb; });
  }

  var SRC_TAG_CLASS = {
    '採集': 'src-gather', '軍票兌換': 'src-seal', '兌換': 'src-shop', 'NPC商店': 'src-shop',
    '無人島': 'src-island', '園藝': 'src-gather', '副本': 'src-duty', '危命任務': 'src-duty',
    '任務獎勵': 'src-duty'
  };
  // 「照著做得出來」的管道：有座標、有貨幣價、有 NPC，看完就知道下一步。
  // 其餘（遠航探索／寶箱／精製／分解／雇員／副本…）上游資料只有一個數量，
  // 說「1 種寶箱開得到」等於沒說——不佔一整列，收成一行類型清單就好。
  var SRC_ACTIONABLE = { '採集': 1, '軍票兌換': 1, '兌換': 1, 'NPC商店': 1, '園藝': 1, '無人島': 1 };

  async function renderSources(el, id) {
    var it = itemById.get(id);
    var untradable = !!(it && !it.marketable);
    try { await ensureSources(); }
    catch (e) {
      el.innerHTML = untradable ? '<div class="note">此物品無法在市場交易。（取得管道資料載入失敗）</div>' : '';
      return;
    }
    var list = sourcesDb[id];
    if (!list || !list.length) {
      el.innerHTML = untradable
        ? '<div class="note">不可交易，站內也查不到取得管道。</div>'
        : '';
      return;
    }

    var main = list.filter(function (s) { return SRC_ACTIONABLE[s.t]; });
    var vague = list.filter(function (s) { return !SRC_ACTIONABLE[s.t]; });
    var vagueTypes = [];
    vague.forEach(function (s) { if (vagueTypes.indexOf(s.t) < 0) vagueTypes.push(s.t); });

    // 摘要要在收合狀態下就有用：講第一個可行管道 ＋ 還有幾條
    var head = main.length
      ? main[0].t + (main[0].w ? '（' + main[0].w + '）' : '') +
        (list.length > 1 ? ' 等 ' + list.length + ' 種管道' : '')
      : vagueTypes.join('、');

    // 走跟其他區塊同一套 foldHtml——先前自己刻一份 .src-box，底色與內距都不同，
    // 夾在一串 .fold 中間看起來像誤植的另一種元件。
    // 不可交易的物品，這一區就是答案，預設展開；可交易的只是補充，跟隨使用者偏好。
    var body =
      (main.length ? '<div class="src-list">' + main.map(function (s) {
        return '<div class="src-row">' +
          '<span class="src-tag ' + (SRC_TAG_CLASS[s.t] || 'src-other') + '">' + esc(s.t) + '</span>' +
          '<span class="src-d">' + esc(s.d) + '</span>' +
          (s.w ? '<span class="src-where">' + esc(s.w) + '</span>' : '') +
          '</div>';
      }).join('') + '</div>' : '') +
      // 這些管道上游只記了「有」、沒有地點或對象；不必向使用者解釋為什麼沒有細節
      (vagueTypes.length
        ? '<div class="src-vague"><span>另可由</span><span class="flag-run">' + vagueTypes.map(function (t) {
            return '<span class="src-tag ' + (SRC_TAG_CLASS[t] || 'src-other') + '">' + esc(t) + '</span>';
          }).join('') + '</span><span>取得</span></div>'
        : '');

    el.innerHTML = foldHtml('src',
      untradable ? '🔒 不可交易 · 要自己去弄' : '🧭 也可以自己取得',
      esc(head), body, untradable);
    bindFolds(el);
  }

  // ---- 裝備限制資料（equip.json：{ jobs, names, items: {id:[裝等,[職業索引]]} }）----
  var equipData = null;
  var loadEquipRaw = lazyJson('../../data/equip.json');
  function ensureEquip() {
    return loadEquipRaw().then(function (d) { equipData = d; return d; });
  }

  // 職能分類（名稱依繁中版官方網站：防護職業/治療職業；進攻依官方敘述拆近戰/遠程物理/遠程魔法）。
  // 集合含基礎職——低等裝備的職業清單常只標基礎職；「全職業可裝」＝含 ADV 標記的無職業限制裝備。
  var EQUIP_ROLES = [
    { key: 'all',      name: '全職業可裝',   abbrs: ['ADV'] },
    { key: 'tank',     name: '防護職業',     abbrs: ['GLA', 'PLD', 'MRD', 'WAR', 'DRK', 'GNB'] },
    { key: 'healer',   name: '治療職業',     abbrs: ['CNJ', 'WHM', 'SCH', 'AST', 'SGE'] },
    { key: 'melee',    name: '近戰職業',     abbrs: ['PGL', 'MNK', 'LNC', 'DRG', 'ROG', 'NIN', 'SAM', 'RPR', 'VPR'] },
    { key: 'pranged',  name: '遠程物理職業', abbrs: ['ARC', 'BRD', 'MCH', 'DNC'] },
    { key: 'caster',   name: '遠程魔法職業', abbrs: ['THM', 'BLM', 'ACN', 'SMN', 'RDM', 'BLU', 'PCT'] },
    { key: 'crafter',  name: '製作職業',     abbrs: ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'] },
    { key: 'gatherer', name: '採集職業',     abbrs: ['MIN', 'BTN', 'FSH'] }
  ];
  // 個別職業選單不列出基礎職與冒險者（僅在職能集合內參與比對）
  var HIDDEN_JOBS = { ADV: 1, GLA: 1, PGL: 1, MRD: 1, LNC: 1, ARC: 1, CNJ: 1, THM: 1, ACN: 1, ROG: 1 };

  // 選單值 → 職業索引集合：'g:tank'＝職能、'j:PLD'＝單一職業；需 equipData 已載入
  function equipJobIdxSet(ej) {
    var abbrs;
    if (ej.indexOf('g:') === 0) {
      var role = null;
      for (var i = 0; i < EQUIP_ROLES.length; i++) if (EQUIP_ROLES[i].key === ej.slice(2)) role = EQUIP_ROLES[i];
      abbrs = role ? role.abbrs : [];
    } else {
      abbrs = [ej.slice(2)];
    }
    var s = new Set();
    abbrs.forEach(function (a) { var idx = equipData.jobs.indexOf(a); if (idx >= 0) s.add(idx); });
    return s;
  }
  function equipJobLabel(ej) {
    if (ej.indexOf('g:') === 0) {
      for (var i = 0; i < EQUIP_ROLES.length; i++) if (EQUIP_ROLES[i].key === ej.slice(2)) return EQUIP_ROLES[i].name;
      return ej;
    }
    return equipData ? equipData.names[ej.slice(2)] : ej.slice(2);
  }

  // ---- 配方索引（延後載入）----
  var loadRecipesRaw = lazyJson('../../data/recipes.json');
  var recipesPromise = null;
  function ensureRecipes() {
    if (!recipesPromise) recipesPromise = loadRecipes().catch(function (e) { recipesPromise = null; throw e; });
    return recipesPromise;
  }
  async function loadRecipes() {
    var db = await loadRecipesRaw();
    recipesByItem = new Map();
    usedInByItem = new Map();
    recipeJobsByItem = new Map();
    var score = function (r) { return (r.expert ? 1e6 : 0) + (r.rlvl || 0); };
    for (var i = 0; i < db.data.length; i++) {
      var r = db.data[i];
      var cur = recipesByItem.get(r.itemId);
      if (!cur || score(r) < score(cur)) recipesByItem.set(r.itemId, r);
      if (r.job) {
        var jm = recipeJobsByItem.get(r.itemId);
        if (!jm) { jm = new Map(); recipeJobsByItem.set(r.itemId, jm); }
        var ej = jm.get(r.job);
        if (!ej || r.level < ej.level) jm.set(r.job, { job: r.job, level: r.level, stars: r.stars || 0 });
      }
      for (var j = 0; j < r.ingredients.length; j++) {
        var gid = r.ingredients[j].itemId;
        var s = usedInByItem.get(gid);
        if (!s) { s = new Set(); usedInByItem.set(gid, s); }
        s.add(r.itemId);
      }
    }
    return recipesByItem;
  }

  // 可製作物品的職業＋等級需求文字（需先 ensureRecipes），如「鍛鐵匠 Lv.62★★／鑄甲匠 Lv.61」
  function craftJobsText(id) {
    var jm = recipeJobsByItem && recipeJobsByItem.get(id);
    if (!jm || !jm.size) return '';
    return Array.from(jm.values()).map(function (j) {
      return j.job + ' Lv.' + j.level + (j.stars ? Array(j.stars + 1).join('★') : '');
    }).join('／');
  }
  // 詳情視窗副標用
  function craftJobsHtml(id) {
    var txt = craftJobsText(id);
    return txt ? ' · 🔨 製作：' + esc(txt) : '';
  }
  // 搜尋卡用（配方載入完成前回空字串，載入後由 init 補渲染）
  function craftJobsLine(id) {
    var txt = craftJobsText(id);
    return txt ? '<span class="result-craft">🔨 ' + esc(txt) + '</span>' : '';
  }

  // ===================== 搜尋（全延遲觸發：條件皆 staged，按搜尋鈕／Enter 才執行）=====================
  var jobFilter = new Set();         // 製作職業篩選（複選；空＝不篩）
  var searchOut = [];                // 目前搜尋結果（換頁重繪用）
  var searchPage = 1;                // 目前頁碼
  var searchToken = 0;               // 連續搜尋競態守門

  function matchesJobFilter(it) {
    if (!jobFilter.size) return true;
    var jm = recipeJobsByItem && recipeJobsByItem.get(it.id);
    if (!jm) return false;
    var ks = Array.from(jm.keys());
    for (var i = 0; i < ks.length; i++) if (jobFilter.has(ks[i])) return true;
    return false;
  }

  // 範圍輸入解析：留空＝不限；min>max 靜默交換（同時回寫輸入框讓交換可見）
  function parseRange(minEl, maxEl) {
    var min = minEl.value === '' ? null : Math.max(1, parseInt(minEl.value, 10) || 1);
    var max = maxEl.value === '' ? null : Math.max(1, parseInt(maxEl.value, 10) || 1);
    if (min != null && max != null && min > max) {
      var t = min; min = max; max = t;
      minEl.value = min; maxEl.value = max;
    }
    return { min: min, max: max, active: min != null || max != null };
  }

  // 製作等級：任一配方職業等級落在範圍內（若有選職業 chips，只看被選職業的配方）
  function matchesCraftLv(it, cr) {
    if (!cr.active) return true;
    var jm = recipeJobsByItem && recipeJobsByItem.get(it.id);
    if (!jm) return false;
    var ok = false;
    jm.forEach(function (j) {
      if (ok) return;
      if (jobFilter.size && !jobFilter.has(j.job)) return;
      if ((cr.min == null || j.level >= cr.min) && (cr.max == null || j.level <= cr.max)) ok = true;
    });
    return ok;
  }

  // 裝備限制：非裝備物品在任一裝備條件下一律排除；ejSet＝允許職業索引集合（null＝不篩）
  function matchesEquip(it, er, ejSet) {
    if (!er.active && !ejSet) return true;
    var e = equipData && equipData.items[it.id];
    if (!e) return false;
    if (er.min != null && e[0] < er.min) return false;
    if (er.max != null && e[0] > er.max) return false;
    if (ejSet) {
      var hit = false;
      for (var i = 0; i < e[1].length; i++) if (ejSet.has(e[1][i])) { hit = true; break; }
      if (!hit) return false;
    }
    return true;
  }

  // 排序鍵：製作＝各職業配方最高等級需求（★ 當小數細分）；裝備＝裝備等級。無資料回 -1（固定排最後）
  function craftLevelKey(id) {
    var jm = recipeJobsByItem && recipeJobsByItem.get(id);
    if (!jm || !jm.size) return -1;
    var mx = 0;
    jm.forEach(function (j) { var k = j.level + (j.stars || 0) / 10; if (k > mx) mx = k; });
    return mx;
  }
  function equipLevelKey(id) {
    var e = equipData && equipData.items[id];
    return e ? e[0] : -1;
  }

  function resultCardHtml(it) {
    var tags = '';
    if (!it.marketable) tags += '<span class="tag untradable">不可交易</span>';
    return '<div class="result-card" data-id="' + it.id + '" title="點擊查看即時價格與在架明細">' +
      '<img class="item-icon" src="' + iconUrl(it) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="result-meta"><span class="result-name">' + esc(it.name) + '</span>' +
      '<span class="result-cat">' + esc(it.category || '') + '</span>' + craftJobsLine(it.id) + '</div>' + tags +
      '</div>';
  }

  // 條件變更（尚未執行）→ 搜尋鈕高亮提示
  function markDirty() { $('#searchBtn').classList.add('dirty'); }

  // 目前生效條件的人話描述（查無訊息點名兇手用）
  function condsText(cr, er, ej, cat, onlyMk) {
    var parts = [];
    if (jobFilter.size) parts.push('製作職業：' + Array.from(jobFilter).join('、'));
    if (cr.active) parts.push('製作等級 ' + (cr.min == null ? '1' : cr.min) + '–' + (cr.max == null ? '不限' : cr.max));
    if (er.active) parts.push('裝備等級 ' + (er.min == null ? '1' : er.min) + '–' + (er.max == null ? '不限' : er.max));
    if (ej !== '') parts.push('裝備職業：' + equipJobLabel(ej));
    if (cat) parts.push('分類：' + cat);
    if (onlyMk) parts.push('只看可上市場板');
    return parts.length ? '（' + parts.join('；') + '）' : '';
  }

  // 執行搜尋：讀取目前所有條件 → 平行載入所需資料 → 過濾＋排序＋分頁
  async function executeSearch() {
    var box = $('#searchResults');
    var q = $('#searchInput').value.trim();
    var cr = parseRange($('#craftMin'), $('#craftMax'));
    var er = parseRange($('#equipMin'), $('#equipMax'));
    var ej = $('#equipJob').value;
    var sort = $('#sortSel').value;
    var cat = $('#catSel').value;
    var onlyMk = $('#onlyMarket').checked;
    searchOut = []; searchPage = 1;

    var hasCond = jobFilter.size || cr.active || er.active || ej !== '' || cat !== '' || onlyMk;
    if (!q && !hasCond) {
      box.innerHTML = '<div class="search-note">請輸入關鍵字或設定篩選條件。</div>';
      $('#searchBtn').classList.remove('dirty');
      return;
    }
    $('#searchBtn').classList.remove('dirty');

    // 需要的資料平行載入；失敗明確報錯，絕不靜默顯示查無（ENG-1）
    var needs = [ensureRecipes()];   // 卡片職業列與製作排序皆用（init 已背景預載，多半即時）
    if (er.active || ej !== '' || sort.indexOf('equip') === 0) needs.push(ensureEquip());
    var t = ++searchToken;
    box.innerHTML = '<div class="search-note">查詢中…</div>';
    try { await Promise.all(needs); }
    catch (e) {
      if (t !== searchToken) return;
      box.innerHTML = '<div class="search-note" style="color:var(--red)">資料載入失敗，請按上方「↻ 重新整理」或稍後再按搜尋重試。</div>';
      return;
    }
    if (t !== searchToken) return;   // 期間又按了一次搜尋

    var ejSet = ej !== '' ? equipJobIdxSet(ej) : null;
    var starts = [], contains = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.name || !PatchGate.released(it.patch, gamePatch)) continue;
      if (onlyMk && !it.marketable) continue;
      if (cat !== '' && it.category !== cat) continue;
      if (!matchesJobFilter(it)) continue;
      if (!matchesCraftLv(it, cr)) continue;
      if (!matchesEquip(it, er, ejSet)) continue;
      if (!q) starts.push(it);       // 純條件查詢（按鈕制下意圖明確，允許）
      else {
        var idx = it.name.indexOf(q);
        if (idx === 0) starts.push(it);
        else if (idx > 0) contains.push(it);
      }
    }
    // 可交易物品優先（查價工具主要對象），組內維持原順序
    var byMarketable = function (a, b) { return (b.marketable ? 1 : 0) - (a.marketable ? 1 : 0); };
    starts.sort(byMarketable);
    contains.sort(byMarketable);
    searchOut = starts.concat(contains);
    // 等級排序（穩定排序，等級相同時保留原相關性順序；無對應資料一律排最後）
    var keyFn = sort.indexOf('equip') === 0 ? equipLevelKey : craftLevelKey;
    var dir = /Asc$/.test(sort) ? 1 : -1;
    searchOut.sort(function (a, b) {
      var la = keyFn(a.id), lb = keyFn(b.id);
      if (la < 0 && lb < 0) return 0;
      if (la < 0) return 1;
      if (lb < 0) return -1;
      return (la - lb) * dir;
    });
    if (!searchOut.length) {
      box.innerHTML = '<div class="search-note">查無符合' + (q ? '「' + esc(q) + '」' : '') +
        esc(condsText(cr, er, ej, cat, onlyMk)) + '的物品</div>';
      return;
    }
    renderResultsPage(false);
  }

  // 分頁渲染：每頁 PAGE_SIZE 筆，換頁時捲回結果頂端
  function renderResultsPage(scrollTop) {
    var box = $('#searchResults');
    var total = searchOut.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (searchPage < 1) searchPage = 1;
    if (searchPage > pages) searchPage = pages;
    var slice = searchOut.slice((searchPage - 1) * PAGE_SIZE, searchPage * PAGE_SIZE);
    var pager = '<div class="search-pager"><span>共 ' + fmt(total) + ' 筆' +
      (pages > 1 ? ' · 第 ' + searchPage + '/' + pages + ' 頁' : '') + '</span>';
    if (pages > 1) {
      pager += '<span style="margin-left:auto"></span>' +
        '<button class="page-btn" data-page="' + (searchPage - 1) + '"' + (searchPage <= 1 ? ' disabled' : '') + '>‹ 上一頁</button>';
      // 頁碼視窗：1、2 … 當前±2 … 末兩頁（頁數多時不整排展開）
      var win = [];
      var push = function (p) { if (p >= 1 && p <= pages && win.indexOf(p) < 0) win.push(p); };
      push(1); push(2);
      for (var p = searchPage - 2; p <= searchPage + 2; p++) push(p);
      push(pages - 1); push(pages);
      win.sort(function (a, b) { return a - b; });
      var last = 0;
      win.forEach(function (p2) {
        if (p2 - last > 1) pager += '<span class="page-gap">…</span>';
        pager += '<button class="page-btn' + (p2 === searchPage ? ' active' : '') + '" data-page="' + p2 + '">' + p2 + '</button>';
        last = p2;
      });
      pager += '<button class="page-btn" data-page="' + (searchPage + 1) + '"' + (searchPage >= pages ? ' disabled' : '') + '>下一頁 ›</button>';
    }
    pager += '</div>';
    box.innerHTML = slice.map(resultCardHtml).join('') + pager;
    if (scrollTop) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ===================== 單品明細 =====================
  var detailHq = false; // 明細表 HQ/NQ 篩選
  var currentDetailId = null;
  var bulkQty = {};     // 單品面板「買 N 個」試算的輸入值：itemId -> 數量
  // 單品面板各折疊區塊的展開狀態（跨物品、跨開關頁共用並持久化）。
  // 預設全部收合：一次攤開走勢＋試算＋利潤＋取得管道＋在架明細＋配方，資訊量過大。
  var panelOpen = { hist: false, calc: false, profit: false, src: false, listings: false, recipe: false };
  function savePanelOpen() { try { localStorage.setItem(LS_FOLD, JSON.stringify(panelOpen)); } catch (e) {} }

  // ── 市場面板（單品詳情與節點視窗共用）────────────────────────────────
  // 兩邊本來各寫一份、內容也各缺一半；抽成同一組函式，之後只有一個地方要改。

  async function fetchItemMarket(id) {
    var r = await Promise.all([
      Universalis.fetchAggregated(scope, [id]),
      Universalis.fetchListings(scope, [id], { listings: LISTINGS_CAP }),
      Universalis.fetchHistory(scope, [id], { entries: 100, days: 30 })
    ]);
    var lstItem = r[1] && r[1].items ? r[1].items[id] : null;
    return {
      ok: !!(r[0] || r[1]),
      agg: r[0] && r[0].items ? r[0].items[id] : null,
      lst: lstItem,
      hist: r[2] && r[2].items ? r[2].items[id] : null,
      // quoteFrom 吃的價格紀錄（這份資料沒有進 priceMap，面板自己持有）
      rec: lstItem ? { listings: lstItem.listings || [], upload: lstItem.lastUploadTime || 0, cap: LISTINGS_CAP } : null
    };
  }

  // 近 30 日成交價的分佈。回傳 null＝樣本太少（<5 筆）不足以下結論——
  // 寧可不講，也不要拿 3 筆成交去告訴人家「現在偏貴」。
  function priceStats(histItem, hq) {
    var es = (histItem && histItem.entries) || [];
    var ps = es.filter(function (e) { return hq == null ? true : (!!e.hq === hq); })
               .map(function (e) { return e.pricePerUnit; })
               .filter(function (p) { return isFinite(p) && p > 0; });
    if (ps.length < 5) return null;
    var sorted = ps.slice().sort(function (a, b) { return a - b; });
    return {
      n: sorted.length, min: sorted[0], max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      pctOf: function (v) {
        var below = 0;
        for (var i = 0; i < sorted.length; i++) if (sorted[i] < v) below++;
        return Math.round(100 * below / sorted.length);
      }
    };
  }

  // 迷你走勢圖。依 ui-ux-pro-max：折線圖屬 AA，但**圖只是輔助**——
  // 主要結論一定要有文字版（下面的百分位句子），且 role="img" 要有完整 aria-label。
  // 不做進場動畫（prefers-reduced-motion 下本來就該讀得到資料）。
  function sparklineSvg(histItem, hq, label) {
    var es = ((histItem && histItem.entries) || [])
      .filter(function (e) { return hq == null ? true : (!!e.hq === hq); })
      .filter(function (e) { return isFinite(e.pricePerUnit) && e.timestamp; })
      .slice().sort(function (a, b) { return a.timestamp - b.timestamp; });
    if (es.length < 5) return '';
    var W = 240, H = 44, PAD = 3;
    var ps = es.map(function (e) { return e.pricePerUnit; });
    var lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps);
    var span = (hi - lo) || 1;
    var t0 = es[0].timestamp, t1 = es[es.length - 1].timestamp;
    var tspan = (t1 - t0) || 1;
    var pts = es.map(function (e) {
      var x = PAD + (W - 2 * PAD) * (e.timestamp - t0) / tspan;
      var y = PAD + (H - 2 * PAD) * (1 - (e.pricePerUnit - lo) / span);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var last = es[es.length - 1];
    var lx = PAD + (W - 2 * PAD), ly = PAD + (H - 2 * PAD) * (1 - (last.pricePerUnit - lo) / span);
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="' + esc(label + '：近 ' + es.length + ' 筆成交價走勢，最低 ' + fmt(lo) + ' G、最高 ' + fmt(hi) + ' G，最新 ' + fmt(last.pricePerUnit) + ' G') + '">' +
      '<polyline class="spark-line" points="' + pts + '" />' +
      '<circle class="spark-dot" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="2.5" />' +
      '</svg>';
  }

  // 走勢區塊：文字結論在前、圖在後（圖是輔助，不是主要載體）
  function historyHtml(histItem, curUnit, hq, label) {
    var st = priceStats(histItem, hq);
    if (!st) return '<div class="note">近 30 日成交樣本不足，無法判斷價位高低。</div>';
    var line = '';
    if (curUnit != null) {
      var p = st.pctOf(curUnit);
      var verdict = p >= 75 ? { t: '偏高', c: 'bad' } : p <= 25 ? { t: '偏低', c: 'good' } : { t: '中間帶', c: '' };
      line = '<div class="hist-verdict">目前最低價 <b>' + fmt(curUnit) + ' G</b>　位於近 30 日 ' + st.n + ' 筆成交的第 ' +
        '<b class="' + verdict.c + '">' + p + '</b> 百分位（' + verdict.t + '）</div>';
    }
    // ⚠ 這一排是「近 30 日**成交**價」的分佈，跟上面那句的「目前**掛單**最低價」
    //   不是同一種數字。不標清楚會出現「目前最低 60，最低卻寫 100」的誤讀。
    return line +
      '<div class="hist-range"><span>成交最低 ' + fmt(st.min) + '</span><span>中位 ' + fmt(st.median) + '</span><span>成交最高 ' + fmt(st.max) + '</span></div>' +
      sparklineSvg(histItem, hq, label);
  }

  // 「買 N 個要多少」——本頁最核心的修正（不是最低價 × N）就在這裡看得最清楚
  function bulkCalcHtml(id, rec) {
    var n = bulkQty[id] || 1;
    var q = rec ? quoteBuy(rec, id, n, detailHq) : null;
    var body;
    if (!q) body = '<span class="note">此品質目前沒有在架商品。</span>';
    else body = '<span class="bulk-out">實付 <b>' + fmt(q.total) + '</b> G' +
      '<span class="plan-of">（市價 ' + fmt(q.subtotal) + ' ＋ ' + pctTxt(taxBuy) + ' 稅 ' + fmt(q.tax) + '）</span>' +
      '　·　未稅均價 <b>' + fmt(q.unit) + '</b> G/個' +
      (q.minUnit !== q.unit ? '　<span class="plan-of">（最低價那筆是 ' + fmt(q.minUnit) + ' G，只有 ' + q.minQty + ' 個）</span>' : '') +
      '</span>' + flagsHtml(q, id, false);
    return '<div class="bulk-row"><label for="bulkQty' + id + '">買</label>' +
      '<input type="number" id="bulkQty' + id + '" class="bulk-input" min="1" max="9999" value="' + n + '" data-bulk="' + id + '">' +
      '<span>個 ' + (detailHq ? 'HQ' : 'NQ') + '：</span>' + body + '</div>';
  }

  // ── 製作利潤試算 ────────────────────────────────────────────────────
  //
  // 這一頁本來只回答「多少錢」，不回答「值不值得做」。缺的是賣方視角：
  //   淨利 = 售價 × (1 − 5% 交易稅) − 材料成本
  // 稅是**賣方**負擔（買方付標價、雇員收到的是扣稅後的錢），所以只作用在售價側。
  //
  // ⚠ 流動性必須跟利潤一起看：賺 50 萬但一週賣一件，跟賺 5 萬但一天賣 20 件，
  //   是完全不同的兩件事。只報利潤會讓人去做賣不掉的東西。
  //
  // 成本這裡取「第一層直接材料的市價」——這是製作利潤的通用基準，而且一次請求就夠。
  // 完整逐層最省成本（會自動判斷中間物該買還是該做）請用製作清單，兩者會不一樣。
  async function directCraftCost(id, qty) {
    var r = recipesByItem.get(id);
    if (!r) return null;
    var batches = Math.ceil(qty / (r.yield || 1));
    var ings = r.ingredients.filter(function (g) { return !(excludeCrystals && isCrystal(g.itemId)); });
    if (!ings.length) return { cost: 0, rows: [], na: [], batches: batches, made: batches * (r.yield || 1) };
    var lst = await Universalis.fetchListings(scope, ings.map(function (g) { return g.itemId; }), { listings: LISTINGS_CAP });
    var cost = 0, rows = [], na = [];
    ings.forEach(function (g) {
      var it = itemById.get(g.itemId);
      var need = batches * g.qty;
      var d = lst && lst.items ? lst.items[g.itemId] : null;
      var rec = d ? { listings: d.listings || [], upload: d.lastUploadTime || 0, cap: LISTINGS_CAP } : null;
      var q = rec ? quoteBuy(rec, g.itemId, need, false) : null;   // 材料是買的 → 含買方稅
      if (q) cost += q.total; else na.push(it ? it.name : '#' + g.itemId);
      rows.push({ id: g.itemId, name: it ? it.name : '#' + g.itemId, need: need, q: q, marketable: !!(it && it.marketable) });
    });
    return { cost: cost, rows: rows, na: na, batches: batches, made: batches * (r.yield || 1) };
  }

  // cost 進來時**已含買方稅**（quoteBuy）；這裡只處理賣方那一側。
  function profitHtml(sellUnit, qty, cost, na, velocity, hqLabel, made, sellWhere) {
    var gross = sellUnit * qty;
    var tax = gross * taxSell;
    var net = gross - tax - cost;
    var rate = cost > 0 ? (net / cost) : null;
    var days = velocity > 0 ? (qty / velocity) : null;
    // 正負值除了顏色一定要帶符號與文字，不可只靠紅綠（color-not-only）
    var sign = net > 0 ? '＋' : net < 0 ? '−' : '';
    var cls = net > 0 ? 'good' : net < 0 ? 'bad' : '';
    var arrow = net > 0 ? '▲' : net < 0 ? '▼' : '＝';
    return '<div class="profit-grid">' +
      '<div class="pf"><span class="pf-l">售出 ' + qty + ' 個（' + hqLabel + '）' +
        (sellWhere ? ' <span class="tag world">' + esc(sellWhere) + '</span>' : '') + '</span><span class="pf-v">' + fmt(gross) + ' G</span></div>' +
      (taxSell > 0 ? '<div class="pf"><span class="pf-l">賣方交易稅 ' + pctTxt(taxSell) + '</span><span class="pf-v bad">−' + fmt(tax) + ' G</span></div>' : '') +
      '<div class="pf"><span class="pf-l">材料成本' + (taxBuy > 0 ? '（已含買方稅 ' + pctTxt(taxBuy) + '）' : '') +
        (na.length ? '（缺 ' + na.length + ' 項報價）' : '') + '</span><span class="pf-v bad">−' + fmt(cost) + ' G</span></div>' +
      '<div class="pf pf-net"><span class="pf-l">淨利</span><span class="pf-v ' + cls + '">' + arrow + ' ' + sign + fmt(Math.abs(net)) + ' G' +
        (rate != null ? ' <small>（利潤率 ' + (rate >= 0 ? '＋' : '−') + Math.abs(Math.round(rate * 100)) + '%）</small>' : '') + '</span></div>' +
      '</div>' +
      '<div class="pf-liq">' +
      (velocity > 0
        ? '每日成交 <b>' + (Math.round(velocity * 10) / 10) + '</b> 件　·　賣完約需 <b>' +
          (days < 1 ? '不到 1' : Math.ceil(days)) + '</b> 天' +
          (days > 14 ? ' <span class="flag warn">△ 流動性低</span>' : '')
        : '<span class="flag warn">△ 近期無成交紀錄，可能賣不掉</span>') +
      '</div>' +
      // 只留會改變判斷的那一句（成本被低估），其餘方法論說明拿掉——
      // 「成本以第一層直接材料計」這種前提放在程式註解與文件裡就好
      (na.length ? '<div class="note"><span class="flag warn">△ 缺 ' + na.length + ' 項材料報價</span>成本被低估：' +
        esc(na.slice(0, 3).join('、')) + (na.length > 3 ? ' 等' : '') + '</div>' : '');
  }

  async function showDetail(id) {
    currentDetailId = id;
    var it = itemById.get(id);
    if (!it) return;
    var box = $('#itemDetail');
    box.innerHTML =
      '<div class="detail-head">' +
      '<img class="item-icon" src="' + iconUrl(it) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<div><div class="detail-title">' + esc(it.name) + '</div>' +
      '<div class="detail-sub">' + esc(it.category || '') + ' · 物品 #' + it.id + ' · 採購範圍：' + esc(scopeLabel()) + '</div></div></div>';

    if (!it.marketable) {
      box.innerHTML += '<div class="error">此物品無法在市場交易（不可上架）。</div>' + qtyAddHtml(id);
      bindQtyAdd(box, id);
      return;
    }
    box.innerHTML += '<div class="loading" id="detailLoading">查詢市場資料中…</div>';

    var M = await fetchItemMarket(id);
    if (currentDetailId !== id) return; // 期間切換了物品
    if (!M.ok) {
      box.innerHTML = box.innerHTML.replace(/<div class="loading"[^>]*>[^<]*<\/div>/, '') +
        '<div class="error">暫時無法連線 Universalis，請稍後再試或按重新整理。</div>' + qtyAddHtml(id);
      bindQtyAdd(box, id);
      return;
    }
    lastUpload = (M.rec && M.rec.upload) || lastUpload;
    renderUpdateTime();

    box.innerHTML = box.innerHTML.replace(/<div class="loading"[^>]*>[^<]*<\/div>/, '') +
      marketPanelHtml(id, M, 'd') + qtyAddHtml(id);
    bindMarketPanel(box, id, M, 'd', function () { showDetail(id); });
    bindQtyAdd(box, id);
  }

  // 面板 id 要帶前綴：單品詳情與節點視窗可能同時存在於 DOM，
  // 兩邊用同一組 id 會讓 querySelector 抓錯人。
  // 可折疊區塊。**摘要那一行本身就要是資訊**——多數情況看摘要就夠了，
  // 展開只是為了看細節。單純把東西藏起來不算解決資訊過載，只是換個地方塞。
  // 展開狀態記在 localStorage：習慣看在架明細的人展開一次就一直開著。
  function foldHtml(key, title, summary, body, forceOpen) {
    var open = forceOpen || panelOpen[key];
    return '<details class="fold"' + (open ? ' open' : '') + ' data-fold="' + key + '">' +
      '<summary><span class="fold-t">' + title + '</span>' +
      '<span class="fold-s">' + (summary || '') + '</span></summary>' +
      '<div class="fold-b">' + body + '</div></details>';
  }

  function marketPanelHtml(id, M, pfx) {
    var it = itemById.get(id);
    var nm = it ? it.name : '#' + id;
    var q1 = M.rec ? quoteFrom(M.rec, id, 1, detailHq) : null;
    var curUnit = q1 ? q1.minUnit : null;
    var qlab = detailHq ? 'HQ' : 'NQ';

    // 一排數字只留三個：目前品質的最低價、近期成交均價、每日銷量。
    // 原本 NQ／HQ 兩張最低價卡跟下面的 NQ/HQ 切換講同一件事，重複又佔位；
    // 資料新鮮度改成標題列的小徽章，它是個附註，不值得一整張卡。
    var html = '<div class="quality-row">' +
      '<span class="seg" id="' + pfx + 'HqSeg" role="group" aria-label="品質">' +
      '<button data-hq="0" class="' + (detailHq ? '' : 'active') + '" aria-pressed="' + !detailHq + '">NQ</button>' +
      '<button data-hq="1" class="' + (detailHq ? 'active' : '') + '" aria-pressed="' + detailHq + '">HQ</button></span>' +
      freshBadge(M.rec) + '</div>';

    html += '<div class="stat-grid">' +
      statCheapest(M.agg, detailHq) + statAvg(M.agg, detailHq) + statVelocity(M.agg, detailHq) + '</div>';

    // ── 以下全部折疊，摘要行帶出關鍵數字 ──
    var hs = histSummary(M.hist, curUnit, detailHq);
    html += foldHtml('hist', '📈 價格走勢', hs, historyHtml(M.hist, curUnit, detailHq, nm));

    // 摘要只在「有東西可講」時才給（自訂價已設定）。標題本身就說明了這區在做什麼，
    // 再補一句「算買 N 個的實付金額」只是把標題換句話再講一次。
    html += foldHtml('calc', '🧮 買量試算 / 自訂買價',
      ovrOf(id) != null ? '已自訂 ' + fmt(ovrOf(id)) + ' G' : '',
      '<div class="fold-row">' + bulkCalcHtml(id, M.rec) + '</div>' +
      '<div class="fold-row">' + overrideRowHtml(id) + '</div>');

    if (recipesByItem && recipesByItem.has(id)) {
      html += foldHtml('profit', '💰 製作利潤', '<span id="' + pfx + 'ProfitSum">計算中…</span>',
        '<div id="' + pfx + 'Profit"><div class="loading">計算材料成本中…</div></div>');
    }

    html += '<div id="' + pfx + 'Src"></div>';

    var rows = ((M.lst && M.lst.listings) || []).filter(function (l) { return detailHq ? l.hq : !l.hq; });
    html += foldHtml('listings', '📋 在架明細',
      rows.length ? rows.length + ' 筆 ' + qlab + ' 在架' : '目前沒有 ' + qlab + ' 在架',
      listingsTable(M.lst));
    return html;
  }

  // 折疊狀態持久化：常看在架明細的人展開一次就一直開著，不必每開一個物品都點。
  // ⚠ details 的 toggle 事件**不會冒泡**，不能用事件委派，只能逐個掛；
  //    面板分兩段渲染（配方立刻、行情等 API 回來），所以兩處都要呼叫，用旗標防重複。
  function bindFolds(root) {
    if (!root) return;
    root.querySelectorAll('details.fold[data-fold]').forEach(function (d) {
      if (d.dataset.foldBound) return;
      d.dataset.foldBound = '1';
      d.addEventListener('toggle', function () {
        panelOpen[d.getAttribute('data-fold')] = d.open;
        savePanelOpen();
      });
    });
  }

  function bindMarketPanel(root, id, M, pfx, rerender) {
    bindFolds(root);
    var seg = $('#' + pfx + 'HqSeg', root);
    if (seg) seg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { detailHq = b.getAttribute('data-hq') === '1'; rerender(); });
    });
    // 批量試算：邊打邊算（純本地運算，不碰網路），只重繪那一塊
    var bulk = root.querySelector('input[data-bulk="' + id + '"]');
    if (bulk) bulk.addEventListener('input', function () {
      var v = Math.max(1, Math.min(9999, parseInt(bulk.value, 10) || 1));
      bulkQty[id] = v;
      var boxEl = bulk.closest('.fold-row');
      if (boxEl) {
        boxEl.innerHTML = bulkCalcHtml(id, M.rec);
        // 只 focus，不要 setSelectionRange——type=number 不支援選取範圍，
        // 呼叫會丟 InvalidStateError（實測會噴 console error）
        var again = boxEl.querySelector('input[data-bulk="' + id + '"]');
        if (again) again.focus();
        bindMarketPanel(root, id, M, pfx, rerender);
      }
    });
    // 自訂實際買價
    var ovr = root.querySelector('input[data-ovr="' + id + '"]');
    if (ovr) ovr.addEventListener('change', function () {
      var v = parseInt(ovr.value, 10);
      if (isFinite(v) && v > 0) priceOverride[id] = v; else delete priceOverride[id];
      savePovr();
      if ($('#tab-craft').classList.contains('active')) renderCraft();
    });
    var ovrClr = root.querySelector('[data-ovrclr="' + id + '"]');
    if (ovrClr) ovrClr.addEventListener('click', function () {
      delete priceOverride[id]; savePovr(); rerender();
      if ($('#tab-craft').classList.contains('active')) renderCraft();
    });

    // 利潤與取得方式都要再打一次資料，放在面板畫出來之後跑（漸進式，不擋主要內容）
    var pf = $('#' + pfx + 'Profit', root);
    if (pf) renderProfit(pf, id, M, $('#' + pfx + 'ProfitSum', root));
    var sc = $('#' + pfx + 'Src', root);
    if (sc) renderSources(sc, id);
  }

  async function renderProfit(el, id, M, sumEl) {
    var setSum = function (t) { if (sumEl) sumEl.innerHTML = t; };
    var it = itemById.get(id);
    var qty = Math.max(1, bulkQty[id] || 1);
    var r = recipesByItem.get(id);
    var made = r ? Math.ceil(qty / (r.yield || 1)) * (r.yield || 1) : qty;
    if (!it || !it.marketable) {
      el.innerHTML = '<div class="note">此物品不可交易，沒有售價可算。</div>';
      setSum('<span class="plan-of">不可交易</span>');
      return;
    }
    // 售價一定要看**自家伺服器**：M 是全 DC 的資料，拿它當售價等於拿別服的價，
    // 你掛不上去。沒設主伺服器就明講在用哪個範圍估。
    var sellRec = M.rec, sellAgg = M.agg, sellWhere = null;
    if (homeWorld != null) {
      var hm = await fetchItemMarketAt(id, homeWorld);
      sellRec = hm.rec; sellAgg = hm.agg; sellWhere = homeLabel();
    }
    // 售價取「目前最低價」——想賣掉就得跟這個價競爭，用成交均價會高估自己賣得掉的價。
    // 但自家伺服器沒人在架時，「沒有競爭者」本身就是答案，退用該服近期成交均價估。
    var side = sellAgg && sellAgg[detailHq ? 'hq' : 'nq'];
    var q1 = sellRec ? quoteFrom(sellRec, id, 1, detailHq) : null;
    var sellUnit = q1 ? q1.minUnit : null, noComp = false;
    if (sellUnit == null) {
      var ap = side && side.averageSalePrice, p = ap && (ap.world || ap.dc);
      if (p && p.price > 0) { sellUnit = p.price; noComp = true; }
    }
    if (sellUnit == null) {
      el.innerHTML = '<div class="note">' + esc(sellWhere || scopeLabel()) +
        ' 既沒有在架商品、也沒有近期成交紀錄，無從估算售價。</div>';
      setSum('<span class="plan-of">無從估價</span>');
      return;
    }
    var cost = await directCraftCost(id, qty);
    if (!cost) { el.innerHTML = '<div class="note">沒有配方。</div>'; setSum('<span class="plan-of">無配方</span>'); return; }
    var vq = side && side.dailySaleVelocity;
    var vel = vq && (vq.world || vq.dc) ? (vq.world || vq.dc).quantity : 0;
    // 摘要行直接給結論：折疊狀態下不必展開就知道這東西做了賺不賺
    var netPreview = sellUnit * made * (1 - taxSell) - cost.cost;
    setSum('<b class="' + (netPreview > 0 ? 'good' : netPreview < 0 ? 'bad' : '') + '">' +
      (netPreview > 0 ? '▲ ＋' : netPreview < 0 ? '▼ −' : '＝ ') + fmt(Math.abs(netPreview)) + ' G</b>' +
      '<span class="plan-of"> / ' + made + ' 個' + (noComp ? ' · 無競爭者' : '') + '</span>');
    el.innerHTML = profitHtml(sellUnit, made, cost.cost, cost.na, vel, detailHq ? 'HQ' : 'NQ', made, sellWhere) +
      (noComp ? '<div class="note"><span class="flag info" title="沒有競爭者，價格可以自己開；但也代表這裡的需求可能不高">ⓘ 無競爭者</span>' +
        esc(sellWhere || scopeLabel()) + '沒人在賣，售價用成交均價估</div>' : '') +
      (homeWorld == null ? '<div class="note"><span class="flag warn">△ 未設定我的伺服器</span>售價暫以全 DC 估算</div>' : '');
  }

  // 指定伺服器的行情（利潤試算的售價側用；不含 history，省一次請求）
  async function fetchItemMarketAt(id, worldId) {
    var r = await Promise.all([
      Universalis.fetchAggregated(worldId, [id]),
      Universalis.fetchListings(worldId, [id], { listings: LISTINGS_CAP })
    ]);
    var lstItem = r[1] && r[1].items ? r[1].items[id] : null;
    return {
      agg: r[0] && r[0].items ? r[0].items[id] : null,
      rec: lstItem ? { listings: lstItem.listings || [], upload: lstItem.lastUploadTime || 0, cap: LISTINGS_CAP } : null
    };
  }

  // 資料新鮮度：冷門素材可能是三週前的報價，跟熱門素材擺在一起卻長得一模一樣。
  // 但它只是個附註，不值得佔一整張數字卡——縮成標題列旁的小徽章。
  function freshBadge(rec) {
    if (!rec || !rec.upload) return '<span class="flag warn">△ 無上傳紀錄</span>';
    var stale = (Date.now() - rec.upload) > STALE_MS;
    var txt = Universalis.fmtAge(rec.upload);
    return stale
      ? '<span class="flag warn" title="超過 3 天沒人上傳，價格可能已經不準">△ 行情 ' + esc(txt) + '</span>'
      : '<span class="fresh-ok">行情 ' + esc(txt) + '</span>';
  }

  // 走勢的一行摘要（折疊狀態下就看得到結論，不必展開）
  function histSummary(histItem, curUnit, hq) {
    var st = priceStats(histItem, hq);
    if (!st) return '<span class="plan-of">近 30 日成交樣本不足</span>';
    if (curUnit == null) return '近 30 日中位 ' + fmt(st.median) + ' G';
    var p = st.pctOf(curUnit);
    var v = p >= 75 ? { t: '偏高', c: 'bad' } : p <= 25 ? { t: '偏低', c: 'good' } : { t: '中間帶', c: '' };
    return '近 30 日第 <b class="' + v.c + '">' + p + '</b> 百分位（' + v.t + '）';
  }

  // 標籤＋placeholder 已經把用途說完了（「我實際買到的單價」／「留空＝用市價」），
  // 不需要再補一句話解釋它會怎麼影響製作清單。
  function overrideRowHtml(id) {
    var v = ovrOf(id);
    return '<div class="bulk-row"><label for="ovr' + id + '">我實際買到的單價</label>' +
      // 不放 placeholder：數字框有上下箭頭、寬度又窄，字會被截成「留空＝用市」
      '<input type="number" id="ovr' + id + '" class="bulk-input wide" min="1" value="' + (v != null ? v : '') + '" data-ovr="' + id + '" title="留空＝使用市價">' +
      '<span>G</span>' +
      (v != null ? '<button class="btn" data-ovrclr="' + id + '">清除</button>' : '') +
      '</div>';
  }

  function statCheapest(aggItem, hq) {
    var q = aggItem && aggItem[hq ? 'hq' : 'nq'];
    var ml = q && q.minListing && (q.minListing.dc || q.minListing.world);
    var label = (hq ? 'HQ' : 'NQ') + ' 最低價';
    if (!ml) return stat(label, '—', '無在架');
    var where = ml.worldId ? Universalis.worldName(ml.worldId) : scopeLabel();
    return stat(label, fmt(ml.price) + ' <small>G</small>', isDcMode() ? '@ ' + esc(where) : esc(scopeLabel()));
  }
  // 均價／銷量都跟著上方的 NQ/HQ 切換走——原本寫死看 NQ，切到 HQ 時
  // 三張卡有兩張還在講 NQ，數字彼此對不起來。
  function statAvg(aggItem, hq) {
    var s = aggItem && aggItem[hq ? 'hq' : 'nq'];
    var q = s && s.averageSalePrice;
    var p = q && (q.dc || q.world);
    return stat('近期成交均價', p ? fmt(p.price) + ' <small>G</small>' : '—', hq ? 'HQ' : 'NQ');
  }
  function statVelocity(aggItem, hq) {
    var s = aggItem && aggItem[hq ? 'hq' : 'nq'];
    var q = s && s.dailySaleVelocity;
    var p = q && (q.dc || q.world);
    return stat('每日銷量', p ? (Math.round(p.quantity * 10) / 10) + ' <small>件/日</small>' : '—', hq ? 'HQ' : 'NQ');
  }
  function stat(label, value, sub) {
    return '<div class="stat"><div class="label">' + label + '</div><div class="value">' + value + '</div>' +
      (sub ? '<div class="label" style="margin-top:2px">' + sub + '</div>' : '') + '</div>';
  }

  function listingsTable(lstItem) {
    var all = (lstItem && lstItem.listings) || [];
    var rows = all.filter(function (l) { return detailHq ? l.hq : !l.hq; });
    if (!rows.length) {
      // 「這個品質沒有」跟「這個物品沒人賣」是兩回事——另一種品質有貨時要講，
      // 否則使用者看到空表會以為整個物品都買不到（上面的報價其實已經退回另一種）
      var other = all.length - rows.length;
      return '<div class="note">目前沒有 ' + (detailHq ? 'HQ' : 'NQ') + ' 在架商品。' +
        (other > 0 ? '（' + (detailHq ? 'NQ' : 'HQ') + ' 有 ' + other + ' 筆，按上方切換）' : '') + '</div>';
    }
    rows.sort(function (a, b) { return a.pricePerUnit - b.pricePerUnit; });
    var head = '<table class="listings"><thead><tr>' +
      (isDcMode() ? '<th>伺服器</th>' : '') +
      '<th class="num">單價</th><th class="num">數量</th><th class="num">總價</th><th>雇員</th></tr></thead><tbody>';
    var body = rows.slice(0, 15).map(function (l) {
      return '<tr>' +
        (isDcMode() ? '<td><span class="tag world">' + esc(l.worldName || '') + '</span></td>' : '') +
        '<td class="num">' + fmt(l.pricePerUnit) + '</td>' +
        '<td class="num">' + l.quantity + '</td>' +
        '<td class="num">' + fmt(l.total) + '</td>' +
        '<td>' + esc(l.retainerName || '') + '</td></tr>';
    }).join('');
    return head + body + '</tbody></table>';
  }

  function qtyAddHtml(id) {
    return '<div class="qty-add"><span class="note">加入製作清單：</span>' +
      '<input type="number" id="addQty" min="1" value="1">' +
      '<button class="btn primary" id="addBtn">＋ 加入</button></div>';
  }
  function bindQtyAdd(box, id) {
    var btn = $('#addBtn', box);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var q = Math.max(1, parseInt($('#addQty', box).value, 10) || 1);
      addToCraft(id, q);
      btn.textContent = '✓ 已加入';
      setTimeout(function () { btn.textContent = '＋ 加入'; }, 1200);
    });
  }

  // ===================== 製作清單 =====================
  function addToCraft(id, qty) {
    var ex = craft.find(function (c) { return c.itemId === id; });
    if (ex) { ex.qty += qty; }
    else {
      if (craft.length >= MAX_CRAFT_ITEMS) {
        alert('製作清單最多 ' + MAX_CRAFT_ITEMS + ' 件物品（避免樹狀圖過大）。\n請先移除部分項目，或另存後清空再加入。');
        return;
      }
      craft.push({ itemId: id, qty: qty });
    }
    saveDraft(); updateCraftCount(); renderCraft();
  }
  function removeFromCraft(id) {
    craft = craft.filter(function (c) { return c.itemId !== id; });
    saveDraft(); updateCraftCount(); renderCraft();
  }
  function setQty(id, qty) {
    var ex = craft.find(function (c) { return c.itemId === id; });
    if (ex) { ex.qty = Math.max(1, qty); saveDraft(); renderCraft(); }
  }
  function updateCraftCount() { $('#craftCount').textContent = craft.length; }

  // 收集樹中所有會用到的物品 id（含全展開的可製作中間物；省略水晶時跳過）
  function collectIds(id, set, depth) {
    if (excludeCrystals && isCrystal(id)) return;
    set.add(id);
    if (depth >= MAX_DEPTH) return;
    var r = recipesByItem.get(id);
    if (!r) return;
    for (var i = 0; i < r.ingredients.length; i++) collectIds(r.ingredients[i].itemId, set, depth + 1);
  }

  // ── 報價引擎 ────────────────────────────────────────────────────────
  //
  // ⚠ 這裡是本頁最容易算錯的地方，改動前請先讀完。
  //
  // 「買 N 個要多少錢」**不是**最低單價 × N。市場板最便宜那一筆常常只有 1～3 個，
  // 要買 118 個木棉木材時真正的花費是往上吃掉好幾筆掛單。用乘法會系統性低估，
  // 而且低估幅度隨數量放大——它正好是 optimal() 判「買 vs 做」的關鍵輸入，
  // 所以量越大越容易誤判成「買比較划算」。逐筆吃單的實作在 Universalis.fillQuote。
  //
  // 想要的品質優先序：逐物品覆寫（hqOverride）> 全域「成品用 HQ 價」（只對可製作
  // 的成品生效）> NQ。fillQuote 把它當偏好而非硬條件：想要的品質完全沒在架時
  // 退回另一種並回報 hqFallback，畫面要明講，不能靜默換掉。
  function wantHq(id) {
    var o = hqOverride[id];
    if (o === 'hq') return true;
    if (o === 'nq') return false;
    return !!(recipesByItem && recipesByItem.has(id) && hqProduct);
  }

  // 同一次渲染內同一個 (id, need) 會被問很多次（樹、合併層、彙總、統計各問一遍），
  // 逐筆吃單不像取最低價那麼廉價，故記憶化。價格或前提一變就整份清掉。
  var quoteCache = new Map();
  function clearQuoteCache() { quoteCache = new Map(); }

  // 低階版：資料由呼叫端給（單品面板拿的是自己剛抓的 listings，沒有進 priceMap）
  function quoteFrom(p, id, need, hqPref) {
    if (!p || !(need > 0)) return null;
    var q = Universalis.fillQuote(p, need, { hq: hqPref === undefined ? wantHq(id) : hqPref, cap: p.cap || LISTINGS_CAP });
    if (!q) return null;
    // 誘餌單：最低價那筆量太少，實際加權均價遠高於它。只標示，不改算法——
    // 算法本來就吃真實掛單，這個旗標是要解釋「為什麼單價跟市場板首頁看到的不一樣」。
    q.bait = q.minUnit > 0 && (q.unit / q.minUnit) >= BAIT_RATIO;
    q.upload = p.upload || 0;
    q.stale = !!(q.upload && (Date.now() - q.upload) > STALE_MS);
    q.override = false;
    return q;
  }

  // 「買」用這個（含 5% 交易稅）；「賣」直接用 quoteFrom，因為賣方收到的就是標價。
  function quoteBuy(rec, id, need, hqPref) { return addTax(quoteFrom(rec, id, need, hqPref), need); }

  // 買方要付的 5% 交易稅。市場板顯示的是未稅價，所以：
  //   單價欄維持未稅（對得上遊戲畫面，才好比對）
  //   小計／總額含稅（那才是實際會離開錢包的錢）
  // 像購物車一樣：品項標價未稅、結帳金額含稅。
  function addTax(q, need) {
    if (!q) return q;
    q.subtotal = q.total;                 // 未稅市價
    q.tax = q.subtotal * taxBuy;
    q.total = q.subtotal + q.tax;         // 實際付出
    q.unitTaxed = q.total / need;
    return q;                             // q.unit 仍是未稅加權均價，別動
  }

  function quote(id, need) {
    if (!(need > 0)) return null;
    // 自訂「我實際付的單價」一旦設定就完全取代市價（也繞過 HQ／掛單深度）。
    // 它是**實付價**，所以不再另外加稅。
    var ov = ovrOf(id);
    if (ov != null) {
      return { total: ov * need, subtotal: ov * need, tax: 0, unit: ov, unitTaxed: ov,
        minUnit: ov, minQty: need, lines: [], worlds: [],
        filled: need, short: 0, estimated: false, hqUsed: null, hqFallback: false,
        capped: false, bait: false, stale: false, upload: 0, override: true };
    }
    var p = priceMap.get(id);
    if (!p) return null;
    var k = id + ':' + need;
    if (quoteCache.has(k)) return quoteCache.get(k);
    var q = addTax(quoteFrom(p, id, need), need);
    if (q) {
      // 誘餌單：最低價那筆量太少，實際加權均價遠高於它。只標示，不改算法——
      // 算法本來就吃真實掛單，這個旗標是要解釋「為什麼單價跟市場板首頁看到的不一樣」。
      q.bait = q.minUnit > 0 && (q.unit / q.minUnit) >= BAIT_RATIO;
      q.upload = p.upload || 0;
      q.stale = !!(q.upload && (Date.now() - q.upload) > STALE_MS);
      q.override = false;
    }
    quoteCache.set(k, q || null);
    return q;
  }

  // 買 need 個的總價；買不到回 Infinity（呼叫端一律用 Infinity 表示「這條路走不通」）
  function costOf(id, need) {
    var it = itemById.get(id);
    if (!it || !it.marketable) return Infinity;
    var q = quote(id, need);
    return q ? q.total : Infinity;
  }
  // 顯示用的市場最低單價（單買 1 個的價）。成本計算一律走 quote/costOf，不要用這個乘。
  function unitBuy(id) { var q = quote(id, 1); return q ? q.minUnit : null; }
  function usedHq(id) { var q = quote(id, 1); return !!(q && q.hqUsed === true); }
  // 買 need 個會跨到哪些伺服器（DC 模式下才有意義）；第一個＝最便宜那筆所在
  function buyWorlds(id, need) { var q = quote(id, need || 1); return q ? q.worlds : []; }
  function buyWorld(id) { var w = buyWorlds(id, 1); return w.length ? w[0] : null; }

  // ── 報價可信度徽章 ──────────────────────────────────────────────────
  // 分三級：danger＝這個數字可能根本不成立；warn＝數字能用但有前提；info＝補充。
  // 每一枚都帶文字，色只是加權——依無障礙準則 color-not-only，不可只用顏色表意。
  // 回傳 [{lv, short, text}]，short 給密集表格（配 title），text 給詳情。
  function quoteFlags(q, id) {
    if (!q) return [];
    var f = [];
    if (q.override) f.push({ lv: 'info', short: '自訂價', text: '使用你自訂的實際買價 ' + fmt(q.unit) + ' G，未參考市價' });
    if (q.short > 0) f.push({ lv: 'danger', short: '缺 ' + q.short, text: '在架量不足：整個陸行鳥 DC 只湊得到 ' + q.filled + ' 個，還差 ' + q.short + ' 個（差額以最貴那筆的單價估算）' });
    else if (q.estimated) f.push({ lv: 'warn', short: '部分估算', text: '需求量超出取樣的前 ' + LISTINGS_CAP + ' 筆掛單，超出部分以第 ' + LISTINGS_CAP + ' 便宜的單價估算，實際可能更貴' });
    if (q.hqFallback) f.push({ lv: 'warn', short: q.hqUsed ? '改用HQ' : '改用NQ', text: (q.hqUsed ? '沒有 NQ 在架，改用 HQ 報價' : '沒有 HQ 在架，改用 NQ 報價') + '——這不是你選的品質' });
    if (q.bait) f.push({ lv: 'warn', short: '最低價僅 ' + q.minQty, text: '最便宜那筆只有 ' + q.minQty + ' 個（單價 ' + fmt(q.minUnit) + ' G），買足數量的實際均價是 ' + fmt(q.unit) + ' G' });
    if (q.stale) f.push({ lv: 'warn', short: Universalis.fmtAge(q.upload), text: '這筆行情是 ' + Universalis.fmtAge(q.upload) + '上傳的，可能已經不準' });
    if (q.worlds && q.worlds.length > 1) f.push({ lv: 'info', short: q.worlds.length + ' 服', text: '要湊足數量得跨 ' + q.worlds.length + ' 個伺服器：' + q.worlds.join('、') });
    return f;
  }
  function flagsHtml(q, id, compact) {
    var f = quoteFlags(q, id);
    if (!f.length) return '';
    // 一律包一層 .flag-run：多枚徽章之間靠 flex gap 撐開，不靠各自的 margin
    return '<span class="flag-run">' + f.map(function (x) {
      return '<span class="flag ' + x.lv + '" title="' + esc(x.text) + '">' +
        (x.lv === 'danger' ? '⚠ ' : x.lv === 'warn' ? '△ ' : 'ⓘ ') +
        esc(compact ? x.short : x.text) + '</span>';
    }).join('') + '</span>';
  }

  // 手上已有的存量池（Map<id, 還可分配的數量>），由 gotMap 建。
  function buildStockPool() {
    var m = new Map();
    Object.keys(gotMap).forEach(function (k) {
      var v = Math.floor(Number(gotMap[k]));
      if (isFinite(v) && v > 0) m.set(Number(k), v);
    });
    return m;
  }

  // 買 vs 做最佳化（省略水晶時材料不計入樹與成本）
  //
  // pool＝「手上已有」的存量，深度優先邊走邊扣。需求被存量蓋滿的節點收斂成
  // mode='have' 且**不再往下展開**——這就是「我已經有第一層材料，就不該再叫我去湊
  // 第二層」的實作。存量是全域的（同一物品出現在多處會依走訪順序先到先扣）。
  //
  // ⚠ 子節點要在 pool 的**複本**上試算：決定「直購」時整個子樹會被丟棄，
  //    若直接在本體上扣，那批存量就會被憑空吃掉。只有真的採自製才寫回。
  function optimal(id, qty, seen, depth, pool) {
    var it = itemById.get(id);
    var stock = pool.get(id) || 0;
    var have = Math.min(stock, qty);
    if (have > 0) pool.set(id, stock - have);
    var need = qty - have;
    var base = { id: id, qty: qty, have: have, need: need, marketable: !!(it && it.marketable) };
    if (need === 0) {
      return Object.assign(base, { leaf: true, mode: 'have', buy: 0, craft: Infinity, cost: 0, children: [] });
    }
    var buy = costOf(id, need);      // 逐筆吃掉掛單的真實總價，不是最低價 × need
    var r = recipesByItem.get(id);
    if (!r || (seen && seen.has(id)) || depth >= MAX_DEPTH) {
      return Object.assign(base, { leaf: true, mode: buy === Infinity ? 'na' : 'buy', buy: buy, craft: Infinity, cost: buy, children: [] });
    }
    var s2 = new Set(seen); s2.add(id);
    var batches = Math.ceil(need / (r.yield || 1));
    var ings = r.ingredients.filter(function (g) { return !(excludeCrystals && isCrystal(g.itemId)); });
    var sub = new Map(pool);
    var children = ings.map(function (ing) { return optimal(ing.itemId, batches * ing.qty, s2, depth + 1, sub); });
    var canCraft = children.every(function (c) { return c.cost !== Infinity; });
    var craftCost = canCraft ? children.reduce(function (a, c) { return a + c.cost; }, 0) : Infinity;
    var mode, cost;
    if (buy === Infinity && craftCost === Infinity) { mode = 'na'; cost = Infinity; }
    else if (buy <= craftCost) { mode = 'buy'; cost = buy; }
    else { mode = 'craft'; cost = craftCost; }
    if (mode !== 'buy') { pool.clear(); sub.forEach(function (v, k) { pool.set(k, v); }); }   // 子樹真的會做，才認列它扣掉的存量
    return Object.assign(base, { leaf: false, mode: mode, buy: buy, craft: craftCost, cost: cost, yield: r.yield, children: children });
  }

  // 目前計畫裡每個物品的**全計畫**合計需求：供「✓ 我有了」一次補滿所有分支，
  // 也用來提示「這一列只是其中一層，全部要幾個」。只走真的會做的分支
  // （決定直接買的節點，它的材料不在計畫裡，算進來會多補存量）。
  function indexPlan(n, idx) {
    var e = idx.get(n.id);
    if (!e) { e = { qty: 0, need: 0 }; idx.set(n.id, e); }
    e.qty += n.qty; e.need += n.need;
    activeChildren(n).forEach(function (c) { indexPlan(c, idx); });
    return idx;
  }

  // 逐物品的品質選擇。全域那個「成品用 HQ 價」是一刀切，但實務上同一份清單裡
  // 有的成品要 HQ（交件、裝備）、有的 NQ 就夠（自用消耗品），而且 7.x 之後很多
  // 素材根本沒有 HQ。「自動」＝跟隨全域開關。
  function hqSegHtml(id) {
    var o = hqOverride[id] || 'auto';
    var opt = [['auto', '自動'], ['nq', 'NQ'], ['hq', 'HQ']];
    return '<div class="hq-seg"><span class="seg" role="group" aria-label="' + esc(nameOf(id)) + ' 的品質選擇">' +
      opt.map(function (k) {
        return '<button data-hqo="' + id + '" data-hqv="' + k[0] + '"' + (o === k[0] ? ' class="active"' : '') +
          ' aria-pressed="' + (o === k[0]) + '">' + k[1] + '</button>';
      }).join('') + '</span></div>';
  }

  // ── 節點圖渲染 ──
  function nodeCardHtml(n, isRoot) {
    var it = itemById.get(n.id);
    var nm = it ? it.name : ('#' + n.id);
    var craftable = recipesByItem.has(n.id);
    var cls = (isRoot ? 'root' : (craftable ? 'prod' : 'mat')) + (n.mode === 'have' ? ' have' : '');
    // 單價按這個節點**實際要買的量**報（吃掉掛單後的加權均價），不是「最便宜那筆」——
    // 兩者差很多時 flagsHtml 會掛一枚「最低價僅 N 件」的徽章解釋落差。
    var q = n.need > 0 ? quote(n.id, n.need) : null;
    var world = q && q.worlds.length ? q.worlds[0] : null;
    var pr = n.mode === 'have'
      ? '<div class="pr done">✅ 已有</div>'
      : !q
        ? '<div class="pr none">' + (n.marketable ? '查無在架' : '不可交易') + '</div>'
        : ('<div class="pr">' + (q.hqUsed === true ? '<span class="hqb">HQ</span>' : '') + fmt(q.unit) + '</div>' +
           (isDcMode() && world ? '<div class="wd">' + esc(world) + (q.worlds.length > 1 ? ' +' + (q.worlds.length - 1) : '') + '</div>' : '') +
           (quoteFlags(q, n.id).length ? '<div class="node-flags">' + flagsHtml(q, n.id, true) + '</div>' : ''));
    // 每張卡都能直接標「我有了」——在樹上就地宣告，不必再回清單找
    var nTot = planIndex.get(n.id);
    var haveBtn = '<button class="node-have' + (n.need === 0 ? ' on' : '') + '" data-have="' + n.id + '" data-need="' + (nTot && nTot.need > 0 ? nTot.need : n.need) + '" title="標記為已有／取消">' +
      (n.need === 0 ? '✓ 已有' : (n.have > 0 ? '已有 ' + n.have + '/' + n.qty : '＋ 我有了')) + '</button>';
    var qtyBadge = isRoot ? '' : '<span class="node-qty">' + n.qty + '</span>';
    var del = isRoot ? '<button class="node-del" data-act="del" data-id="' + n.id + '" title="從清單移除">✕</button>' : '';
    var ctrl = isRoot
      ? ('<div class="node-root-controls"><span class="stepper"><button data-act="dec" data-id="' + n.id + '">−</button>' +
         '<input type="number" min="1" value="' + n.qty + '" data-act="qty" data-id="' + n.id + '" aria-label="' + esc(nm) + ' 的數量"><button data-act="inc" data-id="' + n.id + '">＋</button></span></div>' +
         (it && it.marketable ? hqSegHtml(n.id) : ''))
      : '';
    return '<div class="node-card ' + cls + '" data-node="' + n.id + '" title="點擊查看詳情與上下游配方">' +
      qtyBadge + del +
      '<button class="node-copy" data-copy="' + esc(nm) + '" title="複製名稱">⧉</button>' +
      '<img class="ic" src="' + iconUrl(it) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="nm" title="' + esc(nm) + '">' + esc(nm) + '</div>' + pr + ctrl + haveBtn +
      '</div>';
  }

  function cmpBadgeHtml(n) {
    var prodLabel = (n.qty > 1 ? n.qty + '個成品' : '成品');
    if (n.buy === Infinity && n.craft === Infinity) return '<div class="cmp-badge cmp-na"><div class="l2">無法取得</div></div>';
    if (n.buy === Infinity) return '<div class="cmp-badge cmp-na"><div class="l1">成品無販售</div><div class="l2">採自製 ' + fmt(n.craft) + '</div></div>';
    if (n.craft === Infinity) return '<div class="cmp-badge cmp-buy"><div class="l1">材料缺市價</div><div class="l2">🛒 直購 ' + fmt(n.buy) + '</div></div>';
    if (n.mode === 'craft') return '<div class="cmp-badge cmp-craft"><div class="l1">材料 ' + fmt(n.craft) + '　vs　' + prodLabel + ' ' + fmt(n.buy) + '</div><div class="l2">✓ 自製省 ' + fmt(n.buy - n.craft) + '</div></div>';
    return '<div class="cmp-badge cmp-buy"><div class="l1">材料 ' + fmt(n.craft) + '　vs　' + prodLabel + ' ' + fmt(n.buy) + '</div><div class="l2">🛒 直購省 ' + fmt(n.craft - n.buy) + '</div></div>';
  }

  function rootBadgeHtml(n) {
    if (n.cost === Infinity) return '<div class="root-badge cmp-na"><div class="l1">以最優路線計算</div><div class="big">部分材料無市價</div></div>';
    var label = n.mode === 'craft' ? '自製最佳' : '直接購買最便宜';
    return '<div class="root-badge"><div class="l1">以最優路線計算（每項材料取買／製的較低價）</div><div class="big">✓ ' + label + '：' + fmt(n.cost) + ' G</div></div>';
  }

  function treeLi(n, isRoot) {
    var html = nodeCardHtml(n, isRoot);
    if (n.children && n.children.length) {
      var badge = isRoot ? rootBadgeHtml(n) : cmpBadgeHtml(n);
      var green = (n.mode === 'craft') ? ' green' : '';
      html += badge + '<ul class="children' + green + '">' + n.children.map(function (c) { return treeLi(c, false); }).join('') + '</ul>';
    }
    return '<li>' + html + '</li>';
  }

  // 製作清單子分頁切換（簡易清單 / 樹狀分析）
  function craftSubtabsHtml() {
    return '<div class="craft-subtabs"><span class="seg">' +
      '<button data-cview="simple" class="' + (craftView === 'simple' ? 'active' : '') + '">📋 簡易清單</button>' +
      '<button data-cview="tree" class="' + (craftView === 'tree' ? 'active' : '') + '">🌲 樹狀分析</button>' +
      '</span></div>';
  }
  // mode='tree' 才顯示「省略水晶」（簡易模式只看成品、不展開材料）
  function craftToolsHtml() {
    return '<div class="craft-tools">' +
      '<label class="switch"><input type="checkbox" id="optCrystal"' + (excludeCrystals ? ' checked' : '') + '><span class="track"></span>省略水晶</label>' +
      '<label class="switch"><input type="checkbox" id="optHq"' + (hqProduct ? ' checked' : '') + '><span class="track"></span>成品用 HQ 價</label>' +
      // 「成品卡上可逐件覆寫」這種操作說明拿掉——那組 NQ/HQ 鈕就在畫面上，看得到就會按
      '<span class="note">' + esc(scopeLabel()) + ' · 上限 ' + MAX_CRAFT_ITEMS + ' 件 · 金額含 ' + pctTxt(taxBuy) + ' 買方稅</span>' +
      '</div>';
  }

  // 共用：批次查價建 priceMap。
  // 存整份 listings（不只最低價），成本才算得出來——見 quote() 的說明。
  // 已經查過的 id 直接從 priceStore 取，勾「我有了」這類**只改計算前提**的操作
  // 就完全不碰網路，也不必重新 parse 一次回應。
  async function fetchPriceMap(ids) {
    var store = priceStore.get(scope);
    if (!store) { store = new Map(); priceStore.set(scope, store); }
    var missing = ids.filter(function (id) { return !store.has(id); });

    if (missing.length) {
      var lst = await Universalis.fetchListings(scope, missing, { listings: LISTINGS_CAP });
      if (lst && lst.items) {
        lastUpload = lst.lastUploadTime || lastUpload;
        missing.forEach(function (id) {
          var d = lst.items[id];
          var nq = Universalis.minPrice(d, false), hq = Universalis.minPrice(d, true);
          store.set(id, {
            listings: (d && d.listings) || [],
            // 逐物品的上傳時間：整頁只顯示一個「最後更新」會讓冷門素材的
            // 三週前舊價看起來跟熱門素材一樣新鮮（見 staleBadge）
            upload: (d && d.lastUploadTime) || 0,
            cap: LISTINGS_CAP,
            nq: nq ? nq.pricePerUnit : null, nqWorld: nq ? nq.worldName : null,
            hq: hq ? hq.pricePerUnit : null, hqWorld: hq ? hq.worldName : null
          });
        });
      }
    }

    priceMap = new Map();
    ids.forEach(function (id) { if (store.has(id)) priceMap.set(id, store.get(id)); });
    clearQuoteCache();
    renderUpdateTime();
  }

  // 樹狀分析用：載入配方 + 查整棵樹所有材料價，回傳各需求物品的最省樹
  // 價格的 id 集合刻意**不看存量**（用全展開），這樣勾「已有」重算時
  // 不會因為集合變小而觸發新的查詢，也不會在取消勾選時缺價。
  async function prepareCraftData() {
    await ensureRecipes();
    var idset = new Set();
    craft.forEach(function (c) { collectIds(c.itemId, idset, 0); });
    await fetchPriceMap(Array.from(idset));
    var pool = buildStockPool();
    var trees = craft.map(function (c) { return optimal(c.itemId, c.qty, new Set(), 0, pool); });
    planIndex = new Map();
    trees.forEach(function (t) { indexPlan(t, planIndex); });
    return trees;
  }

  // 簡易清單用：只查成品＋第一層直接原料的價格（不遞迴）
  async function prepareSimpleData() {
    await ensureRecipes();
    var idset = new Set();
    craft.forEach(function (c) {
      idset.add(c.itemId);
      var r = recipesByItem.get(c.itemId);
      if (r) r.ingredients.forEach(function (g) {
        if (!(excludeCrystals && isCrystal(g.itemId))) idset.add(g.itemId);
      });
    });
    await fetchPriceMap(Array.from(idset));
  }

  // ── 一站購足：8 個伺服器各自的採買總額 ──────────────────────────────
  //
  // 全DC 模式報的是「每一項各自的最低價」，但那些最低價散在 8 個服。為了省 2,000 G
  // 跑三個伺服器實務上不划算，畫面卻從來沒提過這個代價。這裡把「只在某一個伺服器
  // 買齊」的總額算出來排排站，讓使用者自己權衡。
  //
  // 每個世界都要單獨查價（不能拿 DC 前 N 筆去篩世界——DC 的前 30 筆裡可能只有 2 筆
  // 屬於泰坦，但泰坦自己可能還有 28 筆沒被取樣到，篩出來的數字會假性偏貴）。
  // 因此是 8 次請求，只在使用者按下按鈕時才跑。

  // 這份計畫的採買總額。缺料只影響那一件，不讓整份預算塌成 0（同 planStats 的理由）。
  function planBuyTotal(trees) {
    var sum = 0, na = 0;
    (function walk(list) {
      list.forEach(function (n) {
        if (n.mode === 'have') return;
        if (n.mode === 'buy') { if (n.buy === Infinity) na++; else sum += n.buy; return; }
        var kids = n.children || [];
        if (!kids.length) { if (n.mode === 'na') na++; return; }
        walk(kids);
      });
    })(trees);
    return { sum: sum, na: na };
  }

  async function computeWorldCompare() {
    if (worldCompareBusy || !craft.length) return;
    worldCompareBusy = true;
    rerenderKeepScroll();
    try {
      await ensureRecipes();
      var idset = new Set();
      craft.forEach(function (c) { collectIds(c.itemId, idset, 0); });
      var ids = Array.from(idset);
      var savedMap = priceMap, savedCache = quoteCache;
      var res = [];
      var wids = Object.keys(Universalis.WORLDS);
      for (var i = 0; i < wids.length; i++) {
        var w = wids[i];
        var lst = await Universalis.fetchListings(w, ids, { listings: LISTINGS_CAP });
        var m = new Map();
        if (lst && lst.items) ids.forEach(function (id) {
          var d = lst.items[id];
          m.set(id, { listings: (d && d.listings) || [], upload: (d && d.lastUploadTime) || 0, cap: LISTINGS_CAP });
        });
        priceMap = m; clearQuoteCache();
        var trees = craft.map(function (c) { return optimal(c.itemId, c.qty, new Set(), 0, buildStockPool()); });
        var t = planBuyTotal(trees);
        res.push({ id: Number(w), world: Universalis.WORLDS[w], sum: t.sum, na: t.na });
      }
      priceMap = savedMap; quoteCache = savedCache;
      res.sort(function (a, b) {
        if (a.na !== b.na) return a.na - b.na;   // 缺料少的優先，其次才比價
        return a.sum - b.sum;
      });
      worldCompare = { sig: planSig(), rows: res };
    } catch (e) {
      worldCompare = { sig: planSig(), error: true };
    }
    worldCompareBusy = false;
    rerenderKeepScroll();
  }

  // 比較結果只對「當時那份計畫」有效。改數量、勾已有、換選項都會讓它失真，
  // 用簽章比對自動作廢，比在七八個地方各補一行 invalidate 可靠。
  function planSig() {
    return scope + '|' + craft.map(function (c) { return c.itemId + 'x' + c.qty; }).join(',') +
      '|' + JSON.stringify(gotMap) + '|' + (excludeCrystals ? 1 : 0) + '|' + (hqProduct ? 1 : 0) +
      '|' + JSON.stringify(hqOverride) + '|' + JSON.stringify(priceOverride);
  }

  function worldCompareHtml(trees) {
    if (!isDcMode()) return '';
    var head = '<div class="section-title">一站購足：只跑一個伺服器要多少</div>';
    if (worldCompareBusy) return head + '<div class="loading">逐一查詢 8 個伺服器的行情中…（每服一次請求，約需十幾秒）</div>';
    if (worldCompare && worldCompare.sig !== planSig()) worldCompare = null;
    if (!worldCompare) {
      // 按鈕文字已經說了它會做什麼，不必再用一段話重述一次
      return head + '<button class="btn primary" data-act="worldcmp">🧭 比較 8 個伺服器（各查一次，約十幾秒）</button>';
    }
    if (worldCompare.error) {
      return head + '<div class="error">查詢失敗，請稍後再試。</div><button class="btn" data-act="worldcmp">重試</button>';
    }
    var rows = worldCompare.rows;
    var base = planBuyTotal(trees).sum;   // 跨服最低價（目前彙總）的總額，當比較基準
    var best = rows[0];
    return head +
      '<div class="note shop-hint">跨服分買共 <b>' + fmt(base) + ' G</b>。' +
      (best && best.sum > 0 ? '最省的單一伺服器是 <b>' + esc(best.world) + '</b>，多花 <b>' +
        fmt(Math.max(0, best.sum - base)) + ' G</b> 就能只跑一趟。' : '') + '</div>' +
      '<div class="shop-scroll"><table class="listings wc-table"><thead><tr>' +
      '<th>伺服器</th><th class="num">一站購足總額</th><th class="num">比跨服多花</th><th>備註</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r, i) {
        var diff = r.sum - base;
        return '<tr' + (i === 0 ? ' class="wc-best"' : '') + '>' +
          '<td><span class="tag world">' + esc(r.world) + '</span>' + (i === 0 ? ' <span class="flag info">★ 最省</span>' : '') + '</td>' +
          '<td class="num">' + fmt(r.sum) + '</td>' +
          '<td class="num ' + (diff > 0 ? 'delta-bad' : diff < 0 ? 'delta-good' : '') + '">' +
            (diff === 0 ? '持平' : (diff > 0 ? '＋' : '−') + fmt(Math.abs(diff))) + '</td>' +
          '<td>' + (r.na ? '<span class="flag warn">△ ' + r.na + ' 項此服買不到</span>' : '<span class="plan-of">全部買得到</span>') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<button class="btn" data-act="worldcmp">↻ 重新比較</button>';
  }

  // 合併樹的虛擬總根卡（顯示整份清單的智慧最省總成本）
  function grandRootCardHtml(grandOptimal, buyAll, anyNa, allNa, buyAllOk) {
    var saving = (buyAllOk && !allNa) ? buyAll - grandOptimal : null;
    var savingTxt = saving == null ? '' : (saving > 0 ? '　自製省 ' + fmt(saving) + ' G' : (saving < 0 ? '　直購省 ' + fmt(-saving) + ' G' : '　買做持平'));
    return '<div class="node-card grand-root">' +
      '<div class="nm">📋 製作清單（' + craft.length + ' 項）</div>' +
      '<div class="pr">' + (allNa ? '—' : fmt(grandOptimal)) + '</div>' +
      '<div class="wd">智慧最省總成本' + (anyNa ? '（部分無市價）' : '') + esc(savingTxt) + '</div>' +
      '</div>';
  }

  function legendHtml() {
    return '<div class="legend">' +
      '<span><span class="sw sw-root"></span>最終成品</span>' +
      '<span><span class="sw sw-prod"></span>可製作中間物</span>' +
      '<span><span class="sw sw-mat"></span>基礎素材</span>' +
      '<span><span class="sw-line"></span>綠線＝該層自製較省</span>' +
      '<span>價格＝NQ最低　HQ＝HQ最低　⧉＝複製名稱　·　點節點看詳情/配方</span>' +
      '</div>';
  }

  // ── 製作計畫清單（縮排可折疊的樹狀表格）──────────────────────────────
  //
  // 為什麼不是「攤平成一張表、再依層級分組」：每個節點各自比買／做，樹本來就不會
  // 齊頭停在同一層，攤平後「第 1 層原料」與「第 3 層原料」變成平行的兩堆，看不出
  // 誰是誰的材料；更糟的是**計畫中要自己做的中間物根本不會出現**（它不是 buy 節點），
  // 於是「我已經有第一層材料了」在畫面上無處可表達，只能被迫去勾第二層。
  //
  // 改成保留樹的形狀：一列一個節點、縮排＋導引線表示上下層、每列都能勾「已有」。
  // 勾了就 mode='have'、整個子樹從計畫消失（見 optimal 的 pool）。
  // 設計依據（ui-ux-pro-max）：階層 >3 層不適用 treemap／sunburst（無障礙 C），
  // 應以可折疊縮排表格為主檢視、圖形樹為輔；層級要靠縮排與間距表達而非只靠顏色。
  // 計畫「實際會做」的分支：買到就停（含做不出來的 na——底下買得到的仍要列）。
  // 項數、金額、採買彙總、存量分配都只認這個，否則會叫人去買用不到的東西。
  function activeChildren(n) {
    return (n.mode === 'craft' || n.mode === 'na') ? (n.children || []) : [];
  }
  // 畫面上「可以展開來看」的下層：決定買的節點也照樣列出它的材料（預設收起）。
  // 這不只是資訊——手上若已經有那些料，標記已有後自製成本會降，
  // 那一列就會自己從「買」翻成「做」。已標記為手上有的節點例外（都有了，底下不重要）。
  function displayChildren(n) {
    return n.mode === 'have' ? [] : (n.children || []);
  }
  function nameOf(id) { var it = itemById.get(id); return it ? it.name : ('#' + id); }

  // 同一層的相同物品合併成一列。不合併的話，一種料被兩個成品（或兩個中間物）用到
  // 就會拆成兩列各報各的數，根本看不出「總共要幾個」。
  // entries: [{ n: 計畫節點, parentName: 上游名稱 }]，回傳合併後的節點陣列。
  // active＝這一列真的要備（上游沒有任何一層是「直接買」）。false 的列照樣顯示，
  // 只是不計入項數／金額／採買彙總。
  // ⚠ active 必須逐個 occurrence 判斷再取聯集，不能整層共用一個旗標：同一種料
  //    可能在 A 成品底下是真的要備、在 B 成品底下卻因為上層改用買的而只是參考。
  function mergeLevel(entries) {
    var byId = new Map();
    entries.forEach(function (x) {
      var n = x.n;
      var e = byId.get(n.id);
      if (!e) { e = { id: n.id, qty: 0, have: 0, need: 0, active: false, kids: [], modes: new Set(), parents: new Set() }; byId.set(n.id, e); }
      e.qty += n.qty; e.have += n.have; e.need += n.need;
      e.modes.add(n.mode);
      if (x.active) e.active = true;
      if (x.parentName) e.parents.add(x.parentName);
      var childActive = x.active && (n.mode === 'craft' || n.mode === 'na');
      displayChildren(n).forEach(function (c) { e.kids.push({ n: c, parentName: nameOf(n.id), active: childActive }); });
    });
    return Array.from(byId.values()).map(function (e) {
      // 合併後的狀態由合併後的數量決定：湊滿了就是「已有」，否則沿用各處的決定
      var mode = e.need === 0 ? 'have'
        : e.modes.has('craft') ? 'craft'
        : e.modes.has('buy') ? 'buy' : 'na';
      var children = mode === 'have' ? [] : mergeLevel(e.kids);
      var it = itemById.get(e.id);
      // 合併後數量變大，報價必須用合併後的 need 重問一次（掛單深度隨量而變）
      var buy = costOf(e.id, e.need);
      var craft = children.length
        ? children.reduce(function (a, c) { return a + c.cost; }, 0)
        : Infinity;
      var cost = mode === 'have' ? 0 : mode === 'buy' ? buy : mode === 'craft' ? craft : Infinity;
      return {
        id: e.id, qty: e.qty, have: e.have, need: e.need, mode: mode, active: e.active,
        buy: buy, craft: craft, cost: cost, children: children,
        marketable: !!(it && it.marketable), parents: Array.from(e.parents)
      };
    }).sort(byItemId);   // 每一層都照同一條規則排（見 byItemId）
  }
  // 成品本身不進計畫（它是目標，不是要備的料），所以從各成品的下一層開始合併攤平。
  // ⚠ 這裡要用 displayChildren 而非 activeChildren：成品若被判定「直購較省」，
  //    activeChildren 會回空陣列，整份配方都不進計畫——加了那種成品進清單，
  //    畫面上會完全看不出有變化（實測「五加木木材」加進去列數 20 → 20）。
  function buildMergedTop(trees) {
    return mergeLevel(trees.reduce(function (a, t) {
      var act = (t.mode === 'craft' || t.mode === 'na');
      return a.concat(displayChildren(t).map(function (c) { return { n: c, parentName: nameOf(t.id), active: act }; }));
    }, []));
  }
  // 展開狀態：買與做一視同仁，預設都展開（使用者指定兩者顯示方式要相同）。
  // 優先序：個別點過的覆寫 > 全部展開／收合 > 預設。
  // ⚠ 全部展開不能只套用在「當下畫面上有的列」——收合狀態下深層的列還沒渲染出來，
  //    那樣按一次只會展開一層。所以用一個全域旗標，讓沒被個別覆寫的節點通通跟著走。
  function planIsOpen(path) {
    if (planOpen.has(path)) return planOpen.get(path);
    if (planAll !== null) return planAll;
    return true;
  }
  function flattenPlan(n, depth, parentPath, out) {
    var path = parentPath + '/' + n.id;
    var kids = n.children || [];
    var open = planIsOpen(path);
    out.push({ n: n, depth: depth, path: path, hasKids: kids.length > 0, open: open });
    if (!open) return out;
    kids.forEach(function (c) { flattenPlan(c, depth + 1, path, out); });
    return out;
  }
  function buildPlanRows(mergedTop) {
    var out = [];
    mergedTop.forEach(function (n) { flattenPlan(n, 0, '', out); });
    return out;
  }

  // ── 多面向查閱：同一份計畫的四種攤平檢視 ──────────────────────────────
  // 階層看得出「誰是誰的材料」，但要「總共要幾個某某」得跨層加總；反過來攤平看得到
  // 總數卻看不出關係。兩種都要，所以做成可切換：
  //   direct 直接材料＝只列成品的第一層（不往下拆）
  //   all    全部素材＝整份計畫跨層合併（同一物品出現在第 1 層與第 3 層也併成一列）
  //   base   基礎素材＝all 之中沒有配方的（採集／掉落／商店）
  //   mid    中間物  ＝all 之中有配方的（自己做得出來的）
  // ⚠ 這裡**不能**用 active 過濾。過濾掉「買」節點底下的材料，會讓叫「全部素材」的
  //    檢視比「階層」還少（實測 16 項變 7 項），使用者只會覺得清單漏東西。
  //    攤平檢視回答的是「這份配方到底由什麼組成」，跟買／做的建議是兩回事。
  function flatAggregate(list, acc) {
    list.forEach(function (n) {
      var e = acc.get(n.id);
      if (!e) { e = { id: n.id, qty: 0, have: 0, need: 0, craftCost: 0, craftInf: false, modes: new Set(), parents: new Set() }; acc.set(n.id, e); }
      e.qty += n.qty; e.have += n.have; e.need += n.need;
      e.modes.add(n.mode);
      if (n.mode === 'craft') { if (n.craft === Infinity) e.craftInf = true; else e.craftCost += n.craft; }
      (n.parents || []).forEach(function (p) { e.parents.add(p); });
      flatAggregate(n.children || [], acc);
    });
    return acc;
  }
  function aggToNode(e) {
    var mode = e.need === 0 ? 'have'
      : e.modes.has('craft') ? 'craft'
      : e.modes.has('buy') ? 'buy' : 'na';
    var it = itemById.get(e.id);
    var buy = costOf(e.id, e.need);   // 跨層合併後的總量，掛單深度要按總量重問
    var craft = (e.craftInf || !e.craftCost) ? Infinity : e.craftCost;
    return {
      id: e.id, qty: e.qty, have: e.have, need: e.need, mode: mode, active: true,
      buy: buy, craft: craft, children: [], parents: Array.from(e.parents),
      cost: mode === 'have' ? 0 : mode === 'buy' ? buy : mode === 'craft' ? craft : Infinity,
      marketable: !!(it && it.marketable)
    };
  }
  // ── 材料排序：固定依物品 ID 遞增，不做排序選單 ────────────────────────
  // 為什麼不是「金額由大到小」：價格是會動的。重新查價、改數量、按一次「✓ 已有」，
  // 整份清單就重新洗牌，剛剛在看的那一列跑掉了——愈常互動的清單愈難用。
  // ID 不會變，順序因此每次都一樣；而且 FFXIV 的物品 ID 大致依資料片／等級遞增，
  // 同一階的材料本來就會排在一起，順帶有分組效果。
  // 不做排序選單：這裡沒有第二種排法值得使用者花心思挑，多一個選單只是把決定丟回去。
  // 站內所有材料列（製作計畫各層、三種攤平檢視、簡易清單原料、採買彙總、上下游配方）
  // 都吃這一條規則。
  function byItemId(a, b) { return a.id - b.id; }
  // 回傳 planRowHtml 吃的列（扁平檢視沒有縮排與展開鈕）
  function buildFlatRows(mergedTop, view) {
    if (view === 'direct') {
      return mergedTop.slice().sort(byItemId).map(function (n) {
        return { n: n, depth: 0, path: '', hasKids: false, open: true };
      });
    }
    var nodes = Array.from(flatAggregate(mergedTop, new Map()).values()).map(aggToNode);
    if (view === 'base') nodes = nodes.filter(function (n) { return !recipesByItem.has(n.id); });
    else if (view === 'mid') nodes = nodes.filter(function (n) { return recipesByItem.has(n.id); });
    return nodes.sort(byItemId).map(function (n) {
      return { n: n, depth: 0, path: '', hasKids: false, open: true };
    });
  }

  var PLAN_VIEWS = [
    { k: 'tree',   t: '階層' },
    { k: 'direct', t: '直接材料' },
    { k: 'all',    t: '全部素材' },
    { k: 'base',   t: '基礎素材' },
    { k: 'mid',    t: '中間物' }
  ];

  // 一列的狀態徽章（同時是「這層要買還是要做」的答案）
  function planBadge(n) {
    if (n.mode === 'have') return '<span class="plan-badge have">✅ 已有</span>';
    if (n.mode === 'buy') return '<span class="plan-badge buy">🛒 買</span>';
    if (n.mode === 'craft') return '<span class="plan-badge craft">🔨 做</span>';
    return '<span class="plan-badge na">⚠ 取不到</span>';
  }

  // ---- 計畫統計（進度列）----
  // 項數走整份計畫而不是「畫面上看得到的列」，否則收合一段進度數字就跟著跳動。
  // 金額用各成品的最省成本合計（含直接買成品的那筆，那也是要花的錢）。
  function planStats(trees, mergedTop) {
    var s = { total: 0, done: 0, remainCost: 0, anyNa: false };
    // 金額直接加總所有「要買」的節點（含直接買的成品本身）。
    // 不用各成品的 cost 合計——只要樹裡有一件取不到，那個 cost 就是 Infinity，
    // 整份預算會塌成 0，畫面上就會變成「一項無市價 → 全部都無市價」。
    trees.forEach(function (t) {                       // 成品層：只有「直接買」的才是花費
      if (t.mode === 'buy') s.remainCost += t.buy;
      else if (t.mode === 'na' && !(t.children || []).length) s.anyNa = true;
    });
    (function walk(list) {                             // 材料層走合併後的計畫，項數才跟畫面一致
      list.forEach(function (n) {
        if (!n.active) return;                         // 「買」的節點底下只是參考，不計入
        s.total++;
        if (n.mode === 'have') { s.done++; return; }
        if (n.mode === 'buy') { s.remainCost += n.buy; return; }
        if (n.mode === 'na' && !n.children.length) { s.anyNa = true; return; }
        walk(n.children);
      });
    })(mergedTop);
    return s;
  }
  function planProgressInnerHtml(s) {
    var pct = s.total ? Math.round(100 * s.done / s.total) : 0;
    var allDone = s.total > 0 && s.done === s.total;
    // 全部都查不到市價時 remainCost 會是 0，直接印「還要花 0 G」會被讀成「不用花錢」
    var right = allDone ? '✅ 全部備齊'
      : s.remainCost > 0 ? ('還要採買 ' + fmt(s.remainCost) + ' G' + (s.anyNa ? '（另有項目無市價）' : ''))
      : s.anyNa ? '剩餘項目皆無市價' : '還要採買 0 G';
    return '<div class="got-line"><span>📦 已備齊 <b>' + s.done + '</b> / ' + s.total + ' 項</span>' +
      '<span>' + right + '</span></div>' +
      '<div class="got-bar"><div class="got-bar-fill' + (allDone ? ' full' : '') + '" style="width:' + pct + '%"></div></div>';
  }

  function renderCraft() {
    var body = $('#craftBody');
    // 前提（已有數量／HQ 覆寫／自訂買價／選項）每次重繪都可能變，報價記憶化必須作廢。
    // 注意這只清算好的報價，不清 priceStore——所以不會因此多打任何一次 API。
    clearQuoteCache();
    var sub = craftSubtabsHtml();
    if (!craft.length) {
      body.innerHTML = sub + '<div class="empty-state">製作清單是空的。<br>到「物品查詢」找物品，按「＋ 加入」開始試算。</div>';
      return Promise.resolve();
    }
    return craftView === 'simple' ? renderCraftSimple(body, sub) : renderCraftTree(body, sub);
  }
  // 勾「已有」會改變計畫（子樹整段消失），必須整區重算重繪；
  // 依 UX 準則 back-behavior：互動後要保留捲動位置，否則畫面會跳掉。
  function rerenderKeepScroll() {
    var y = window.scrollY;
    Promise.resolve(renderCraft()).then(function () { window.scrollTo(0, y); });
  }

  // 兩個檢視共用：成本統計（智慧最省／全買成品／可省）。數字都已扣掉「手上已有」。
  function craftTotals(trees) {
    var grandOptimal = trees.reduce(function (a, t) { return a + (t.cost === Infinity ? 0 : t.cost); }, 0);
    var anyNa = trees.some(function (t) { return t.cost === Infinity; });
    var allNa = trees.every(function (t) { return t.cost === Infinity; });
    // 全買成品的成本（供比較）——同樣扣掉已有的成品，兩邊才是同一個基準
    var buyAll = 0, buyAllOk = true;
    trees.forEach(function (t) {
      if (t.need === 0) return;
      var c = costOf(t.id, t.need);
      if (c !== Infinity) buyAll += c; else buyAllOk = false;
    });
    var hasStock = trees.some(function (t) { return t.have > 0; }) ||
      Array.from(planIndex.values()).some(function (e) { return e.qty > e.need; });
    return { grandOptimal: grandOptimal, anyNa: anyNa, allNa: allNa, buyAll: buyAll, buyAllOk: buyAllOk, hasStock: hasStock };
  }

  function craftActionsHtml() {
    return '<div class="craft-actions">' +
      '<button class="btn primary" data-act="saveAs">💾 另存為清單</button>' +
      '<button class="btn danger" data-act="clear">清空清單</button>' +
      '</div>';
  }

  // 兩個檢視共用：成本統計卡＋製作計畫（縮排樹狀、可勾已有）＋採買彙總（依伺服器）
  function craftSummaryHtml(trees, T) {
    var mergedTop = buildMergedTop(trees);
    var isTree = planView === 'tree';
    var rows = isTree ? buildPlanRows(mergedTop) : buildFlatRows(mergedTop, planView);
    var dc = isDcMode();
    var cols = dc ? 6 : 5;

    function planRowHtml(r) {
      var n = r.n, it = itemById.get(n.id);
      var nm = it ? it.name : '#' + n.id;
      var stock = gotOf(n.id);
      var total = n.active ? planIndex.get(n.id) : null;
      var open = r.open;
      var toggle = r.hasKids
        ? '<button class="plan-toggle" data-plan-toggle="' + esc(r.path) + '" aria-expanded="' + open + '" aria-label="' + (open ? '收合' : '展開') + esc(nm) + '的材料">' + (open ? '▾' : '▸') + '</button>'
        : '<span class="plan-spacer" aria-hidden="true"></span>';
      var guides = '';
      for (var i = 0; i < r.depth; i++) guides += '<span class="plan-guide" aria-hidden="true"></span>';

      // 副標：這一列是誰的材料（縮排看得出深淺，文字補上到底掛在哪些項目下；
      // 合併後可能同時供應多個上游，列出來才知道這個總數是怎麼來的）
      var ps = n.parents || [];
      var sub = esc(ps.slice(0, 3).join('、') + (ps.length > 3 ? ' 等 ' + ps.length + ' 項' : '')) + ' 的材料';
      // 買與做用同一種句型（只是方向相反），欄位也一樣填——兩者顯示方式一致
      if (n.mode === 'craft') sub += n.buy === Infinity ? ' · 自製（市場買不到成品）' : ' · 自製較省（直接買要 ' + fmt(n.buy) + ' G）';
      else if (n.mode === 'buy' && r.hasKids) sub += n.craft === Infinity ? ' · 直購（材料湊不齊）' : ' · 直購較省（自己做要 ' + fmt(n.craft) + ' G）';
      else if (n.mode === 'have') sub += ' · 已標記為手上有，底下的材料不用再湊';
      else if (n.mode === 'na' && r.hasKids) sub += ' · 這條路線缺料，做不出來';
      // 同一種料若還出現在別的層（同層才合併得起來），把全計畫總數講明，
      // 否則使用者看到 270 卻要買 297，會以為清單漏了
      if (total && total.need > n.need) sub += ' · <b>全計畫共需 ' + total.need + '</b>（另 ' + (total.need - n.need) + ' 個在其他層）';

      // 買的列掛上報價的可信度徽章（缺量／估算／HQ 退回／誘餌單／資料太舊／跨服）
      var bq = n.mode === 'buy' && n.need > 0 ? quote(n.id, n.need) : null;
      if (bq) { var fh = flagsHtml(bq, n.id, true); if (fh) sub += ' ' + fh; }   // flagsHtml 自帶 .flag-run

      var qtyCell = n.mode === 'have' ? '0' : ('<b>' + n.need + '</b>' + (n.have > 0 ? ' <span class="plan-of">/ ' + n.qty + '</span>' : ''));
      // 「做」的列也填單價／小計（自製的單位成本與總成本），欄位不再一邊有數字一邊空著。
      // 買的單價是**吃掉掛單後的加權均價**（跟 n.buy／n.need 一致），不是最便宜那筆。
      var unitVal = n.mode === 'buy' ? (bq ? bq.unit : null)
        : (n.mode === 'craft' && n.need > 0 && n.craft !== Infinity) ? n.craft / n.need
        : null;
      var totalVal = n.mode === 'buy' ? n.buy : n.mode === 'craft' ? n.craft : null;
      var priceCell = unitVal != null ? fmt(unitVal) : '—';
      var subCell = (totalVal != null && totalVal !== Infinity) ? fmt(totalVal) : '—';
      var world = bq && bq.worlds.length ? bq.worlds[0] : null;
      // ✓ 要補的量：計畫內的列補到全計畫都夠，其餘只補它自己這一格
      var fillNeed = total && total.need > 0 ? total.need : n.need;

      // 綠底＝中間素材（自己做得出來），無底色＝基礎素材。與買／做的建議是兩件事：
      // 一個中間素材也可能因為市價便宜而被建議「買」。
      return '<tr class="plan-row' + (n.mode === 'have' ? ' plan-have' : '') +
        (recipesByItem.has(n.id) ? ' plan-mid' : '') + '" data-depth="' + r.depth + '">' +
        '<td><div class="plan-cell">' + guides + toggle +
          '<img class="plan-ic" src="' + iconUrl(it) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
          '<div class="plan-main"><div class="plan-nm"><span class="plan-node" data-node="' + n.id + '" role="button" tabindex="0" title="查看即時價格與上下游配方">' + esc(nm) + '</span>' + planBadge(n) + '</div>' +
          '<div class="shop-use">' + sub + '</div></div></div></td>' +
        '<td class="num">' + qtyCell + '</td>' +
        '<td class="num got-cell"><input type="number" class="got-input" data-got="' + n.id + '" min="0" max="' + (total ? total.qty : n.qty) + '" value="' + stock + '" aria-label="' + esc(nm) + ' 手上已有的數量">' +
          '<button class="got-all" data-gotall="' + n.id + '" data-need="' + fillNeed + '" title="我已經有了／再按一次歸零">✓</button></td>' +
        (dc ? '<td>' + (world ? '<span class="tag world">' + esc(world) + '</span>' +
          (bq.worlds.length > 1 ? ' <span class="plan-of">+' + (bq.worlds.length - 1) + '</span>' : '') : '—') +
          (bq && bq.hqUsed === true ? ' <span class="hqb">HQ</span>' : '') + '</td>' : '') +
        '<td class="num">' + priceCell + '</td>' +
        '<td class="num">' + subCell + '</td></tr>';
    }

    var S = planStats(trees, mergedTop);

    // 檢視切換：階層看關係，其餘三種攤平看總數
    var viewSeg = '<span class="seg plan-seg">' + PLAN_VIEWS.map(function (v) {
      return '<button data-pview="' + v.k + '"' + (planView === v.k ? ' class="active"' : '') + '>' + v.t + '</button>';
    }).join('') + '</span>';

    // 攤平檢視的合計：只在「列與列之間不會互相包含」時才給。
    //   direct 全是兄弟、base 全是葉子 → 可加總
    //   all    含中間物與它的材料          → 重複計算
    //   mid    中間物本身也會互相巢套（氧化鎂砥石 在 黑星石 底下）→ 重複計算
    var viewTotal = '';
    if (!isTree && planView !== 'all' && planView !== 'mid' && rows.length) {
      var vs = 0, vna = false;
      rows.forEach(function (r) {
        var c = r.n.mode === 'buy' ? r.n.buy : r.n.mode === 'craft' ? r.n.craft : (r.n.mode === 'have' ? 0 : Infinity);
        if (c === Infinity) vna = true; else vs += c;
      });
      viewTotal = '<tfoot><tr class="plan-total"><th scope="row" colspan="' + (cols - 1) + '">本檢視合計 ' + rows.length + ' 項</th>' +
        '<td class="num">' + fmt(vs) + (vna ? ' <span class="plan-of">+無市價</span>' : '') + '</td></tr></tfoot>';
    }

    var planHtml = rows.length ? (
      '<div class="got-progress" id="gotProgress">' + planProgressInnerHtml(S) + '</div>' +
      '<div class="plan-bar">' + viewSeg +
      (isTree ? '<span class="plan-bulk"><button class="btn" data-plan-all="open">全部展開</button>' +
        '<button class="btn" data-plan-all="close">全部收合</button></span>' : '') +
      '<span class="plan-legend"><span class="lg-mid"></span>中間素材<span class="lg-base"></span>基礎素材</span></div>' +
      // 縮排＋導引線本來就看得出上下層；只留「✓ 是什麼意思」這個非自明的部分
      (isTree ? '<div class="note shop-hint">按 <b>✓</b> ＝我已經有了，它底下的材料會整段從計畫消失。</div>' : '') +
      '<div class="shop-scroll"><table class="listings"><thead><tr>' +
      // 單價維持未稅（對得上遊戲裡市場板顯示的數字），小計含買方稅（那才是實付）
      // 表頭不做可點排序：順序是固定的（見 byItemId）。但要讓人看得出「這是有排過的」，
      // 否則會以為是隨機順序，於是 title 說明依據。
      '<th title="依遊戲內物品編號固定排序，不隨價格變動">材料</th>' +
      '<th class="num">還需要</th><th class="num">已有</th>' +
      (dc ? '<th>最便宜伺服器</th>' : '') +
      '<th class="num">單價<span class="th-sub">未稅</span></th>' +
      '<th class="num">小計<span class="th-sub">含 ' + pctTxt(taxBuy) + ' 稅</span></th>' +
      '</tr></thead><tbody>' + rows.map(planRowHtml).join('') + '</tbody>' + viewTotal + '</table></div>'
    ) : '<div class="note">不需要備料：直接買比自製便宜（或已標記為手上有），見下方採買彙總。</div>';

    // 採買彙總：把計畫裡所有「要買」的節點依物品合併（同一料被多處用到只跑一趟），
    // 全DC 模式再依最便宜的伺服器分組成路線。這是計畫檢視給不了的「一次買齊」視角。
    var buyAcc = new Map();
    trees.forEach(function (t) { if (t.mode === 'buy') buyAcc.set(t.id, (buyAcc.get(t.id) || 0) + t.need); });
    (function walk(list) {
      list.forEach(function (n) {
        if (!n.active || n.mode === 'have') return;
        if (n.mode === 'buy') { buyAcc.set(n.id, (buyAcc.get(n.id) || 0) + n.need); return; }
        walk(n.children || []);
      });
    })(mergedTop);
    var buyList = Array.from(buyAcc.entries()).map(function (e) {
      var it = itemById.get(e[0]);
      var q = quote(e[0], e[1]);
      return { id: e[0], name: it ? it.name : '#' + e[0], qty: e[1], q: q,
        unit: q ? q.unit : null, sub: q ? q.total : null, hq: q && q.hqUsed === true };
    }).sort(byItemId);   // 同上：依 ID 固定排，重新查價不會整份洗牌

    // 採買彙總依伺服器分組。⚠ 一筆需求可能橫跨多個伺服器（最便宜那筆只有 3 個、
    // 剩下的要去別服買），所以分組要走 quote 的 lines 逐筆掛單拆，不能拿「最便宜
    // 的那個伺服器」代表整筆——那會叫人在買不到的地方買整批。
    var routeHtml = '';
    if (buyList.length) {
      var byWorld = new Map();
      var addLine = function (w, name, qty, cost, hq) {
        if (!byWorld.has(w)) byWorld.set(w, { items: [], sub: 0 });
        var g = byWorld.get(w);
        g.items.push({ name: name, qty: qty, sub: cost, hq: hq });
        if (cost != null) g.sub += cost;
      };
      buyList.forEach(function (r) {
        if (!r.q) { addLine('（查無市價）', r.name, r.qty, null, false); return; }
        if (!dc || !r.q.lines.length) { addLine(dc ? '（查無市價）' : scopeLabel(), r.name, r.qty, r.sub, r.hq); return; }
        var per = new Map();
        r.q.lines.forEach(function (l) {
          var w = l.w || scopeLabel();
          var g = per.get(w) || { qty: 0, cost: 0 };
          g.qty += l.q; g.cost += l.q * l.p; per.set(w, g);
        });
        // 掛單湊不滿而外推的餘量：掛在最後（最貴）那筆所在的伺服器，並在數量上補回
        var extra = r.qty - r.q.filled;
        if (extra > 0 && r.q.lines.length) {
          var lw = r.q.lines[r.q.lines.length - 1].w || scopeLabel();
          var lg = per.get(lw); lg.qty += extra; lg.cost = lg.cost;
        }
        per.forEach(function (g, w) { addLine(w, r.name, g.qty, g.cost, r.hq); });
      });
      var worlds = Array.from(byWorld.entries()).sort(function (a, b) { return b[1].sub - a[1].sub; });
      routeHtml = '<div class="section-title toggle-row">採買彙總' +
        (dc ? '（依伺服器 · 共 ' + worlds.length + ' 個伺服器）' : '（' + esc(scopeLabel()) + '）') +
        '<span class="plan-bulk" style="margin-left:auto">' +
        '<button class="btn" data-copyplan="all">⧉ 複製全部</button>' +
        (dc ? '<button class="btn" data-copyplan="world">⧉ 依伺服器複製</button>' : '') +
        '</span></div>' +
        (dc && worlds.length > 1 ? '<div class="note shop-hint">這份採買要跑 <b>' + worlds.length +
          '</b> 個伺服器。只想跑一趟的話，看下面的「一站購足」比較。</div>' : '') +
        '<div class="route-grid">' + worlds.map(function (e) {
          return '<div class="route-card"><div class="route-head"><span class="tag world">' + esc(e[0]) + '</span><span class="route-sub">' + fmt(e[1].sub) + ' G</span></div>' +
            e[1].items.map(function (r) {
              return '<div class="route-line"><span>' + esc(r.name) + ' ×' + r.qty + (r.hq ? ' <span class="hqb">HQ</span>' : '') + '</span><span>' + (r.sub != null ? fmt(r.sub) : '—') + '</span></div>';
            }).join('') + '</div>';
        }).join('') + '</div>' +
        worldCompareHtml(trees);
      lastBuyList = buyList; lastRouteGroups = worlds;
    } else { lastBuyList = []; lastRouteGroups = []; }

    // 有材料取不到時，各成品的 cost 是 Infinity；此時改用「可購得部分」的合計，
    // 至少讓使用者知道已知的錢要花多少，而不是整格變成「—」。
    var costOk = !T.anyNa && !T.allNa;
    var saving = (T.buyAllOk && costOk && T.grandOptimal > 0) ? T.buyAll - T.grandOptimal : null;
    var stockNote = T.hasStock ? '（已扣除手上已有）' : '';

    return '<div class="summary-card">' +
      '<div class="summary-totals">' +
      stat('智慧製作總成本',
        costOk ? (fmt(T.grandOptimal) + ' <small>G</small>')
          : S.remainCost > 0 ? ('<span style="color:var(--amber)">' + fmt(S.remainCost) + ' <small>G</small></span>') : '—',
        (costOk ? '買／做自動取最省 · 含 ' + pctTxt(taxBuy) + ' 買方稅' : (S.remainCost > 0 ? '僅計可購得部分（有材料取不到）' : '查無市場資料')) + stockNote) +
      stat('全部直接買成品', T.buyAllOk ? fmt(T.buyAll) + ' <small>G</small>' : '—', (T.buyAllOk ? '不自製 · 含稅' : '部分成品查無市價') + stockNote) +
      '<div class="stat"><div class="label">自製可省</div><div class="value ' + (saving != null && saving > 0 ? 'save' : (saving != null && saving < 0 ? 'bad' : '')) + '">' +
      (saving == null ? '—' : (saving > 0 ? fmt(saving) + ' G' : (saving < 0 ? '反而貴 ' + fmt(-saving) + ' G' : '持平'))) + '</div></div>' +
      '</div>' +
      '<div class="section-title">製作計畫</div>' + planHtml + routeHtml +
      '</div>';
  }

  // 樹狀分析：統整所有需求物品 → 買/做最省樹狀圖 + 共用彙總區（總採買清單）
  async function renderCraftTree(body, sub) {
    var token = ++craftToken;
    var tools = sub + craftToolsHtml();
    body.innerHTML = tools + '<div class="loading">展開配方並查詢材料價格中…</div>';

    var trees = await prepareCraftData();
    if (token !== craftToken) return;          // 期間已切換檢視／重新渲染，放棄本次
    var T = craftTotals(trees);

    // 合併成單一樹：虛擬總根「製作清單」→ 各需求物品（可調數量）→ 材料
    var childrenLis = trees.map(function (t) { return treeLi(t, true); }).join('');
    var html = '<div class="craft-item"><div class="tree-scroll"><div class="tree"><ul><li>' +
      grandRootCardHtml(T.grandOptimal, T.buyAll, T.anyNa, T.allNa, T.buyAllOk) +
      '<ul class="children">' + childrenLis + '</ul></li></ul></div></div>' + legendHtml() + '</div>';

    body.innerHTML = tools + html + craftSummaryHtml(trees, T) + craftActionsHtml();
  }

  // 簡易清單：橫向一層式——每列「成品 ▶ 直接原料」；下方接與樹狀分析共用的彙總區（總採買清單）
  async function renderCraftSimple(body, sub) {
    var token = ++craftToken;
    var tools = sub + craftToolsHtml();
    body.innerHTML = tools + '<div class="loading">查詢成品與原料價格中…</div>';

    await prepareSimpleData();
    if (token !== craftToken) return;
    var dc = isDcMode();

    // 「不可交易」與「這個範圍剛好沒人在架」給玩家的行動完全相反（知識庫 §3.13），
    // 分開講；價格一律走 quote（買 mult 個的真實總價，不是最低價 × mult）。
    function priceSub(id, mult) {
      var it = itemById.get(id);
      if (!it || !it.marketable) return '<span class="tag untradable">不可交易 · 需自行取得</span>';
      var q = quote(id, mult);
      if (!q) return '<span class="sr-na">' + esc(scopeLabel()) + '查無在架</span>';
      var w = q.worlds.length ? q.worlds[0] : null;
      return '<span class="sr-price">' + (q.hqUsed === true ? '<span class="hqb">HQ</span> ' : '') + fmt(q.total) + ' G</span>' +
        (dc && w ? ' @ ' + esc(w) + (q.worlds.length > 1 ? ' +' + (q.worlds.length - 1) : '') : '') +
        flagsHtml(q, id, true);
    }
    function chip(cls, id, name, qty, sub2) {
      var it = itemById.get(id);
      return '<div class="' + cls + '" data-simple="' + id + '" title="點擊查看即時價格與配方">' +
        '<img class="sr-ic" src="' + iconUrl(it) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
        '<div><div class="sr-nm">' + esc(name) + ' <span class="sr-sub">×' + qty + '</span></div>' +
        '<div class="sr-sub">' + sub2 + '</div></div></div>';
    }

    var rows = craft.map(function (c) {
      var it = itemById.get(c.itemId);
      var nm = it ? it.name : '#' + c.itemId;
      var prod = chip('sr-prod', c.itemId, nm, c.qty, priceSub(c.itemId, c.qty)) +
        (it && it.marketable ? hqSegHtml(c.itemId) : '');
      var r = recipesByItem.get(c.itemId);
      var mats;
      if (r) {
        var batches = Math.ceil(c.qty / (r.yield || 1));
        // 配方原本的材料順序沒有意義（上游資料的排列），照 byItemId 排成
        // 跟下方「製作計畫」一致的順序，兩塊對照著看才不會每塊各排各的。
        var ings = r.ingredients.filter(function (g) { return !(excludeCrystals && isCrystal(g.itemId)); })
          .map(function (g) {
            var need = batches * g.qty;
            return { id: g.itemId, need: need, cost: costOf(g.itemId, need) };
          }).sort(byItemId);
        var matSum = 0, matNa = false;
        mats = ings.map(function (g) {
          if (g.cost !== Infinity) matSum += g.cost; else matNa = true;
          return chip('sr-mat', g.id, nameOf(g.id), g.need, priceSub(g.id, g.need));
        }).join('');
        mats += '<span class="sr-total">原料合計 ' + fmt(matSum) + ' G' + (matNa ? '（部分無市價）' : '') + '</span>';
      } else {
        mats = '<span class="sr-total">無製作配方（採集／商店／掉落取得）</span>';
      }
      return '<div class="simple-row">' + prod + '<span class="sr-arrow">▶</span><div class="sr-mats">' + mats + '</div></div>';
    }).join('');

    body.innerHTML = tools + rows +
      '<div class="note">上面只列第一層原料，完整逐層計畫見下方「製作計畫」。</div>' +
      '<div id="simpleSummary"><div class="loading">完整展開配方、統整製作計畫中…</div></div>' +
      craftActionsHtml();

    // 第二段：完整展開配方，接上與樹狀分析同一份總採買清單（含已收集進度）
    var trees = await prepareCraftData();
    if (token !== craftToken) return;
    var elSum = $('#simpleSummary');
    if (elSum) elSum.innerHTML = craftSummaryHtml(trees, craftTotals(trees));
  }

  // ===================== 節點詳情 / 上下游配方 =====================
  var nmCurrentId = null;
  async function openNodeDetail(id) {
    await ensureRecipes();
    var it = itemById.get(id);
    if (!it) return;
    nmCurrentId = id;
    var mask = $('#nodeModal'), body = $('#nodeModalBody');
    mask.classList.add('open');
    body.innerHTML =
      '<div class="modal-head">' +
      '<img class="ic" src="' + iconUrl(it) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="t">' + esc(it.name) + '</div>' +
      '<button class="modal-close" data-nm="close" title="關閉">✕</button></div>' +
      '<div class="detail-sub" style="margin-bottom:10px">' + esc(it.category || '') + ' · 物品 #' + it.id + ' · 採購範圍：' + esc(scopeLabel()) + (isCrystal(id) ? ' · 水晶' : '') + craftJobsHtml(id) + '</div>' +
      '<div id="nmMarket">' + (it.marketable ? '<div class="loading">查詢市場資料中…</div>' : '<div class="note">此物品無法在市場交易。</div>') + '</div>' +
      nmRecipeSection(id) +
      '<div class="qty-add"><span class="note">加入製作清單：</span><input type="number" id="nmQty" min="1" value="1"><button class="btn primary" data-nm="add" data-id="' + id + '">＋ 加入</button></div>';
    bindFolds(body);

    if (it.marketable) {
      var M = await fetchItemMarket(id);
      if (nmCurrentId !== id) return;
      if (M.rec && M.rec.upload) { lastUpload = M.rec.upload; renderUpdateTime(); }
      var mk = $('#nmMarket');
      if (mk) {
        if (!M.ok) mk.innerHTML = '<div class="error">暫時無法連線 Universalis。</div>';
        else {
          mk.innerHTML = marketPanelHtml(id, M, 'nm');
          bindMarketPanel(mk, id, M, 'nm', function () { openNodeDetail(id); });
        }
      }
    } else {
      // 不可交易＝要自己去弄。光說「無法交易」等於只給診斷不給處方，
      // 站內本來就有採集點／軍票／兌換的繁中資料，直接接上來。
      var mk2 = $('#nmMarket');
      if (mk2) renderSources(mk2, id);
    }
  }

  // 是否顯示某物品（有繁中名且台服已開放；無名者＝台服未開放，依站規隱藏）
  function visibleItem(id) {
    var it = itemById.get(id);
    return !!(it && it.name && PatchGate.released(it.patch, gamePatch));
  }
  // 上下游配方。「用於製作」動輒數十項，攤開來會直接淹掉整個視窗——
  // 折疊起來，摘要行講清楚各有幾項；展開後的上游也從 50 項收到 24 項。
  function nmRecipeSection(id) {
    // 水晶是基礎素材又被上千配方使用，列出上下游無意義——整區不出現即可，
    // 不必印一行字解釋為什麼不出現
    if (isCrystal(id)) return '';

    var r = recipesByItem.get(id);
    // 同 byItemId 的理由：依物品 ID 排，順序固定不隨行情變動。
    // 「用於製作」還會被截到 24 項——沒有排序的話連「留下哪 24 項」都是隨機的。
    var ings = r ? r.ingredients.filter(function (g) { return visibleItem(g.itemId); })
      .sort(function (a, b) { return a.itemId - b.itemId; }) : [];
    var ups = usedInByItem.get(id);
    var arr = ups ? Array.from(ups).filter(visibleItem).sort(function (a, b) { return a - b; }) : [];
    var CAP = 24;

    var body = '<div class="fold-row"><div class="nav-label">製作材料（向下）</div>' +
      (ings.length
        ? '<div class="nav-list">' + ings.map(function (g) {
            return navChipHtml(g.itemId, itemById.get(g.itemId).name + ' ×' + g.qty);
          }).join('') + '</div>'
        : '<div class="note">基礎素材，無製作配方。</div>') + '</div>' +
      '<div class="fold-row"><div class="nav-label">用於製作（向上）</div>' +
      (arr.length
        ? '<div class="nav-list">' + arr.slice(0, CAP).map(function (pid) {
            return navChipHtml(pid, itemById.get(pid).name);
          }).join('') + '</div>' + (arr.length > CAP ? '<div class="note">… 另有 ' + (arr.length - CAP) + ' 項</div>' : '')
        : '<div class="note">無已知用途。</div>') + '</div>';

    var sum = (ings.length ? '材料 ' + ings.length + ' 種' : '基礎素材') +
      ' · ' + (arr.length ? '用於 ' + arr.length + ' 項' : '無已知用途');
    return foldHtml('recipe', '🔗 上下游配方', sum, body);
  }
  function navChipHtml(id, label) {
    var it = itemById.get(id);
    return '<span class="nav-chip" data-nm="nav" data-id="' + id + '"><img src="' + iconUrl(it) + '" alt="" onerror="this.style.display=\'none\'">' + esc(label) + '</span>';
  }
  function closeNodeModal() { nmCurrentId = null; $('#nodeModal').classList.remove('open'); }
  // 關閉節點視窗＝退回上一筆歷史，讓瀏覽器上/下頁與工具內導覽一致
  function backOrClose() { if (applied.node != null) history.back(); else closeNodeModal(); }

  // ===================== 賺錢排行 =====================
  //
  // 本頁原本只能「我想做這個 → 算成本」，但實際需求常常是反過來的：
  // 「我 90 級鍛鐵匠，做什麼有賺頭？」
  //
  // 成本一律以**第一層直接材料的市價**計，並且**把水晶算進去**（水晶要花錢，
  // 排除掉會系統性高估利潤——這跟製作清單的「省略水晶」是不同的取捨：
  // 那邊是為了讓樹好讀，這邊是要算對錢）。
  var pfJobs = new Set();
  var pfHq = false;
  var pfRows = [];
  var pfSort = { key: 'perDay', dir: -1 };
  var pfBusy = false;
  var pfToken = 0;
  var pfMeta = null;

  // 欄位的計算方式放在表頭的 title（想知道才滑過去看），不佔畫面
  var PF_COLS = [
    { k: 'name',  t: '物品',      num: false },
    { k: 'level', t: '製作',      num: true },
    { k: 'sell',  t: '售價/個',   num: true, h: '自家伺服器目前最低價——要賣掉就得跟同一服的價競爭' },
    { k: 'cost',  t: '材料成本',  num: true, h: '第一層直接材料的全 DC 市價，含水晶，已加買方交易稅' },
    { k: 'net',   t: '淨利/輪',   num: true, h: '售價 ×(1−賣方稅) − 材料成本，一輪產出量計' },
    { k: 'rate',  t: '利潤率',    num: true, h: '淨利 ÷ 材料成本' },
    { k: 'vel',   t: '日銷量',    num: true, h: '該伺服器每日成交量' },
    { k: 'perDay', t: '日均可賺', num: true, h: '單件淨利 × 日成交量。假設成交量全被你吃下（實際會被別的製作者分掉），用途是把「賺很多但賣不掉」和「賺一點但走量」放在同一把尺上比' }
  ];

  // 取樣量大時會是好幾十次請求，逐批送並回報進度——一個不動的「查詢中…」
  // 掛 40 秒，使用者只會以為當掉了。每批 100 個是 Universalis 的單次上限。
  async function fetchInChunks(fn, ids, label, onProg, tokenOk, sc) {
    var out = {}, chunks = [];
    for (var i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    for (var c = 0; c < chunks.length; c++) {
      if (!tokenOk()) return null;
      onProg(label, c + 1, chunks.length);
      var r = await fn(sc == null ? scope : sc, chunks[c], { listings: LISTINGS_CAP });
      if (r && r.items) Object.keys(r.items).forEach(function (k) { out[k] = r.items[k]; });
    }
    return { items: out };
  }

  function pfCandidates(min, max, limit) {
    var out = [];
    recipesByItem.forEach(function (r, id) {
      var it = itemById.get(id);
      if (!it || !it.name || !it.marketable) return;      // 賣不掉的東西談不上利潤
      if (!PatchGate.released(it.patch, gamePatch)) return; // 台服未開放
      var jm = recipeJobsByItem.get(id);
      if (!jm || !jm.size) return;
      var best = null;
      jm.forEach(function (j) {
        if (pfJobs.size && !pfJobs.has(j.job)) return;
        if (min != null && j.level < min) return;
        if (max != null && j.level > max) return;
        if (!best || j.level < best.level) best = j;       // 同物品取門檻最低的職業
      });
      if (!best) return;
      out.push({ id: id, r: r, job: best });
    });
    // 取樣策略：等級高的先（收益通常也高），同級按 id 穩定排序。
    // total 要一起回傳——被截掉多少必須讓使用者知道，否則他會以為
    // 「煉金術士全等級」只有 250 個配方（實際 1081 個）。
    out.sort(function (a, b) { return b.job.level - a.job.level || a.id - b.id; });
    return { list: out.slice(0, limit), total: out.length };
  }

  function recOf(lst, id) {
    var d = lst && lst.items ? lst.items[id] : null;
    return d ? { listings: d.listings || [], upload: d.lastUploadTime || 0, cap: LISTINGS_CAP } : null;
  }

  async function runProfitScan() {
    if (pfBusy) return;
    var token = ++pfToken;
    pfBusy = true;
    var body = $('#profitBody');
    body.innerHTML = '<div class="loading">載入配方…</div>';
    try { await ensureRecipes(); }
    catch (e) { body.innerHTML = '<div class="error">配方資料載入失敗，請稍後再試。</div>'; pfBusy = false; return; }
    if (token !== pfToken) { pfBusy = false; return; }

    var min = $('#pfMin').value === '' ? null : Math.max(1, parseInt($('#pfMin').value, 10) || 1);
    var max = $('#pfMax').value === '' ? null : Math.max(1, parseInt($('#pfMax').value, 10) || 1);
    if (min != null && max != null && min > max) { var t = min; min = max; max = t; $('#pfMin').value = min; $('#pfMax').value = max; }
    var limit = parseInt($('#pfLimit').value, 10) || 60;

    var cand = pfCandidates(min, max, limit);
    var cands = cand.list;
    if (!cands.length) {
      body.innerHTML = '<div class="search-note">沒有符合條件的配方' +
        (pfJobs.size ? '（職業：' + esc(Array.from(pfJobs).join('、')) + '）' : '') +
        (min != null || max != null ? '（等級 ' + (min == null ? 1 : min) + '–' + (max == null ? '不限' : max) + '）' : '') +
        '。放寬條件再試一次。</div>';
      pfBusy = false; return;
    }

    var prodIds = cands.map(function (c) { return c.id; });
    var ingSet = new Set();
    cands.forEach(function (c) { c.r.ingredients.forEach(function (g) { ingSet.add(g.itemId); }); });
    var ingIds = Array.from(ingSet);

    // ⚠ 賣與買是兩個不同的範圍，不能共用一次查詢：
    //   售價／日銷量 → **自家伺服器**（掛售只能在自己那一服，別服的最低價你掛不上去）
    //   材料成本     → 全 DC（採購可以跨服）
    var sellScope = homeWorld == null ? scope : homeWorld;
    var totalReq = Math.ceil(prodIds.length / 100) * 2 + Math.ceil(ingIds.length / 100);
    var setProg = function (label, i, n) {
      body.innerHTML = '<div class="loading">' + esc(label) + '（第 ' + i + '/' + n + ' 批）…<br>' +
        '<span class="note">' + cands.length + ' 項成品 · ' + ingIds.length + ' 種材料 · 共約 ' + totalReq +
        ' 次查詢 · 售價看 ' + esc(homeLabel() || scopeLabel()) + '、材料看 ' + esc(scopeLabel()) + '</span></div>';
    };
    var alive = function () { return token === pfToken; };

    var prodLst, prodAgg, ingLst;
    try {
      prodLst = await fetchInChunks(Universalis.fetchListings, prodIds, '查詢成品售價', setProg, alive, sellScope);
      if (!alive()) { pfBusy = false; return; }
      prodAgg = await fetchInChunks(function (s, ids) { return Universalis.fetchAggregated(s, ids); },
        prodIds, '查詢成品成交量', setProg, alive, sellScope);
      if (!alive()) { pfBusy = false; return; }
      ingLst = await fetchInChunks(Universalis.fetchListings, ingIds, '查詢材料行情', setProg, alive, scope);
    } catch (e) { prodLst = null; }
    if (!alive()) { pfBusy = false; return; }
    if (!prodLst) {
      body.innerHTML = '<div class="error">無法連線 Universalis，請稍後再試或按頁首「↻ 重新整理」。</div>';
      pfBusy = false; return;
    }

    pfRows = [];
    cands.forEach(function (c) {
      var it = itemById.get(c.id);
      var aggIt = prodAgg && prodAgg.items ? prodAgg.items[c.id] : null;
      var side = aggIt && aggIt[pfHq ? 'hq' : 'nq'];
      // 售價不加買方稅（賣方收到的是標價，再被抽賣方稅）。
      // ⚠ 限定自家伺服器後，很多成品**在這一服根本沒人在架**——早期版本直接
      //    跳過，結果整張表變空。沒人在架不是「沒有價值」，而是「沒有競爭者」，
      //    是這個功能最該告訴你的情況之一。退而用該服近期成交均價估，並標示來源。
      var sq = quoteFrom(recOf(prodLst, c.id), c.id, 1, pfHq);
      var sellUnit = null, basis = 'listing';
      if (sq) sellUnit = sq.minUnit;
      else {
        var ap = side && side.averageSalePrice;
        var p = ap && (ap.world || ap.dc);
        if (p && p.price > 0) { sellUnit = p.price; basis = 'avg'; }
      }
      if (sellUnit == null) return;                      // 既無在架也無成交紀錄
      var y = c.r.yield || 1;
      var cost = 0, na = 0;
      c.r.ingredients.forEach(function (g) {
        var q = quoteBuy(recOf(ingLst, g.itemId), g.itemId, g.qty, false);   // 含買方稅
        if (q) cost += q.total; else na++;
      });
      var gross = sellUnit * y;
      var net = gross * (1 - taxSell) - cost;
      var vq = side && side.dailySaleVelocity;
      var vel = vq && (vq.world || vq.dc) ? (vq.world || vq.dc).quantity : 0;
      pfRows.push({
        id: c.id, name: it ? it.name : '#' + c.id, level: c.job.level, job: c.job.job,
        stars: c.job.stars || 0, yield: y, sell: sellUnit, cost: cost, net: net,
        rate: cost > 0 ? net / cost : null, vel: vel,
        perDay: vel > 0 ? (net / y) * vel : 0,       // 單件淨利 × 市場日成交量
        na: na, stale: !!(sq && sq.stale), basis: basis
      });
    });
    pfMeta = { scanned: cands.length, total: cand.total, priced: pfRows.length,
      ings: ingIds.length, min: min, max: max, limit: limit, reqs: totalReq,
      sellWhere: homeLabel() || scopeLabel(), buyWhere: scopeLabel(), noHome: homeWorld == null };
    pfBusy = false;
    renderProfitTab();
  }

  function renderProfitTab() {
    var body = $('#profitBody');
    if (!pfRows.length) {
      // 空狀態該給下一步（UX empty-states），但一句就夠
      body.innerHTML = pfMeta
        ? '<div class="search-note">取樣的 ' + pfMeta.scanned + ' 項都沒有在架商品，算不出售價。換個職業或等級區間再試。</div>'
        : '<div class="empty-state">選好職業與等級區間，按「💰 計算利潤」。</div>';
      return;
    }
    var rows = pfRows.slice().sort(function (a, b) {
      var k = pfSort.key;
      var av = a[k], bv = b[k];
      if (k === 'name') return String(av).localeCompare(String(bv), 'zh-Hant') * pfSort.dir;
      if (av == null) av = -Infinity;
      if (bv == null) bv = -Infinity;
      return (av - bv) * pfSort.dir;
    });

    var head = PF_COLS.map(function (c) {
      var active = pfSort.key === c.k;
      var srt = active ? (pfSort.dir === 1 ? 'ascending' : 'descending') : 'none';
      return '<th' + (c.num ? ' class="num"' : '') + ' aria-sort="' + srt + '">' +
        '<button class="pf-sort' + (active ? ' on' : '') + '" data-pfsort="' + c.k + '"' +
        (c.h ? ' title="' + esc(c.h) + '"' : '') + '>' +
        esc(c.t) + (active ? (pfSort.dir === 1 ? ' ▲' : ' ▼') : '') + '</button></th>';
    }).join('');

    // 被截掉多少一定要講。不講的話「煉金術士全等級」看起來就只有 250 個配方
    // （實際 1081 個），而且被砍掉的一律是低等級那一批。
    var cut = pfMeta.total > pfMeta.scanned
      ? '<span class="flag warn" title="被砍掉的一律是製作等級較低的那批">△ 符合 ' + pfMeta.total +
        ' 項，只取樣等級最高的 ' + pfMeta.scanned + ' 項</span>縮小等級區間或調大取樣可看到其餘。'
      : '';
    // 沒設主伺服器＝售價退回全 DC 最低價，那是「別服的價」，你掛不上去也賣不到
    if (pfMeta.noHome) {
      cut += (cut ? '<br>' : '') +
        '<span class="flag danger" title="掛售只能在自家伺服器，用別服的最低價當售價會讓利潤失真">⚠ 未設定我的伺服器</span>' +
        '售價暫以全 DC 估算，請在頁首選擇。';
    }

    // 計算方法的完整說明搬進表頭的 title（滑過才看）與文件；這裡只留
    // 「這份結果是用什麼算的」一行事實，加上真的會影響判讀的截斷／未設伺服器警告。
    body.innerHTML =
      '<div class="note shop-hint">' + cut + (cut ? '<br>' : '') +
      '取樣 <b>' + pfMeta.scanned + '</b> 項，<b>' + pfMeta.priced + '</b> 項有售價　·　' +
      '售價看 <b>' + esc(pfMeta.sellWhere) + '</b>（扣 ' + pctTxt(taxSell) + ' 賣方稅）　·　' +
      '材料看 <b>' + esc(pfMeta.buyWhere) + '</b>（加 ' + pctTxt(taxBuy) + ' 買方稅）</div>' +
      '<div class="shop-scroll"><table class="listings pf-table"><thead><tr>' + head + '</tr></thead><tbody>' +
      rows.map(function (r) {
        var netCls = r.net > 0 ? 'good' : r.net < 0 ? 'bad' : '';
        var arrow = r.net > 0 ? '▲' : r.net < 0 ? '▼' : '＝';
        var it = itemById.get(r.id);
        return '<tr>' +
          '<td><div class="pf-name">' +
            '<img class="pf-ic" src="' + iconUrl(it) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '<div class="pf-nm"><span class="plan-node" data-node="' + r.id + '" role="button" tabindex="0" title="查看行情與配方">' + esc(r.name) + '</span>' +
            (r.yield > 1 ? ' <span class="plan-of">×' + r.yield + '/輪</span>' : '') +
            ((r.na || r.stale || r.basis === 'avg') ? '<span class="flag-run">' +
              (r.na ? '<span class="flag warn" title="有 ' + r.na + ' 種材料查不到市價，成本被低估">△ 缺 ' + r.na + ' 項材料價</span>' : '') +
              (r.stale ? '<span class="flag warn" title="售價資料可能已過期">△ 舊價</span>' : '') +
              (r.basis === 'avg' ? '<span class="flag info" title="你的伺服器目前沒人在賣，售價改用該服近期成交均價估算——沒有競爭者，價格可以自己開">ⓘ 無競爭者</span>' : '') +
              '</span>' : '') +
            '</div></div></td>' +
          '<td class="num">' + esc(r.job) + ' ' + r.level + (r.stars ? Array(r.stars + 1).join('★') : '') + '</td>' +
          '<td class="num">' + fmt(r.sell) + '</td>' +
          '<td class="num">' + fmt(r.cost) + '</td>' +
          '<td class="num ' + netCls + '">' + arrow + ' ' + (r.net < 0 ? '−' : '') + fmt(Math.abs(r.net)) + '</td>' +
          '<td class="num ' + netCls + '">' + (r.rate == null ? '—' : (r.rate < 0 ? '−' : '＋') + Math.abs(Math.round(r.rate * 100)) + '%') + '</td>' +
          '<td class="num">' + (r.vel > 0 ? (Math.round(r.vel * 10) / 10) : '<span class="flag warn">△ 0</span>') + '</td>' +
          '<td class="num ' + (r.perDay > 0 ? 'good' : '') + '">' + (r.perDay > 0 ? fmt(r.perDay) : '—') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ===================== 我的清單 =====================
  function saveAsList() {
    if (!craft.length) return;
    var name = prompt('清單名稱：', '製作清單 ' + (lists.length + 1));
    if (name == null) return;
    name = name.trim() || ('製作清單 ' + (lists.length + 1));
    var now = Date.now();
    lists.push({ id: 'L' + now + Math.floor(Math.random() * 1000), name: name, createdAt: now, updatedAt: now, items: craft.map(function (c) { return { itemId: c.itemId, qty: c.qty }; }) });
    saveLists(); renderLists();
    alert('已儲存清單「' + name + '」');
  }
  function loadList(id) {
    var l = lists.find(function (x) { return x.id === id; });
    if (!l) return;
    craft = l.items.slice(0, MAX_CRAFT_ITEMS).map(function (c) { return { itemId: c.itemId, qty: c.qty }; });
    if (l.items.length > MAX_CRAFT_ITEMS) alert('此清單有 ' + l.items.length + ' 件，超過上限，已載入前 ' + MAX_CRAFT_ITEMS + ' 件。');
    saveDraft(); updateCraftCount(); switchTab('craft'); renderCraft();
  }
  function renameList(id) {
    var l = lists.find(function (x) { return x.id === id; });
    if (!l) return;
    var n = prompt('新名稱：', l.name);
    if (n == null) return;
    l.name = n.trim() || l.name; l.updatedAt = Date.now(); saveLists(); renderLists();
  }
  function deleteList(id) {
    var l = lists.find(function (x) { return x.id === id; });
    if (!l) return;
    if (!confirm('刪除清單「' + l.name + '」？')) return;
    lists = lists.filter(function (x) { return x.id !== id; }); saveLists(); renderLists();
  }
  // 展開狀態只記在記憶體：改名／刪除後整區會重繪，不希望使用者剛展開的卡被收回去。
  // 不寫進 localStorage——清單會增減，存了反而留下一堆已刪清單的殘留鍵。
  var listOpen = {};
  var SL_ICONS = 6;   // 收合時最多排幾個圖示，其餘用「+N」帶過

  function listItemName(c) { var it = itemById.get(c.itemId); return it ? it.name : '#' + c.itemId; }

  function listItemsHtml(l) {
    if (!l.items.length) return '<div class="note">這份清單是空的。</div>';
    return '<div class="sl-items">' + l.items.map(function (c) {
      var nm = listItemName(c);
      return '<button type="button" class="sl-item" data-goto="' + c.itemId + '" title="查看「' + esc(nm) + '」的市價">' +
        '<img class="sl-ic" src="' + iconUrl(itemById.get(c.itemId)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="sl-inm">' + esc(nm) + '</span>' +
        '<span class="sl-qty">×' + c.qty + '</span></button>';
    }).join('') + '</div>';
  }

  function renderLists() {
    var body = $('#listsBody');
    if (!lists.length) { body.innerHTML = '<div class="empty-state">還沒有儲存任何清單。<br>在「製作清單」分頁按「💾 另存為清單」即可建立。</div>'; return; }
    body.innerHTML = lists.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).map(function (l) {
      // 「項」＝不同品項數，「件」＝總數量。兩個數字常常差很多（4 項 120 件），
      // 只給其中一個會讓人誤判這份清單的規模。
      var units = l.items.reduce(function (s, c) { return s + (Number(c.qty) || 0); }, 0);
      var ics = l.items.slice(0, SL_ICONS).map(function (c) {
        return '<img src="' + iconUrl(itemById.get(c.itemId)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">';
      }).join('');
      if (l.items.length > SL_ICONS) ics += '<span class="sl-more">+' + (l.items.length - SL_ICONS) + '</span>';
      return '<details class="fold saved-fold"' + (listOpen[l.id] ? ' open' : '') + ' data-lid="' + l.id + '">' +
        '<summary>' +
          '<span class="sl-main"><span class="sl-nm">' + esc(l.name) + '</span>' +
          '<span class="sl-meta">' + l.items.length + ' 項 · 共 ' + fmt(units) + ' 件 · 更新於 ' +
            new Date(l.updatedAt).toLocaleDateString('zh-TW') + '</span></span>' +
          // 圖示只是輔助辨識，品名在展開後才是正式資訊，故對輔助技術隱藏
          (ics ? '<span class="sl-ics" aria-hidden="true">' + ics + '</span>' : '') +
          '<span class="sl-acts">' +
            '<button class="btn primary" type="button" data-act="load" data-id="' + l.id + '">載入</button>' +
            '<button class="btn" type="button" data-act="rename" data-id="' + l.id + '">改名</button>' +
            '<button class="btn danger" type="button" data-act="del" data-id="' + l.id + '">刪除</button>' +
          '</span>' +
        '</summary>' +
        '<div class="fold-b">' + listItemsHtml(l) + '</div></details>';
    }).join('');

    // ⚠ toggle 不冒泡，只能逐個掛（同 bindFolds 的理由）
    body.querySelectorAll('details[data-lid]').forEach(function (d) {
      d.addEventListener('toggle', function () { listOpen[d.getAttribute('data-lid')] = d.open; });
    });
    // 這三顆鈕在 <summary> 裡，不擋掉預設行為的話按「刪除」會順手把卡片展開
    body.querySelectorAll('[data-act]').forEach(function (el) {
      var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
      el.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (act === 'load') loadList(id); else if (act === 'rename') renameList(id); else if (act === 'del') deleteList(id);
      });
    });
    body.querySelectorAll('[data-goto]').forEach(function (el) {
      el.addEventListener('click', function () { navTo({ node: Number(el.getAttribute('data-goto')) }); });
    });
  }

  function exportLists() {
    var blob = new Blob([JSON.stringify({ schema: 'sgt-market-lists', exported: new Date().toISOString(), lists: lists }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'market-lists.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importLists(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var obj = JSON.parse(fr.result);
        var incoming = Array.isArray(obj) ? obj : (obj.lists || []);
        if (!Array.isArray(incoming) || !incoming.length) { alert('檔案內沒有清單資料。'); return; }
        var ok = 0;
        incoming.forEach(function (l) {
          if (l && Array.isArray(l.items)) {
            lists.push({ id: 'L' + Date.now() + Math.floor(Math.random() * 100000), name: (l.name || '匯入清單'), createdAt: l.createdAt || Date.now(), updatedAt: Date.now(), items: l.items.filter(function (c) { return c && c.itemId; }).slice(0, MAX_CRAFT_ITEMS).map(function (c) { return { itemId: Number(c.itemId), qty: Math.max(1, Number(c.qty) || 1) }; }) });
            ok++;
          }
        });
        saveLists(); renderLists();
        alert('已匯入 ' + ok + ' 份清單。');
      } catch (e) { alert('匯入失敗：檔案格式錯誤。'); }
    };
    fr.readAsText(file);
  }

  // ===================== 分頁 / 瀏覽歷史（上一頁/下一頁）=====================
  // 用 History API 讓瀏覽器上一頁/下一頁可在「分頁 → 物品詳情 → 節點視窗」之間
  // 逐步前進後退，而不是一按上一頁就離開整個工具回首頁。
  // 狀態 nav = { tab, detail(物品查詢選中的物品), node(節點視窗開啟的物品) }。
  var applied = { tab: 'search', detail: null, node: null };

  function setTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
    if (name === 'craft') renderCraft();
    if (name === 'lists') renderLists();
    if (name === 'profit') renderProfitTab();
  }

  // 套用某個歷史狀態到畫面（不再寫入歷史）
  function applyNav(s) {
    s = s || { tab: 'search', detail: null, node: null };
    if (s.tab !== applied.tab) setTab(s.tab);
    if (s.tab === 'search' && s.detail !== applied.detail) {
      if (s.detail != null) showDetail(s.detail);
      else { $('#itemDetail').innerHTML = ''; currentDetailId = null; }
    }
    if (s.node !== applied.node) {
      if (s.node != null) openNodeDetail(s.node);
      else { nmCurrentId = null; $('#nodeModal').classList.remove('open'); }
    }
    applied = { tab: s.tab, detail: s.detail != null ? s.detail : null, node: s.node != null ? s.node : null };
  }

  function urlFor(s) {
    if (s.node != null) return '#node=' + s.node;
    if (s.tab === 'search' && s.detail != null) return '#item=' + s.detail;
    return '#' + s.tab;
  }

  // 使用者操作 → 寫入一筆歷史並套用（上一頁即可回到先前狀態）
  function navTo(partial) {
    var s = {
      tab: 'tab' in partial ? partial.tab : applied.tab,
      detail: 'detail' in partial ? partial.detail : applied.detail,
      node: 'node' in partial ? partial.node : applied.node
    };
    // 節點視窗內的上下游導覽（node→node、同分頁）以 replaceState 取代，
    // 讓整個視窗瀏覽只佔一筆歷史；如此關閉／點空白處／上一頁一次即可回到原頁面，
    // 不必依瀏覽層數重複點擊。
    var inModalNav = (applied.node != null && s.node != null && s.tab === applied.tab);
    try {
      if (inModalNav) history.replaceState(s, '', urlFor(s));
      else history.pushState(s, '', urlFor(s));
    } catch (e) {}
    applyNav(s);
  }
  function switchTab(name) { navTo({ tab: name, node: null }); }
  function renderUpdateTime() {
    $('#updateTime').textContent = lastUpload ? ('資料更新：' + relTime(lastUpload)) : '';
  }
  // 我的伺服器：只影響「賣」那一側（售價、利潤、日銷量）。採購不受它影響。
  function buildHomeSelect() {
    var sel = $('#homeSel');
    var opts = '<option value="">（尚未設定）</option>';
    Object.keys(Universalis.WORLDS).forEach(function (id) {
      opts += '<option value="' + id + '">' + Universalis.WORLDS[id] + '</option>';
    });
    sel.innerHTML = opts;
    sel.value = homeWorld == null ? '' : String(homeWorld);
    sel.addEventListener('change', function () {
      homeWorld = sel.value === '' ? null : Number(sel.value);
      saveHome();
      pfRows = []; pfMeta = null;                 // 售價基準變了，舊結果一律作廢
      if ($('#tab-profit').classList.contains('active')) renderProfitTab();
      if ($('#nodeModal').classList.contains('open') && nmCurrentId) openNodeDetail(nmCurrentId);
      if (currentDetailId && $('#tab-search').classList.contains('active')) showDetail(currentDetailId);
    });
  }
  function homeLabel() { return homeWorld == null ? null : Universalis.worldName(homeWorld); }

  // ===================== 初始化 =====================
  async function init() {
    loadState();
    buildHomeSelect();
    updateCraftCount();

    // 分頁切換
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); });
    });

    // 深連結：初次載入若帶 #item=<id> / #node=<id> / #craft|#lists|#profit，套用之
    // （供收藏頁「💰 市場行情」等外部連結直接開到指定物品）
    //
    // ⚠ 兩個順序都不能顛倒，各踩過一次：
    //  ① 必須**在下面的 replaceState 之前**讀 location.hash——那一行把 URL 換成
    //     pathname+search，hash 會當場被洗掉，晚一步讀到的永遠是空字串。
    //  ② 必須**等 items-market.json 載完才套用**——showDetail／openNodeDetail
    //     第一件事就是 itemById.get(id)，物品庫還沒到位時它們會靜默 return，
    //     畫面停在空白，看起來就像連結是壞的。所以這裡只記下來，稍後才套用。
    var pendingHash = (function () {
      var h = location.hash || '';
      var mItem = h.match(/^#item=(\d+)/);
      var mNode = h.match(/^#node=(\d+)/);
      if (mItem) return { tab: 'search', detail: Number(mItem[1]), node: null };
      if (mNode) return { node: Number(mNode[1]) };
      if (h === '#craft' || h === '#lists' || h === '#profit') return { tab: h.slice(1), node: null };
      return null;
    })();

    // 瀏覽歷史：初始狀態 + 上一頁/下一頁
    try { history.replaceState({ tab: 'search', detail: null, node: null }, '', location.pathname + location.search); } catch (e) {}
    window.addEventListener('popstate', function (e) { applyNav(e.state || { tab: 'search', detail: null, node: null }); });

    // 賺錢排行：職業複選、售價品質、執行、表頭排序、點物品名開詳情
    $('#pfJobRow').addEventListener('click', function (e) {
      var chip = e.target.closest('.job-chip');
      if (!chip) return;
      var j = chip.getAttribute('data-pfjob');
      if (pfJobs.has(j)) pfJobs.delete(j); else pfJobs.add(j);
      chip.classList.toggle('active', pfJobs.has(j));
    });
    $('#pfHqSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pfhq]');
      if (!b) return;
      pfHq = b.getAttribute('data-pfhq') === '1';
      $('#pfHqSeg').querySelectorAll('button').forEach(function (x) {
        var on = (x.getAttribute('data-pfhq') === '1') === pfHq;
        x.classList.toggle('active', on);
        x.setAttribute('aria-pressed', String(on));
      });
    });
    $('#pfRun').addEventListener('click', runProfitScan);
    $('#profitBody').addEventListener('click', function (e) {
      var s = e.target.closest('[data-pfsort]');
      if (s) {
        var k = s.getAttribute('data-pfsort');
        // 再按同一欄＝反向；換欄時文字欄預設升冪、數字欄預設降冪（大的先看）
        if (pfSort.key === k) pfSort.dir = -pfSort.dir;
        else pfSort = { key: k, dir: k === 'name' ? 1 : -1 };
        renderProfitTab();
        return;
      }
      var nd = e.target.closest('.plan-node[data-node]');
      if (nd) navTo({ node: Number(nd.getAttribute('data-node')) });
    });
    $('#profitBody').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var nd = e.target.closest('.plan-node[data-node]');
      if (!nd) return;
      e.preventDefault();
      navTo({ node: Number(nd.getAttribute('data-node')) });
    });

    // 搜尋：全延遲觸發——輸入/條件變更只標記 dirty，按搜尋鈕或 Enter 才執行
    var input = $('#searchInput');
    $('#searchBtn').addEventListener('click', executeSearch);
    input.addEventListener('keydown', function (e) {
      // 中文輸入法組字中的 Enter（isComposing / keyCode 229）不觸發搜尋
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) executeSearch();
    });
    input.addEventListener('input', markDirty);

    // 條件群（chips／等級範圍／裝備職業／排序）：變更僅 staged，不即時查詢
    $('#craftRow').addEventListener('click', function (e) {
      var chip = e.target.closest('.job-chip');
      if (!chip) return;
      var j = chip.getAttribute('data-job');
      if (jobFilter.has(j)) jobFilter.delete(j); else jobFilter.add(j);
      chip.classList.toggle('active', jobFilter.has(j));
      markDirty();
    });
    ['craftMin', 'craftMax', 'equipMin', 'equipMax'].forEach(function (id) {
      $('#' + id).addEventListener('input', markDirty);
    });
    $('#equipJob').addEventListener('change', markDirty);
    $('#sortSel').addEventListener('change', markDirty);
    $('#catSel').addEventListener('change', markDirty);
    $('#onlyMarket').addEventListener('change', markDirty);
    $('#searchResults').addEventListener('click', function (e) {
      var pb = e.target.closest('.page-btn[data-page]');
      if (pb) { if (!pb.disabled) { searchPage = Number(pb.getAttribute('data-page')); renderResultsPage(true); } return; }
      var card = e.target.closest('.result-card[data-id]');
      if (!card) return;
      // 與「製作清單」的節點卡片同效果：開啟節點詳情視窗（市價 + 上下游配方 + 加入清單）
      navTo({ node: Number(card.getAttribute('data-id')) });
    });

    // 重新整理
    $('#refreshBtn').addEventListener('click', function () {
      Universalis.clearCache(); priceMap = new Map();
      if (currentDetailId && $('#tab-search').classList.contains('active')) showDetail(currentDetailId);
      if ($('#tab-craft').classList.contains('active')) renderCraft();
      if ($('#nodeModal').classList.contains('open') && nmCurrentId) openNodeDetail(nmCurrentId);
    });

    // 匯出 / 匯入
    $('#exportBtn').addEventListener('click', exportLists);
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (e) { if (e.target.files[0]) importLists(e.target.files[0]); e.target.value = ''; });

    // 製作清單：事件委派（點節點 / 數量 / 複製 / 動作 / 選項切換）
    var cb = $('#craftBody');
    cb.addEventListener('click', function (e) {
      var cview = e.target.closest('[data-cview]');
      if (cview) { craftView = cview.getAttribute('data-cview'); saveCview(); renderCraft(); return; }
      var copy = e.target.closest('.node-copy');
      if (copy) { copyName(copy.getAttribute('data-copy')); var o = copy.textContent; copy.textContent = '✓'; setTimeout(function () { copy.textContent = o; }, 900); return; }
      // 「✓ 我有了」：一次補滿該物品在計畫裡**所有分支**的剩餘需求（同一料被兩個成品用到
      // 也一起解決）；已經滿足時再按一次歸零。之後整份計畫重算——子樹會整段消失。
      var gall = e.target.closest('[data-gotall], [data-have]');
      if (gall) {
        var gid = Number(gall.getAttribute('data-gotall') || gall.getAttribute('data-have'));
        var fill = Number(gall.getAttribute('data-need'));
        if (!isFinite(fill)) { var tt = planIndex.get(gid); fill = tt ? tt.need : 0; }
        gotMap[gid] = fill > 0 ? gotOf(gid) + fill : 0;
        saveGot(); rerenderKeepScroll();
        return;
      }
      var cp = e.target.closest('[data-copyplan]');
      if (cp) {
        copyName(planText(cp.getAttribute('data-copyplan')));
        var ot = cp.textContent; cp.textContent = '✓ 已複製';
        setTimeout(function () { cp.textContent = ot; }, 1400);
        return;
      }
      var hqo = e.target.closest('[data-hqo]');
      if (hqo) {
        var hid = Number(hqo.getAttribute('data-hqo')), hv = hqo.getAttribute('data-hqv');
        if (hv === 'auto') delete hqOverride[hid]; else hqOverride[hid] = hv;
        saveHqo(); rerenderKeepScroll();
        return;
      }
      var pview = e.target.closest('[data-pview]');
      if (pview) { planView = pview.getAttribute('data-pview'); savePview(); rerenderKeepScroll(); return; }
      var ptog = e.target.closest('[data-plan-toggle]');
      if (ptog) {
        var pth = ptog.getAttribute('data-plan-toggle');
        planOpen.set(pth, ptog.getAttribute('aria-expanded') !== 'true');
        rerenderKeepScroll();
        return;
      }
      var pall = e.target.closest('[data-plan-all]');
      if (pall) {
        planAll = pall.getAttribute('data-plan-all') === 'open';
        planOpen = new Map();
        rerenderKeepScroll();
        return;
      }
      var act = e.target.closest('[data-act]');
      if (act) {
        var a = act.getAttribute('data-act'), id = Number(act.getAttribute('data-id'));
        if (a === 'inc') setQty(id, getQty(id) + 1);
        else if (a === 'dec') setQty(id, getQty(id) - 1);
        else if (a === 'del') removeFromCraft(id);
        else if (a === 'worldcmp') computeWorldCompare();
        else if (a === 'saveAs') saveAsList();
        else if (a === 'clear') { if (confirm('確定清空目前的製作清單？（已儲存的清單不受影響，「已有」的標記將一併重設）')) { craft = []; gotMap = {}; planOpen = new Map(); saveGot(); saveDraft(); updateCraftCount(); renderCraft(); } }
        return;
      }
      var srow = e.target.closest('[data-simple]');
      if (srow) { navTo({ node: Number(srow.getAttribute('data-simple')) }); return; }
      var card = e.target.closest('[data-node]');
      if (card) navTo({ node: Number(card.getAttribute('data-node')) });
    });
    // 計畫列的品名是 role="button"，鍵盤也要能開詳情
    cb.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var nd = e.target.closest('.plan-node[data-node]');
      if (!nd) return;
      e.preventDefault();
      navTo({ node: Number(nd.getAttribute('data-node')) });
    });
    cb.addEventListener('change', function (e) {
      if (e.target.matches('input[data-act="qty"]')) { setQty(Number(e.target.getAttribute('data-id')), parseInt(e.target.value, 10) || 1); }
      else if (e.target.matches('input[data-got]')) { rerenderKeepScroll(); }   // 打完數字才重算，不要邊打邊重繪
      else if (e.target.id === 'optCrystal') { excludeCrystals = e.target.checked; saveOpts(); renderCraft(); }
      else if (e.target.id === 'optHq') { hqProduct = e.target.checked; saveOpts(); renderCraft(); }
    });
    // 「已有」數量：邊打邊存（夾在 0～計畫總需求），重算等到 change
    cb.addEventListener('input', function (e) {
      if (!e.target.matches('input[data-got]')) return;
      var gid = Number(e.target.getAttribute('data-got'));
      var gmax = Number(e.target.getAttribute('max')) || 0;
      var v = parseInt(e.target.value, 10);
      if (!isFinite(v) || v < 0) v = 0;
      if (v > gmax) { v = gmax; e.target.value = v; }
      gotMap[gid] = v;
      saveGot();
    });

    // 節點詳情 modal：委派（關閉 / 上下游導覽 / 加入清單）
    $('#nodeModalBody').addEventListener('click', function (e) {
      var t = e.target.closest('[data-nm]');
      if (!t) return;
      var k = t.getAttribute('data-nm');
      if (k === 'close') backOrClose();
      else if (k === 'nav') navTo({ node: Number(t.getAttribute('data-id')) });
      else if (k === 'add') {
        var q = Math.max(1, parseInt($('#nmQty').value, 10) || 1);
        addToCraft(Number(t.getAttribute('data-id')), q);
        t.textContent = '✓ 已加入'; setTimeout(function () { t.textContent = '＋ 加入'; }, 1200);
      }
    });
    $('#nodeModal').addEventListener('click', function (e) { if (e.target === this) backOrClose(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#nodeModal').classList.contains('open')) backOrClose(); });

    // 載入資料
    try {
      gamePatch = await PatchGate.loadGamePatch('../../data/_meta.json');
      // 讀精簡表而不是 10MB 的 items.json：本頁只用到六個欄位，整包載完才能動實在太貴。
      // 產生方式與欄位說明見 scripts/build-items-market.mjs（改完 items.json 要重跑）。
      var res = await fetch('../../data/items-market.json');
      var db = await res.json();
      items = expandMarketItems(db);
      itemById = new Map(items.map(function (it) { return [it.id, it]; }));
      // 分類清單本來就在 items-market.json 裡（113 種），白拿的篩選維度
      var cats = (db.categories || []).filter(Boolean).slice().sort(function (a, b) { return a.localeCompare(b, 'zh-Hant'); });
      $('#catSel').innerHTML = '<option value="">全部分類</option>' +
        cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
      // 物品庫到位了，這時才套用深連結（見上面 pendingHash 的說明）
      if (pendingHash) { navTo(pendingHash); pendingHash = null; }
      // 背景預載：配方（卡片職業列／製作清單零等待）＋裝備限制（填職業下拉）
      ensureRecipes().then(function () {
        if (searchOut.length) renderResultsPage(false);   // 補上卡片的製作職業列
      }).catch(function () {});
      ensureEquip().then(function () {
        var html = '<option value="">全部</option>' +
          '<option value="g:all">全職業可裝</option>' +
          '<optgroup label="職能分類">' +
          EQUIP_ROLES.filter(function (r) { return r.key !== 'all'; }).map(function (r) {
            return '<option value="g:' + r.key + '">' + esc(r.name) + '</option>';
          }).join('') + '</optgroup>';
        EQUIP_ROLES.forEach(function (r) {
          if (r.key === 'all') return;
          var jobs = r.abbrs.filter(function (a) { return !HIDDEN_JOBS[a] && equipData.names[a]; });
          if (!jobs.length) return;
          html += '<optgroup label="' + esc(r.name) + '">' + jobs.map(function (a) {
            return '<option value="j:' + a + '">' + esc(equipData.names[a]) + '</option>';
          }).join('') + '</optgroup>';
        });
        $('#equipJob').innerHTML = html;
      }).catch(function () {});
    } catch (e) {
      $('#itemDetail').innerHTML = '<div class="error">物品資料載入失敗，請重新整理頁面。</div>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();