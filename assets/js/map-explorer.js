// ============================================================
// 地圖探索器（共用元件）
//
// 用途：釣魚紀錄追蹤、限時採集節點查詢、採集紀錄追蹤三頁共用的地圖檢視。
// 版面沿用無人島「採集地圖／素材」的做法——左邊底圖標點、右邊清單，兩邊連動：
//   · 右邊清單一次列出「所有」符合篩選的地圖與地點（不再是一次只能看一張的下拉選單）
//   · 點地圖圓點 → 右邊對應列高亮並捲進視野、展開詳情
//   · 點右邊的列  → 地圖切到該張、圓點高亮
//   · 搜尋框跨地圖搜尋：地圖名／地區名／地點名／該點的產物名都吃
//
// 底圖：data/maps.json 的 image.local（assets/maps/*.jpg），本地缺圖時改抓 image.url。
// 座標換算：遊戲座標 c → 圖面百分比 = (c - 1) * sizeFactor / 41
//   （與 map-modal.js／無人島採集地圖同一條 FFXIV 標準式）
//
// 效能：限時採集頁每秒重畫一次，所以 render() 分兩層——
//   結構（地圖分組／地點列／底圖）只在「簽章」變動時重建 DOM，
//   會跳動的文字（倒數、狀態顏色）每次都只做原地 patch。
//   搜尋框本身永不重建，使用者打字打到一半不會被洗掉。
// ============================================================

let _styled = false;

