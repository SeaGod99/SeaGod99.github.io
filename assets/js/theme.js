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
})();
