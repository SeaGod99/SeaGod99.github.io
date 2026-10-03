// validate-window-calc.mjs — 共用視窗計算的差分回歸
//
// 什麼時候跑：**改了 assets/js/window-calc.js，或改了釣魚／限時採集兩頁的時間窗邏輯之後。**
//
// 為什麼要差分測而不是寫期望值：鬧鐘與時間窗的錯誤是「該響沒響」「早了半個 ET 日」，
// 畫面上完全看不出來，而正確答案本身很難用手算驗證。所以這裡把**重構前兩頁各自的
// 實作原封不動抄一份當參照**，拿真實資料在大量取樣時刻上跑，要求新舊逐筆相同。
// 參照實作刻意寫死在這個檔裡、不從頁面讀——頁面改了之後參照還在，才驗得出有沒有改壞。
//
// 取樣策略：ET 一天只有 70 真實分鐘，所以「掃一整個 ET 日」很便宜。
// 每個受測對象取 24 個時刻（跨兩個 ET 日、刻意落在天氣週期邊界前後），
// 天氣型的另外拉長到 7 個 ET 日，確保掃得到「連續兩個週期都符合而要合併」的情況。
//
// 執行（repo 根目錄）：node scripts/validate-window-calc.mjs

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 參照實作（重構前的原樣，不要動）────────────────────────────────────
const EORZEA_MULT = 3600 / 175;
const WEATHER_PERIOD = 1400000;
const ET_HOUR_MS = 4200000 / 24;
const refEtHourOf = (ms) => Math.floor(ms * EORZEA_MULT / 3600000) % 24;

// tools/fishing/index.html 的 nextWindows()（2026-09-25 重構前）
function refFishWindows(f, now, maxN, weatherOf, hasTable) {
  const timed = f.startHour > 0 || f.endHour < 24;
  const wk = f.wk || [], pk = f.pk || [];
  const needWx = wk.length > 0 || pk.length > 0;
  if (!timed && !needWx) return [];
  let mapId = null;
  if (needWx) {
    mapId = f.mapId;
    if (mapId == null || !hasTable(mapId)) return [];
  }
  const wins = [];
  const pi0 = Math.floor(now / WEATHER_PERIOD);
  for (let i = 0; i < 700 && wins.length < maxN + 1; i++) {
    const pi = pi0 + i;
    if (needWx) {
      if (wk.length && !wk.includes(weatherOf(mapId, pi))) continue;
      if (pk.length && !pk.includes(weatherOf(mapId, pi - 1))) continue;
    }
    const pStart = pi * WEATHER_PERIOD;
    const pEtH = refEtHourOf(pStart);
    let segs;
    if (!timed) segs = [[pEtH, pEtH + 8]];
    else {
      const raw = f.startHour < f.endHour ? [[f.startHour, f.endHour]] : [[0, f.endHour], [f.startHour, 24]];
      segs = raw.map(([a, b]) => [Math.max(a, pEtH), Math.min(b, pEtH + 8)]).filter(([a, b]) => b > a);
    }
    for (const [a, b] of segs) {
      const ws = pStart + (a - pEtH) * ET_HOUR_MS;
      const we = pStart + (b - pEtH) * ET_HOUR_MS;
      if (now >= we) continue;
      const last = wins[wins.length - 1];
      if (last && Math.abs(last.we - ws) < 1000) last.we = we;
      else wins.push({ ws, we });
    }
  }
  wins.forEach((w) => { w.active = now >= w.ws; });
  return wins.slice(0, maxN);
}

