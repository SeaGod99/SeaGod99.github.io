// ============================================================
// 迷你地圖彈窗（共用元件）
// 用途：點「🗺 地圖」時顯示該區域地圖 + 座標大頭針，
// 讓玩家不開遊戲也知道採集點／釣場在地圖哪個位置。
// 底圖：data/maps.json 的 image.local（assets/maps/*.jpg），
// 本地缺圖時自動改抓 XIVAPI 遠端圖。
// 座標換算：遊戲座標 c → 圖面百分比 = (c - 1) / (41 * 100 / sizeFactor) * 100
// ============================================================

let _maps = new Map(); // mapId -> map 資料
let _base = '..';      // 到站根的相對路徑前綴
let _dom = null;

/**
 * 初始化（重複呼叫無害）
 * @param {{mapsData: Array, base: string}} opts
 *   mapsData：maps.json 的 data 陣列；base：頁面到站根的相對路徑（如 '../..'）
 */
export function initMapModal({ mapsData, base }) {
  if (mapsData) _maps = new Map(mapsData.map(m => [m.id, m]));
  if (base) _base = base;
}

function ensureDom() {
  if (_dom) return _dom;
  const style = document.createElement('style');
  style.textContent = `
    .mmw-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1000;
      display:flex; align-items:center; justify-content:center; padding:16px; }
    .mmw-box { background:var(--bg-card, #fff); color:var(--text-primary, var(--text, #222));
      border:1px solid var(--border, rgba(0,0,0,0.12)); border-radius:12px;
      max-width:560px; width:100%; max-height:92vh; overflow:auto;
      box-shadow:0 12px 40px rgba(0,0,0,0.35); }
    .mmw-head { display:flex; align-items:flex-start; gap:10px; padding:14px 16px 10px; }
    .mmw-titles { flex:1; min-width:0; }
    .mmw-title { font-size:1rem; font-weight:700; }
    .mmw-sub { font-size:0.78rem; color:var(--text-secondary, var(--text-dim, #888)); margin-top:2px; }
    .mmw-close { background:none; border:1px solid var(--border, rgba(0,0,0,0.12)); border-radius:6px;
      width:30px; height:30px; cursor:pointer; font-size:14px; color:inherit; flex-shrink:0; }
    .mmw-close:hover { border-color:var(--gold, #c8a96e); color:var(--gold, #c8a96e); }
    .mmw-map { position:relative; margin:0 16px; border-radius:8px; overflow:hidden;
      border:1px solid var(--border, rgba(0,0,0,0.12)); background:rgba(128,128,128,0.08); }
    .mmw-map img { display:block; width:100%; height:auto; }
    .mmw-pin { position:absolute; transform:translate(-50%,-100%); font-size:26px; line-height:1;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,0.6)); pointer-events:none;
      animation:mmw-drop 0.35s ease-out; }
    .mmw-ring { position:absolute; transform:translate(-50%,-50%); width:14px; height:14px;
      border-radius:50%; border:2px solid #ff5252; pointer-events:none;
      animation:mmw-pulse 1.6s ease-out infinite; }
    @keyframes mmw-drop { from { transform:translate(-50%,-160%); opacity:0; } to { transform:translate(-50%,-100%); opacity:1; } }
    @keyframes mmw-pulse { 0% { box-shadow:0 0 0 0 rgba(255,82,82,0.5);} 100% { box-shadow:0 0 0 14px rgba(255,82,82,0);} }
    .mmw-empty { padding:42px 0; text-align:center; font-size:0.85rem;
      color:var(--text-secondary, var(--text-dim, #888)); }
    .mmw-foot { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 16px 16px; }
    .mmw-coord { font-size:0.85rem; font-variant-numeric:tabular-nums; font-weight:600; }
    .mmw-flag { font-size:0.75rem; padding:4px 10px; border-radius:6px; cursor:pointer;
      border:1px solid var(--border, rgba(0,0,0,0.12)); background:none;
      color:var(--blue, #2f7fd1); margin-left:auto; }
    .mmw-flag:hover { border-color:var(--blue, #2f7fd1); }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'mmw-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="mmw-box" role="dialog" aria-modal="true">
      <div class="mmw-head">
        <div class="mmw-titles">
          <div class="mmw-title"></div>
          <div class="mmw-sub"></div>
        </div>
        <button class="mmw-close" title="關閉">✕</button>
      </div>
      <div class="mmw-map"></div>
      <div class="mmw-foot">
        <span class="mmw-coord"></span>
        <button class="mmw-flag"></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeMapModal(); });
  overlay.querySelector('.mmw-close').addEventListener('click', closeMapModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closeMapModal();
  });
  overlay.querySelector('.mmw-flag').addEventListener('click', e => {
    const btn = e.currentTarget;
    const text = btn.dataset.flag;
    if (!text) return;
    copyText(text).then(ok => {
      const orig = `📋 ${text}`;
      btn.textContent = ok ? '✅ 已複製' : '❌ 複製失敗';
      setTimeout(() => { btn.textContent = orig; }, 1400);
    });
  });

  _dom = overlay;
  return overlay;
}

/**
 * 開啟地圖彈窗
 * @param {{mapId:number, x:number, y:number, title:string, sub?:string, flagText?:string}} opts
 */
export function openMapModal({ mapId, x, y, title, sub, flagText }) {
  const overlay = ensureDom();
  const m = _maps.get(mapId);
  overlay.querySelector('.mmw-title').textContent = title || '';
  overlay.querySelector('.mmw-sub').textContent = sub || (m ? m.name : '');
  overlay.querySelector('.mmw-coord').textContent = `X: ${fmt(x)}　Y: ${fmt(y)}`;

  const flagBtn = overlay.querySelector('.mmw-flag');
  if (flagText) {
    flagBtn.style.display = '';
    flagBtn.dataset.flag = flagText;
    flagBtn.textContent = `📋 ${flagText}`;
  } else {
    flagBtn.style.display = 'none';
  }

  const box = overlay.querySelector('.mmw-map');
  if (!m || !m.image) {
    box.innerHTML = '<div class="mmw-empty">此區域尚無地圖底圖，請依座標前往。</div>';
  } else {
    const span = 41 * 100 / (m.sizeFactor || 100); // 地圖座標跨度
    const px = clamp((x - 1) / span * 100);
    const py = clamp((y - 1) / span * 100);
    box.innerHTML = `
      <img src="${_base}${m.image.local}" alt="${m.name}"
           onerror="if(this.dataset.retry){this.parentElement.innerHTML='<div class=&quot;mmw-empty&quot;>地圖載入失敗，請依座標前往。</div>'}else{this.dataset.retry=1;this.src='${m.image.url}';}">
      <span class="mmw-ring" style="left:${px}%;top:${py}%"></span>
      <span class="mmw-pin" style="left:${px}%;top:${py}%">📍</span>`;
  }
  overlay.style.display = 'flex';
}

export function closeMapModal() {
  if (_dom) _dom.style.display = 'none';
}

function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }
function clamp(p) { return Math.max(1, Math.min(99, p)); }

/* 剪貼簿：clipboard API 失敗時退回 execCommand（非安全環境／遊戲內瀏覽器） */
function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => copyTextFallback(text));
  }
  return Promise.resolve(copyTextFallback(text));
}
function copyTextFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  return ok;
}
