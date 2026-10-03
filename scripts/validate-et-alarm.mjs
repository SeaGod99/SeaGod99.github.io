// 鬧鐘回歸 — 改完 assets/js/et-alarm.js、或釣魚／限時採集／天氣任一頁的鬧鐘接線必跑。
//
// ── 為什麼需要這支 ────────────────────────────────────────────────
// **鬧鐘的錯誤是「該響沒響」，畫面上完全看不出來。** 而且這裡有一個實際發生過的
// 更安靜的失敗：`et-alarm.js` 寫好了、CLAUDE.md 與知識庫都宣稱兩頁「已收斂成薄包裝」，
// 但**沒有任何一頁載它**——它整支是死碼，兩頁各自留著自己的鬧鐘。
// 所以這支的第一件事就是「檔案真的被載了、而且沒有人自己再寫一份」。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-et-alarm.mjs

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const ENGINE = readFileSync(join(ROOT, 'assets/js/et-alarm.js'), 'utf8');
const PAGES = {
  釣魚: 'tools/fishing/index.html',
  限時採集: 'tools/gathering/index.html',
  天氣: 'tools/weather/index.html',
};

// ── ① 引擎真的被載了，而且沒有人自己再寫一份 ────────────
for (const [label, rel] of Object.entries(PAGES)) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  push(`${label}頁載了 et-alarm.js`, /assets\/js\/et-alarm\.js/.test(html), rel);
  push(`  ${label}頁用 ETAlarm.create()`, /ETAlarm\.create\(/.test(html), '');
  /* 自己寫一份的徵狀：頁內出現 createOscillator（音效）或自己的去重表。
     引擎接上之後這兩樣都該只存在於 et-alarm.js。 */
  push(`  ${label}頁沒有自己的音效實作`, !/createOscillator/.test(html),
    /createOscillator/.test(html) ? '仍有 createOscillator' : '乾淨');
  push(`  ${label}頁沒有自己的「同一窗只響一次」去重表`,
    !/alarmFired\s*=\s*new Map|const fired\s*=\s*new Map/.test(html), '');
  /* 提醒運作中的提示：三頁都要講「需保持此分頁開啟」。
     不講的話使用者會把分頁關掉然後以為鬧鐘壞了。 */
  push(`  ${label}頁講明需保持分頁開啟`, /需保持此分頁開啟/.test(html), '');
  // 2026-10-03：呼叫端一定要給 openTs（真實開窗起點），否則已開的窗每 2 分鐘重響（見 ② 的說明）
  push(`  ${label}頁呼叫 alarm.check 時有傳 openTs`, /openTs:/.test(html), '');
}

