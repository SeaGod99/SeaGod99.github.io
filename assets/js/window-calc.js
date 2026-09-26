/* window-calc.js — 「下次什麼時候開」的共用視窗計算
 *
 * 站內有兩套時間窗演算法，各寫各的：
 *   tools/fishing/     nextWindows()  天氣＋ET 時段，回傳絕對時間區間清單
 *   tools/gathering/   nodeStatus()   ET 整點 spawn ＋ 持續分鐘，回傳現在的狀態
 * 形狀不同（前者要看天氣、後者是週期性湧現），但要的東西一樣：
 * 「從現在起，接下來幾個開放區間分別是幾點到幾點，現在算開著還是關著」。
 *
 * 再多做一個有時間窗的功能（優雷卡 NM、海釣班表、鬧鐘中心、追蹤總看板）
 * 就會出現第三份。這支把兩種形狀收斂成同一個函式。
 *
 * ── 這支**不做**的事 ─────────────────────────────────────────────
 * 不碰畫面、不存設定、不發通知。鬧鐘那層在 et-alarm.js。
 * ET/RT 換算與天氣查表在 eorzea-weather.js，這裡只組合它們，不重寫。
 *
 * ── 用法 ────────────────────────────────────────────────────────
 *   import { nextWindows, statusOf } from './window-calc.js';
 *
 *   // ① 區間型（釣魚：ET 幾點到幾點，可加天氣條件）
 *   nextWindows({ startHour: 17, endHour: 21,
 *                 weather: { mapId: 135, keys: ['雨'], prevKeys: ['晴朗'] } }, now, { max: 3 })
 *
 *   // ② 週期型（採集：ET 整點湧現，持續 N 分鐘）
 *   nextWindows({ spawns: [0, 4, 8, 12, 16, 20], duration: 120 }, now, { max: 3 })
 *
 *   回傳 [{ ws, we, active }]，ws/we 是**真實時間毫秒**。
 *   沒有任何限制（全天開放且不看天氣）回 []——呼叫端自己決定那叫「隨時」還是「不顯示」。
 */
import {
  WEATHER_PERIOD, ET_HOUR_MS, getWeatherTable, getWeatherAt,
} from './eorzea-weather.js';

/** 1 現實毫秒 = 多少 ET 毫秒 */
export const EORZEA_MULT = 3600 / 175;

/** 某個真實時刻對應的 ET 小時（0–23，取整） */
export function etHourOf(ms) {
  return Math.floor(ms * EORZEA_MULT / 3600000) % 24;
}

/** 某個真實時刻對應的 ET 分鐘（0–1439） */
export function etMinuteOf(ms) {
  return Math.floor(ms * EORZEA_MULT / 60000) % 1440;
}

// ET 小時區間 → 一天內的片段。跨午夜（17→3）要拆成兩段，否則 b > a 的判斷會把整段丟掉。
function hourSegments(startHour, endHour) {
  if (startHour == null || endHour == null) return null;          // 不限時
  if (startHour <= 0 && endHour >= 24) return null;
  return startHour < endHour ? [[startHour, endHour]] : [[0, endHour], [startHour, 24]];
}

/**
 * 接下來的開放區間。
 *
 * @param spec {
 *   startHour, endHour   區間型：ET 幾點到幾點（0–24，跨午夜寫 17→3）
 *   spawns, duration     週期型：ET 整點湧現時刻陣列 ＋ 持續 ET 分鐘
 *   weather              可選 { mapId, keys[], prevKeys[] }，天氣鍵用 eorzea-weather 的 key
 * }
 * @param now  真實時間毫秒
 * @param opts { max = 3, horizon = 700 }  horizon＝最多往後掃幾個天氣週期（1 個 = 1400 秒）
 */
