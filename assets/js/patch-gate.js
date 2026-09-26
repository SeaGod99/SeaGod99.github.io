// patch-gate.js — 共用「台服未開放即隱藏」判斷
//
// 收藏／功能頁載入資料後，除了既有的 name 規則，再依台服當前版本(gamePatch)隱藏
// 尚未開放的條目：條目 patch 已知且 > gamePatch → 台服未開放 → 不顯示。
// patch 未知(null/空)者不主動隱藏（交既有 name 規則或視為資料缺口）。
//
// gamePatch 取自 /data/_meta.json，全站單一真實來源（目前 7.21）。
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

  async function loadGamePatch(metaUrl) {
    if (_gamePatch != null) return _gamePatch;
    try {
      const res = await fetch(metaUrl || "/data/_meta.json");
      const meta = await res.json();
      _gamePatch = meta && meta.gamePatch ? meta.gamePatch : "7.21";
    } catch (e) {
      _gamePatch = "7.21"; // 後備：抓不到 _meta 時用已知台服版本
    }
    return _gamePatch;
  }

  /* ── 「上次來過之後新增了什麼」────────────────────────────────────────
     記住使用者上次看到的是哪一版（`ffxiv_seen_patch`，key 一律 ffxiv_ 前綴才進得了
     首頁的全站備份，§2.3），之後就能標出「這一版新加的」。

     幾個刻意的決定：
     · **第一次來的人什麼都不標**。沒有 seen 值時全部條目都會算「新」，
       那等於整頁閃光，反而看不出重點——這時只把當前版本記下來，下次改版才有比較基準。
     · **不自動把 seen 推進到最新**。使用者看過之後才推（頁面呼叫 markSeen），
       否則開一次頁面就再也看不到那些標記了。
     · 比較用 pnum 的數值語意（7.21 > 7.2 > 7.15），不是字串比大小。 */
  const SEEN_KEY = 'ffxiv_seen_patch';

  function seenPatch() {
    try { return localStorage.getItem(SEEN_KEY) || null; } catch (e) { return null; }
  }
  function markSeen(gamePatch) {
    try { if (gamePatch) localStorage.setItem(SEEN_KEY, String(gamePatch)); } catch (e) {}
  }
  /** 這個條目是不是「上次來過之後才開放的」。第一次來（沒有 seen）一律回 false。 */
  function isNewSince(patch, gamePatch, seen) {
    const v = pnum(patch), g = pnum(gamePatch), s = pnum(seen);
    if (v == null || g == null || s == null) return false;
    return v > s && v <= g;
  }
  /** 第一次造訪就先把當前版本記下來，並回報「這次有沒有東西可標」。 */
  function initSeen(gamePatch) {
    const s = seenPatch();
    if (!s) { markSeen(gamePatch); return { seen: null, hasNew: false }; }
    return { seen: s, hasNew: pnum(gamePatch) > pnum(s) };
  }

  window.PatchGate = { loadGamePatch, released, pnum, seenPatch, markSeen, isNewSince, initSeen, SEEN_KEY };
})();
