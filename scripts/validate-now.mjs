// 「現在能做什麼」回歸 — 改完 tools/now/ 或它吃的四份資料必跑。
//
// 這頁最容易錯的是**單位**，而且錯了畫面上看起來完全正常：
//   · 採集節點的 `duration` 是 **ET 分鐘**（120／180／240），寫成小時就變「持續 180 小時」
//   · 探索筆記的 `timeEnd` 是**含該小時**（頁面顯示 17–17 為 `ET 17:00–17:59`），
//     直接餵給 window-calc 的開區間 `endHour` 會讓 17–17 變成零長度視窗
//     （實測算出「開著但剩 272 小時」），8–11 則每次少算一小時。
// 兩種都不報錯，所以這裡逐一釘住視窗長度。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-now.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextWindows, statusOf, EORZEA_MULT } from '../assets/js/window-calc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const HTML = readFileSync(join(ROOT, 'tools/now/index.html'), 'utf8');
const EXPLOG = JSON.parse(readFileSync(join(ROOT, 'data/exploration-log.json'), 'utf8')).data;
const NODES = JSON.parse(readFileSync(join(ROOT, 'data/gathering.json'), 'utf8')).data;

const etHours = (w) => (w.we - w.ws) / 1000 * EORZEA_MULT / 3600;

// ── 單位一：探索筆記的 timeEnd 是含該小時 ───────────────────
{
  const now = Date.now();
  const cases = [
    [17, 17, 1, '17–17 是「17 點那一小時」，不是零長度'],
    [8, 11, 4, '8–11 含 11 點那一小時（8/9/10/11）'],
    [18, 4, 11, '跨午夜：18 點到隔天 4 點含 4 點那一小時'],
    [5, 7, 3, '5–7 共三小時'],
  ];
  for (const [s, e, want, why] of cases) {
    const w = nextWindows({ startHour: s, endHour: e + 1, weather: { mapId: null, keys: [], prevKeys: [] } }, now, { max: 1 });
    const got = w.length ? Math.round(etHours(w[0])) : 0;
    push(`ET ${s}–${e} 的視窗是 ${want} ET 小時`, got === want, `算出 ${got} 小時　${why}`);
  }
  // 頁面真的有做 +1 這件事
  push('頁面有把 timeEnd +1 再餵給 window-calc', /endHour:\s*g\.e\s*\+\s*1/.test(HTML),
    (HTML.match(/endHour:\s*g\.e[^,]*/) || ['(找不到)'])[0]);
  // 這個 7 筆的退化案例真的存在於資料裡（資料變了就該重看這條）
  const same = EXPLOG.filter((x) => x.timeStart != null && x.timeStart === x.timeEnd);
  push('  資料裡真的有 start===end 的條目（所以這條不是杞人憂天）', same.length > 0,
    same.length + ' 筆，例：' + same.slice(0, 2).map((x) => x.name).join('、'));
}

