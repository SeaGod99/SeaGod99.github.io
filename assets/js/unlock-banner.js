/* unlock-banner.js — 工具頁的「這個系統要先解鎖」橫幅
 *
 * 解決的問題：站上不少工具對應的是遊戲裡「要解任務才會開」的系統
 * （金碟、天書奇談、幻巧戰、無人島、小隊、幻化收藏櫃…）。
 * 回鍋與新手玩家開了頁面、算出一堆數字，才發現自己遊戲裡根本還沒開這個系統。
 *
 * 用法：在頁面底部（theme.js 之後）加一行
 *     <script src="../../assets/js/unlock-banner.js"></script>
 * 不需要任何參數——橫幅認的是**網址路徑**，對上 data/system-unlocks.json 裡
 * 某個系統的 `tool` 欄位就顯示。一個頁面對到多個系統時全部列出（如幻化＝投影＋收藏櫃）。
 *
 * 三個刻意的取捨：
 *   ① **只在有對應資料時才出現**，查不到就安靜什麼都不做——寧可不提示，也不要提示錯的前置。
 *   ② 關掉後記住（localStorage，`ffxiv_` 前綴才進得了首頁的全站備份），
 *      但只記「這個系統」，換一頁還是會提示一次。
 *   ③ 橫幅不擋操作：它是一條可收合的提示列，不是彈窗。
 */
(function () {
  'use strict';

  var LS = 'ffxiv_unlock_banner_dismissed';   // key 一律 ffxiv_ 前綴（§2.3）
  // 站內任何深度的頁面都可能載它，路徑用 <script src> 反推 repo 根
  var me = document.currentScript;
  var ROOT = me ? me.src.replace(/assets\/js\/unlock-banner\.js.*$/, '') : '/';

  function read() {
    try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; }
  }
  function dismiss(key) {
    try {
      var a = read();
      if (a.indexOf(key) < 0) a.push(key);
      localStorage.setItem(LS, JSON.stringify(a));
    } catch (e) { /* 無痕視窗等寫不進去：只是記不住，不影響顯示 */ }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 目前頁面的站內路徑，正規化成 system-unlocks.json 的 tool 欄位格式（/tools/xxx/）
  function here() {
    var p = location.pathname;
    var i = p.indexOf('/tools/');
    if (i < 0) i = p.indexOf('/collections/');
    if (i < 0) return null;
    var rel = p.slice(i);
    if (!/\/$/.test(rel)) rel = rel.replace(/[^/]*$/, '');   // 去掉 index.html
    return rel;
  }

  function injectStyle() {
    if (document.getElementById('sgt-unlock-style')) return;
    var css = '' +
      '.sgt-unlock{max-width:var(--w-content,1500px);margin:0 auto;padding:0 1.5rem 0.6rem;}' +
      '.sgt-unlock-box{display:flex;gap:0.6rem;align-items:flex-start;background:var(--bg-card);' +
        'border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:var(--radius-md,8px);' +
        'padding:0.6rem 0.75rem;font-size:0.78rem;line-height:1.7;color:var(--text-muted);}' +
      '.sgt-unlock-key{flex:none;font-size:0.95rem;line-height:1.4;}' +
      '.sgt-unlock-body{flex:1;min-width:0;}' +
      '.sgt-unlock-body b{color:var(--text-dim);font-weight:600;}' +
      '.sgt-unlock-body .q{color:var(--text);font-weight:600;}' +
      '.sgt-unlock-body .lv{color:var(--blue);}' +
      '.sgt-unlock-more{color:var(--gold);text-decoration:none;white-space:nowrap;}' +
      '.sgt-unlock-more:hover{text-decoration:underline;}' +
      // 這條只有 16px 高，手機上點不到。字級不動，用透明擴張層把命中區推到 44px
      // （同 nav.js 頂列站名的做法）。橫幅是 13 個工具頁都會出現的東西，
      // 少了這一條等於那 13 頁在手機上都有一個點不到的連結。
      '@media (pointer:coarse){.sgt-unlock-more{position:relative;display:inline-block;}' +
      '.sgt-unlock-more::after{content:"";position:absolute;left:0;right:0;top:50%;' +
      'height:44px;transform:translateY(-50%);}}' +
      '.sgt-unlock-x{flex:none;background:none;border:0;color:var(--text-muted);cursor:pointer;' +
        'font-size:0.95rem;line-height:1;padding:0.15rem 0.2rem;font-family:inherit;}' +
      '.sgt-unlock-x:hover{color:var(--text);}' +
      '@media (pointer:coarse){.sgt-unlock-x{min-width:44px;min-height:44px;}}';
    var el = document.createElement('style');
    el.id = 'sgt-unlock-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // 一個系統一行：任務名、等級、接取 NPC 與地點
  function lineOf(s) {
    // 三團版本的三條任務內容相同，橫幅只印第一條並註明——細節留給索引頁
    var q = s.quests[0];
    var where = [];
    if (q.issuer && q.issuer.name) where.push(esc(q.issuer.name));
    if (q.at && q.at.mapName) {
      where.push(esc(q.at.mapName) + (q.at.x == null ? '' : ' (' + q.at.x + ', ' + q.at.y + ')'));
    }
    return '<div>' +
      '<b>' + esc(s.name) + '</b>　需先完成任務 <span class="q">「' + esc(q.name) + '」</span>' +
      (q.level > 1 ? '<span class="lv">　Lv' + q.level + '</span>' : '') +
      (where.length ? '　·　' + where.join(' ＠') : '') +
      (s.gcVariants ? '（三個大國防聯軍各一條，這裡列的是其中一條）' : '') +
      '</div>';
  }

  function mount(list) {
    injectStyle();
    var wrap = document.createElement('div');
    wrap.className = 'sgt-unlock';
    wrap.innerHTML =
      '<div class="sgt-unlock-box">' +
        '<span class="sgt-unlock-key" aria-hidden="true">🗝️</span>' +
        '<div class="sgt-unlock-body">' +
          list.map(lineOf).join('') +
          '<div><a class="sgt-unlock-more" href="' + ROOT + 'tools/unlock-index/?id=' +
            encodeURIComponent('sys:' + list[0].key) + '">看接取點地圖與前置任務 →</a></div>' +
        '</div>' +
        '<button class="sgt-unlock-x" type="button" aria-label="不再顯示這個提示">✕</button>' +
      '</div>';

    // 放在頁面標題之後、操作列之前。.tool-header 是全站慣例，
    // .app-navbar 是幻化配裝圖鑑（併進來的子專案，用 Bootstrap 自帶導覽列）的對應物；
    // 都找不到才退到 body 最前面。
    var head = document.querySelector('.tool-header, .app-navbar');
    if (head && head.parentNode) head.parentNode.insertBefore(wrap, head.nextSibling);
    else document.body.insertBefore(wrap, document.body.firstChild);

    wrap.querySelector('.sgt-unlock-x').addEventListener('click', function () {
      list.forEach(function (s) { dismiss(s.key); });
      wrap.remove();
    });
  }

  function boot() {
    var path = here();
    if (!path) return;
    fetch(ROOT + 'data/system-unlocks.json')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var done = read();
        var list = (j.data || []).filter(function (s) {
          return s.tool === path && s.quests && s.quests.length && done.indexOf(s.key) < 0;
        });
        if (list.length) mount(list);
      })
      .catch(function () { /* 載不到就不提示——錯的提示比沒有提示糟 */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