function injectStyle() {
  if (_styled) return;
  _styled = true;
  const style = document.createElement('style');
  style.textContent = `
  .mx-layout { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(300px,400px);
    gap:22px; align-items:start; }
  @media (max-width:900px) { .mx-layout { grid-template-columns:1fr; } }

  /* ── 左：地圖 ──
     top:58px＝全站固定頂部工具列 46px＋留白，與 aether-currents／treasure-maps 一致；
     用 12px 會被頂列蓋住（見「專案慣例與記憶」§2.6）*/
  .mx-mapcol { position:sticky; top:58px; min-width:0; }
  @media (max-width:900px) { .mx-mapcol { position:static; } }
  .mx-maphead { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
  .mx-mapname { font-size:1.05rem; font-weight:700; color:var(--gold-light,#e2c98a); }
  .mx-mapmeta { font-size:0.78rem; color:var(--text-muted,#717c91); }
  .mx-canvas { position:relative; border:1px solid var(--border,rgba(255,255,255,0.08));
    border-radius:var(--radius-md,10px); overflow:hidden; background:rgba(128,128,128,0.05); }
  .mx-canvas img { display:block; width:100%; height:auto; user-select:none; }
  .mx-dots { position:absolute; inset:0; }
  .mx-empty { display:flex; align-items:center; justify-content:center; min-height:220px;
    padding:1rem; text-align:center; font-size:0.85rem; color:var(--text-muted,#717c91); }

  .mx-dot { position:absolute; width:14px; height:14px; border-radius:50%; cursor:pointer;
    transform:translate(-50%,-50%); border:2px solid rgba(0,0,0,0.55);
    box-shadow:0 0 0 1px rgba(255,255,255,0.35); transition:transform .12s, box-shadow .12s; }
  .mx-dot:hover { transform:translate(-50%,-50%) scale(1.5); z-index:6; }
  .mx-dot.sel { transform:translate(-50%,-50%) scale(1.6); z-index:7;
    box-shadow:0 0 0 3px rgba(255,255,255,0.9), 0 0 12px 4px rgba(255,255,255,0.45); }
  @media (max-width:600px) { .mx-dot { width:18px; height:18px; } }

  .mx-legend { display:flex; gap:14px; flex-wrap:wrap; justify-content:center;
    margin-top:10px; font-size:0.74rem; color:var(--text-muted,#717c91); }
  .mx-legend span { display:inline-flex; align-items:center; gap:5px; }
  .mx-legend i { width:11px; height:11px; border-radius:50%; display:inline-block;
    border:1px solid rgba(0,0,0,0.45); }

  /* ── 右：搜尋＋地圖／地點清單 ── */
  .mx-listcol { display:flex; flex-direction:column; gap:10px; min-width:0; }
  .mx-searchwrap { position:relative; }
  .mx-searchwrap .mx-si { position:absolute; left:11px; top:50%; transform:translateY(-50%);
    font-size:0.85rem; opacity:.7; pointer-events:none; }
  .mx-search { width:100%; box-sizing:border-box; padding:9px 30px 9px 32px; font:inherit;
    font-size:0.88rem; color:var(--text-primary,#e8eaf0);
    background:var(--bg-card,#14181f); border:1px solid var(--border,rgba(255,255,255,0.08));
    border-radius:var(--radius-sm,6px); transition:var(--transition,.18s); }
  .mx-search:focus { outline:none; border-color:var(--gold,#c8a96e); }
  .mx-search::placeholder { color:var(--text-muted,#717c91); }
  .mx-clear { position:absolute; right:6px; top:50%; transform:translateY(-50%);
    width:22px; height:22px; line-height:1; border:none; background:none; cursor:pointer;
    color:var(--text-muted,#717c91); font-size:0.9rem; border-radius:4px; }
  .mx-clear:hover { color:var(--gold,#c8a96e); }
  .mx-summary { font-size:0.78rem; color:var(--text-muted,#717c91); }
  .mx-summary em { font-style:normal; font-weight:700; color:var(--gold,#c8a96e); }
  .mx-note { font-size:0.72rem; color:var(--text-muted,#717c91); line-height:1.6; }

  .mx-groups { border:1px solid var(--border,rgba(255,255,255,0.08));
    border-radius:var(--radius-md,10px); overflow-y:auto; max-height:min(72vh,760px); }
  @media (max-width:900px) { .mx-groups { max-height:60vh; } }
  .mx-group + .mx-group { border-top:1px solid var(--border,rgba(255,255,255,0.08)); }
  .mx-ghead { display:flex; align-items:center; gap:8px; width:100%; box-sizing:border-box;
    padding:9px 12px; font:inherit; font-size:0.85rem; text-align:left; cursor:pointer;
    background:none; border:none; border-left:2px solid transparent;
    color:var(--text-secondary,#8892a4); transition:var(--transition,.18s); }
  .mx-ghead:hover { background:var(--bg-card-hover,#1a1f2b); color:var(--text-primary,#e8eaf0); }
  .mx-ghead:focus-visible { outline:2px solid var(--gold,#c8a96e); outline-offset:-2px; }
  .mx-group.open > .mx-ghead { background:var(--gold-dim,rgba(200,169,110,0.15));
    color:var(--gold,#c8a96e); border-left-color:var(--gold,#c8a96e); font-weight:600; }
  .mx-gname { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mx-gregion { font-size:0.7rem; color:var(--text-muted,#717c91); flex-shrink:0; }
  .mx-gcount { font-size:0.72rem; font-variant-numeric:tabular-nums; flex-shrink:0;
    padding:1px 7px; border-radius:9px; background:var(--raise,rgba(255,255,255,0.05)); }

  .mx-points { border-top:1px solid var(--border,rgba(255,255,255,0.06)); }
  .mx-point { display:flex; align-items:center; gap:8px; width:100%; box-sizing:border-box;
    padding:7px 12px 7px 20px; font:inherit; font-size:0.82rem; text-align:left; cursor:pointer;
    background:none; border:none; border-left:2px solid transparent;
    color:var(--text-secondary,#8892a4); transition:var(--transition,.18s); }
  .mx-point:hover { background:var(--bg-card-hover,#1a1f2b); color:var(--text-primary,#e8eaf0); }
  .mx-point:focus-visible { outline:2px solid var(--gold,#c8a96e); outline-offset:-2px; }
  .mx-point.sel { background:var(--raise,rgba(255,255,255,0.05));
    color:var(--text-primary,#e8eaf0); border-left-color:var(--gold,#c8a96e); }
  .mx-pdot { width:9px; height:9px; border-radius:50%; flex-shrink:0;
    border:1px solid rgba(0,0,0,0.45); }
  .mx-pname { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mx-pmeta, .mx-live { font-size:0.72rem; color:var(--text-muted,#717c91); flex-shrink:0;
    font-variant-numeric:tabular-nums; }

  .mx-detail { padding:10px 12px 14px 20px; border-left:2px solid var(--gold,#c8a96e);
    background:var(--raise,rgba(255,255,255,0.05)); font-size:0.82rem; }
  .mx-hint { padding:14px 12px; font-size:0.78rem; color:var(--text-muted,#717c91); text-align:center; }
  `;
  document.head.appendChild(style);
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* 遊戲座標 → 底圖百分比（FFXIV 標準式；夾在 0..100 免得離群點跑出圖外） */
const coordPct = (c, sizeFactor) =>
  Math.max(0, Math.min(100, ((c - 1) * ((sizeFactor || 100) / 100)) / 41 * 100));

/**
 * 建立地圖探索器
 *
 * @param {object} cfg
 * @param {HTMLElement} cfg.mount    掛載容器（內容會被接管）
 * @param {string}      cfg.base     頁面到站根的相對路徑（如 '../..'）
 * @param {Map|Array}   cfg.maps     maps.json 的資料（Map<id,map> 或陣列）
 * @param {string}      cfg.unit     地點單位名，用於文案（'釣場'／'節點'／'採集點'）
 * @param {object}      cfg.states   狀態色表 { token: { color, label } }；label 有值才進圖例
 * @param {Function}    cfg.points   () => [{ id, mapId, x, y, name, state, meta, live, search }]
 *                                   ※ 順序請保持穩定（如依 id 排），否則每次重畫都會重建 DOM
 * @param {Function}    cfg.detail   (point) => 詳情卡 HTML
 * @param {Function}   [cfg.tick]    (point, detailEl) => void；每次 render 對詳情卡做原地更新
 * @param {Function}   [cfg.detailSig] (point) => string；選中點的詳情卡內容簽章，變了就重建詳情卡
 * @param {Function}   [cfg.note]    () => string；清單下方的補充說明（如「另有 N 點無座標」）
 * @param {string}     [cfg.searchPlaceholder]
 * @param {string}     [cfg.emptyText]
 * @returns {{ render: Function, select: Function, getSelected: Function }}
 */
export function createMapExplorer(cfg) {
  injectStyle();

  const maps = cfg.maps instanceof Map
    ? cfg.maps
    : new Map((cfg.maps || []).map((m) => [m.id, m]));
  const base = cfg.base || '..';
  const unit = cfg.unit || '地點';
  const states = cfg.states || {};
  const mount = cfg.mount;

  const legendHtml = Object.keys(states)
    .filter((k) => states[k].label)
    .map((k) => `<span><i style="background:${states[k].color}"></i>${esc(states[k].label)}</span>`)
    .join('');

  mount.innerHTML = `
    <div class="mx-layout">
      <div class="mx-mapcol">
        <div class="mx-maphead">
          <span class="mx-mapname"></span><span class="mx-mapmeta"></span>
        </div>
        <div class="mx-canvas"><div class="mx-dots"></div></div>
        <div class="mx-legend">${legendHtml}</div>
      </div>
      <div class="mx-listcol">
        <div class="mx-searchwrap">
          <span class="mx-si">🔍</span>
          <input class="mx-search" type="search" autocomplete="off"
                 placeholder="${esc(cfg.searchPlaceholder || `搜尋地圖、地區或${unit}…`)}">
          <button class="mx-clear" type="button" title="清除搜尋" hidden>✕</button>
        </div>
        <div class="mx-summary"></div>
        <div class="mx-groups"></div>
        <div class="mx-note"></div>
      </div>
    </div>`;

  const $ = (sel) => mount.querySelector(sel);
  const elMapName = $('.mx-mapname');
  const elMapMeta = $('.mx-mapmeta');
  const elCanvas  = $('.mx-canvas');
  const elLegend  = $('.mx-legend');
  const elSearch  = $('.mx-search');
  const elClear   = $('.mx-clear');
  const elSummary = $('.mx-summary');
  const elGroups  = $('.mx-groups');
  const elNote    = $('.mx-note');

  let query   = '';
  let mapId   = null;   // 目前顯示的地圖
  let selId   = null;   // 目前選中的地點
  let sig     = '';     // 結構簽章（變了才重建 DOM）
  let ordSig  = '';     // 顯示順序簽章（變了才搬節點）
  let imgMap  = null;   // 底圖目前畫的是哪張地圖
  let groups  = [];     // [{ map, pts }]，依地點數多→少
  let byId    = new Map();

  /* ── 篩選：地圖名／地區命中就整張留下，否則只留命中的地點 ── */
  function build() {
    const q = query.trim().toLowerCase();
    const all = cfg.points() || [];
    byId = new Map();

    const buckets = new Map();
    for (const p of all) {
      const m = maps.get(p.mapId);
      if (!m || p.x == null || p.y == null) continue;
      byId.set(String(p.id), p);
      if (!buckets.has(p.mapId)) buckets.set(p.mapId, { map: m, pts: [] });
      buckets.get(p.mapId).pts.push(p);
    }

    groups = [];
    for (const g of buckets.values()) {
      if (!q) { groups.push(g); continue; }
      const mapHit = [g.map.name, g.map.nameEn, g.map.region, g.map.zone]
        .some((s) => s && String(s).toLowerCase().includes(q));
      if (mapHit) { groups.push(g); continue; }
      const pts = g.pts.filter((p) =>
        [p.name, p.meta, p.search].some((s) => s && String(s).toLowerCase().includes(q)));
      if (pts.length) groups.push({ map: g.map, pts });
    }
    // 順序：地點順序＝頁面 points() 給的順序（＝工具列選的排序），不再自己重排；
    // 地圖順序＝該圖第一個地點在那份排序結果中的位置（buckets 的插入序就是），
    // 所以換排序時左邊清單與右邊地圖一起跟著動。
    // 唯一的強制規則：副本與特殊區域（type=instance／dungeon）一律殿後——
    // 雲冠群島（The Diadem）49 個採集點全站最多，卻是要另外進本的地方，不該排第一。
    // sort 是穩定排序，所以同 rank 內仍維持上面的先後。
    const rank = (m) => (m.type === 'instance' || m.type === 'dungeon' ? 1 : 0);
    groups.sort((a, b) => rank(a.map) - rank(b.map));

    // 目前地圖若已不在結果內（換篩選／打了搜尋），自動跳到第一張
    if (!groups.some((g) => g.map.id === mapId)) mapId = groups.length ? groups[0].map.id : null;
    const cur = groups.find((g) => g.map.id === mapId);
    if (selId != null && !(cur && cur.pts.some((p) => String(p.id) === String(selId)))) selId = null;
  }

  /* ── 結構簽章：只看「有哪些地圖、各有哪些地點」這個集合，刻意做成與順序無關
       （id 排過再串），換排序時不會整包重建 DOM，改由 applyOrder() 搬既有節點。
       狀態與倒數也不進簽章（那些走 patch）。
       詳情卡若有「非倒數」的內容會變（如已採勾選），頁面用 cfg.detailSig 把它併進來，
       簽章一變詳情卡就重建；只有倒數在跳的頁面（限時採集）則不給 detailSig，改用 cfg.tick。── */
  function structSig() {
    let tail = '';
    if (cfg.detailSig && selId != null) {
      const cur = groups.find((g) => g.map.id === mapId);
      const p = cur && cur.pts.find((x) => String(x.id) === String(selId));
      if (p) tail = '||' + cfg.detailSig(p);
    }
    const canon = groups
      .map((g) => g.map.id + '#' + g.pts.map((p) => String(p.id)).sort().join('.'))
      .sort().join('|');
    return canon + '||' + mapId + '||' + selId + tail;
  }

  /* 顯示順序簽章：地圖順序＋目前這張圖的地點順序。變了才動 DOM。 */
  function orderSig() {
    const cur = groups.find((g) => g.map.id === mapId);
    return groups.map((g) => g.map.id).join(',')
      + '|' + (cur ? cur.pts.map((p) => p.id).join(',') : '');
  }

  /* 把既有節點搬到正確位置（appendChild 對已在 DOM 的節點＝移動）。
     不重建 innerHTML，所以倒數、捲動位置、詳情卡都不會被打斷。 */
  function applyOrder() {
    const want = groups
      .map((g) => elGroups.querySelector(`.mx-group[data-mxg="${cssEsc(g.map.id)}"]`))
      .filter(Boolean);
    if (want.some((el, i) => elGroups.children[i] !== el)) want.forEach((el) => elGroups.appendChild(el));

    const cur = groups.find((g) => g.map.id === mapId);
    const host = elGroups.querySelector(`.mx-group[data-mxg="${cssEsc(mapId)}"] .mx-points`);
    if (!cur || !host) return;
    const seq = [];
    for (const p of cur.pts) {
      const row = host.querySelector(`.mx-point[data-mxpt="${cssEsc(p.id)}"]`);
      if (!row) continue;
      seq.push(row);
      // 詳情卡是該列的下一個兄弟節點，要跟著一起搬，否則會跑到別人底下
      const det = host.querySelector(`.mx-detail[data-mxdetail="${cssEsc(p.id)}"]`);
      if (det) seq.push(det);
    }
    if (seq.some((el, i) => host.children[i] !== el)) seq.forEach((el) => host.appendChild(el));
  }

  function render() {
    build();
    const s = structSig();
    if (s !== sig) { sig = s; rebuild(); ordSig = orderSig(); }  // rebuild 出來就是正確順序
    else {
      const o = orderSig();
      if (o !== ordSig) { ordSig = o; applyOrder(); }
    }
    patch();
  }

  /* ── 重建：底圖、圓點、右側清單 ── */
  function rebuild() {
    const cur = groups.find((g) => g.map.id === mapId);

    // 標題與底圖
    if (!cur) {
      elMapName.textContent = '';
      elMapMeta.textContent = '';
      elCanvas.innerHTML = `<div class="mx-empty">${esc(cfg.emptyText || `目前篩選沒有可定位在地圖上的${unit}。`)}</div>`;
      elLegend.style.display = 'none';
      imgMap = null;
    } else {
      const m = cur.map;
      elMapName.textContent = m.name || m.nameEn || `地圖 ${m.id}`;
      elMapMeta.textContent = [m.region, m.patch ? `v${m.patch}` : '', `${cur.pts.length} ${unit}`]
        .filter(Boolean).join(' · ');
      elLegend.style.display = legendHtml ? '' : 'none';
      if (imgMap !== mapId) {
        imgMap = mapId;
        elCanvas.innerHTML = '<div class="mx-dots"></div>';
        if (m.image && m.image.local) {
          const img = document.createElement('img');
          img.alt = m.name || '';
          img.src = base + m.image.local;
          // 本地缺圖 → 改抓 XIVAPI 遠端圖 → 再失敗才顯示提示
          img.addEventListener('error', () => {
            if (img.dataset.retry) {
              elCanvas.innerHTML = `<div class="mx-empty">「${esc(m.name)}」的底圖尚未下載。<br>`
                + `於本機執行 <code>node scripts/download-maps.mjs --id ${m.id}</code> 可補齊；`
                + `目前仍可用下方座標前往。</div>`;
              imgMap = null;
            } else { img.dataset.retry = '1'; img.src = m.image.url; }
          });
          elCanvas.insertBefore(img, elCanvas.firstChild);
        } else {
          elCanvas.innerHTML = `<div class="mx-empty">此區域尚無底圖，請依座標前往。</div>`;
          imgMap = null;
        }
      }
      const dots = elCanvas.querySelector('.mx-dots');
      if (dots) {
        const sf = m.sizeFactor || 100;
        dots.innerHTML = cur.pts.map((p) => {
          const st = states[p.state] || {};
          // 另掛 mx-s-<state>，讓各頁能對特定狀態加樣式（如「開放中」的脈動）
          return `<span class="mx-dot mx-s-${esc(p.state)}" data-mxpt="${esc(p.id)}"`
            + ` style="left:${coordPct(p.x, sf).toFixed(2)}%;top:${coordPct(p.y, sf).toFixed(2)}%;`
            + `background:${st.color || 'var(--blue,#4fc3f7)'}"`
            + ` title="${esc(p.name)}（X:${p.x.toFixed(1)} Y:${p.y.toFixed(1)}）"></span>`;
        }).join('');
      }
    }

    // 右側清單
    if (!groups.length) {
      elGroups.innerHTML = `<div class="mx-hint">${esc(query ? '找不到符合的地圖或' + unit + '。' : cfg.emptyText || '沒有可定位的' + unit + '。')}</div>`;
    } else {
      elGroups.innerHTML = groups.map((g) => {
        const open = g.map.id === mapId;
        const head = `<button type="button" class="mx-ghead" data-mxmap="${g.map.id}"`
          + ` aria-expanded="${open}">`
          + `<span class="mx-gname">${esc(g.map.name || g.map.nameEn)}</span>`
          + (g.map.region ? `<span class="mx-gregion">${esc(g.map.region)}</span>` : '')
          + `<span class="mx-gcount">${g.pts.length}</span></button>`;
        if (!open) return `<div class="mx-group" data-mxg="${g.map.id}">${head}</div>`;
        const rows = g.pts.map((p) => {
          const on = String(p.id) === String(selId);
          const st = states[p.state] || {};
          // 列本身也掛 mx-s-<state>，各頁才能對整列上色（如限時採集的開放／即將／未開放）
          return `<button type="button" class="mx-point mx-s-${esc(p.state)}${on ? ' sel' : ''}" data-mxpt="${esc(p.id)}"`
            + ` aria-current="${on}">`
            + `<i class="mx-pdot mx-s-${esc(p.state)}" data-mxdot="${esc(p.id)}" style="background:${st.color || 'var(--blue,#4fc3f7)'}"></i>`
            + `<span class="mx-pname" title="${esc(p.name)}">${esc(p.name)}</span>`
            + (p.meta ? `<span class="mx-pmeta">${esc(p.meta)}</span>` : '')
            + `<span class="mx-live" data-mxlive="${esc(p.id)}"></span></button>`
            + (on ? `<div class="mx-detail" data-mxdetail="${esc(p.id)}">${cfg.detail(p)}</div>` : '');
        }).join('');
        return `<div class="mx-group open" data-mxg="${g.map.id}">${head}`
          + `<div class="mx-points">${rows}</div></div>`;
      }).join('');
    }

    elNote.innerHTML = (cfg.note && cfg.note()) || '';
    if (selId != null) scrollRowIntoView();
  }

  const cssEsc = (v) => String(v).replace(/["\\]/g, '\\$&');

  /* ── 原地更新：狀態顏色、會跳動的文字、詳情卡
       只有「目前這張地圖」的地點有 DOM（圓點與清單列），所以也只 patch 它們 ── */
  function patch() {
    const cur = groups.find((g) => g.map.id === mapId);
    const total = groups.reduce((n, g) => n + g.pts.length, 0);
    elSummary.innerHTML = groups.length
      ? `<em>${groups.length}</em> 張地圖 · <em>${total}</em> 個${esc(unit)}`
        + (query ? '（符合搜尋）' : '（依目前篩選）')
      : '';
    if (!cur) return;

    for (const p of cur.pts) {
      const st = states[p.state] || {};
      const color = st.color || 'var(--blue,#4fc3f7)';
      const dot = elCanvas.querySelector(`.mx-dot[data-mxpt="${cssEsc(p.id)}"]`);
      if (dot) {
        dot.style.background = color;
        dot.className = `mx-dot mx-s-${p.state}` + (String(p.id) === String(selId) ? ' sel' : '');
      }
      const pdot = elGroups.querySelector(`.mx-pdot[data-mxdot="${cssEsc(p.id)}"]`);
      if (pdot) { pdot.style.background = color; pdot.className = `mx-pdot mx-s-${p.state}`; }
      const row = elGroups.querySelector(`.mx-point[data-mxpt="${cssEsc(p.id)}"]`);
      if (row) row.className = `mx-point mx-s-${p.state}` + (String(p.id) === String(selId) ? ' sel' : '');
      const live = elGroups.querySelector(`.mx-live[data-mxlive="${cssEsc(p.id)}"]`);
      if (live) live.textContent = p.live || '';
    }

    if (selId != null && cfg.tick) {
      const p = cur.pts.find((x) => String(x.id) === String(selId));
      const box = elGroups.querySelector(`.mx-detail[data-mxdetail="${cssEsc(selId)}"]`);
      if (p && box) cfg.tick(p, box);
    }
  }

  // 用 rect 差值算，不用 offsetTop——.mx-groups 沒有 position:relative，
  // offsetTop 會相對到更外層的祖先，捲到的位置會整個歪掉
  function scrollRowIntoView() {
    const row = elGroups.querySelector(`.mx-point[data-mxpt="${cssEsc(selId)}"]`);
    if (!row) return;
    const r = row.getBoundingClientRect();
    const c = elGroups.getBoundingClientRect();
    if (r.top < c.top || r.bottom > c.bottom) {
      elGroups.scrollTop += (r.top - c.top) - c.height / 3;
    }
  }

  /* ── 互動 ── */
  elSearch.addEventListener('input', () => {
    query = elSearch.value;
    elClear.hidden = !query;
    selId = null;
    render();
  });
  elClear.addEventListener('click', () => {
    elSearch.value = ''; query = ''; elClear.hidden = true; selId = null;
    render(); elSearch.focus();
  });

  elCanvas.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-mxpt]');
    if (!dot) return;
    selId = dot.dataset.mxpt;
    render();
  });

  elGroups.addEventListener('click', (e) => {
    // 詳情卡內的互動（複製座標、勾選產物…）交給頁面處理，處理掉就不再往下走
    const inDetail = e.target.closest('.mx-detail');
    if (inDetail && cfg.onAction && cfg.onAction(e, byId.get(inDetail.dataset.mxdetail))) return;

    const row = e.target.closest('.mx-point');
    if (row) {
      const id = row.dataset.mxpt;
      selId = String(selId) === String(id) ? null : id;   // 再點一次收合
      render();
      return;
    }
    const head = e.target.closest('.mx-ghead');
    if (head) {
      const id = Number(head.dataset.mxmap);
      if (mapId !== id) { mapId = id; selId = null; }
      render();
    }
  });

  return {
    render,
    /** 從外部選中某個地點（例如清單卡上的「📍 地圖」鈕）。找不到則忽略。 */
    select(id) {
      const p = (cfg.points() || []).find((x) => String(x.id) === String(id));
      if (!p) return false;
      if (query) { query = ''; elSearch.value = ''; elClear.hidden = true; }
      mapId = p.mapId; selId = String(id);
      render();
      return true;
    },
    getSelected() { return selId == null ? null : byId.get(String(selId)) || null; },
    /** 重畫並強制重建（版面尺寸／主題變動後用得到） */
    invalidate() { sig = ''; ordSig = ''; imgMap = null; render(); },
  };
}
