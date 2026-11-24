/* reset-clock.js —「現在能做什麼」的重置倒數＋例行清單（2026-11-23）
 *
 * ── 重置時間只用台服官網有寫的兩個 ─────────────────────────────────
 *   每日 23:00（UTC+8）  遊戲手冊・任務搜尋器：隨機任務的獎勵「每日可領一次（於每日 23:00（UTC+8）更新）」
 *   每週二 16:00（UTC+8）遊戲手冊・管理筆記：「挑戰進度會在每週二下午4點（UTC+08:00）進行重置。」
 *                        （7.3 更新筆記的每週限制也寫「每週二16:00重置」）
 * 2026-11-23 逐頁讀過的官網：理符配額、軍需品調達、仙人微彩／仙彩、天書奇談、部族每日任務都**沒寫重置時間**。
 * **2026-11-24 站主確認**（第四輪 §5-5）：仙人微彩、部族每日任務跟每日 23:00；天書奇談、假面狂歡每週目標跟每週二 16:00
 *   （官網青魔頁寫「每週二17:00（地球時間）」，站主確認是 16:00）。這四項加進內建建議，畫面上註明出處是站主確認、不是官網。
 *   **理符配額、軍需品調達、仙彩沒有確認**跟著這兩個時間，仍不內建——使用者自己加、自己選（鐵則：不憑印象）。
 *   時刻本身仍然只有官網寫的兩個；要加別的時刻（例如每 12 小時）得先有出處。
 *
 * 一律用 UTC 算：23:00 UTC+8 ＝ UTC 15:00；週二 16:00 UTC+8 ＝ 週二 UTC 08:00。
 * 不在 UTC+8 的人也算得對（畫面另附當地時間）。台灣沒有夏令時，所以全年固定。
 *
 * ── 例行清單：記「打勾的時間」，不記「有沒有勾」 ─────────────────────
 * 一項算完成 ⇔ 打勾時間 ≥ 該週期的上一次重置。所以**不需要計時器去清空**，
 * 關掉頁面隔天再開、或在別的分頁打勾，結果都一定對。存檔 `ffxiv_now_routine`：
 *   { v: 1, items: [{ id, name, p: 'd'|'w' }], done: { id: 打勾時刻 } }
 * key 是 `ffxiv_` 開頭（首頁全站備份掃得到），多角色設定檔預設把它當角色態——每隻角色各一份清單，這是對的。
 */

export const DAY = 86400000;
export const WEEK = 7 * DAY;
export const DAILY_UTC_MS = 15 * 3600000;                    // 每日 23:00 UTC+8
export const WEEKLY_ANCHOR = Date.UTC(2026, 5, 30, 8, 0, 0); // 2026-06-30（二）16:00 UTC+8，任何一個週二都可以
export const STORAGE_KEY = 'ffxiv_now_routine';
export const NAME_MAX = 30;

export const SOURCES = {
  d: { label: '每日重置', when: '每天 23:00（UTC+8）', href: 'https://www.ffxiv.com.tw/web/intro/guide/game_manual/pp/index.html',
       cite: '遊戲手冊・任務搜尋器', quote: '隨機任務的獎勵…每日可領一次（於每日 23:00（UTC+8）更新）' },
  w: { label: '每週重置', when: '每週二 16:00（UTC+8）', href: 'https://www.ffxiv.com.tw/web/intro/guide/game_manual/view/index.html',
       cite: '遊戲手冊・管理筆記', quote: '挑戰進度會在每週二下午4點（UTC+08:00）進行重置' },
};
// 內建建議：重置時間有出處的。`by`＝出處（官網原文／站主確認）。不預先塞進清單（這頁只列使用者自己標的東西）
export const PRESETS = [
  { id: 'p:roulette', name: '隨機任務獎勵', p: 'd', by: 'site' },
  { id: 'p:minicactpot', name: '仙人微彩', p: 'd', by: 'owner' },
  { id: 'p:tribe-daily', name: '部族每日任務', p: 'd', by: 'owner' },
  { id: 'p:challenge', name: '挑戰筆記', p: 'w', by: 'site' },
  { id: 'p:wondrous-tails', name: '天書奇談', p: 'w', by: 'owner' },
  { id: 'p:masked-carnivale', name: '假面狂歡每週目標', p: 'w', by: 'owner' },
];
export const OWNER_CONFIRMED = '2026-11-24';   // 站主確認上面 by: 'owner' 那幾項的日期

