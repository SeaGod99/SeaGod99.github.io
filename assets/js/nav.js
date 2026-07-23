/* 水神的工具箱 — 全站跨工具快速切換器（命令面板）
 *
 * 由 theme.js 以相對路徑載入（相容 file:// 與線上）。開啟方式：
 *   - 鍵盤 "/"（游標不在輸入框時）或 Ctrl/⌘ + K
 *   - 點左下角的浮動 🔍 鈕（行動裝置用）
 * 面板內：打字即時過濾、↑/↓ 選擇、Enter 前往、Esc 關閉、點背景關閉。
 *
 * 站根相對路徑取自 window.__SGT_ROOT__（theme.js 設定，如 "../../"）。
 * 各工具路徑以站根為基準；外部連結用絕對 URL 並另開分頁。
 */
(function () {
  'use strict';

  var ROOT = (window.__SGT_ROOT__ != null ? window.__SGT_ROOT__ : './');

  // 工具清單（對應首頁卡片）。ext:true = 外部連結。
  var TOOLS = [
    // 日常工具（c:'daily'）
    { e: '⛅', n: '艾歐澤亞天氣預報', p: 'tools/weather/', c: 'daily', k: 'weather tianqi 天氣 預報 天氣鏈' },
    { e: '📖', n: '天書奇談計算器', p: 'tools/wondrous-tails/', c: 'daily', k: 'wondrous tails 天書 奇談 連線' },
    { e: '🎰', n: '仙人微彩計算機', p: 'tools/cactpot/', c: 'daily', k: 'cactpot 仙人 微彩 金碟' },
    { e: '⛏️', n: '限時採集節點查詢', p: 'tools/gathering/', c: 'daily', k: 'gathering 採集 傳說 稀有 節點' },
    { e: '🌬️', n: '風脈泉追蹤器', p: 'tools/aether-currents/', c: 'daily', k: 'aether currents 風脈泉 風脈' },
    { e: '🦊', n: '幻巧戰助手', p: 'tools/faux-hollows/', c: 'daily', k: 'faux hollows 幻巧戰 狐狸' },
    { e: '👗', n: '時尚品鑑推薦', p: 'tools/fashion-report/', c: 'daily', k: 'fashion report 時尚 品鑑 染色' },
    { e: '👘', n: '幻化配裝圖鑑', p: 'tools/glamour/', c: 'daily', k: 'glamour 幻化 配裝 mirapri 套裝' },
    // 收藏 / 成就（c:'collect'）
    { e: '🐎', n: '坐騎收藏追蹤', p: 'collections/mounts/', c: 'collect', k: 'mount 坐騎 收藏' },
    { e: '🐣', n: '寵物收藏追蹤', p: 'minions/', c: 'collect', k: 'minion 寵物 收藏' },
    { e: '🎵', n: '樂譜收藏追蹤', p: 'collections/orchestrion/', c: 'collect', k: 'orchestrion 樂譜 演奏團' },
    { e: '💃', n: '表情收藏追蹤', p: 'collections/emotes/', c: 'collect', k: 'emote 表情 動作' },
    { e: '💇', n: '髮型收藏追蹤', p: 'collections/hairstyles/', c: 'collect', k: 'hairstyle 髮型 樣式書' },
    { e: '🦜', n: '鳥鞍收藏追蹤', p: 'collections/barding/', c: 'collect', k: 'barding 鳥鞍 陸行鳥' },
    { e: '👁️', n: '探索筆記追蹤器', p: 'collections/exploration-log/', c: 'collect', k: 'sightseeing 探索筆記 景觀' },
    { e: '💙', n: '青魔法術收藏', p: 'collections/blue-magic/', c: 'collect', k: 'blue magic 青魔 法術' },
    { e: '🃏', n: '幻卡追蹤', p: 'collections/triple-triad/', c: 'collect', k: 'triple triad 幻卡' },
    // 戰鬥 / 副本（c:'battle'）
    { e: '🏰', n: '冒險者小隊計算機', p: 'tools/squadron/', c: 'battle', k: 'squadron 小隊 派遣' },
    { e: '🛡️', n: '配裝規劃器（外部）', u: 'https://gearing.ffsusu.com/', c: 'battle', k: 'gearing 配裝 規劃', ext: true },
    // 生活職（c:'life'）
    { e: '📊', n: '市場查價 + 比價', p: 'tools/market/', c: 'life', k: 'market 市場 查價 universalis 比價' },
    { e: '🎖️', n: '軍票變現排行', p: 'tools/gc-exchange/', c: 'life', k: 'gc seals 軍票 grand company 變現' },
    { e: '🗺️', n: '藏寶圖採集點查詢', p: 'tools/treasure-maps/', c: 'life', k: 'treasure map 藏寶圖 挖寶' },
    { e: '🌱', n: '園藝配種計算', p: 'tools/gardening/', c: 'life', k: 'gardening 園藝 配種 種植' },
    { e: '🎣', n: '釣魚紀錄追蹤', p: 'tools/fishing/', c: 'life', k: 'fishing 釣魚 大魚' },
    { e: '🚢', n: '出海垂釣班表（外部・魚糕）', u: 'https://fish.ffmomola.com/#/oceanFishing', c: 'life', k: 'ocean fishing 出海 垂釣', ext: true },
    { e: '⛏️', n: '採集紀錄追蹤', p: 'tools/gathering-log/', c: 'life', k: 'gathering log 採集紀錄 手帳' },
    { e: '🏝️', n: '無人島素材／工坊查詢', p: 'tools/island/', c: 'life', k: 'island sanctuary mji 無人島 開拓 素材 工坊 製作 採集' }
  ];

  // 分類（顯示順序 = TOOLS 定義順序）
  var CATS = [
    { k: 'daily',   label: '📅 日常工具' },
    { k: 'collect', label: '🏆 收藏 / 成就' },
    { k: 'battle',  label: '⚔️ 戰鬥 / 副本' },
    { k: 'life',    label: '🌿 生活職（採集 / 製作 / 市場）' }
  ];
  function catLabel(k) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].k === k) return CATS[i].label;
    return '其他';
  }

  function hrefOf(t) { return t.ext ? t.u : (ROOT + t.p); }
  function searchStr(t) { return (t.n + ' ' + (t.k || '')).toLowerCase(); }

  var overlay, input, listEl, items = [], sel = 0, filtered = TOOLS.slice();

  function injectStyle() {
    if (document.getElementById('sgt-nav-style')) return;
    var css = '' +
      // 頂部工具列（全站切換器入口）：整條貼齊視窗寬，內容置中對齊站內 1500px 容器
      '#sgt-topbar{position:sticky;top:0;z-index:9997;' +
      'background:color-mix(in srgb,var(--bg-surface,#0f1117) 90%,transparent);' +
      'border-bottom:1px solid var(--border,rgba(255,255,255,.08));' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}' +
      '.sgt-tb-inner{max-width:1500px;margin:0 auto;width:100%;box-sizing:border-box;' +
      'display:flex;align-items:center;gap:16px;height:46px;padding:0 24px;}' +
      '.sgt-tb-brand{display:flex;align-items:center;gap:6px;flex:none;text-decoration:none;' +
      'font-size:14px;font-weight:600;color:var(--gold,#c8a96e);white-space:nowrap;}' +
      '.sgt-tb-brand:hover{color:var(--gold-light,#e2c98a);}' +
      '.sgt-tb-search{flex:1;margin-left:auto;display:flex;align-items:center;gap:8px;' +
      'height:32px;padding:0 12px;cursor:text;text-align:left;' +
      'background:var(--bg-card,#14181f);border:1px solid var(--border,rgba(255,255,255,.12));' +
      'border-radius:8px;color:var(--text-muted,#717c91);font-size:13.5px;font-family:inherit;' +
      'transition:border-color .15s,color .15s;}' +
      '.sgt-tb-search:hover{border-color:var(--border-hover,rgba(200,169,110,.45));color:var(--text-secondary,#8892a4);}' +
      '.sgt-tb-search .ph{flex:1;text-align:left;}' +
      '.sgt-tb-search kbd{font:600 11px/1 ui-monospace,Consolas,monospace;color:var(--text-muted,#717c91);' +
      'border:1px solid var(--border,rgba(255,255,255,.18));border-radius:4px;padding:2px 6px;}' +
      '@media print{#sgt-topbar{display:none;}}' +
      '@media (max-width:600px){.sgt-tb-inner{padding:0 14px;gap:10px;}.sgt-tb-brand span:last-child{display:none;}.sgt-tb-search kbd{display:none;}}' +
      '#sgt-nav-overlay{position:fixed;inset:0;z-index:10000;display:none;background:rgba(0,0,0,.5);' +
      '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);}' +
      '#sgt-nav-overlay.open{display:block;}' +
      '#sgt-nav-panel{position:absolute;left:50%;top:14vh;transform:translateX(-50%);width:min(560px,92vw);' +
      'background:var(--bg-card,#14181f);border:1px solid var(--border-hover,rgba(200,169,110,.4));' +
      'border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;}' +
      '#sgt-nav-input{width:100%;box-sizing:border-box;background:transparent;border:0;' +
      'border-bottom:1px solid var(--border,rgba(255,255,255,.08));color:var(--text-primary,#e8eaf0);' +
      'font-size:16px;padding:16px 18px;outline:none;}' +
      '#sgt-nav-input::placeholder{color:var(--text-muted,#717c91);}' +
      '#sgt-nav-list{max-height:52vh;overflow-y:auto;padding:6px;}' +
      '.sgt-nav-cat{padding:9px 12px 4px;font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--text-muted,#717c91);}' +
      '.sgt-nav-cat:first-child{padding-top:4px;}' +
      '.sgt-nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;color:var(--text-secondary,#8892a4);}' +
      '.sgt-nav-item .ico{font-size:18px;width:24px;text-align:center;flex:none;}' +
      '.sgt-nav-item .nm{font-size:14.5px;color:var(--text-primary,#e8eaf0);}' +
      '.sgt-nav-item .ext{margin-left:auto;font-size:11px;color:var(--text-muted,#717c91);}' +
      '.sgt-nav-item.on,.sgt-nav-item:hover{background:var(--gold-dim,rgba(200,169,110,.15));}' +
      '.sgt-nav-item.on .nm{color:var(--gold-light,#e2c98a);}' +
      '#sgt-nav-empty{padding:22px 18px;color:var(--text-muted,#717c91);font-size:14px;text-align:center;display:none;}' +
      '#sgt-nav-foot{padding:8px 14px;border-top:1px solid var(--border,rgba(255,255,255,.08));' +
      'font-size:11px;color:var(--text-muted,#717c91);display:flex;gap:14px;flex-wrap:wrap;}' +
      '@media print{#sgt-nav-launch{display:none;}}';
    var st = document.createElement('style');
    st.id = 'sgt-nav-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    injectStyle();
    overlay = document.createElement('div');
    overlay.id = 'sgt-nav-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '快速切換工具');
    overlay.innerHTML =
      '<div id="sgt-nav-panel">' +
        '<input id="sgt-nav-input" type="text" autocomplete="off" placeholder="前往工具…（打字過濾，↑↓ 選擇，Enter 前往）" aria-label="搜尋工具">' +
        '<div id="sgt-nav-list" role="listbox"></div>' +
        '<div id="sgt-nav-empty">找不到符合的工具</div>' +
        '<div id="sgt-nav-foot"><span>↑↓ 選擇</span><span>↵ 前往</span><span>Esc 關閉</span><span>/ 或 Ctrl/⌘K 開啟</span></div>' +
      '</div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('#sgt-nav-input');
    listEl = overlay.querySelector('#sgt-nav-list');

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    input.addEventListener('input', function () { filter(input.value); });
    input.addEventListener('keydown', onKey);
  }

  function render() {
    listEl.innerHTML = '';
    items = [];
    var empty = overlay.querySelector('#sgt-nav-empty');
    empty.style.display = filtered.length ? 'none' : '';
    var lastCat = null;
    filtered.forEach(function (t, i) {
      // filtered 保持 TOOLS 的分類排序，分類變更時插入標題（items[] 仍與 filtered 同序，方向鍵不受影響）
      if (t.c !== lastCat) {
        lastCat = t.c;
        var h = document.createElement('div');
        h.className = 'sgt-nav-cat';
        h.textContent = catLabel(t.c);
        listEl.appendChild(h);
      }
      var row = document.createElement('a');
      row.className = 'sgt-nav-item' + (i === sel ? ' on' : '');
      row.href = hrefOf(t);
      if (t.ext) { row.target = '_blank'; row.rel = 'noopener'; }
      row.setAttribute('role', 'option');
      row.innerHTML = '<span class="ico">' + t.e + '</span><span class="nm"></span>' + (t.ext ? '<span class="ext">↗ 外部</span>' : '');
      row.querySelector('.nm').textContent = t.n;
      row.addEventListener('mouseenter', function () { sel = i; markSel(); });
      row.addEventListener('click', function (e) { e.preventDefault(); go(t); });
      listEl.appendChild(row);
      items.push(row);
    });
  }

  function markSel() {
    items.forEach(function (el, i) { el.classList.toggle('on', i === sel); });
    if (items[sel] && items[sel].scrollIntoView) items[sel].scrollIntoView({ block: 'nearest' });
  }

  function filter(q) {
    q = (q || '').trim().toLowerCase();
    filtered = q ? TOOLS.filter(function (t) { return searchStr(t).indexOf(q) >= 0; }) : TOOLS.slice();
    sel = 0;
    render();
  }

  function go(t) {
    if (t.ext) { window.open(t.u, '_blank', 'noopener'); close(); return; }
    window.location.href = hrefOf(t);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (filtered.length) { sel = (sel + 1) % filtered.length; markSel(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (filtered.length) { sel = (sel - 1 + filtered.length) % filtered.length; markSel(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[sel]) go(filtered[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  function open() {
    if (!overlay) build();
    filter('');
    overlay.classList.add('open');
    input.value = '';
    setTimeout(function () { input.focus(); }, 0);
  }
  function close() { if (overlay) overlay.classList.remove('open'); }

  // 全域快捷鍵
  function inField(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); open(); return; }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !inField(document.activeElement)) {
      var isOpen = overlay && overlay.classList.contains('open');
      if (!isOpen) { e.preventDefault(); open(); }
    }
  });

  // 頂部細長工具列（全站切換器入口）：站名（連首頁）＋ 搜尋欄（點擊開面板）
  function addTopbar() {
    if (document.getElementById('sgt-topbar')) return;
    injectStyle();
    var bar = document.createElement('div');
    bar.id = 'sgt-topbar';
    var inner = document.createElement('div');
    inner.className = 'sgt-tb-inner';

    var brand = document.createElement('a');
    brand.className = 'sgt-tb-brand';
    brand.href = ROOT || './';
    brand.setAttribute('aria-label', '回水神的工具箱首頁');
    brand.innerHTML = '<span>⚓</span><span>水神的工具箱</span>';

    var search = document.createElement('button');
    search.type = 'button';
    search.className = 'sgt-tb-search';
    search.title = '搜尋所有工具（/ 或 Ctrl/⌘K）';
    search.setAttribute('aria-label', '搜尋所有工具');
    search.innerHTML = '<span>🔍</span><span class="ph">搜尋所有工具…</span><kbd>/</kbd>';
    search.addEventListener('click', open);

    inner.appendChild(brand);
    inner.appendChild(search);
    bar.appendChild(inner);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addTopbar);
  else addTopbar();
})();
