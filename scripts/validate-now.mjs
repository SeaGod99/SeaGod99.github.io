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

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