// ── 單位二：節點 duration 是 ET 分鐘 ────────────────────────
{
  const durs = [...new Set(NODES.filter((n) => n.spawns && n.spawns.length).map((n) => n.duration))].sort((a, b) => a - b);
  push('節點 duration 看起來是分鐘（120／180／240）', durs.every((d) => d >= 120 && d % 60 === 0),
    durs.join('、'));
  push('  頁面有除以 60 再顯示成小時', /\(n\.duration \|\| 0\) \/ 60/.test(HTML),
    (HTML.match(/持續 '[^;]*/) || ['(找不到)'])[0].slice(0, 60));
  const n = NODES.find((x) => x.spawns && x.spawns.length && x.duration === 180);
  const w = nextWindows({ spawns: n.spawns, duration: n.duration }, Date.now(), { max: 1 });
  push('  duration 180 算出來是 3 ET 小時', w.length && Math.round(etHours(w[0])) === 3,
    w.length ? Math.round(etHours(w[0])) + ' 小時' : '(無視窗)');
}

// ── 只列使用者標記過的 ───────────────────────────────────
{
  push('讀的是釣魚頁的目標魚 key', HTML.includes('ffxiv_fishing_targets'), '');
  push('讀的是限時採集頁的追蹤 key', HTML.includes('ffxiv_gathering_tracked'), '');
  push('全天開放的魚會被排除（不必等的不列）',
    /if \(!timed && !wk\.length && !pk\.length\) continue;/.test(HTML), '');
  push('沒有時間窗的節點會被排除', /if \(!n\.spawns \|\| !n\.spawns\.length\) continue;/.test(HTML), '');
  // 按需載入（2026-10-03）：沒標就不抓；探索筆記一律要抓（列的是「還沒完成」的）
  push('沒標目標魚就不載 fishes／fishing-spots',
    /wantFish\.size \? fetch\('\.\.\/\.\.\/data\/fishes\.json'\)/.test(HTML) &&
    /wantFish\.size \? fetch\('\.\.\/\.\.\/data\/fishing-spots\.json'\)/.test(HTML), '');
  push('沒追蹤節點就不載 gathering', /wantNode\.size \? fetch\('\.\.\/\.\.\/data\/gathering\.json'\)/.test(HTML), '');
  push('  探索筆記不設條件（什麼都沒勾的人反而最需要）',
    /^\s*fetch\('\.\.\/\.\.\/data\/exploration-log\.json'\)/m.test(HTML), '');
}

// ── 探索筆記要合併，且排在使用者標記的後面 ──────────────────
{
  const timed = EXPLOG.filter((x) => x.timeStart != null && x.timeEnd != null);
  const windows = new Set(timed.map((x) => x.timeStart + '-' + x.timeEnd));
  push('未完成探索筆記合併成「一個時窗一列」', /logByWindow/.test(HTML),
    `${timed.length} 條限時條目只會變成 ${windows.size} 列`);
  push('  合併是必要的（不合併會蓋掉使用者標記的目標）', timed.length / windows.size > 5,
    `平均一個時窗 ${(timed.length / windows.size).toFixed(1)} 條`);
  push('  排序讓使用者標記的（prio 0）排在探索筆記（prio 1）前面',
    /\(a\.it\.prio \|\| 0\) - \(z\.it\.prio \|\| 0\)/.test(HTML), '');
}

// ── 視窗計算一律走共用層，不可自己再寫一份 ────────────────
{
  push('視窗計算來自 window-calc.js', /from '\.\.\/\.\.\/assets\/js\/window-calc\.js'/.test(HTML), '');
  push('  天氣 key 對照表也用共用的（沒有在這頁再抄一份）',
    /weatherKeys/.test(HTML) && !/EN_TO_KEY\s*=/.test(HTML), '');
  push('  有先載天氣表（不然看天氣的魚全會變成「算不出」）',
    /initWeatherTables\('\.\.\/\.\.\/data\/maps\.json'\)/.test(HTML), '');
  push('  沒有自己寫 statusOf／nextWindows', !/function (statusOf|nextWindows)\b/.test(HTML), '');
}

// ── 算不出視窗的要單獨一段，不能混進「稍後」 ────────────────
push('算不出時間窗的單獨列出（不假裝知道）',
  /state === 'none'/.test(HTML) && /算不出時間窗/.test(HTML), '');
push('  並講明「不是不會開」', /不是「不會開」/.test(HTML), '');

// ── 不是鬧鐘，要講清楚 ─────────────────────────────────
push('頁面講明這不是鬧鐘', /不是鬧鐘/.test(HTML), '');
push('空狀態會教人去哪標記', /還沒有標記任何限時目標/.test(HTML) && /tools\/fishing\//.test(HTML), '');

// ══ 重置倒數與例行清單（2026-11-23，tools/now/reset-clock.js）══════════════
// 會安靜出錯的地方：①重置時刻差一小時或差一天（時區、週幾）——倒數照跑、看不出錯
// ②打勾沒在重置時清掉／清錯週期 ③清單每秒重畫吃掉打字與焦點 ④內建項目混進官網沒寫重置時間的東西（鐵則：不憑印象）
{
  const RC = await import('../tools/now/reset-clock.js');
  const H = 3600000, TW = 8 * H;
  const twParts = (ms) => { const d = new Date(ms + TW); return { day: d.getUTCDay(), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() }; };

  // ① 時刻：每日 23:00、每週二 16:00（UTC+8）。官網原文就是這兩個——常數與畫面文字都要對得上
  push('重置：每日 23:00（UTC+8）＝UTC 15:00', RC.DAILY_UTC_MS === 15 * H && /23:00（UTC\+8）/.test(RC.SOURCES.d.when) && /每日 23:00（UTC\+8）/.test(RC.SOURCES.d.quote), RC.SOURCES.d.when);
  push('  每週二 16:00（UTC+8）', /週二 16:00（UTC\+8）/.test(RC.SOURCES.w.when) && /每週二下午4點（UTC\+08:00）/.test(RC.SOURCES.w.quote), RC.SOURCES.w.when);
  push('  出處連到台服官網的遊戲手冊', /^https:\/\/www\.ffxiv\.com\.tw\/web\/intro\/guide\/game_manual\//.test(RC.SOURCES.d.href) && /^https:\/\/www\.ffxiv\.com\.tw\/web\/intro\/guide\/game_manual\//.test(RC.SOURCES.w.href), '');
  let badD = 0, badW = 0;
  for (let i = 0; i < 400; i++) {
    const t = Date.UTC(2024, 0, 1) + Math.floor(i * 7919.3 * H) + i * 61001;   // 跨 2024–2027、各種時分秒（含錨點之前）
    const nd = RC.nextReset('d', t), nw = RC.nextReset('w', t), pd = twParts(nd), pw = twParts(nw);
    if (!(nd > t && nd - t <= 86400000 && pd.h === 23 && pd.m === 0 && pd.s === 0)) badD++;
    if (!(nw > t && nw - t <= 7 * 86400000 && pw.day === 2 && pw.h === 16 && pw.m === 0 && pw.s === 0)) badW++;
    if (RC.lastReset('d', t) > t || RC.lastReset('w', t) > t) { badD++; badW++; }
  }
  push('  400 個時刻：下次每日重置都是台北 23:00 整、24 小時內', badD === 0, badD + ' 個不對');
  push('  400 個時刻：下次每週重置都是台北週二 16:00 整、7 天內（含錨點之前的日期）', badW === 0, badW + ' 個不對');
  const edge = Date.UTC(2026, 10, 24, 8, 0, 0);      // 2026-11-24（二）16:00 台北
  push('  剛好在重置那一刻：上一次＝此刻、下一次＝下週', RC.lastReset('w', edge) === edge && RC.nextReset('w', edge) === edge + 7 * 86400000 &&
    RC.nextReset('w', edge - 1) === edge, '');

  // ④ 內建項目只收「重置時間有出處」的：官網寫了的兩個＋站主 2026-11-24 確認的四個（第四輪 §5-5）。
  //    理符配額、軍需品調達、仙彩沒有確認——混進來就是憑印象（鐵則）。週期要逐項對，錯一個使用者就會以為做完了。
  const WANT = { 'p:roulette': ['d', 'site'], 'p:challenge': ['w', 'site'], 'p:minicactpot': ['d', 'owner'], 'p:tribe-daily': ['d', 'owner'],
    'p:wondrous-tails': ['w', 'owner'], 'p:masked-carnivale': ['w', 'owner'] };
  push('內建建議＝官網的 2 項＋站主確認的 4 項，週期與出處逐項對', RC.PRESETS.length === 6 &&
    RC.PRESETS.every((p) => WANT[p.id] && WANT[p.id][0] === p.p && WANT[p.id][1] === p.by), RC.PRESETS.map((p) => `${p.name}(${p.p}/${p.by})`).join('、'));
  push('  沒有確認過的（理符配額、軍需品調達、仙彩）不內建', !RC.PRESETS.some((p) => /理符|軍需|^仙彩/.test(p.name)));
  push('  站主確認的日期有記（畫面講出處用）', /^\d{4}-\d{2}-\d{2}$/.test(RC.OWNER_CONFIRMED || ''));

  // ── DOM（jsdom）──
  const { JSDOM } = await import('jsdom');
  const mk = (init = {}) => {
    const dom = new JSDOM('<!DOCTYPE html><body><div id="h"></div></body>', { url: 'https://seagod99.github.io/tools/now/' });
    const store = new Map(Object.entries(init));
    let failSet = false;
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { if (failSet) throw new Error('QuotaExceeded'); store.set(k, String(v)); } };
    const clock = { t: Date.UTC(2026, 10, 23, 12, 0, 0) };   // 台北 11/23（一）20:00
    const toasts = [];
    const toast = { action: (msg, o) => { toasts.push({ msg, o }); return dom.window.document.createElement('div'); } };
    const host = dom.window.document.getElementById('h');
    const api = RC.mountRoutine(host, { storage, now: () => clock.t, toast, tzOffsetMin: -480 });
    return { dom, host, api, store, clock, toasts, setFail: (v) => { failSet = v; }, saved: () => JSON.parse(store.get(RC.STORAGE_KEY) || 'null') };
  };
  const ev = (w, el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));

  {
    const { dom, host, api, clock, saved } = mk();
    const w = dom.window;
    push('清單：空的時候兩張卡都有倒數與空狀態說明、每個內建建議一顆鈕', host.querySelectorAll('.rc-card').length === 2 &&
      host.querySelector('[data-cd="d"]').textContent === '3 小時 0 分' && host.querySelectorAll('.rc-empty').length === 2 &&
      host.querySelectorAll('.rc-chip').length === RC.PRESETS.length, host.querySelector('[data-cd="d"]').textContent + '／' + host.querySelector('[data-cd="w"]').textContent);
    push('  出處段落講明哪些是站主確認、哪些沒確認', /站主在遊戲內確認/.test(host.querySelector('.rc-src').textContent) &&
      /理符配額、軍需品調達、仙彩沒有確認/.test(host.querySelector('.rc-src').textContent));
    push('  台北時區的人不另外顯示「你的時間」', !host.querySelector('.rc-local'));

    host.querySelector('[data-preset="p:roulette"]').click();
    host.querySelector('[data-preset="p:challenge"]').click();
    let s = saved();
    push('  按建議鈕：加進對應週期的卡、存進 ffxiv_now_routine、按過的建議鈕消失', s && s.items.length === 2 &&
      host.querySelector('.rc-card[data-p="d"] input[data-id="p:roulette"]') && host.querySelector('.rc-card[data-p="w"] input[data-id="p:challenge"]') &&
      !host.querySelector('[data-preset="p:roulette"]') && !host.querySelector('[data-preset="p:challenge"]') &&
      host.querySelectorAll('.rc-chip').length === RC.PRESETS.length - 2, JSON.stringify(s && s.items));
    host.querySelector('[data-preset="p:masked-carnivale"]').click();
    push('  假面狂歡每週目標加進「每週」那張卡（站主確認是週二 16:00，不是青魔頁的 17:00）',
      !!host.querySelector('.rc-card[data-p="w"] input[data-id="p:masked-carnivale"]'));
    { const cb = host.querySelector('input[data-id="p:masked-carnivale"]'); if (cb) { cb.closest('.rc-item').querySelector('.rc-del')?.click(); } }

    for (const id of ['p:roulette', 'p:challenge']) {
      const cb = host.querySelector('input[data-id="' + id + '"]');
      cb.checked = true; ev(w, cb, 'change');
    }
    s = saved();
    push('  打勾：記下打勾的時刻（不是 true/false）、畫面劃掉', s.done['p:roulette'] === clock.t && s.done['p:challenge'] === clock.t &&
      host.querySelectorAll('.rc-item.done').length === 2 && w.document.activeElement === host.querySelector('input[data-id="p:challenge"]'), JSON.stringify(s.done));

    // ③ 每秒 tick 不重畫清單：打到一半的字與焦點都在
    const input = host.querySelector('.rc-input');
    input.focus(); input.value = '天書奇';
    clock.t += 1000; api.tick();
    push('③ 每秒 tick 只改倒數，不重畫清單（打到一半的字與焦點都還在）', host.querySelector('.rc-input') === input && input.value === '天書奇' &&
      w.document.activeElement === input && host.querySelector('[data-cd="d"]').textContent === '2 小時 59 分', host.querySelector('[data-cd="d"]').textContent);

    // ② 跨過每日重置：每日的清掉、每週的留著；打到一半的字跨過重置也保留
    clock.t = Date.UTC(2026, 10, 23, 15, 0, 1);   // 台北 23:00:01
    api.tick();
    push('② 跨過每日重置：每日項目的勾清掉、每週的留著', !host.querySelector('input[data-id="p:roulette"]').checked &&
      host.querySelector('input[data-id="p:challenge"]').checked, '');
    push('  跨過重置時整塊重畫，但新增框打到一半的字還在', host.querySelector('.rc-input').value === '天書奇' && w.document.activeElement === host.querySelector('.rc-input'));
    clock.t = Date.UTC(2026, 10, 24, 8, 0, 0);    // 台北 11/24（二）16:00
    api.tick();
    push('  跨過每週重置（週二 16:00）：每週項目的勾也清掉', !host.querySelector('input[data-id="p:challenge"]').checked, '');
    host.querySelector('input[data-id="p:roulette"]').checked = true; ev(w, host.querySelector('input[data-id="p:roulette"]'), 'change');
    push('  存檔時清掉過期的打勾紀錄（只留這一期的）', Object.keys(saved().done).join() === 'p:roulette', JSON.stringify(saved().done));

    // 自訂項目：空白不收、同卡同名不重複、長度上限、週期照選的
    const add = (name, p) => { host.querySelector('.rc-input').value = name; host.querySelector('.rc-period').value = p; ev(w, host.querySelector('.rc-add'), 'submit'); };
    add('   ', 'd');
    add('天書奇談', 'w'); add('天書奇談', 'w'); add('天書奇談', 'd');
    add('一'.repeat(50), 'd');
    s = saved();
    const tales = s.items.filter((x) => x.name === '天書奇談');
    push('自訂項目：空白不收、同一張卡同名不重複（兩張卡可各一個）、名稱截到 30 字', s.items.length === 5 && tales.length === 2 &&
      tales.some((x) => x.p === 'w') && tales.some((x) => x.p === 'd') && s.items.some((x) => x.name.length === 30), s.items.map((x) => x.p + ':' + x.name.length).join(' '));
    push('  加完焦點回到新增框、週期選單維持剛剛選的', w.document.activeElement === host.querySelector('.rc-input') && host.querySelector('.rc-period').value === 'd');
  }

  {
    // 11-24 以前內建只有兩項：自己手打過「天書奇談（每週）」的人（自訂 id），建議裡不要再出現同一張卡的同名那顆（按下去會多一筆一樣的）；
    // 放在別張卡的同名不算（兩張卡可各一個，與自訂項目同一條規則）
    const seed = (items) => ({ [RC.STORAGE_KEY]: JSON.stringify({ v: 1, items, done: {} }) });
    const { host } = mk(seed([{ id: 'u:1', name: '天書奇談', p: 'w' }]));
    push('  同一張卡上自己加過同名的，內建建議不再列它（id 不同也算）', !host.querySelector('[data-preset="p:wondrous-tails"]') &&
      host.querySelectorAll('.rc-chip').length === RC.PRESETS.length - 1, [...host.querySelectorAll('.rc-chip')].map((b) => b.textContent).join('、'));
    const { host: h2 } = mk(seed([{ id: 'u:1', name: '天書奇談', p: 'd' }]));
    push('  同名但在另一張卡（每日）的不算，每週的建議照列', !!h2.querySelector('[data-preset="p:wondrous-tails"]'));
  }

  {
    // 刪除＋復原
    const { dom, host, toasts, saved } = mk();
    const w = dom.window;
    host.querySelector('[data-preset="p:roulette"]').click();
    const add = (name) => { host.querySelector('.rc-input').value = name; ev(w, host.querySelector('.rc-add'), 'submit'); };
    add('老主顧'); add('雇員');
    const cb = host.querySelector('input[data-id="p:roulette"]'); cb.checked = true; ev(w, cb, 'change');
    host.querySelector('[data-del="p:roulette"]').click();
    const after = saved();
    push('刪除：從存檔拿掉、焦點移到同一張卡的下一項、跳出「復原」提示', !after.items.some((x) => x.id === 'p:roulette') && !('p:roulette' in after.done) &&
      toasts.length === 1 && toasts[0].o.label === '復原' && w.document.activeElement && w.document.activeElement.getAttribute('data-id') === after.items[0].id,
      toasts[0] && toasts[0].msg);
    toasts[0].o.onClick();
    const back = saved();
    push('  按復原：回到原本的位置、連打勾狀態一起回來', back.items[0].id === 'p:roulette' && back.done['p:roulette'] != null &&
      host.querySelector('input[data-id="p:roulette"]').checked, back.items.map((x) => x.name).join('、'));
  }

  {
    // 存不進去要講出來，畫面不可以假裝勾成功
    const { dom, host, setFail } = mk();
    const w = dom.window;
    host.querySelector('[data-preset="p:roulette"]').click();
    setFail(true);
    const cb = host.querySelector('input[data-id="p:roulette"]'); cb.checked = true; ev(w, cb, 'change');
    push('存檔失敗：講出來（role=alert），而且畫面上沒有勾起來', /存不進去/.test(host.querySelector('.rc-err[role="alert"]')?.textContent || '') &&
      !host.querySelector('input[data-id="p:roulette"]').checked, '');
  }

  {
    // 壞掉的存檔不可以讓整頁掛掉；非台北時區要附當地時間
    const dom = new JSDOM('<!DOCTYPE html><body><div id="h"></div></body>');
    const host = dom.window.document.getElementById('h');
    const storage = { getItem: () => '{這不是 JSON', setItem() {} };
    let threw = false;
    try { RC.mountRoutine(host, { storage, now: () => Date.UTC(2026, 10, 23, 12, 0, 0), toast: null, tzOffsetMin: 0 }); } catch (e) { threw = true; }
    push('壞掉的存檔當成空的、不丟例外', !threw && host.querySelectorAll('.rc-empty').length === 2);
    push('  UTC 時區的人：每日重置另附「你的時間 一 15:00」', /你的時間 一 15:00/.test(host.querySelector('.rc-card[data-p="d"] .rc-local')?.textContent || ''),
      host.querySelector('.rc-card[data-p="d"] .rc-local')?.textContent);
  }

  push('頁面：重置區獨立掛在 #resetBox（不跟著每秒整塊重畫的 #body）、每秒呼叫 tick、不等資料載入',
    /<div id="resetBox"><\/div>/.test(HTML) && /mountRoutine\(document\.getElementById\('resetBox'\)\)/.test(HTML) &&
    /setInterval\(routine\.tick, 1000\)/.test(HTML) && HTML.indexOf("mountRoutine(document") < HTML.indexOf('load().then('), '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
