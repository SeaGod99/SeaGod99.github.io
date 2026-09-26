// 多角色設定檔回歸 — 改完 assets/js/profiles.js 必跑。
//
// 這支碰的是**使用者的進度**，錯了會直接吃掉資料，所以驗得比別支嚴：
//   ① **白名單反轉**：不在 `SHARED` 裡的 `ffxiv_*` key 一律算角色態。
//      反過來做的話，日後新增一個忘了登記的進度 key，兩隻角色會共用同一份——**靜默的資料損壞**。
//   ② **只覆蓋不刪**：切過去時不刪除目標設定檔沒有的 key。
//   ③ **切走前一定先存**，而且存不進去（配額爆了）時**不可以切**。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-profiles.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);
const JS = readFileSync(join(ROOT, 'assets/js/profiles.js'), 'utf8');

/** 造一個帶 localStorage 的視窗，載入 profiles.js。 */
function mk(seed) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM('<!doctype html><body><div id="sgt-topbar"><div class="sgt-tb-inner"></div></div>',
    { runScripts: 'outside-only', url: 'https://seagod99.github.io/', virtualConsole: vc });
  const { window } = dom;
  const store = Object.assign({}, seed || {});
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
  });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.alert = () => {};
  window.prompt = () => null;
  window.eval(JS);
  /* ⚠ jsdom 的 readyState 停在 "loading"（沒有外部資源要載），所以 profiles.js 會走
     DOMContentLoaded 那條路而不是立即執行。真實瀏覽器裡 defer 腳本執行時是 "interactive"，
     走的是立即那條。這裡補發一次事件，讓測試跑到與瀏覽器相同的路徑。 */
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return { window, store, errs, P: window.SGT_PROFILES };
}

// ── ① 白名單反轉 ────────────────────────────────────────
{
  const { P, store } = mk({
    ffxiv_mounts_owned: '{"1":1}',
    ffxiv_market_opts: '{"a":1}',          // SHARED
    ffxiv_seen_patch: '7.21',              // SHARED
    ffxiv_brand_new_progress: '{"x":1}',   // 新 key，沒登記過
    ffxiv_profiles: JSON.stringify({ active: 'A', names: ['A'] }),
    ffxiv_profile_A: '{}',
    other_thing: 'x',                      // 非 ffxiv_ 前綴
  });
  const keys = P.characterKeys();
  push('沒登記過的新 key 預設算「角色態」', keys.includes('ffxiv_brand_new_progress'),
    keys.join('、'));
  push('  共用偏好不算角色態', !keys.includes('ffxiv_market_opts') && !keys.includes('ffxiv_seen_patch'), '');
  push('  設定檔自己的資料不算角色態', !keys.includes('ffxiv_profiles') && !keys.includes('ffxiv_profile_A'), '');
  push('  非 ffxiv_ 前綴的完全不碰', !keys.includes('other_thing'), '');
  push('  SHARED 每一條都有寫理由', Object.values(P.SHARED).every((v) => typeof v === 'string' && v.length > 3),
    Object.keys(P.SHARED).length + ' 條');
  // 程式碼層面：確認是「不在白名單就算角色態」而不是反過來
  push('  程式碼是反轉白名單（不是列舉角色態）', /if \(SHARED\[k\]\) continue;/.test(JS), '');
}

// ── ② 切換：先存、只覆蓋不刪 ────────────────────────────
{
  const { window, P, store } = mk({
    ffxiv_profiles: JSON.stringify({ active: 'A', names: ['A', 'B'] }),
    ffxiv_mounts_owned: '{"A的坐騎":1}',
    ffxiv_minions_owned: '{"只有A有":1}',
    ffxiv_market_opts: '{"共用":1}',
    ffxiv_profile_B: JSON.stringify({ ffxiv_mounts_owned: '{"B的坐騎":1}' }),
  });
  // jsdom 的 location.reload 唯讀，改成把 setTimeout 吃掉（switchTo 是延遲後才 reload）
  window.setTimeout = function () { return 0; };
  P.switchTo('B');

  push('切走前把目前的進度存起來', !!store.ffxiv_profile_A, store.ffxiv_profile_A ? '有存' : '沒存');
  const saved = JSON.parse(store.ffxiv_profile_A || '{}');
  push('  存的是角色態的 key', saved.ffxiv_mounts_owned === '{"A的坐騎":1}' && !!saved.ffxiv_minions_owned,
    Object.keys(saved).join('、'));
  push('  共用偏好沒被存進設定檔', !saved.ffxiv_market_opts, '');

  push('載入目標設定檔有的 key', store.ffxiv_mounts_owned === '{"B的坐騎":1}', store.ffxiv_mounts_owned);
  /* **只覆蓋不刪**：B 沒有 minions，A 的那份要留著。
     刪掉的話，從「還沒建資料的新設定檔」切過去會把既有進度整個清空。 */
  push('  目標沒有的 key 保持原樣（只覆蓋不刪）', store.ffxiv_minions_owned === '{"只有A有":1}',
    String(store.ffxiv_minions_owned));
  push('  共用偏好不受切換影響', store.ffxiv_market_opts === '{"共用":1}', String(store.ffxiv_market_opts));
  push('  active 已更新', JSON.parse(store.ffxiv_profiles).active === 'B', JSON.parse(store.ffxiv_profiles).active);
}

