// 文書跑圖回歸 — 改完 tools/relic-note/ 或 data/relic-note.json 必跑。
//
// 三個會安靜出錯的地方：
//   ① **打勾的鍵沒有含書的 id**。有 7 個目標同時出現在兩本書裡（例如首領 2564
//      在第 1 本與第 6 本都要打），只用 baseId 當鍵的話，打勾一本會連動另一本——
//      畫面上兩邊都變成完成，看起來完全正常，只是進度是假的。
//   ② **座標鈕在 <label> 裡面**。不擋掉冒泡的話，按「複製座標」會順手把那一列打勾。
//   ③ **同名副本的連結**。三個首領所在的副本一般版與高難度版同名，資料分不出是哪一本；
//      照名字連過去會把人送去打錯副本（與知識庫 §4.10 是同一類坑）。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-relic-note.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const DB = JSON.parse(readFileSync(join(ROOT, 'data/relic-note.json'), 'utf8'));
const HTML = readFileSync(join(ROOT, 'tools/relic-note/index.html'), 'utf8');
const BUILD = readFileSync(join(ROOT, 'scripts/build-relic-note.mjs'), 'utf8');
const DUNGEONS = JSON.parse(readFileSync(join(ROOT, 'data/dungeons.json'), 'utf8')).data;

// ── 資料 ────────────────────────────────────────────────
{
  push('9 本文書', DB.data.length === 9, DB.data.length + ' 本');
  push('  每本 10 怪／3 首領／3 FATE／3 理符',
    DB.data.every((b) => b.mobs.length === 10 && b.nms.length === 3 && b.fates.length === 3 && b.leves.length === 3),
    DB.data.map((b) => `${b.mobs.length}/${b.nms.length}/${b.fates.length}/${b.leves.length}`).join(' '));

  const all = DB.data.flatMap((b) => [...b.mobs, ...b.nms, ...b.fates, ...b.leves]);
  push('  共 171 個目標', all.length === 171, all.length + ' 個');
  push('  每個目標都有台服名', all.every((x) => /[\u4e00-\u9fff]/.test(x.name)), '');
  push('  沒有日文假名', !/[\u3041-\u3096\u30A1-\u30FA]/.test(JSON.stringify(all.map((x) => x.name))),
    (JSON.stringify(all.map((x) => x.name)).match(/[\u3041-\u3096\u30A1-\u30FA]/g) || []).slice(0, 3).join(''));
  push('  書名也是台服名', DB.data.every((b) => /^《/.test(b.name)), DB.data[0].name);

  push('  一般怪都有要打幾隻', DB.data.every((b) => b.mobs.every((m) => m.count > 0)),
    '例：' + DB.data[0].mobs[0].name + ' ×' + DB.data[0].mobs[0].count);
  push('  首領不帶隻數（打一次就好，寫數字會誤導）',
    DB.data.every((b) => b.nms.every((m) => m.count === undefined)), '');
  push('  每個怪／首領都有出沒地名',
    DB.data.every((b) => [...b.mobs, ...b.nms].every((m) => m.zones.length > 0)), '');
  push('  FATE 座標齊全', DB.data.every((b) => b.fates.every((f) => f.at && f.at.mapName)), '');
  push('  理符有等級與發布地', DB.data.every((b) => b.leves.every((l) => l.lv > 0 && l.issued)),
    '例：' + DB.data[0].leves[0].name + ' Lv' + DB.data[0].leves[0].lv + '＠' + DB.data[0].leves[0].issued);

  /* 座標是加分項：monsters.json 只有部分怪有 positions。
     這裡只確認「有座標的那些確實對得到地圖」，不要求覆蓋率——要求 100% 會逼人去臆造。 */
  const withAt = DB.data.flatMap((b) => b.mobs).filter((m) => m.at);
  push('  有座標的怪，地圖名都填得出來', withAt.every((m) => m.at.mapName && m.at.mapId > 0),
    withAt.length + ' 隻有座標（共 90，其餘只顯示地名）');
}

// ── 同名副本不給連結 ────────────────────────────────────
{
  const cnt = {};
  DUNGEONS.forEach((d) => { cnt[d.name] = (cnt[d.name] || 0) + 1; });
  const nms = DB.data.flatMap((b) => b.nms);
  const linked = nms.filter((m) => m.duty);
  push('首領的副本連結只給唯一解',
    linked.every((m) => cnt[m.duty] === 1),
    linked.filter((m) => cnt[m.duty] !== 1).map((m) => m.duty).join('、') || `${linked.length}/${nms.length} 個有連結`);
  const dup = nms.filter((m) => { const s = m.zones[0] && m.zones[0].spot; return s && cnt[s] > 1; });
  push('  同名（一般／高難度）的那些沒有連結', dup.length > 0 && dup.every((m) => !m.duty),
    dup.length + ' 個：' + [...new Set(dup.map((m) => m.zones[0].spot))].join('、'));
  push('  連結指得到的副本真的存在',
    linked.every((m) => DUNGEONS.some((d) => d.name === m.duty)), '');
}