// tools/gathering/index.html 的 nodeStatus()（2026-09-25 重構前）
const SOON_SECS = 5 * 60;
function refNodeStatus(node, now) {
  if (!node.spawns.length) return { state: "closed", secsLeft: Infinity, startH: null };
  const durEtMin = node.duration;
  const curEtMin = (now * EORZEA_MULT / 60000) % (24 * 60);
  for (const startH of node.spawns) {
    const s = ((startH % 24) + 24) % 24;
    const startMin = s * 60;
    let diffMin = curEtMin - startMin;
    if (diffMin < 0) diffMin += 24 * 60;
    if (diffMin < durEtMin) {
      const remainEtMin = durEtMin - diffMin;
      return { state: "open", secsLeft: Math.max(0, Math.round((remainEtMin * 60000) / EORZEA_MULT / 1000)), startH: s };
    }
  }
  let bestDiff = Infinity, nextStart = null;
  for (const startH of node.spawns) {
    const s = ((startH % 24) + 24) % 24;
    let diff = s * 60 - curEtMin;
    if (diff <= 0) diff += 24 * 60;
    if (diff < bestDiff) { bestDiff = diff; nextStart = s; }
  }
  const secsLeft = Math.max(0, Math.round((bestDiff * 60000) / EORZEA_MULT / 1000));
  return { state: secsLeft <= SOON_SECS ? "soon" : "closed", secsLeft, startH: nextStart };
}

// ── 受測模組 ──────────────────────────────────────────────────────────
const wc = await import(pathToFileURL(join(ROOT, "assets/js/window-calc.js")).href);
const ez = await import(pathToFileURL(join(ROOT, "assets/js/eorzea-weather.js")).href);

const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

// 天氣表：走頁面用的同一條路徑 initWeatherTables()，只是把 fetch 換成讀檔，
// 這樣測到的是真的那份表（含優雷卡的 fallback），不是我在測試裡自己重建的一份。
globalThis.fetch = async (u) => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(join(ROOT, String(u)), "utf8")),
});
await ez.initWeatherTables("data/maps.json");
const maps = JSON.parse(await readFile(join(ROOT, "data/maps.json"), "utf8")).data;
const hasTable = (id) => !!ez.getWeatherTable(id);
const weatherOfPi = (mapId, pi) => ez.getWeatherAt(mapId, pi * WEATHER_PERIOD);

const sameWins = (a, b) =>
  a.length === b.length &&
  a.every((w, i) => Math.abs(w.ws - b[i].ws) < 1 && Math.abs(w.we - b[i].we) < 1 && w.active === b[i].active);

// ── ① 區間型（釣魚）────────────────────────────────────────────────
{
  const fishes = JSON.parse(await readFile(join(ROOT, "data/fishes.json"), "utf8")).data;
  const spots = JSON.parse(await readFile(join(ROOT, "data/fishing-spots.json"), "utf8")).data;
  const spotById = new Map(spots.map((s) => [s.id, s]));

  // 取「有時段限制」的魚。天氣條件在資料裡是英文名，這裡只測時段那一半，
  // 天氣那一半另外用合成案例測（才控制得住哪個週期會命中）。
  const timed = fishes.filter((f) => (f.startHour > 0 || f.endHour < 24) && f.startHour != null).slice(0, 400);
  const base = Date.UTC(2026, 8, 25, 0, 0, 0);
  const times = [];
  for (let i = 0; i < 24; i++) times.push(base + i * 175000);      // 跨兩個 ET 日、含天氣週期邊界
  let bad = [];
  for (const f of timed) {
    for (const now of times) {
      const ref = refFishWindows({ startHour: f.startHour, endHour: f.endHour }, now, 3, weatherOfPi, hasTable);
      const got = wc.nextWindows({ startHour: f.startHour, endHour: f.endHour }, now, { max: 3 });
      if (!sameWins(ref, got)) {
        bad.push(`${f.name} ${f.startHour}-${f.endHour} @${now}：參照 ${JSON.stringify(ref)} / 新 ${JSON.stringify(got)}`);
        if (bad.length > 3) break;
      }
    }
    if (bad.length > 3) break;
  }
  push(`區間型與參照實作相同（${timed.length} 種魚 × ${times.length} 時刻）`, bad.length === 0, bad.slice(0, 2).join(' | ') || '全部相同');

  // 跨午夜的要特別確認（17→3 這種會拆兩段）
  const cross = timed.filter((f) => f.startHour > f.endHour).slice(0, 50);
  push(`  其中跨午夜的 ${cross.length} 種也相同`, cross.length > 0, cross.slice(0, 2).map((f) => `${f.name} ${f.startHour}→${f.endHour}`).join('、'));
}