// ── ③ 存不進去就不可以切 ────────────────────────────────
{
  const { window, P, store } = mk({
    ffxiv_profiles: JSON.stringify({ active: 'A', names: ['A', 'B'] }),
    ffxiv_mounts_owned: '{"A":1}',
    ffxiv_profile_B: JSON.stringify({ ffxiv_mounts_owned: '{"B":1}' }),
  });
  // jsdom 的 location.reload 唯讀，改成把 setTimeout 吃掉（switchTo 是延遲後才 reload）
  window.setTimeout = function () { return 0; };
  // 模擬配額爆掉：只讓寫入設定檔快照失敗
  const realSet = window.localStorage.setItem;
  window.localStorage.setItem = function (k, v) {
    if (k.indexOf('ffxiv_profile_') === 0) throw new Error('QuotaExceededError');
    return realSet.call(this, k, v);
  };
  P.switchTo('B');
  push('存不進去時不切換（不然會遺失資料）', store.ffxiv_mounts_owned === '{"A":1}',
    String(store.ffxiv_mounts_owned));
  push('  active 也沒有被改掉', JSON.parse(store.ffxiv_profiles).active === 'A',
    JSON.parse(store.ffxiv_profiles).active);
}

// ── 晶片只長給多設定檔的人看 ────────────────────────────
{
  const one = mk({ ffxiv_profiles: JSON.stringify({ active: 'A', names: ['A'] }) });
  push('只有一個設定檔時不長晶片', !one.window.document.getElementById('sgt-prof'), '');
  const two = mk({ ffxiv_profiles: JSON.stringify({ active: 'A', names: ['A', 'B'] }) });
  push('  有兩個以上才長', !!two.window.document.getElementById('sgt-prof'),
    two.window.document.getElementById('sgt-prof') ? '有' : '無');
  push('  晶片上顯示使用中的名稱',
    !!two.window.document.getElementById('sgt-prof') && (two.window.document.getElementById('sgt-prof').textContent || '').indexOf('A') >= 0, '');
  push('  無 console error', two.errs.length === 0, two.errs.slice(0, 1).join('') || '乾淨');
}

// ── enable() 開通 ───────────────────────────────────────
{
  const { P, store, window } = mk({});
  push('一開始沒有設定檔資料', !store.ffxiv_profiles, '');
  const ok = P.enable('小明');
  push('enable() 建得起來', ok && P.list().length === 2, P.list().join('、'));
  push('  重複名稱擋掉', !P.enable('小明'), '');
  push('  空字串擋掉', !P.enable('  '), '');
  push('  建完長出晶片', !!window.document.getElementById('sgt-prof'), '');
}

// ── 名稱是使用者輸入，必須轉義 ──────────────────────────
{
  const { P, window } = mk({
    ffxiv_profiles: JSON.stringify({ active: '<img src=x onerror=alert(1)>', names: ['<img src=x onerror=alert(1)>', 'B'] }),
  });
  const chip = window.document.getElementById('sgt-prof');
  push('設定檔名稱有轉義（名稱是使用者輸入的）',
    !!chip && chip.innerHTML.indexOf('<img') < 0 && chip.innerHTML.indexOf('&lt;img') >= 0,
    chip ? chip.innerHTML.slice(0, 60) : '(無晶片)');
}

// ── 首頁入口 ────────────────────────────────────────────
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  push('首頁有開通入口', /id="pdProfileBtn"/.test(html), '');
  push('  首頁講明「只覆蓋不刪」', /只覆蓋、不刪除/.test(html), '');
  const theme = readFileSync(join(ROOT, 'assets/js/theme.js'), 'utf8');
  push('theme.js 會載 profiles.js', /profiles\.js/.test(theme), '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
