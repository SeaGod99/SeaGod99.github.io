/* 水神的工具箱 — 全站主題切換（亮 / 暗 / 自動）
 *
 * 用法：每頁 <head> 內加兩行（theme.js 要早於頁面 <style>、且「不要」加 defer，
 * 才能在首次繪製前就設好 data-theme，避免閃一下暗色）：
 *   <link rel="stylesheet" href="REL/assets/css/theme.css">
 *   <script src="REL/assets/js/theme.js"></script>
 * REL 依頁面深度：根 = "."、minions/ = ".."、tools|collections/X/ = "../.."
 *
 * 偏好存於 localStorage('sgt-theme') = auto|light|dark（預設 auto，跟系統）。
 * auto 會即時跟隨系統淺/深色變化。切換鈕於 DOM ready 後注入 body，不需各頁改版面。
 */
(function () {
  'use strict';
  var KEY = 'sgt-theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function getPref() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  function setPref(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* 私密視窗等：僅本次有效 */ }
  }
  function resolve(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return (mq && mq.matches) ? 'light' : 'dark';
  }
  function apply(pref) {
    root.setAttribute('data-theme', resolve(pref));
  }

  // 1) 盡早套用（在 <head> 同步執行，首次繪製前），避免閃白/閃黑
  apply(getPref());

  // 2) auto 模式下跟隨系統主題變化
  function onSystemChange() { if (getPref() === 'auto') apply('auto'); }
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange); // 舊版 Safari
  }

  // 3) DOM ready 後注入浮動切換鈕
  var MODES = [
    { v: 'auto',  icon: '🖥', label: '自動（跟隨系統）' },
    { v: 'light', icon: '☀', label: '亮色' },
    { v: 'dark',  icon: '🌙', label: '暗色' }
  ];

  function syncButtons() {
    var pref = getPref();
    var btns = document.querySelectorAll('#theme-toggle button');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-mode') === pref;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function choose(v) {
    setPref(v);
    apply(v);
    syncButtons();
  }

  function buildToggle() {
    if (document.getElementById('theme-toggle')) return;
    var wrap = document.createElement('div');
    wrap.id = 'theme-toggle';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', '主題切換');
    MODES.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-mode', m.v);
      b.textContent = m.icon;
      b.title = m.label;
      b.setAttribute('aria-label', m.label);
      b.addEventListener('click', function () { choose(m.v); });
      wrap.appendChild(b);
    });
    document.body.appendChild(wrap);
    syncButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildToggle);
  } else {
    buildToggle();
  }

  // 4) PWA：注入 manifest／圖示／theme-color，並在 https 下註冊 service worker。
  //    路徑用絕對 "/"（本站為根網域託管的 GitHub Pages 使用者頁）；
  //    file:// 本機開檔時這些 404 無害，SW 也不會註冊。
  (function pwa() {
    try {
      var head = document.head || document.getElementsByTagName('head')[0];
      if (head && !document.querySelector('link[rel="manifest"]')) {
        function addLink(rel, href, type) {
          var l = document.createElement('link');
          l.rel = rel; l.href = href; if (type) l.type = type;
          head.appendChild(l);
        }
        addLink('manifest', '/manifest.json');
        addLink('icon', '/assets/icons/icon.svg', 'image/svg+xml');
        addLink('apple-touch-icon', '/assets/icons/icon.svg');
        if (!document.querySelector('meta[name="theme-color"]')) {
          var tc = document.createElement('meta');
          tc.name = 'theme-color'; tc.content = '#0a0c10';
          head.appendChild(tc);
        }
      }
    } catch (e) { /* 忽略：注入失敗不影響頁面 */ }

    if ('serviceWorker' in navigator &&
        (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () { /* 忽略 */ });
      });
    }
  })();

  // 5) 全站跨工具快速切換器：載入 nav.js。
  //    以本檔 <script src> 推回站根相對路徑（如 "../../"），相容 file:// 與線上。
  (function loadNav() {
    try {
      var selfSrc = '';
      var ss = document.getElementsByTagName('script');
      for (var i = 0; i < ss.length; i++) {
        var s = ss[i].getAttribute('src') || '';
        if (/assets\/js\/theme\.js(\?|$)/.test(s)) { selfSrc = s; break; }
      }
      var root = selfSrc.replace(/assets\/js\/theme\.js.*$/, ''); // "" | "./" | "../" | "../../"
      window.__SGT_ROOT__ = root || './';
      var el = document.createElement('script');
      el.src = (root || '') + 'assets/js/nav.js';
      el.defer = true;
      (document.head || document.documentElement).appendChild(el);
    } catch (e) { /* 忽略：切換器載入失敗不影響頁面 */ }
  })();
})();
