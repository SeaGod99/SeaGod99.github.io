// patch-gate.js — 共用「台服未開放即隱藏」判斷
//
// 收藏／功能頁載入資料後，除了既有的 name 規則，再依台服當前版本(gamePatch)隱藏
// 尚未開放的條目：條目 patch 已知且 > gamePatch → 台服未開放 → 不顯示。
// patch 未知(null/空)者不主動隱藏（交既有 name 規則或視為資料缺口）。
//
// gamePatch 取自 /data/_meta.json，全站單一真實來源（loadGamePatch 抓不到時才用下面的後備值）。
//
// 用法：
//   const gp = await PatchGate.loadGamePatch('../../data/_meta.json');
//   const data = raw.filter(e => e.name && PatchGate.released(e.patch, gp));
//
// 版本號比較：取主.次兩段，次段補滿兩位（"7.2"→7.20、"7.21"→7.21、"7.5"→7.50），
// 數值比較。7.25 > 7.21 → 隱藏；7.20 ≤ 7.21 → 顯示。
(function () {
  let _gamePatch = null;

  function pnum(p) {
    if (p == null || p === "") return null;
    const m = String(p).match(/^(\d+)\.(\d+)/);
    if (!m) return null;
    return parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`);
  }

  // 條目是否「台服已開放」（可顯示）。patch 未知時回 true（不主動隱藏）。
  function released(patch, gamePatch) {
    const v = pnum(patch);
    const g = pnum(gamePatch);
    if (v == null || g == null) return true;
    return v <= g;
  }

  /* 抓不到 data/_meta.json 時的後備台服版本。**前端只有這一處寫死版本號**（市場頁、製作模擬器都讀這個），
     validate-data.mjs 會斷言它等於 _meta.json 的 gamePatch——升版改 gamePatch 時這裡沒跟上就紅。 */
  const FALLBACK_PATCH = "7.25";

  async function loadGamePatch(metaUrl) {
    if (_gamePatch != null) return _gamePatch;
    try {
      const res = await fetch(metaUrl || "/data/_meta.json");
      const meta = await res.json();
      _gamePatch = meta && meta.gamePatch ? meta.gamePatch : FALLBACK_PATCH;
    } catch (e) {
      _gamePatch = FALLBACK_PATCH; // 後備：抓不到 _meta 時用已知台服版本
    }
    return _gamePatch;
  }

  /* ── 「上次來過之後新增了什麼」────────────────────────────────────────
     記住使用者上次看到的是哪一版（`ffxiv_seen_patch`，key 一律 ffxiv_ 前綴才進得了
     首頁的全站備份，§2.3），之後就能標出「這一版新加的」。

     幾個刻意的決定：
     · **第一次來的人什麼都不標**。沒有 seen 值時全部條目都會算「新」，
       那等於整頁閃光，反而看不出重點——這時只把當前版本記下來，下次改版才有比較基準。
     · **不自動把 seen 推進到最新**。使用者看過之後才推（頁面呼叫 markSeen／markSeenFor），
       否則開一次頁面就再也看不到那些標記了。
     · **逐頁記**（2026-10-10）：`ffxiv_seen_patch` 只有一個值，在坐騎頁看過就推進的話，寵物頁的新條目
       也跟著不見。改成 `ffxiv_seen_patch_pages`＝{頁面路徑: 看過的版本}，沒記過的頁退回全站的
       `ffxiv_seen_patch`（第一次來時記下的基準）。10-10 之前沒有任何頁面呼叫 markSeen，所以
       「本次新增」實際上一直是「自你第一次來之後新增」。
     · 比較用 pnum 的數值語意（7.21 > 7.2 > 7.15），不是字串比大小。 */
  const SEEN_KEY = 'ffxiv_seen_patch';
  const SEEN_PAGES_KEY = 'ffxiv_seen_patch_pages';

  function seenPatch() {
    try { return localStorage.getItem(SEEN_KEY) || null; } catch (e) { return null; }
  }
  function markSeen(gamePatch) {
    try { if (gamePatch) localStorage.setItem(SEEN_KEY, String(gamePatch)); } catch (e) {}
  }
  function seenPages() {
    try { const o = JSON.parse(localStorage.getItem(SEEN_PAGES_KEY) || 'null'); return o && typeof o === 'object' ? o : {}; }
    catch (e) { return {}; }
  }
  /** 這一頁上次看到的版本；這一頁沒記過就退回全站基準 */
  function seenFor(scope) {
    const p = scope ? seenPages()[scope] : null;
    return p || seenPatch();
  }
  /** 使用者在這一頁看過「本次新增」了：只推進這一頁 */
  function markSeenFor(scope, gamePatch) {
    if (!scope || !gamePatch) return markSeen(gamePatch);
    try {
      const o = seenPages();
      o[scope] = String(gamePatch);
      localStorage.setItem(SEEN_PAGES_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  /** 這個條目是不是「上次來過之後才開放的」。第一次來（沒有 seen）一律回 false。
      newIn＝站上補進這筆的版本（升版時才補到的舊條目，patch 比 seen 早但對使用者是新的；例：7.25 才補的 7.2 樂譜）。 */
  function isNewSince(patch, gamePatch, seen, newIn) {
    const g = pnum(gamePatch), s = pnum(seen);
    if (g == null || s == null) return false;
    const v = pnum(patch), a = pnum(newIn);
    return (v != null && v > s && v <= g) || (a != null && a > s && a <= g);
  }
  /** 第一次造訪就先把當前版本記下來，並回報「這次有沒有東西可標」。scope 給了就逐頁看。 */
  function initSeen(gamePatch, scope) {
    const s = scope ? seenFor(scope) : seenPatch();
    if (!s) { markSeen(gamePatch); if (scope) markSeenFor(scope, gamePatch); return { seen: null, hasNew: false }; }
    return { seen: s, hasNew: pnum(gamePatch) > pnum(s) };
  }

  window.PatchGate = { loadGamePatch, released, pnum, seenPatch, markSeen, seenFor, markSeenFor, isNewSince, initSeen, SEEN_KEY, SEEN_PAGES_KEY, FALLBACK_PATCH };
})();