// ── ② 引擎行為（同一窗只響一次、primeOnly、提前量、forget） ──
{
  const dom = new JSDOM('<!doctype html><title>T</title><body>', { runScripts: 'outside-only', url: 'https://x/' });
  const { window } = dom;
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
  });
  window.eval(ENGINE);
  const fires = [];
  const alarm = window.ETAlarm.create({
    scope: 'test', baseTitle: 'T',
    onFire: (item, secs) => { fires.push([item.id, secs]); return { title: 't', body: '', tag: 'x' }; },
  });

  push('沒開提醒時不響', (() => {
    alarm.cfg.on = false;
    return alarm.check(1000, [{ key: 'a', item: { id: 'a' }, secsUntilOpen: 0 }], false) === 0;
  })(), '');

  alarm.cfg.on = true;
  alarm.cfg.lead = 60;

  push('超過提前量的不響', alarm.check(1000, [{ key: 'a', item: { id: 'a' }, secsUntilOpen: 61 }], false) === 0,
    '61 秒 > lead 60');
  push('  剛好在提前量內會響', alarm.check(1000, [{ key: 'a', item: { id: 'a' }, secsUntilOpen: 60 }], false) === 1, '');

  // 同一窗只響一次——倒數每秒重算，開窗時刻會有零點幾秒的抖動
  alarm.reset(); fires.length = 0;
  const n1 = alarm.check(1000, [{ key: 'b', item: { id: 'b' }, secsUntilOpen: 30 }], false);
  const n2 = alarm.check(2000, [{ key: 'b', item: { id: 'b' }, secsUntilOpen: 29 }], false);
  const n3 = alarm.check(3000, [{ key: 'b', item: { id: 'b' }, secsUntilOpen: 28 }], false);
  push('同一個開窗只響一次（倒數每秒重算不算新的一窗）', n1 === 1 && n2 === 0 && n3 === 0,
    `${n1}／${n2}／${n3}`);

  /* 下一個窗要再響。⚠ 這裡的 secsUntilOpen 仍要在 lead 之內——
     拿一個超過提前量的值來測，會被提前量那道擋掉而誤判成「去重表壞了」。 */
  const n4 = alarm.check(200000, [{ key: 'b', item: { id: 'b' }, secsUntilOpen: 50 }], false);
  push('  換成下一個窗會再響', n4 === 1, 'openTs 差 219 秒 > 120 秒容差，且 50 秒仍在 lead 內');

  // primeOnly：只登記不響（剛開啟提醒時不該被眼前已開著的窗炸一輪）
  alarm.reset(); fires.length = 0;
  const p1 = alarm.check(1000, [{ key: 'c', item: { id: 'c' }, secsUntilOpen: 0 }], true);
  push('primeOnly 只登記不響', p1 === 0 && fires.length === 0, '');
  const p2 = alarm.check(1500, [{ key: 'c', item: { id: 'c' }, secsUntilOpen: 0 }], false);
  push('  登記過的窗之後也不會補響（不然開啟提醒就等於按下試響）', p2 === 0, '');

  // forget：移除目標再加回來要能重新響
  alarm.forget('c');
  const p3 = alarm.check(1600, [{ key: 'c', item: { id: 'c' }, secsUntilOpen: 0 }], false);
  push('  forget() 之後同一個窗能重新響（移除再加回來的情況）', p3 === 1, '');

  push('secsUntilOpen 是 null 的跳過（算不出窗的不要亂響）',
    alarm.check(9000, [{ key: 'd', item: { id: 'd' }, secsUntilOpen: null }], false) === 0, '');

  /* 2026-10-03 補：上面每一條的時間點都在 1000–3000ms 之間，**從來沒測過「窗開著超過 2 分鐘」**。
     舊呼叫法對已開的窗傳 secsUntilOpen:0 → openTs＝now 一直漂 → 超過 120 秒容差就當新的一窗，
     實際上已開的窗每 2 分鐘重響一次（8 ET 小時的天氣窗響 12 次）。現在三頁都改傳 openTs。 */
  alarm.reset(); fires.length = 0;
  const W = 10000000;
  let nOpen = 0;
  for (let t = W; t < W + 30 * 60000; t += 5000) {
    nOpen += alarm.check(t, [{ key: 'o', item: { id: 'o' }, openTs: W, secsUntilOpen: 0 }], false);
  }
  push('已開的窗每 5 秒 check、連續 30 分鐘，只響 1 次（給 openTs）', nOpen === 1, `${nOpen} 次`);

  alarm.reset(); fires.length = 0;
  let nCount = 0;
  for (let t = W - 120000; t < W + 10 * 60000; t += 5000) {
    nCount += alarm.check(t, [{ key: 'w', item: { id: 'w' }, openTs: W, secsUntilOpen: Math.max(0, Math.round((W - t) / 1000)) }], false);
  }
  push('  倒數 → 開窗 → 開著 10 分鐘，整段只響 1 次', nCount === 1, `${nCount} 次`);

  alarm.reset(); fires.length = 0;
  alarm.check(W, [{ key: 'q', item: { id: 'q' }, openTs: W - 60000, secsUntilOpen: 0 }], true);
  let nPrime = 0;
  for (let t = W + 5000; t < W + 30 * 60000; t += 5000) {
    nPrime += alarm.check(t, [{ key: 'q', item: { id: 'q' }, openTs: W - 60000, secsUntilOpen: 0 }], false);
  }
  push('  primeOnly 登記過的已開窗，之後 30 分鐘都不響', nPrime === 0, `${nPrime} 次`);

  // 反證：舊呼叫法（只給 secsUntilOpen:0）就是會重響——確認上面三條真的在測那個 bug
  alarm.reset(); fires.length = 0;
  let nLegacy = 0;
  for (let t = W; t < W + 30 * 60000; t += 5000) {
    nLegacy += alarm.check(t, [{ key: 'l', item: { id: 'l' }, secsUntilOpen: 0 }], false);
  }
  push('  （反證）只給 secsUntilOpen:0 的舊呼叫法在 30 分鐘內會重響', nLegacy > 1, `${nLegacy} 次`);

  // 設定持久化與舊 key 遷移（§2.3：改 key 要留遷移、不刪舊的）
  alarm.cfg.lead = 180; alarm.save();
  push('設定存進 ffxiv_alarm', !!store.ffxiv_alarm && JSON.parse(store.ffxiv_alarm).test.lead === 180,
    String(store.ffxiv_alarm));
}

// ── ③ 舊 key 遷移：兩頁的既有使用者設定不能掉 ───────────
{
  for (const [scope, legacy] of Object.entries({ fishing: 'ffxiv_fishing_alarm', gathering: 'ffxiv_gathering_alarm' })) {
    const dom = new JSDOM('<!doctype html><title>T</title><body>', { runScripts: 'outside-only', url: 'https://x/' });
    const { window } = dom;
    const store = { [legacy]: JSON.stringify({ on: true, lead: 300, sound: false }) };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
        removeItem: () => {}, key: () => null, get length() { return 0; } },
    });
    window.eval(ENGINE);
    const a = window.ETAlarm.create({ scope, baseTitle: 'T' });
    push(`${scope} 讀得回舊 key 的設定（既有使用者不會被重置）`,
      a.cfg.on === true && a.cfg.lead === 300 && a.cfg.sound === false,
      JSON.stringify(a.cfg));
    a.save();
    push(`  ${scope} 舊 key 仍然留著（不刪）`, !!store[legacy], '');
  }
}

