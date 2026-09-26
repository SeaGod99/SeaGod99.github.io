/* ============================================================
   共用提示元件：Toast（非阻塞訊息）＋ Confirm（確認對話框）
   ------------------------------------------------------------
   取代原生 alert()／confirm()。原生對話框會**凍住整個分頁**（背景的
   ET 時鐘、鬧鐘倒數、查價全部停擺），行動裝置上還會蓋住整個畫面，
   而且長相與站內版型完全脫節。

   用法（classic script，掛 window.Toast）：
     Toast.show('匯入成功，共 42 筆');          // 一般訊息
     Toast.show('匯入失敗：格式不正確', 'err'); // 錯誤（紅色、停留久一點）
     var ok = await Toast.confirm('確定要清除嗎？', { danger: true });

   ⚠ confirm() 回傳 Promise，不是布林值。把原生 confirm 換過來時
     **呼叫端整條流程都要改成 async／then**，不能只把函式名換掉——
     漏改會讓「確定要清除嗎」直接通過（Promise 物件恆為 truthy），
     使用者按取消也照清。

   無障礙：Toast 用 role="status"（不搶焦點）；Confirm 用原生 <dialog>
   的 showModal()，焦點鎖在對話框內、Esc 等同取消（回傳 false）。
   ============================================================ */
