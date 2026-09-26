/* 多角色設定檔切換 —— 頂列的角色晶片。
 *
 * 站內所有進度都存在 localStorage，一台瀏覽器只有一份。練兩隻角色的人只能靠
 * 首頁的匯出／匯入手動搬，很麻煩。這支讓你在頂列一鍵切換。
 *
 * ── 設計上最重要的一條：白名單反轉 ──────────────────────────────────
 * **預設每個 `ffxiv_*` key 都算「角色態」，只有明列在 `SHARED` 的才算共用偏好。**
 * 反過來做（預設共用、列出角色態）的話，日後新增一個忘了登記的進度 key，
 * 切換角色時兩隻角色會共用同一份進度——**那是靜默的資料損壞**。
 * 這樣做的話，分類錯的代價只是「某個偏好不跟著角色走」，看得見也改得回來。
 *
 * ── 只覆蓋不刪 ──────────────────────────────────────────────────────
 * 切過去時只寫入目標設定檔**有的** key，不刪除它沒有的。
 * 所以從「什麼都沒有的新角色」切過去，不會把你既有的進度清掉——
 * 你會看到原本的資料，標記之後才分家。第一版刻意保守。
 *
 * ── 切換前一定先存 ──────────────────────────────────────────────────
 * 切走之前把目前的所有角色態 key 整份存進 `ffxiv_profile_<名稱>`。
 * 那份就是備份；不另外強迫下載檔案（每次切換都跳下載很煩），
 * 但首頁的「匯出全站進度」仍然是換裝置時的正途。
 */