// ── 不宣稱做不到的事 ────────────────────────────────────
{
  push('頁面講明只涵蓋文書這一段', /只涵蓋/.test(HTML) && /不在遊戲的資料表裡/.test(HTML), '');
  /* 「這九本書屬於 50 級光武的製作流程」這條**是站主提供的第一手玩家知識**，
     不是從資料表查到的（`Relic`／`RelicItem` 是空殼、`EventItem.Quest` 全是 0）。
     頁面必須把出處寫清楚，否則下一輪有人去查資料、查不到、就把它當錯的刪掉。 */
  push('  講明這九本書屬於 50 級光武的製作流程', /50 級光武/.test(HTML), '');
  push('    並註明這條是站主提供、不是查資料得到的',
    /由站主提供/.test(HTML) && /查不到武器與書的關聯/.test(HTML), '');
  push('  講明為什麼三個首領沒連結', /同名/.test(HTML) && /打錯副本/.test(HTML), '');
  push('  講明座標為什麼只有一部分', /不臆造座標/.test(HTML), '');
  /* 建置腳本要把「為什麼只做到這裡」寫下來。沒有這段的話，
     下一個人會以為是漏掉的，然後憑印象把階段鏈補上去。 */
  push('  建置腳本記下了範圍的依據（兩張表是空殼、Quest 全是 0）',
    /空殼/.test(BUILD) && /EventItem\.Quest/.test(BUILD), '');
  push('  資料檔沒有 weapon／stage 欄位（查不到就不放）',
    !DB.data.some((b) => b.weapon || b.stage), '');
}