/** 下一次重置的時刻（嚴格大於 now） */
export function nextReset(p, now) {
  if (p === 'd') return Math.floor((now - DAILY_UTC_MS) / DAY) * DAY + DAILY_UTC_MS + DAY;
  return WEEKLY_ANCHOR + (Math.floor((now - WEEKLY_ANCHOR) / WEEK) + 1) * WEEK;
}
/** 上一次重置的時刻（≤ now） */
export function lastReset(p, now) { return nextReset(p, now) - (p === 'd' ? DAY : WEEK); }
export function isDone(item, done, now) {
  const t = done && done[item.id];
  return typeof t === 'number' && t >= lastReset(item.p, now);
}

export function fmtLeft(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  if (d > 0) return d + ' 天 ' + h + ' 小時';
  if (h > 0) return h + ' 小時 ' + m + ' 分';
  return m + ' 分 ' + (s % 60) + ' 秒';
}

export function readRoutine(storage) {
  try {
    const r = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (r && Array.isArray(r.items)) {
      const items = r.items.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && (x.p === 'd' || x.p === 'w'));
      return { v: 1, items, done: (r.done && typeof r.done === 'object') ? r.done : {} };
    }
  } catch (e) { /* 壞掉的存檔當成空的，不要整頁掛掉 */ }
  return { v: 1, items: [], done: {} };
}
/** 存檔；順手清掉已經過期（上一次重置之前）或項目已刪的打勾紀錄。回傳是否存成功 */
export function saveRoutine(storage, r, now) {
  const done = {};
  for (const it of r.items) if (isDone(it, r.done, now)) done[it.id] = r.done[it.id];
  try { storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, items: r.items, done })); r.done = done; return true; }
  catch (e) { return false; }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 掛到 host 上。storage／now／toast 可注入（回歸測試用）。
 * 回傳 { render, tick }；呼叫端每秒呼叫 tick()——它只改倒數文字，跨過重置時才整塊重畫（清單才不會吃掉焦點）。
 */
