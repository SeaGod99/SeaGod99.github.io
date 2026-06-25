/* 水神的工具箱 — 收藏頁卡片「取得方式」展開
 *
 * 問題：各收藏頁的取得方式詳情原本只在滑鼠 hover 時顯示（.X-card:hover .X-detail），
 * 觸控裝置看不到、也無法固定檢視。
 *
 * 解法：注入一個明顯可點/可觸的「取得方式 ▾」按鈕，點它就在卡內展開/收合詳情
 * （以 .sg-open class 控制，各頁 CSS 已把 :hover 改為 .sg-open）。按鈕 stopPropagation，
 * 不會觸發整張卡片既有的「點擊＝標記已取得」。卡片會在篩選/搜尋時重繪，故以
 * MutationObserver 重新接線。
 *
 * 適用：沿用同一套 .X-card/.X-detail 結構的收藏頁（mounts/barding/blue-magic/
 * exploration-log/orchestrion/triple-triad）。各頁 <head> 引用本檔即可，免改 render。
 */
(function () {
  'use strict';
  var DETAIL = '.tt-detail, .bd-detail, .bm-detail, .mount-detail, .oc-detail';
  var CARD = '.tt-card, .bd-card, .bm-card, .mount-card, .oc-card';

  function wire(detail) {
    if (detail.dataset.sgWired) return;
    var card = detail.closest(CARD);
    if (!card) return;
    detail.dataset.sgWired = '1';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sg-src-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '取得方式 <span class="sg-chev" aria-hidden="true">▾</span>';
    detail.parentNode.insertBefore(btn, detail);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();            // 不要觸發整卡的「標記已取得」
      var open = card.classList.toggle('sg-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function scan() {
    var ds = document.querySelectorAll(DETAIL);
    for (var i = 0; i < ds.length; i++) wire(ds[i]);
  }

  function start() {
    scan();
    var pending = false;
    var obs = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; scan(); });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