export function nextWindows(spec, now, opts = {}) {
  const max = opts.max ?? 3;
  const horizon = opts.horizon ?? 700;
  const wx = spec.weather;
  const wk = (wx && wx.keys) || [];
  const pk = (wx && wx.prevKeys) || [];
  const needWx = wk.length > 0 || pk.length > 0;

  if (spec.spawns && spec.spawns.length) {
    return periodicWindows(spec, now, max, { needWx, wx, wk, pk, horizon });
  }

  const segs0 = hourSegments(spec.startHour, spec.endHour);
  if (!segs0 && !needWx) return [];                                // 全天開放又不看天氣
  if (needWx && (wx.mapId == null || !getWeatherTable(wx.mapId))) return [];

  const wins = [];
  const pi0 = Math.floor(now / WEATHER_PERIOD);
  for (let i = 0; i < horizon && wins.length < max + 1; i++) {
    const pi = pi0 + i;
    if (needWx && !weatherOk(wx.mapId, pi, wk, pk)) continue;
    const pStart = pi * WEATHER_PERIOD;
    const pEtH = etHourOf(pStart);
    // 一個天氣週期固定是 8 ET 小時；沒有時段限制時整個週期都算開放
    const segs = segs0
      ? segs0.map(([a, b]) => [Math.max(a, pEtH), Math.min(b, pEtH + 8)]).filter(([a, b]) => b > a)
      : [[pEtH, pEtH + 8]];
    for (const [a, b] of segs) {
      const ws = pStart + (a - pEtH) * ET_HOUR_MS;
      const we = pStart + (b - pEtH) * ET_HOUR_MS;
      if (now >= we) continue;
      const last = wins[wins.length - 1];
      // 相鄰段合併：連續兩個天氣週期都符合時，中間不該斷一刀
      if (last && Math.abs(last.we - ws) < 1000) last.we = we;
      else wins.push({ ws, we });
    }
  }
  wins.forEach((w) => { w.active = now >= w.ws; });
  return wins.slice(0, max);
}

function weatherOk(mapId, pi, wk, pk) {
  if (wk.length && !wk.includes(getWeatherAt(mapId, pi * WEATHER_PERIOD))) return false;
  if (pk.length && !pk.includes(getWeatherAt(mapId, (pi - 1) * WEATHER_PERIOD))) return false;
  return true;
}

// 週期型：ET 整點湧現、持續 N 分鐘。以 ET 日為單位往後掃。
function periodicWindows(spec, now, max, ctx) {
  const dur = spec.duration || 0;
  if (!dur) return [];
  const dayMs = 24 * ET_HOUR_MS;                       // 一個 ET 日的真實毫秒（＝4200 秒）
  const spawns = [...new Set(spec.spawns.map((h) => ((h % 24) + 24) % 24))].sort((a, b) => a - b);
  const wins = [];
  // 從「現在所在的 ET 日」的起點開始，含前一天以免錯過正在進行中的那一段
  const day0 = Math.floor(now / dayMs) - 1;
  for (let d = 0; d < 400 && wins.length < max + 1; d++) {
    const dayStart = (day0 + d) * dayMs;
    for (const h of spawns) {
      const ws = dayStart + h * ET_HOUR_MS;
      const we = ws + (dur / 60) * ET_HOUR_MS;
      if (now >= we) continue;
      if (ctx.needWx && ctx.wx.mapId != null) {
        const pi = Math.floor(ws / WEATHER_PERIOD);
        if (!weatherOk(ctx.wx.mapId, pi, ctx.wk, ctx.pk)) continue;
      }
      const last = wins[wins.length - 1];
      if (last && Math.abs(last.we - ws) < 1000) last.we = we;
      else wins.push({ ws, we });
      if (wins.length >= max + 1) break;
    }
  }
  wins.forEach((w) => { w.active = now >= w.ws; });
  return wins.slice(0, max);
}

/**
 * 視窗清單 → 現在的狀態。
 * @returns { state: 'open'|'soon'|'closed'|'none', secsLeft, window }
 *   open   現在開著，secsLeft＝還剩幾秒
 *   soon   還沒開但在 soonSecs 內，secsLeft＝還要等幾秒
 *   closed 還沒開且超過 soonSecs
 *   none   查不到任何未來視窗
 *
 * `soonSecs` 預設 5 分鐘：**ET 一天只有 70 真實分鐘**，門檻放到 30 分鐘等於涵蓋
 * 43% 的循環，實測 225 個限時節點會有 71% 同時掛「即將開放」，那個狀態就沒有鑑別度了
 * （量測見 docs/PROGRESS.md 2026-07-28）。要調請連同分佈一起重算，不要憑感覺改。
 */
export function statusOf(wins, now, soonSecs = 300) {
  if (!wins || !wins.length) return { state: 'none', secsLeft: Infinity, window: null };
  const w = wins[0];
  if (now >= w.ws && now < w.we) {
    return { state: 'open', secsLeft: Math.max(0, Math.round((w.we - now) / 1000)), window: w };
  }
  const wait = Math.max(0, Math.round((w.ws - now) / 1000));
  return { state: wait <= soonSecs ? 'soon' : 'closed', secsLeft: wait, window: w };
}