// ── 前端 ────────────────────────────────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://seagod99.github.io/tools/relic-note/', virtualConsole: vc });
  const { window } = dom, doc = window.document;
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
  });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.scrollTo = () => {};
  const copied = [];
  window.navigator.clipboard = { writeText: (t) => { copied.push(t); return Promise.resolve(); } };
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 500));

  push('九個書籤都畫出來', doc.querySelectorAll('.book').length === 9,
    doc.querySelectorAll('.book').length + ' 個');
  /* 逐步揭露：一次只展開一本。九本全攤開是 171 列，沒有人讀得完，
     也讓「我現在在跑哪一本」這件事消失。 */
  push('  一次只展開一本（171 列一次攤開沒人讀得完）',
    doc.querySelectorAll('.row').length === 19, doc.querySelectorAll('.row').length + ' 列');
  push('  四個分類都在', doc.querySelectorAll('.sec').length === 4,
    [...doc.querySelectorAll('.sec-title')].map((x) => x.textContent).join('／'));
  push('  只有一個書籤是選取狀態',
    [...doc.querySelectorAll('.book')].filter((b) => b.getAttribute('aria-pressed') === 'true').length === 1, '');

  // 打勾
  const first = doc.querySelector('.row');
  const key1 = first.dataset.key;
  first.querySelector('input').checked = true;
  first.querySelector('input').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  push('打勾會存起來', !!store.ffxiv_relic_note && JSON.parse(store.ffxiv_relic_note).indexOf(key1) >= 0,
    String(store.ffxiv_relic_note).slice(0, 60));
  push('  key 是 ffxiv_ 開頭（否則首頁備份掃不到）', Object.keys(store).every((k) => k.indexOf('ffxiv_') === 0),
    Object.keys(store).join('、'));
  push('  打勾的鍵含書的 id', /^\d+:/.test(key1), key1);
  push('  總進度跟著動', doc.getElementById('totalN').textContent.indexOf('1 /') === 0,
    doc.getElementById('totalN').textContent);

  /* ① 跨書不連動。資料裡有 7 個目標同時屬於兩本書。 */
  {
    const seen = {};
    const dupKey = [];
    DB.data.forEach((b) => {
      b.nms.forEach((m) => {
        if (seen['n' + m.baseId] != null) dupKey.push([seen['n' + m.baseId], b.id, 'n' + m.baseId]);
        else seen['n' + m.baseId] = b.id;
      });
    });
    push('  有跨書重複的目標可測', dupKey.length > 0, dupKey.length + ' 組');
    if (dupKey.length) {
      const [bookA, bookB, sub] = dupKey[0];
      const ia = DB.data.findIndex((b) => b.id === bookA);
      const ib = DB.data.findIndex((b) => b.id === bookB);
      // 在第一本打勾
      doc.querySelector('.book[data-i="' + ia + '"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      const ra = doc.querySelector('.row[data-key="' + bookA + ':' + sub + '"]');
      ra.querySelector('input').checked = true;
      ra.querySelector('input').dispatchEvent(new window.Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      // 切到第二本，同一隻怪不可以是打勾狀態
      doc.querySelector('.book[data-i="' + ib + '"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      const rb = doc.querySelector('.row[data-key="' + bookB + ':' + sub + '"]');
      push('  同一個目標在另一本書不會跟著打勾（進度是假的，畫面上看不出來）',
        !!rb && !rb.querySelector('input').checked, rb ? '未連動' : '找不到那一列');
      // 回到第一本確認還在
      doc.querySelector('.book[data-i="' + ia + '"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      push('  原本那一本仍然是打勾的',
        doc.querySelector('.row[data-key="' + bookA + ':' + sub + '"]').querySelector('input').checked, '');
    }
  }

  /* ② 按座標鈕不可以順手打勾（它在 <label> 裡面）。 */
  {
    const r = [...doc.querySelectorAll('.row')].find((x) => x.querySelector('.coord') && !x.querySelector('input').checked);
    push('  有帶座標鈕的列可測', !!r, r ? r.querySelector('.coord').textContent.trim() : '無');
    if (r) {
      const before = r.querySelector('input').checked;
      r.querySelector('.coord').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r2) => setTimeout(r2, 80));
      const after = doc.querySelector('.row[data-key="' + r.dataset.key + '"]').querySelector('input').checked;
      push('  按座標鈕不會順手把那一列打勾', before === after, before + ' → ' + after);
      push('  座標是 /coord X Y 地圖名 的格式（貼進遊戲會標點）',
        copied.length > 0 && /^\/coord \d+\.\d \d+\.\d \S+/.test(copied[copied.length - 1]),
        copied[copied.length - 1] || '(沒複製到)');
    }
  }

  // 全部打勾／清除
  {
    const i = +doc.querySelector('.book[aria-pressed="true"]').dataset.i;
    doc.getElementById('btnAll').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    push('「全部打勾」把這一本打滿',
      [...doc.querySelectorAll('.row input')].every((x) => x.checked), '');
    push('  該書籤標成完成', doc.querySelector('.book[data-i="' + i + '"]').classList.contains('full'),
      doc.querySelector('.book[data-i="' + i + '"]').textContent.trim());

    /* 清除必須先問過。按清除→取消時進度不能動（全站追蹤頁的共同規則）。 */
    const before = JSON.parse(store.ffxiv_relic_note || '[]').length;
    window.Toast = { show() {}, confirm: () => Promise.resolve(false) };
    doc.getElementById('btnClear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    push('  按清除→取消，進度不能動',
      JSON.parse(store.ffxiv_relic_note || '[]').length === before,
      before + ' → ' + JSON.parse(store.ffxiv_relic_note || '[]').length);

    window.Toast = { show() {}, confirm: () => Promise.resolve(true) };
    doc.getElementById('btnClear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    push('  按清除→確定，這一本清空',
      [...doc.querySelectorAll('.row input')].every((x) => !x.checked), '');
    push('  其他本的進度沒被一起清掉',
      JSON.parse(store.ffxiv_relic_note || '[]').length > 0,
      JSON.parse(store.ffxiv_relic_note || '[]').length + ' 個目標仍打勾');
  }

  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

// ── ?id=book: 深連結 ───────────────────────────────────
{
  const target = DB.data[4];                       // 隨便挑一本不是第一本的
  const vc = new VirtualConsole();
  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    url: 'https://seagod99.github.io/tools/relic-note/?id=book:' + encodeURIComponent(target.name),
    virtualConsole: vc,
  });
  const { window } = dom, doc = window.document;
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {},
      key: () => null, get length() { return 0; } },
  });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.scrollTo = () => {};
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 400));
  const on = doc.querySelector('.book[aria-pressed="true"]');
  push('?id=book:<書名> 會切到那一本', !!on && on.textContent.indexOf(target.name) >= 0,
    on ? on.textContent.trim() : '(沒有選取的書籤)');

  // 命令面板吃 site-index，漏跑 build-site-index 會搜不到
  const idx = JSON.parse(readFileSync(join(ROOT, 'data/site-index.json'), 'utf8'));
  const ti = idx.types.findIndex((t) => t.path === 'tools/relic-note/');
  push('  site-index 收了文書這一類', ti >= 0, ti >= 0 ? idx.types[ti].label : '未收');
  const hit = idx.data.filter((r) => r[1] === ti);
  push('  九本都進索引，key 是 book:<書名>',
    hit.length === 9 && hit.every((r) => r[2] === 'book:' + r[0]),
    hit.length + ' 筆，例：' + (hit[0] ? hit[0].join(' / ') : ''));
}

// ── 登記 ────────────────────────────────────────────────
{
  const nav = readFileSync(join(ROOT, 'assets/js/nav.js'), 'utf8');
  push('已登記在 nav.js 的 TOOLS', /tools\/relic-note\//.test(nav), '');
  const home = readFileSync(join(ROOT, 'index.html'), 'utf8');
  push('  首頁有卡片且帶 data-added', /tools\/relic-note\/"[^>]*data-added="\d{4}-\d{2}-\d{2}"/.test(home), '');
  const meta = JSON.parse(readFileSync(join(ROOT, 'data/_meta.json'), 'utf8'));
  push('  data/relic-note.json 有進 _meta',
    (meta.databases || []).some((d) => d.file === 'relic-note.json'), '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
