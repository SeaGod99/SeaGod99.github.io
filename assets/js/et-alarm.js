/* et-alarm.js — 時間窗鬧鐘的共用引擎
 *
 * 釣魚頁與限時採集頁各有一份幾乎一樣的鬧鐘（音效、系統通知、分頁標題閃動、
 * 同一個開窗只響一次的去重、primeOnly 首次登記不響），只有「要提醒什麼」不同。
 * 再多一個有時間窗的功能就會出現第三份，而**鬧鐘的錯誤是該響沒響，畫面上看不出來**。
 *
 * 這支只管「什麼時候響、怎麼響、設定存哪裡」；
 * 「下次什麼時候開」交給 window-calc.js，兩件事分開才測得動。
 *
 * ── 設定合併與遷移 ──────────────────────────────────────────────
 * 兩頁原本各存一份（`ffxiv_fishing_alarm`／`ffxiv_gathering_alarm`）。
 * 這裡統一存 `ffxiv_alarm`，並在第一次載入時**把舊 key 讀進來**。
 * 舊 key **不刪**——使用者可能還會開到舊版快取的頁面，刪了就等於把他的設定清掉
 * （§2.3 的教訓：改 key 要留遷移、不要刪舊的）。
 *
 * ── 用法 ────────────────────────────────────────────────────────
 *   const alarm = ETAlarm.create({
 *     scope: 'fishing',                       // 用來遷移舊 key，也用於去重命名空間
 *     baseTitle: document.title,
 *     onFire: (item, secsUntilOpen) => ({     // 回傳通知內容；回 null 就只響音效
 *       title: `🎣 ${item.name} 開窗了！`, body: '釣場：…', tag: 'fish-' + item.id,
 *     }),
 *   });
 *   alarm.cfg                                  // { on, lead, sound }
 *   alarm.save()                               // 寫回 localStorage
 *   alarm.check(now, list, primeOnly)          // list: [{ key, item, openTs, secsUntilOpen }]
 *                                              //   openTs＝這一窗的真實起點（毫秒，已開的窗是過去的時刻）——**一定要給**，
 *                                              //   只給 secsUntilOpen 的話已開的窗會每 2 分鐘重響
 *   alarm.chime()                              // 試響
 */
(function () {
  'use strict';

  var KEY = 'ffxiv_alarm';                       // key 一律 ffxiv_ 前綴（首頁全站備份才掃得到）
  var LEGACY = { fishing: 'ffxiv_fishing_alarm', gathering: 'ffxiv_gathering_alarm' };
  var DEFAULTS = { on: false, lead: 60, sound: true };

  function readJson(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }

  function loadCfg(scope) {
    var cfg = Object.assign({}, DEFAULTS);
    var all = readJson(KEY) || {};
    // 舊 key 只在共用設定還沒有這個 scope 時才讀——使用者改過新設定就以新的為準
    if (!all[scope] && LEGACY[scope]) {
      var old = readJson(LEGACY[scope]);
      if (old) all[scope] = old;
    }
    Object.assign(cfg, all[scope] || {});
    return cfg;
  }

  function saveCfg(scope, cfg) {
    try {
      var all = readJson(KEY) || {};
      all[scope] = { on: !!cfg.on, lead: Number(cfg.lead) || 0, sound: !!cfg.sound };
      localStorage.setItem(KEY, JSON.stringify(all));
      // 舊 key 同步寫一份（不刪）：使用者若開到被 SW 快取住的舊版頁面，設定才不會倒退
      if (LEGACY[scope]) localStorage.setItem(LEGACY[scope], JSON.stringify(all[scope]));
    } catch (e) { /* 無痕視窗等寫不進去：只是記不住，不影響這次使用 */ }
  }

  // 上行兩音，柔和不刺耳。AudioContext 只建一次，且被瀏覽器暫停時要先 resume。
  var sharedCtx = null;
  function chime(enabled) {
    if (!enabled) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = sharedCtx || (sharedCtx = new Ctx());
      if (ctx.state === 'suspended') ctx.resume();
      var t0 = ctx.currentTime;
      [880, 1174.66].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.5);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + i * 0.18); o.stop(t0 + i * 0.18 + 0.55);
      });
    } catch (e) { /* 音效失敗不該擋掉通知 */ }
  }

  function create(opts) {
    opts = opts || {};
    var scope = opts.scope || 'default';
    var baseTitle = opts.baseTitle || document.title;
    var cfg = loadCfg(scope);
    var fired = new Map();          // key → 該次開窗的絕對時間戳（同一窗只響一次）
    var titleTimer = null;

    function fire(entry) {
      chime(cfg.sound);
      var n = opts.onFire ? opts.onFire(entry.item, entry.secsUntilOpen) : null;
      if (!n) return;
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(n.title, { body: n.body || '', tag: n.tag || (scope + '-' + entry.key) }); } catch (e) {}
      }
      // 分頁在背景時系統通知可能被擋，標題是最後一道；30 秒後還原
      document.title = '🔔 ' + n.title;
      clearTimeout(titleTimer);
      titleTimer = setTimeout(function () { document.title = baseTitle; }, 30000);
    }

    return {
      cfg: cfg,
      scope: scope,
      save: function () { saveCfg(scope, cfg); },
      chime: function () { chime(true); },       // 試響：不管 sound 設定都要出聲
      /**
       * @param now        真實時間毫秒
       * @param list       [{ key, item, secsUntilOpen }]，secsUntilOpen=0 代表已開窗
       * @param primeOnly  true＝只登記不響。剛開啟提醒／剛加目標／剛改提前量時用，
       *                   否則使用者一打開就被眼前「本來就已經開著」的窗炸一輪。
       */
      check: function (now, list, primeOnly) {
        if (!cfg.on || !list || !list.length) return 0;
        var n = 0;
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          /* 去重要用「這一窗的真實起點」。呼叫端請給 openTs（毫秒）；只給 secsUntilOpen 的舊寫法仍收，
             但窗已開時 secsUntilOpen 恆為 0，算出來的 openTs＝now 會一直往後漂，超過 120 秒容差就被
             當成新的一窗——已開的窗每 2 分鐘重響一次（2026-10-03 修，三頁都改傳 openTs）。 */
          var openTs = e.openTs != null ? e.openTs
            : (e.secsUntilOpen == null ? null : now + e.secsUntilOpen * 1000);
          if (openTs == null || (openTs - now) / 1000 > cfg.lead) continue;
          var prev = fired.get(e.key);
          // 120 秒容差：倒數每秒重算，開窗時刻會有零點幾秒的抖動，不能當成新的一窗
          if (prev && Math.abs(openTs - prev) < 120000) continue;
          fired.set(e.key, openTs);
          if (!primeOnly) { fire(e); n++; }
        }
        return n;
      },
      /** 目標清單變動時呼叫，免得已移除的目標一直留在去重表裡 */
      forget: function (key) { fired.delete(key); },
      reset: function () { fired.clear(); },
      /** 測試與維運用 */
      _fired: function () { return new Map(fired); },
    };
  }

  window.ETAlarm = { create: create, KEY: KEY, LEGACY: LEGACY, DEFAULTS: DEFAULTS };
})();