// ── ④ 天氣頁的 ⭐ 訂閱 ──────────────────────────────────
{
  const html = readFileSync(join(ROOT, 'tools/weather/index.html'), 'utf8');
  push('天氣頁有 ⭐ 訂閱鈕（單地圖與天氣鏈各一）',
    /id="watch-add"/.test(html) && /id="chain-watch-add"/.test(html), '');
  push('  訂閱存 ffxiv_ 前綴的 key（首頁全站備份才掃得到）',
    /WATCH_KEY = 'ffxiv_weather_watch'/.test(html), '');
  /* **存天氣鍵不存顯示字串**：譯名表改過的話存字串會變成查不到的死資料。
     判別方式＝寫進去的物件只有 zone／w／prev 三個欄位，沒有 name 之類的。 */
  push('  存的是天氣鍵不是顯示字串',
    /watches\.push\(\{ zone, w: \[\.\.\.keys\], prev: prev \|\| null \}\)/.test(html), '');
  push('  讀回來時過濾不認得的天氣鍵（localStorage 可以被亂改）',
    /WEATHER_KEYS\.has\(k\)/.test(html), '');
  push('  移除時清掉去重表（不清的話加回來不會響）', /alarm\.forget\(watchKey\(w\)\)/.test(html), '');
  /* 「任意 → 任意」不可訂閱：每一段都符合，等於一個永遠在響的鬧鐘。 */
  push('  天氣鏈只在有目標天氣時才給訂閱', /next && !hasWatch\(chainZone/.test(html), '');
  push('  沒有訂閱時整塊面板不顯示（不留空框佔位）',
    /if \(!watches\.length\) \{ panel\.style\.display = 'none'; return; \}/.test(html), '');
  /* 鬧鐘不跟畫面的 20 秒節奏走——選「出現時提醒」的人會晚最多 20 秒收到。 */
  push('  鬧鐘另開較密的 timer（不跟畫面的 20 秒重畫共用）',
    /setInterval\(\(\) => checkAlarms\(Date\.now\(\)\), 5000\)/.test(html), '');
  push('  天氣視窗用 eorzea-weather 的 getWeatherAt（不是 window-calc）',
    /不要拿 window-calc 來算/.test(html) && /function scanWeather/.test(html), '');
  push('  三處共用同一個掃描函式（目標搜尋／天氣鏈／我的目標）',
    (html.match(/scanWeather\(/g) || []).length >= 4,
    (html.match(/scanWeather\(/g) || []).length + ' 處呼叫');
  push('  ?prev= 只在兩邊地圖相同時才寫進網址', /chainZone === curZone/.test(html), '');
}

// ── ⑤ 「現在能做什麼」收得到天氣目標 ───────────────────
{
  const html = readFileSync(join(ROOT, 'tools/now/index.html'), 'utf8');
  push('現在能做什麼讀 ffxiv_weather_watch', /weather: 'ffxiv_weather_watch'/.test(html), '');
  push('  天氣目標用純天氣的 spec（startHour 0／endHour 24＝不限時段）',
    /startHour: 0, endHour: 24, weather: \{ mapId: zone, keys, prevKeys \}/.test(html), '');
  push('  地圖名取自已載好的那份（不再抓一次 maps.json）', /getMapsData\(\)/.test(html), '');
  push('  空狀態會教人去天氣頁標記', /選好地圖與天氣後按 ⭐ 加入提醒/.test(html), '');
  // 用引擎實算一次，確認純天氣 spec 真的算得出視窗
  const { nextWindows } = await import('../assets/js/window-calc.js');
  const { initWeatherTables } = await import('../assets/js/eorzea-weather.js');
  globalThis.fetch = async (p) => ({
    ok: true, json: async () => JSON.parse(readFileSync(join(ROOT, String(p).replace(/^.*\/data\//, 'data/')), 'utf8')),
  });
  await initWeatherTables('../../data/maps.json');
  /* ⚠ 天氣鍵是 `fairSkies` 這種識別字，**不是**「晴朗」那個顯示名——
     拿顯示名當鍵永遠掃不到任何時段，而且不會報錯（第一版這支測試自己就踩了）。 */
  const wins = nextWindows({ startHour: 0, endHour: 24, weather: { mapId: 17, keys: ['fairSkies'], prevKeys: [] } },
    Date.now(), { max: 2 });
  push('  純天氣 spec 真的算得出視窗（東拉諾西亞・fairSkies）', wins.length > 0,
    wins.length + ' 個視窗，第一個長 ' + (wins[0] ? Math.round((wins[0].we - wins[0].ws) / 1000) + ' 秒' : '—'));
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