// ── ①b 天氣條件（釣魚的另一半）──────────────────────────────────────
// 上面只測了時段那一半。天氣那一半才是會「連續兩個週期都命中而要合併」的來源，
// 也是唯一會回傳空陣列（地圖沒有天氣表）的路徑，必須單獨測。
{
  // 挑幾張有天氣表的地圖，各取常見天氣鍵，組合成合成案例
  const withTable = maps.filter((m) => m.weatherRates && m.weatherRates.length).slice(0, 12);
  const base = Date.UTC(2026, 8, 25, 0, 0, 0);
  const times = [];
  for (let i = 0; i < 40; i++) times.push(base + i * 175000);     // 跨 7 個 ET 日
  const cases = [];
  for (const m of withTable) {
    const keys = [...new Set(ez.buildTableFromWeatherRates(m.weatherRates).map(([, k]) => k))];
    if (!keys.length) continue;
    cases.push({ mapId: m.id, wk: [keys[0]], pk: [], startHour: 0, endHour: 24 });
    cases.push({ mapId: m.id, wk: [keys[0]], pk: [keys[keys.length - 1]], startHour: 0, endHour: 24 });
    cases.push({ mapId: m.id, wk: [keys[0]], pk: [], startHour: 17, endHour: 3 });   // 天氣＋跨午夜
  }
  let bad = [], merged = 0;
  for (const c of cases) {
    for (const now of times) {
      const ref = refFishWindows(c, now, 3, weatherOfPi, hasTable);
      const got = wc.nextWindows(
        { startHour: c.startHour, endHour: c.endHour, weather: { mapId: c.mapId, keys: c.wk, prevKeys: c.pk } },
        now, { max: 3 });
      if (!sameWins(ref, got)) {
        bad.push(`map ${c.mapId} wk=${c.wk} pk=${c.pk} ${c.startHour}-${c.endHour} @${now}`);
        if (bad.length > 3) break;
      }
      // 記一下有沒有真的掃到「合併過」的視窗（區間長度超過一個天氣週期就是合併過）
      if (got.some((w) => w.we - w.ws > WEATHER_PERIOD + 1000)) merged++;
    }
    if (bad.length > 3) break;
  }
  push(`天氣條件與參照實作相同（${cases.length} 組 × ${times.length} 時刻）`, bad.length === 0, bad.slice(0, 2).join(' | ') || '全部相同');
  push('  測到了跨週期合併的視窗', merged > 0, merged + ' 次');
  push('  沒有天氣表的地圖回空陣列',
    wc.nextWindows({ startHour: 0, endHour: 24, weather: { mapId: 999999, keys: ['fairSkies'] } }, base).length === 0, '');
}

// ── ② 週期型（限時採集）────────────────────────────────────────────
{
  const gathering = JSON.parse(await readFile(join(ROOT, "data/gathering.json"), "utf8")).data;
  const nodes = gathering.filter((n) => n.limited && Array.isArray(n.spawns) && n.spawns.length && n.duration).slice(0, 300);
  const base = Date.UTC(2026, 8, 25, 0, 0, 0);
  const times = [];
  for (let i = 0; i < 24; i++) times.push(base + i * 175000);
  let bad = [];
  for (const n of nodes) {
    for (const now of times) {
      const ref = refNodeStatus(n, now);
      const wins = wc.nextWindows({ spawns: n.spawns, duration: n.duration }, now, { max: 3 });
      const got = wc.statusOf(wins, now, SOON_SECS);
      // 狀態要一致；秒數允許 1 秒誤差（兩邊取整的位置不同）
      const okState = ref.state === got.state;
      const okSecs = Math.abs(ref.secsLeft - got.secsLeft) <= 1;
      if (!okState || !okSecs) {
        bad.push(`節點 ${n.id} spawns=${n.spawns} dur=${n.duration} @${now}：參照 ${ref.state}/${ref.secsLeft} 新 ${got.state}/${got.secsLeft}`);
        if (bad.length > 3) break;
      }
    }
    if (bad.length > 3) break;
  }
  push(`週期型與參照實作相同（${nodes.length} 個節點 × ${times.length} 時刻）`, bad.length === 0, bad.slice(0, 2).join(' | ') || '全部相同');
}