export function mountRoutine(host, opts = {}) {
  const storage = opts.storage || window.localStorage;
  const now = opts.now || (() => Date.now());
  const getToast = () => opts.toast !== undefined ? opts.toast : (window.Toast || null);
  const doc = host.ownerDocument;
  const localOffsetMin = opts.tzOffsetMin != null ? opts.tzOffsetMin : new Date().getTimezoneOffset();
  let rendered = { d: 0, w: 0 };
  let err = '';
  let undoEl = null;

  const localTime = (ms) => {
    if (localOffsetMin === -480) return '';             // 本來就在 UTC+8，不必再寫一次
    const d = new Date(ms - localOffsetMin * 60000);    // 以使用者的時區顯示（偏移可注入，測試才穩）
    const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
    return '＝你的時間 ' + ['日', '一', '二', '三', '四', '五', '六'][d.getUTCDay()] + ' ' + hh + ':' + mm;
  };

  function card(p, r, t) {
    const src = SOURCES[p];
    const list = r.items.filter((x) => x.p === p);
    const doneN = list.filter((x) => isDone(x, r.done, t)).length;
    const nx = nextReset(p, t);
    const lt = localTime(nx);
    return '<div class="rc-card" data-p="' + p + '">' +
      '<div class="rc-head">' +
        '<span class="rc-name">' + src.label + '</span>' +
        '<span class="rc-when">' + src.when + (lt ? '<span class="rc-local">' + esc(lt) + '</span>' : '') + '</span>' +
        '<span class="rc-cd">還有 <b data-cd="' + p + '">' + fmtLeft(nx - t) + '</b></span>' +
      '</div>' +
      (list.length
        ? '<div class="rc-n">' + doneN + '／' + list.length + ' 完成</div><ul class="rc-list">' + list.map((x) => {
            const ok = isDone(x, r.done, t);
            return '<li class="rc-item' + (ok ? ' done' : '') + '">' +
              '<label><input type="checkbox" data-id="' + esc(x.id) + '"' + (ok ? ' checked' : '') + '> <span>' + esc(x.name) + '</span></label>' +
              '<button type="button" class="rc-del" data-del="' + esc(x.id) + '" aria-label="刪除「' + esc(x.name) + '」">✕</button></li>';
          }).join('') + '</ul>'
        : '<p class="rc-empty">還沒有' + (p === 'd' ? '每日' : '每週') + '項目。打勾之後，到下次' + src.label.replace('重置', '') + '重置自動清掉。</p>') +
      '</div>';
  }

  function render(focusSel) {
    const t = now();
    const r = readRoutine(storage);
    rendered = { d: lastReset('d', t), w: lastReset('w', t) };
    const have = new Set(r.items.map((x) => x.id));
    // 同一張卡上已有同名的也不建議（與「同一張卡同名不重複」同一條規則）：11-24 以前內建只有兩項，
    // 自己加過「天書奇談（每週）」的人 id 是自訂的，按下去會在同一張卡多一筆一樣的
    const haveName = new Set(r.items.map((x) => x.p + '|' + x.name));
    const sug = PRESETS.filter((x) => !have.has(x.id) && !haveName.has(x.p + '|' + x.name));
    host.innerHTML =
      '<section class="rc" aria-labelledby="rcTitle">' +
        '<h2 class="rc-title" id="rcTitle">⏳ 重置倒數與例行清單</h2>' +
        '<div class="rc-cards">' + card('d', r, t) + card('w', r, t) + '</div>' +
        '<form class="rc-add" novalidate>' +
          '<input type="text" class="rc-input" maxlength="' + NAME_MAX + '" placeholder="自己加一項例行事" aria-label="新項目名稱">' +
          '<select class="rc-period" aria-label="重置週期"><option value="d">每日</option><option value="w">每週</option></select>' +
          '<button type="submit" class="rc-btn">＋ 加入</button>' +
        '</form>' +
        (err ? '<p class="rc-err" role="alert">' + esc(err) + '</p>' : '') +
        (sug.length ? '<div class="rc-sug"><span>內建建議：</span>' + sug.map((x) =>
          '<button type="button" class="rc-chip" data-preset="' + x.id + '">＋ ' + esc(x.name) + '（' + (x.p === 'd' ? '每日' : '每週') + '）</button>').join('') + '</div>' : '') +
        '<p class="rc-src">重置時間出自台服官網：<a href="' + SOURCES.d.href + '" target="_blank" rel="noopener">' + SOURCES.d.cite + '</a>' +
          '（「' + SOURCES.d.quote + '」）、<a href="' + SOURCES.w.href + '" target="_blank" rel="noopener">' + SOURCES.w.cite + '</a>' +
          '（「' + SOURCES.w.quote + '」）。仙人微彩、部族每日任務、天書奇談、假面狂歡每週目標的重置時間官網沒寫，' +
          '是站主在遊戲內確認跟著這兩個時間（' + OWNER_CONFIRMED + '）；理符配額、軍需品調達、仙彩沒有確認，本站不替你判斷——' +
          '自己加的項目由你選每日或每週。打勾記在這台裝置的瀏覽器，跟著角色走。</p>' +
      '</section>';
    err = '';
    if (focusSel) { const el = host.querySelector(focusSel); if (el) el.focus(); }
  }

  function tick() {
    const t = now();
    // 跨過重置：整塊重畫（打勾要清掉）；否則只改倒數文字，不碰清單，打字與焦點不受影響
    if (lastReset('d', t) !== rendered.d || lastReset('w', t) !== rendered.w) {
      const a = doc.activeElement;
      const keep = a && host.contains(a) ? (a.classList.contains('rc-input') ? '.rc-input' : null) : null;
      const typed = keep ? a.value : '';
      render(keep);
      if (keep) host.querySelector('.rc-input').value = typed;
      return;
    }
    for (const p of ['d', 'w']) {
      const el = host.querySelector('[data-cd="' + p + '"]');
      if (el) el.textContent = fmtLeft(nextReset(p, t) - t);
    }
  }

  function mutate(fn, focusSel) {
    const t = now();
    const r = readRoutine(storage);
    fn(r, t);
    // 存檔失敗時講出來；render() 讀的是「真正存著的」，所以畫面不會假裝勾成功
    if (!saveRoutine(storage, r, t)) err = '存不進去：瀏覽器的儲存空間可能滿了，或這個分頁不允許存資料。';
    render(focusSel);
  }

  host.addEventListener('change', (e) => {
    const cb = e.target.closest && e.target.closest('input[type="checkbox"][data-id]');
    if (!cb) return;
    const id = cb.getAttribute('data-id');
    mutate((r, t) => { if (cb.checked) r.done[id] = t; else delete r.done[id]; }, 'input[data-id="' + id + '"]');
  });
  host.addEventListener('click', (e) => {
    const del = e.target.closest && e.target.closest('[data-del]');
    if (del) {
      const id = del.getAttribute('data-del');
      const r0 = readRoutine(storage);
      const idx = r0.items.findIndex((x) => x.id === id);
      if (idx < 0) return;
      const removed = r0.items[idx], doneAt = r0.done[id];
      // 刪完焦點移到同一張卡的下一項，沒有就回新增框（不要讓焦點掉回 body）
      const sameP = r0.items.filter((x) => x.p === removed.p);
      const nextItem = sameP[sameP.indexOf(removed) + 1] || sameP[sameP.indexOf(removed) - 1];
      mutate((r) => { r.items = r.items.filter((x) => x.id !== id); delete r.done[id]; },
        nextItem ? 'input[data-id="' + nextItem.id + '"]' : '.rc-input');
      const Toast = getToast();
      if (Toast && Toast.action) {
        if (undoEl && undoEl.parentNode) undoEl.parentNode.removeChild(undoEl);
        undoEl = Toast.action('已刪除「' + removed.name + '」', {
          label: '復原', key: 'rc-undo',
          onClick: () => mutate((r) => {
            if (r.items.some((x) => x.id === id)) return;
            r.items.splice(Math.min(idx, r.items.length), 0, removed);
            if (doneAt != null) r.done[id] = doneAt;
          }, 'input[data-id="' + id + '"]'),
        });
      }
      return;
    }
    const pre = e.target.closest && e.target.closest('[data-preset]');
    if (pre) {
      const p = PRESETS.find((x) => x.id === pre.getAttribute('data-preset'));
      if (p) mutate((r) => { if (!r.items.some((x) => x.id === p.id)) r.items.push({ id: p.id, name: p.name, p: p.p }); },
        'input[data-id="' + p.id + '"]');
    }
  });
  host.addEventListener('submit', (e) => {
    if (!e.target.classList || !e.target.classList.contains('rc-add')) return;
    e.preventDefault();
    const input = host.querySelector('.rc-input');
    const p = host.querySelector('.rc-period').value === 'w' ? 'w' : 'd';
    const name = (input.value || '').trim().slice(0, NAME_MAX);
    if (!name) { input.focus(); return; }
    mutate((r, t) => {
      if (r.items.some((x) => x.p === p && x.name === name)) return;     // 同一張卡不重複
      r.items.push({ id: 'u:' + t.toString(36) + Math.floor(Math.random() * 1296).toString(36), name, p });
    }, '.rc-input');
    // 連續加好幾項時，週期選單維持剛剛選的
    const sel = host.querySelector('.rc-period');
    if (sel) sel.value = p;
  });

  render();
  return { render, tick };
}
