// patch-gate.js — 共用「台服未開放即隱藏」判斷
//
// 收藏／功能頁載入資料後，除了既有的 name 規則，再依台服當前版本(gamePatch)隱藏
// 尚未開放的條目：條目 patch 已知且 > gamePatch → 台服未開放 → 不顯示。
// patch 未知(null/空)者不主動隱藏（交既有 name 規則或視為資料缺口）。
//
// gamePatch 取自 /data/_meta.json，全站單一真實來源（目前 7.15）。
//
// 用法：
//   const gp = await PatchGate.loadGamePatch('../../data/_meta.json');
//   const data = raw.filter(e => e.name && PatchGate.released(e.patch, gp));
//
// 版本號比較：取主.次兩段，次段補滿兩位（"7.2"→7.20、"7.15"→7.15、"7.5"→7.50），
// 數值比較。7.20 > 7.15 → 隱藏；7.10 ≤ 7.15 → 顯示。
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
      _gamePatch = meta && meta.gamePatch ? meta.gamePatch : "7.15";
    } catch (e) {
      _gamePatch = "7.15"; // 後備：抓不到 _meta 時用已知台服版本
    }
    return _gamePatch;
  }

  window.PatchGate = { loadGamePatch, released, pnum };
})();
