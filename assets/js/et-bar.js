// ============================================================
// 艾歐澤亞時鐘列（et-bar）— 全站共用元件
//
// 釣魚紀錄追蹤、限時採集節點查詢、艾歐澤亞天氣預報三頁原本各自
// 手寫一套時間顯示（hero 大字／左右兩塊 ET+本地／天氣列），版型、
// 字級與資訊量都不同。改成統一由本元件產生，樣式見 assets/css/et-bar.css。
//
// 用法（頁面內放一個掛載點 <div id="etBar"></div>）：
//   import { mountEtBar } from '../../assets/js/et-bar.js';
//   mountEtBar('#etBar', { metric: 'weather' });   // 或 'ethour'
// ============================================================

import { WEATHER_PERIOD, ET_HOUR_MS, fmtCountdown } from './eorzea-weather.js';

const EORZEA_MULT = 3600 / 175; // 現實 → ET 的流速倍率（1 ET 天 = 70 真實分鐘）

/** 現實時間 ms → ET 時分 */
export function etParts(ms = Date.now()) {
  const etMin = Math.floor(ms * EORZEA_MULT / 60000);
  return { h: Math.floor(etMin / 60) % 24, m: etMin % 60 };
}

/** ET 整點 → 日夜階段（採集節點與部分魚看白天／夜晚）*/
export function etPhase(h) {
  if (h >= 5 && h < 17) return '☀️ 白天';
  if (h >= 17 && h < 19) return '🌆 黃昏';
  return '🌙 夜晚';
}

// 中欄可顯示的週期。兩者的邊界都落在 epoch 毫秒的整數倍上
// （1 ET 小時 = 175000ms、1 個天氣時段 = 8 ET 小時 = 1400000ms）。
const METRICS = {
  weather: { label: '下次換天氣',   period: WEATHER_PERIOD },
  ethour:  { label: '下個 ET 整點', period: ET_HOUR_MS },
};

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 掛載時鐘列並開始每秒更新。
 * @param {string|Element} target 掛載點（選擇器或元素）
 * @param {{metric?: 'weather'|'ethour', label?: string}} [opts]
 * @returns {{el: Element, update: () => void, stop: () => void}|null}
 */
export function mountEtBar(target, opts = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) return null;

  const metric = METRICS[opts.metric] || METRICS.weather;
  const label = opts.label || metric.label;

  host.classList.add('et-bar');
  host.innerHTML = `
    <div class="et-now">
      <div class="et-label">艾歐澤亞時間</div>
      <div class="et-clock"><span class="et-time">--:--</span><span class="et-phase">—</span></div>
    </div>
    <div class="et-progress">
      <div class="et-label">${label}</div>
      <div class="et-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="et-fill" style="width:0%"></div>
      </div>
      <div class="et-count">--</div>
    </div>
    <div class="et-rt">
      <div class="et-rt-time">現實 --:--:--</div>
      <div class="et-rt-sub">1 ET 小時 ≈ 2 分 55 秒</div>
    </div>`;

  const elTime  = host.querySelector('.et-time');
  const elPhase = host.querySelector('.et-phase');
  const elTrack = host.querySelector('.et-track');
  const elFill  = host.querySelector('.et-fill');
  const elCount = host.querySelector('.et-count');
  const elRt    = host.querySelector('.et-rt-time');

  function update() {
    const now = Date.now();

    const { h, m } = etParts(now);
    elTime.textContent = `${pad2(h)}:${pad2(m)}`;
    elPhase.textContent = etPhase(h);

    const elapsed = now % metric.period;
    const pct = elapsed / metric.period * 100;
    elFill.style.width = pct.toFixed(1) + '%';
    elTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
    elCount.textContent = fmtCountdown(metric.period - elapsed);

    const d = new Date(now);
    elRt.textContent = `現實 ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  update();
  const timer = setInterval(update, 1000);
  return { el: host, update, stop: () => clearInterval(timer) };
}