(function () {
  'use strict';

  var LS_META = 'ffxiv_profiles';          // { active, names: [] }
  var PREFIX = 'ffxiv_profile_';           // + 名稱 → 該角色的整包快照
  var MAX_NAMES = 8;

  /* 共用偏好：切換角色時**不動**這些。
     每一條都要講得出「為什麼這不屬於某一隻角色」。 */
  var SHARED = {
    // 介面偏好
    ffxiv_bluemagic_view: '青魔頁的檢視模式',
    ffxiv_gardening_view: '園藝頁的檢視模式',
    ffxiv_triad_view: '幻卡頁的檢視模式（手帳／缺卡跑圖）',
    ffxiv_market_craftview: '市場頁製作分頁的檢視',
    ffxiv_market_planview: '市場頁計畫分頁的檢視',
    ffxiv_market_panelopen: '市場頁面板展開狀態',
    ffxiv_market_opts: '市場頁的顯示選項',
    // 一次性狀態
    ffxiv_pwa_dismissed: '關掉過安裝提示',
    ffxiv_unlock_banner_dismissed: '關掉過解鎖橫幅',
    ffxiv_seen_patch: '上次看到的遊戲版本（「本次新增」用）',
    ffxiv_recent_tools: '最近用過的工具',
    ffxiv_favs_migrated: '幻化收藏的一次性遷移旗標',
    ffxiv_market_migrated: '市場頁 key 的一次性遷移旗標',
    // 通知與資料修正——與角色無關
    ffxiv_alarm: '鬧鐘設定',
    ffxiv_fishing_alarm: '鬧鐘設定（舊 key，保留不刪）',
    ffxiv_gathering_alarm: '鬧鐘設定（舊 key，保留不刪）',
    ffxiv_market_hqoverride: '市場頁的 HQ 覆寫（對資料的修正，不是角色進度）',
    ffxiv_market_priceoverride: '市場頁的價格覆寫（同上）',
    // 循環是做法不是進度
    ffxiv_craftsim_rotations: '存起來的製作循環',
  };

  function readMeta() {
    try {
      var m = JSON.parse(localStorage.getItem(LS_META) || 'null');
      if (m && Array.isArray(m.names)) return m;
    } catch (e) { /* 壞掉就當作沒有 */ }
    return null;
  }
  function writeMeta(m) {
    try { localStorage.setItem(LS_META, JSON.stringify(m)); } catch (e) {}
  }

  /** 目前瀏覽器裡所有「角色態」的 key。白名單反轉：不在 SHARED 裡的都算。 */
  function characterKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf('ffxiv_') !== 0) continue;
      if (k === LS_META || k.indexOf(PREFIX) === 0) continue;   // 設定檔自己的資料不算
      if (SHARED[k]) continue;
      out.push(k);
    }
    return out;
  }

  function snapshot() {
    var o = {};
    characterKeys().forEach(function (k) {
      try { o[k] = localStorage.getItem(k); } catch (e) {}
    });
    return o;
  }

  function saveInto(name) {
    try { localStorage.setItem(PREFIX + name, JSON.stringify(snapshot())); return true; }
    catch (e) {
      // 配額爆了：**不要吞掉**，切換會遺失資料
      notify('儲存「' + name + '」的進度失敗（瀏覽器空間不足），沒有切換。請先到首頁匯出備份。', 'error');
      return false;
    }
  }

  function loadFrom(name) {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(PREFIX + name) || 'null'); } catch (e) {}
    if (!raw) return 0;
    var n = 0;
    // ⚠ **只覆蓋不刪**：目標設定檔沒有的 key 保持原樣（見檔頭）
    Object.keys(raw).forEach(function (k) {
      try { localStorage.setItem(k, raw[k]); n++; } catch (e) {}
    });
    return n;
  }

  function notify(msg, kind) {
    if (window.Toast) Toast.show(msg, kind || 'ok');
    else window.alert(msg);
  }

  function switchTo(name) {
    var m = readMeta();
    if (!m || m.active === name) return;
    if (!saveInto(m.active)) return;            // 存不進去就不切
    var n = loadFrom(name);
    m.active = name;
    writeMeta(m);
    notify('已切換到「' + name + '」' + (n ? '（載入 ' + n + ' 項）' : '（這個設定檔還沒有資料，沿用目前的進度）'), 'ok');
    // 各頁的進度是載入時讀進記憶體的，不重整看不到變化
    setTimeout(function () { location.reload(); }, 600);
  }

  function ensureInit() {
    var m = readMeta();
    if (m) return m;
    m = { active: '角色 1', names: ['角色 1'] };
    writeMeta(m);
    return m;
  }

  // ── UI ──────────────────────────────────────────────
  var menuEl = null;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    document.removeEventListener('click', onDocClick, true);
  }
  function onDocClick(e) {
    if (menuEl && !menuEl.contains(e.target) && !e.target.closest('#sgt-prof')) closeMenu();
  }

  function openMenu(anchor) {
    closeMenu();
    var m = ensureInit();
    menuEl = document.createElement('div');
    menuEl.id = 'sgt-prof-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML =
      '<div class="sgt-pm-hd">切換角色設定檔</div>' +
      m.names.map(function (n) {
        return '<button type="button" class="sgt-pm-item' + (n === m.active ? ' on' : '') +
          '" data-go="' + encodeURIComponent(n) + '" role="menuitem">' +
          (n === m.active ? '● ' : '○ ') + escapeHtml(n) + '</button>';
      }).join('') +
      '<div class="sgt-pm-sep"></div>' +
      (m.names.length < MAX_NAMES ? '<button type="button" class="sgt-pm-item" data-add="1" role="menuitem">＋ 新增設定檔</button>' : '') +
      '<button type="button" class="sgt-pm-item" data-rename="1" role="menuitem">✎ 重新命名目前的</button>' +
      '<div class="sgt-pm-note">切換前會自動把目前的進度存進這個設定檔。' +
      '換裝置請用<a href="' + (window.__SGT_ROOT__ || '/') + '">首頁的匯出</a>。</div>';
    document.body.appendChild(menuEl);

    var r = anchor.getBoundingClientRect();
    menuEl.style.top = (r.bottom + 6) + 'px';
    menuEl.style.right = Math.max(8, window.innerWidth - r.right) + 'px';

    menuEl.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.go) { var n = decodeURIComponent(b.dataset.go); closeMenu(); switchTo(n); return; }
      if (b.dataset.add) {
        closeMenu();
        var name = (window.prompt('新設定檔的名稱（例如角色名）：') || '').trim();
        if (!name) return;
        var mm = readMeta();
        if (mm.names.indexOf(name) >= 0) { notify('已經有同名的設定檔了', 'warn'); return; }
        mm.names.push(name);
        writeMeta(mm);
        notify('已新增「' + name + '」。切過去之後標記的進度才會存進它。', 'ok');
        return;
      }
      if (b.dataset.rename) {
        closeMenu();
        var mm2 = readMeta();
        var nn = (window.prompt('改成什麼名字？', mm2.active) || '').trim();
        if (!nn || nn === mm2.active) return;
        if (mm2.names.indexOf(nn) >= 0) { notify('已經有同名的設定檔了', 'warn'); return; }
        // 連同已存的快照一起改名，不然那份會變成孤兒
        try {
          var old = localStorage.getItem(PREFIX + mm2.active);
          if (old != null) { localStorage.setItem(PREFIX + nn, old); localStorage.removeItem(PREFIX + mm2.active); }
        } catch (e) {}
        mm2.names[mm2.names.indexOf(mm2.active)] = nn;
        mm2.active = nn;
        writeMeta(mm2);
        notify('已改名為「' + nn + '」', 'ok');
        mountChip();
      }
    });
    document.addEventListener('click', onDocClick, true);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function injectStyle() {
    if (document.getElementById('sgt-prof-style')) return;
    var css =
      '#sgt-prof{display:inline-flex;align-items:center;gap:5px;flex:none;cursor:pointer;' +
      'background:transparent;color:var(--text-dim,#8892a4);' +
      'border:1px solid var(--border,rgba(255,255,255,.08));border-radius:8px;' +
      'font:600 12px/1 inherit;padding:0 10px;min-height:34px;max-width:11rem;}' +
      '#sgt-prof:hover{background:var(--bg-card-hover,#1a1f2b);color:var(--text-primary,#e8eaf0);}' +
      '#sgt-prof:focus-visible{outline:2px solid var(--gold,#c8a96e);outline-offset:2px;}' +
      '#sgt-prof .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '#sgt-prof-menu{position:fixed;z-index:10000;min-width:12rem;max-width:16rem;' +
      'background:var(--bg-card,#14181f);border:1px solid var(--border-hover,rgba(200,169,110,.4));' +
      'border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.45);padding:6px;}' +
      '.sgt-pm-hd{font-size:11px;color:var(--text-muted,#717c91);padding:6px 8px 4px;}' +
      '.sgt-pm-item{display:block;width:100%;text-align:left;background:transparent;border:0;' +
      'color:var(--text-dim,#8892a4);font:inherit;font-size:13px;padding:0 8px;min-height:36px;' +
      'border-radius:6px;cursor:pointer;}' +
      '.sgt-pm-item:hover{background:var(--gold-dim,rgba(200,169,110,.15));color:var(--gold-light,#e2c98a);}' +
      '.sgt-pm-item.on{color:var(--gold-light,#e2c98a);font-weight:700;}' +
      '.sgt-pm-sep{height:1px;background:var(--border,rgba(255,255,255,.08));margin:5px 4px;}' +
      '.sgt-pm-note{font-size:11px;color:var(--text-muted,#717c91);padding:6px 8px 4px;line-height:1.6;}' +
      '.sgt-pm-note a{color:var(--gold,#c8a96e);}' +
      '@media (pointer:coarse){#sgt-prof{min-height:44px;}.sgt-pm-item{min-height:44px;}}' +
      '@media (max-width:600px){#sgt-prof .nm{display:none;}#sgt-prof{padding:0 9px;}}' +
      '@media print{#sgt-prof{display:none;}}';
    var st = document.createElement('style');
    st.id = 'sgt-prof-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function mountChip() {
    var inner = document.querySelector('#sgt-topbar .sgt-tb-inner');
    if (!inner) return false;
    injectStyle();
    var m = ensureInit();
    var old = document.getElementById('sgt-prof');
    if (old) old.remove();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'sgt-prof';
    btn.title = '切換角色設定檔（目前：' + m.active + '）';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.innerHTML = '<span aria-hidden="true">👤</span><span class="nm">' + escapeHtml(m.active) + '</span>';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menuEl) closeMenu(); else openMenu(btn);
    });
    inner.appendChild(btn);
    return true;
  }

  /* 只有「已經建過第二個設定檔」的人才長出晶片。
     單角色的人不該多一個看不懂的按鈕——那是純粹的雜訊。
     想開始用的人從首頁的進度備份區進入（那裡有說明）。 */
  function shouldShow() {
    var m = readMeta();
    return !!(m && m.names && m.names.length > 1);
  }

  function boot() {
    if (!shouldShow()) return;
    if (mountChip()) return;
    // nav.js 是 defer 載的，頂列可能還沒建好——等它出現
    var obs = new MutationObserver(function () {
      if (mountChip()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 8000);
  }

  window.SGT_PROFILES = {
    SHARED: SHARED,
    list: function () { var m = readMeta(); return m ? m.names.slice() : []; },
    active: function () { var m = readMeta(); return m ? m.active : null; },
    characterKeys: characterKeys,
    /** 從首頁那類地方呼叫：建立第二個設定檔並開始使用。 */
    enable: function (name) {
      var m = ensureInit();
      name = (name || '').trim();
      if (!name || m.names.indexOf(name) >= 0) return false;
      m.names.push(name);
      writeMeta(m);
      mountChip();
      return true;
    },
    switchTo: switchTo,
    mount: mountChip,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