(function () {
  'use strict';

  var styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var s = document.createElement('style');
    s.textContent = [
      '.sgt-toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;',
      '  display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;',
      '  max-width:min(92vw,520px)}',
      '.sgt-toast{pointer-events:auto;background:var(--bg-card,#222);color:var(--text-primary,var(--text,#eee));',
      '  border:1px solid var(--border,rgba(255,255,255,0.14));border-left:3px solid var(--accent,#c8a96e);',
      '  border-radius:var(--radius-sm,6px);padding:10px 14px;font-size:13.5px;line-height:1.5;',
      '  box-shadow:0 8px 24px rgba(0,0,0,0.35);animation:sgt-in .18s ease-out;white-space:pre-line}',
      '.sgt-toast.err{border-left-color:var(--red,#f87171)}',
      '.sgt-toast.ok{border-left-color:var(--green,#4ade80)}',
      '.sgt-toast.out{animation:sgt-out .18s ease-in forwards}',
      '@keyframes sgt-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '@keyframes sgt-out{to{opacity:0;transform:translateY(8px)}}',
      '@media (prefers-reduced-motion: reduce){.sgt-toast,.sgt-toast.out{animation:none}}',
      '.sgt-dialog{border:1px solid var(--border,rgba(255,255,255,0.14));border-radius:var(--radius-lg,12px);',
      '  background:var(--bg-card,#222);color:var(--text-primary,var(--text,#eee));padding:0;',
      '  max-width:min(92vw,420px);box-shadow:0 16px 48px rgba(0,0,0,0.45)}',
      '.sgt-dialog::backdrop{background:rgba(0,0,0,0.55)}',
      '.sgt-dialog-body{padding:20px 22px 14px;font-size:14px;line-height:1.65;white-space:pre-line}',
      '.sgt-dialog-foot{display:flex;gap:8px;justify-content:flex-end;padding:0 18px 18px}',
      '.sgt-btn{font:inherit;font-size:13px;padding:7px 16px;border-radius:var(--radius-sm,6px);cursor:pointer;',
      '  border:1px solid var(--border,rgba(255,255,255,0.14));background:none;color:inherit}',
      '.sgt-btn:hover{border-color:var(--text-secondary,#aaa)}',
      '.sgt-btn.primary{border-color:var(--accent,#c8a96e);color:var(--accent,#c8a96e)}',
      '.sgt-btn.danger{border-color:var(--red,#f87171);color:var(--red,#f87171)}',
      '.sgt-btn:focus-visible{outline:2px solid var(--accent,#c8a96e);outline-offset:1px}',
      '@media (pointer: coarse){.sgt-btn{min-height:44px}}',
      /* 常駐提示：訊息 ＋ 動作鈕 ＋ ✕ 排一列。窄畫面換行，不要讓鈕被推出畫面外 */
      '.sgt-sticky{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.sgt-sticky-msg{flex:1 1 auto;min-width:0}',
      '.sgt-sticky .sgt-btn{flex:none;padding:6px 12px}'
    ].join('');
    document.head.appendChild(s);
  }

  var host = null;
  function ensureHost() {
    if (host && document.body.contains(host)) return host;
    injectStyle();
    host = document.createElement('div');
    host.className = 'sgt-toasts';
    document.body.appendChild(host);
    return host;
  }

  /**
   * 顯示一則非阻塞訊息。
   * @param {string} msg
   * @param {'info'|'ok'|'err'} [kind]
   * @param {number} [ms] 停留毫秒（預設一般 3200、錯誤 5000）
   */
  function show(msg, kind, ms) {
    var el = document.createElement('div');
    el.className = 'sgt-toast' + (kind && kind !== 'info' ? ' ' + kind : '');
    // role=status：螢幕閱讀器會讀出來但不搶焦點（不要用 alert role，那會打斷使用者）
    el.setAttribute('role', 'status');
    el.textContent = msg;
    ensureHost().appendChild(el);
    var life = ms || (kind === 'err' ? 5000 : 3200);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    }, life);
    return el;
  }

  /**
   * 常駐提示 ＋ 一顆動作鈕。**不會自動消失**——只在使用者按動作鈕或 ✕ 時關閉。
   * 用於「非做不可但不急」的事，例如資料已更新、要不要重新整理。
   *
   * 為什麼不另做一個浮層元件：位置、z-index、動效、`prefers-reduced-motion`、
   * `role="status"` 這些在 Toast 這裡已經處理好了，再開一份就會有第四種飄浮物。
   *
   * @param {string} msg
   * @param {{ label:string, onClick:Function, kind?:'info'|'ok'|'err', key?:string }} opts
   *        `key` 有值時同一個 key 只會存在一則（重複呼叫不會疊出一整排）。
   * @returns {HTMLElement|null} null＝同 key 的已經在畫面上
   */
  var stickyByKey = {};
  function action(msg, opts) {
    opts = opts || {};
    if (opts.key && stickyByKey[opts.key] && document.body.contains(stickyByKey[opts.key])) return null;
    injectStyle();
    var el = document.createElement('div');
    el.className = 'sgt-toast sgt-sticky' + (opts.kind && opts.kind !== 'info' ? ' ' + opts.kind : '');
    el.setAttribute('role', 'status');
    var txt = document.createElement('span');
    txt.className = 'sgt-sticky-msg';
    txt.textContent = msg;
    var btn = document.createElement('button');
    btn.className = 'sgt-btn primary';
    btn.type = 'button';
    btn.textContent = opts.label || '確定';
    var close = function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    };
    btn.addEventListener('click', function () {
      close();
      try { if (opts.onClick) opts.onClick(); } catch (e) {}
    });
    var x = document.createElement('button');
    x.className = 'sgt-btn';
    x.type = 'button';
    x.textContent = '✕';
    x.setAttribute('aria-label', '關閉提示');
    x.addEventListener('click', close);
    el.appendChild(txt); el.appendChild(btn); el.appendChild(x);
    ensureHost().appendChild(el);
    if (opts.key) stickyByKey[opts.key] = el;
    return el;
  }

  /**
   * 確認對話框。**回傳 Promise<boolean>**，Esc 與背景關閉都視為取消。
   * @param {string} msg
   * @param {{ okText?:string, cancelText?:string, danger?:boolean }} [opts]
   */
  function confirm(msg, opts) {
    opts = opts || {};
    injectStyle();
    // <dialog> 是 2022 起全瀏覽器支援；沒有的話退回原生 confirm，
    // 寧可醜也不要讓「清除進度」這種操作變成無聲通過。
    // 偵測條件看的是 showModal 本身而不是 HTMLDialogElement 是否存在——
    // 有些環境（舊 WebView、jsdom）建構式在、方法卻不在，只檢查前者會在按下去的瞬間才爆。
    var probe = document.createElement('dialog');
    if (typeof probe.showModal !== 'function') {
      return Promise.resolve(window.confirm(msg));
    }
    return new Promise(function (resolve) {
      var dlg = document.createElement('dialog');
      dlg.className = 'sgt-dialog';
      var body = document.createElement('div');
      body.className = 'sgt-dialog-body';
      body.textContent = msg;
      var foot = document.createElement('div');
      foot.className = 'sgt-dialog-foot';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'sgt-btn';
      cancel.textContent = opts.cancelText || '取消';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'sgt-btn ' + (opts.danger ? 'danger' : 'primary');
      ok.textContent = opts.okText || '確定';
      foot.appendChild(cancel); foot.appendChild(ok);
      dlg.appendChild(body); dlg.appendChild(foot);
      document.body.appendChild(dlg);

      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try { dlg.close(); } catch (e) {}
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(v);
      }
      cancel.addEventListener('click', function () { finish(false); });
      ok.addEventListener('click', function () { finish(true); });
      // Esc 觸發 cancel 事件；一律當成「取消」
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); finish(false); });
      dlg.addEventListener('close', function () { finish(false); });
      dlg.showModal();
      // 預設焦點放在「取消」：危險操作不該讓 Enter 直接送出
      (opts.danger ? cancel : ok).focus();
    });
  }

  window.Toast = { show: show, action: action, confirm: confirm };
})();