// ── ③ 性質測試（參照實作本身沒覆蓋到的）──────────────────────────
{
  const now = Date.UTC(2026, 8, 25, 3, 14, 15);
  push('全天開放且無天氣 → 回空陣列', wc.nextWindows({ startHour: 0, endHour: 24 }, now).length === 0, '');
  push('沒有 spawns 也沒有時段 → 回空陣列', wc.nextWindows({}, now).length === 0, '');
  push('duration 為 0 → 回空陣列', wc.nextWindows({ spawns: [0, 8], duration: 0 }, now).length === 0, '');

  const w = wc.nextWindows({ startHour: 8, endHour: 12 }, now, { max: 5 });
  push('視窗依時間遞增且不重疊', w.every((x, i) => i === 0 || x.ws >= w[i - 1].we), JSON.stringify(w.map((x) => [x.ws, x.we])).slice(0, 80));
  push('視窗都在未來（we > now）', w.every((x) => x.we > now), '');
  push('max 有生效', wc.nextWindows({ startHour: 8, endHour: 12 }, now, { max: 2 }).length === 2, '');

  const st = wc.statusOf([], now);
  push('沒有視窗時 statusOf 回 none', st.state === 'none' && st.window === null, st.state);
  const open = wc.statusOf([{ ws: now - 1000, we: now + 60000, active: true }], now);
  push('進行中 → open 且剩餘秒數正確', open.state === 'open' && Math.abs(open.secsLeft - 60) <= 1, open.secsLeft);
  const soon = wc.statusOf([{ ws: now + 60000, we: now + 120000, active: false }], now, 300);
  push('60 秒後開 → soon', soon.state === 'soon' && Math.abs(soon.secsLeft - 60) <= 1, soon.state);
  const closed = wc.statusOf([{ ws: now + 600000, we: now + 700000, active: false }], now, 300);
  push('10 分鐘後開（>門檻）→ closed', closed.state === 'closed', closed.state);
}

// ── ④ 鬧鐘引擎（et-alarm.js）──────────────────────────────────────
// 鬧鐘的錯誤是「該響沒響」「同一窗響兩次」，畫面上完全看不出來，所以這裡把
// 去重、primeOnly、提前量門檻、舊 key 遷移四件事各釘一條。
{
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><title>T</title><body>', {
    runScripts: 'dangerously', url: 'https://seagod99.github.io/tools/x/',
  });
  const { window } = dom;
  window.eval(readFileSync(join(ROOT, 'assets/js/et-alarm.js'), 'utf8'));
  const A = window.ETAlarm;
  push('掛上 window.ETAlarm', !!(A && A.create), '');

  const fires = [];
  const mk = () => A.create({ scope: 'fishing', baseTitle: 'T', onFire: (it, s) => { fires.push([it.id, s]); return null; } });

  // 預設關閉 → 不響
  let al = mk();
  push('預設是關閉的', al.cfg.on === false, JSON.stringify(al.cfg));
  push('關閉時不響', al.check(1000, [{ key: 'a', item: { id: 1 }, secsUntilOpen: 0 }]) === 0, '');

  // 開啟後：超過提前量不響、門檻內響一次、同一窗不重複
  al.cfg.on = true; al.cfg.lead = 60;
  push('超過提前量不響', al.check(1000, [{ key: 'a', item: { id: 1 }, secsUntilOpen: 120 }]) === 0, '');
  push('門檻內響', al.check(1000, [{ key: 'a', item: { id: 1 }, secsUntilOpen: 30 }]) === 1, '');
  push('同一窗不重複響', al.check(2000, [{ key: 'a', item: { id: 1 }, secsUntilOpen: 29 }]) === 0, '');
  push('下一個窗會響', al.check(2000, [{ key: 'a', item: { id: 1 }, secsUntilOpen: 600 }]) === 0, '（超過門檻本來就不響）');
  al.reset();
  push('reset 後同樣的窗會再響', al.check(2000, [{ key: 'a', item: { id: 1 }, secsUntilOpen: 29 }]) === 1, '');

  // primeOnly：登記但不響
  const al2 = mk(); al2.cfg.on = true; al2.cfg.lead = 60;
  const before = fires.length;
  push('primeOnly 不響', al2.check(1000, [{ key: 'b', item: { id: 2 }, secsUntilOpen: 10 }], true) === 0 && fires.length === before, '');
  push('primeOnly 登記過的之後也不響', al2.check(1100, [{ key: 'b', item: { id: 2 }, secsUntilOpen: 10 }]) === 0, '');

  // 設定持久化與舊 key 遷移
  al2.cfg.lead = 300; al2.save();
  push('設定寫進 ffxiv_ 前綴的共用 key', /"lead":300/.test(window.localStorage.getItem('ffxiv_alarm') || ''), window.localStorage.getItem('ffxiv_alarm'));
  push('舊 key 同步寫一份（不刪）', /"lead":300/.test(window.localStorage.getItem('ffxiv_fishing_alarm') || ''), window.localStorage.getItem('ffxiv_fishing_alarm'));

  // 舊 key 遷移：清掉共用 key，只留舊的，應該讀得回來
  window.localStorage.removeItem('ffxiv_alarm');
  window.localStorage.setItem('ffxiv_gathering_alarm', JSON.stringify({ on: true, lead: 45, sound: false }));
  const al3 = A.create({ scope: 'gathering', baseTitle: 'T' });
  push('讀得回舊 key 的設定', al3.cfg.on === true && al3.cfg.lead === 45 && al3.cfg.sound === false, JSON.stringify(al3.cfg));
  push('兩個 scope 的設定互不干擾',
    A.create({ scope: 'fishing', baseTitle: 'T' }).cfg.lead !== 45, '');
}

// ── ⑤ 頁面真的只用 window-calc（2026-10-03 補）──────────────────────────
/* 上面全部是「共用模組 vs 重構前抄本」，**從沒檢查頁面是不是真的在用共用模組**。
   釣魚頁的 fishStatus()（卡片／看板／排序／鬧鐘）因此一直保留著頁內第二份演算法
   （掃 400 個天氣段、不合併連續段），112 種魚的剩餘時間被低估，而這支全綠。 */
{
  const fish = readFileSync(join(ROOT, 'tools/fishing/index.html'), 'utf8');
  const gath = readFileSync(join(ROOT, 'tools/gathering/index.html'), 'utf8');
  const body = (src, name) => { const i = src.indexOf(`function ${name}(`); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };
  const fs = body(fish, 'fishStatus'), ns = body(gath, 'nodeStatus');
  push('釣魚頁 fishStatus() 走 window-calc（呼叫 nextWindows）', /nextWindows\(/.test(fs), '');
  push('  釣魚頁沒有自己掃天氣段（沒有 weatherOf／calcSeed／WEATHER_PERIOD 迴圈）',
    !/function weatherOf\(|calcSeed\(|WEATHER_PERIOD\s*\)/.test(fish), '');
  push('限時採集頁 nodeStatus() 走 window-calc（nextWindows＋statusOf）', /nextWindows\(/.test(ns) && /statusOf\(/.test(ns), '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? "✓" : "✗"} ${n}  ${d ?? ""}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
