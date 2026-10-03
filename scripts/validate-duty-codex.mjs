// 副本圖鑑回歸 — 改完 tools/duty-codex/ 或 data/dungeons.json 必跑。
//
// 這頁的錯誤多半是安靜的：類型標籤對錯了、圖片路徑指向不存在的檔、
// 篩選把不該濾的濾掉——畫面上都只是「東西比較少」，不會報錯。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-duty-codex.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);
const unhandled = [];
process.on('unhandledRejection', (e) => unhandled.push(String((e && e.message) || e)));

const DB = JSON.parse(readFileSync(join(ROOT, 'data/dungeons.json'), 'utf8'));

// ── 資料面 ──────────────────────────────────────────────
{
  const d = DB.data;
  push('count 與 data.length 相符', DB.count === d.length, DB.count + ' / ' + d.length);
  push('每個副本都有台服名', d.every((x) => x.name && x.name !== x.nameEn), '');
  push('台服名不含日文原文', d.every((x) => !/[\u3041-\u3096\u30A1-\u30FA]/.test(x.name)), '');

  const withTime = d.filter((x) => x.timeLimit).length;
  push('時限覆蓋率 > 95%', withTime / d.length > 0.95, withTime + '/' + d.length);

  const unlocked = d.filter((x) => x.unlock && x.unlock.questName);
  push('有解鎖任務的副本', unlocked.length > 20, unlocked.length + ' 個');
  push('  解鎖任務名都是繁中', unlocked.every((x) => /[\u4e00-\u9fff]/.test(x.unlock.questName) &&
    !/[\u3041-\u3096\u30A1-\u30FA]/.test(x.unlock.questName)), '');
  push('  解鎖等級是數字不是陣列', unlocked.every((x) => x.unlock.questLevel == null || typeof x.unlock.questLevel === 'number'),
    unlocked.slice(0, 1).map((x) => x.name + ' Lv' + x.unlock.questLevel).join(''));

  // 圖片：image 欄指到的本地檔要嘛在、要嘛前端得優雅退場
  const imgs = d.filter((x) => x.image);
  const present = imgs.filter((x) => existsSync(join(ROOT, 'assets/dungeons', String(x.image).split('/').pop())));
  push('image 欄指到的檔案多數存在', present.length > 300, present.length + '/' + imgs.length + ' 在本地');
}

// ── 前端層 ──────────────────────────────────────────────
const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const html = readFileSync(join(ROOT, 'tools/duty-codex/index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://seagod99.github.io/tools/duty-codex/?t=ultimate',
  virtualConsole: vc,
});
const { window } = dom;
const doc = window.document;
window.fetch = async (url) => {
  const rel = String(url).replace(/^.*\/(data|assets)\//, '$1/');
  if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
};
window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });

for (const f of ['assets/js/patch-gate.js']) window.eval(readFileSync(join(ROOT, f), 'utf8'));
window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
await new Promise((r) => setTimeout(r, 900));

const cards = () => doc.querySelectorAll('.duty');
const status = () => doc.getElementById('status').textContent;

push('網址帶 ?t=ultimate 時只顯示絕殲滅戰', cards().length === 7, status());
push('  類型選單是從資料長出來的', doc.getElementById('typeSel').options.length === 13,
  doc.getElementById('typeSel').options.length + ' 個選項（含「全部類型」）');
push('  資料片選單由舊到新', [...doc.getElementById('expSel').options].slice(1).map((o) => o.value).join('→'),
  [...doc.getElementById('expSel').options].slice(1, 3).map((o) => o.value).join('→'));

// 清掉篩選 → 全部顯示
doc.getElementById('typeSel').value = '';
doc.getElementById('typeSel').dispatchEvent(new window.Event('change', { bubbles: true }));
await new Promise((r) => setTimeout(r, 400));
push('清掉類型篩選後顯示全部', cards().length === DB.count, cards().length + ' 張卡');
push('  依資料片分組', doc.querySelectorAll('.exp-head').length >= 6,
  doc.querySelectorAll('.exp-head').length + ' 組');

// 類型標籤用的是官方分類名
{
  doc.getElementById('typeSel').value = 'dungeon';
  doc.getElementById('typeSel').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const kinds = [...doc.querySelectorAll('.tag.kind')].map((e) => e.textContent);
  push('迷宮挑戰用官方分類名', kinds.length > 0 && kinds.every((k) => k === '迷宮挑戰'),
    [...new Set(kinds)].join('、'));
  push('  卡片帶人數與時限', doc.querySelectorAll('.duty .tag').length > cards().length, '');
}

// 等級篩選
{
  doc.getElementById('typeSel').value = '';
  doc.getElementById('lvSel').value = '50-59';
  doc.getElementById('lvSel').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const shown = [...doc.querySelectorAll('.duty-lv')].map((e) => +e.textContent.replace('Lv', ''));
  push('等級篩選 Lv50–59 有結果', shown.length > 0, shown.length + ' 個');
  push('  結果全都落在範圍內', shown.every((l) => l >= 50 && l <= 59),
    shown.filter((l) => l < 50 || l > 59).slice(0, 3).join('、') || '全對');
  doc.getElementById('lvSel').value = '';
  doc.getElementById('lvSel').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
}

// 搜尋
{
  const q = doc.getElementById('q');
  q.value = '巴哈姆特';
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const names = [...doc.querySelectorAll('.duty-name')].map((e) => e.textContent);
  push('搜尋「巴哈姆特」有結果', names.length > 0, names.length + ' 個');
  push('  結果都含關鍵字', names.every((n) => n.indexOf('巴哈姆特') >= 0),
    names.filter((n) => n.indexOf('巴哈姆特') < 0).slice(0, 2).join('、') || '全對');
  push('  網址記下搜尋（可分享）', /q=/.test(window.location.search), window.location.search);
  q.value = '';
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
}

// 解鎖任務只在有資料時才出現
{
  const withUnlock = doc.querySelectorAll('.unlock').length;
  const expect = DB.data.filter((x) => x.unlock && x.unlock.questName).length;
  push('解鎖任務區塊只在有資料時出現', withUnlock === expect, withUnlock + ' / 資料有 ' + expect);
}

// 快捷鍵有登記
push('登記了頁內快捷鍵', Array.isArray(window.SGT_SHORTCUTS_PENDING) &&
  window.SGT_SHORTCUTS_PENDING[0] && window.SGT_SHORTCUTS_PENDING[0].length === 2,
  (window.SGT_SHORTCUTS_PENDING || [[]])[0].map((k) => k.keys).join('、'));

// ── ?id=duty:<名稱> 深連結（命令面板走這條進來）─────────────────
{
  const vc2 = new VirtualConsole();
  const err2 = [];
  vc2.on('jsdomError', (e) => err2.push(e.message));
  vc2.on('error', (...a) => err2.push(a.join(' ')));
  const NAME = '魔獸領域日影地修練所';
  const d2 = new JSDOM(html, {
    runScripts: 'outside-only',
    // 刻意同時帶一個會擋掉它的類型篩選：從面板點進來時不該看到空白
    url: 'https://seagod99.github.io/tools/duty-codex/?t=ultimate&id=' + encodeURIComponent('duty:' + NAME),
    virtualConsole: vc2,
  });
  const w2 = d2.window, dc2 = w2.document;
  w2.fetch = window.fetch;
  w2.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w2.eval(readFileSync(join(ROOT, 'assets/js/patch-gate.js'), 'utf8'));
  w2.eval([...dc2.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 900));

  const names = [...dc2.querySelectorAll('.duty-name')].map((e) => e.textContent);
  push('?id=duty:<名稱> 篩到那一個副本', names.length === 1 && names[0] === NAME,
    names.length + ' 個：' + names.slice(0, 2).join('、'));
  push('  會清掉衝突的既有篩選（不然會看到空白）', dc2.getElementById('typeSel').value === '',
    'typeSel=' + JSON.stringify(dc2.getElementById('typeSel').value));
  push('  這條路徑也沒有 console error', err2.length === 0, err2.slice(0, 1).join('') || '乾淨');

  // site-index 真的用這個格式
  const si = JSON.parse(readFileSync(join(ROOT, 'data/site-index.json'), 'utf8'));
  const types = si.types || [];
  const ti = types.findIndex((t) => t.label === '副本');
  push('site-index 的副本指向副本圖鑑', ti >= 0 && types[ti].path === 'tools/duty-codex/',
    ti >= 0 ? types[ti].path : '(找不到副本類別)');
  const rows = (si.data || si.rows || []).filter((r) => r[1] === ti);
  push('  key 是 duty:<名稱>', rows.length > 400 && rows.every((r) => typeof r[2] === 'string' && r[2].indexOf('duty:') === 0),
    rows.length + ' 筆，例：' + (rows[0] ? rows[0][2] : ''));
}

// ── 2026-10-03：?id=duty:<id> 精確定位＋「資料列為此副本的產出」──────────────
async function openWith(query) {
  const vc3 = new VirtualConsole(); const err3 = [];
  vc3.on('jsdomError', (e) => err3.push(e.message));
  const d3 = new JSDOM(html, { runScripts: 'outside-only', url: 'https://seagod99.github.io/tools/duty-codex/' + query, virtualConsole: vc3 });
  const w3 = d3.window;
  w3.fetch = window.fetch;
  w3.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w3.eval(readFileSync(join(ROOT, 'assets/js/patch-gate.js'), 'utf8'));
  w3.eval([...w3.document.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 900));
  return { w: w3, doc: w3.document, err: err3 };
}
{
  const dun = JSON.parse(readFileSync(join(ROOT, 'data/dungeons.json'), 'utf8')).data;
  const cnt = {}; dun.forEach((d) => { cnt[d.name] = (cnt[d.name] || 0) + 1; });
  const dup = dun.find((d) => cnt[d.name] > 1);          // 同名副本（一般／高難度）
  const a = await openWith('?id=' + encodeURIComponent('duty:' + dup.id));
  push('?id=duty:<id> 在同名副本也只篩出那一個', a.doc.querySelectorAll('.duty').length === 1,
    `${dup.name}（id ${dup.id}，同名 ${cnt[dup.name]} 個）→ ${a.doc.querySelectorAll('.duty').length} 張`);
  push('  網址保留 id（可分享）', /id=duty%3A\d+|id=duty:\d+/.test(a.w.location.search), a.w.location.search);
  const b = await openWith('?id=' + encodeURIComponent('duty:' + dup.name));
  push('  舊的名稱連結仍可用（同名時列出全部）', b.doc.querySelectorAll('.duty').length === cnt[dup.name], `${b.doc.querySelectorAll('.duty').length} 張`);

  const drops = JSON.parse(readFileSync(join(ROOT, 'data/duty-drops.json'), 'utf8'));
  const dunIds = new Set(dun.map((d) => d.id));
  const badDuty = Object.keys(drops.data).filter((k) => !dunIds.has(+k));
  push('duty-drops 的副本 id 全都在 dungeons.json', badDuty.length === 0, `${Object.keys(drops.data).length} 個，錯 ${badDuty.length}`);
  const mounts = new Set(JSON.parse(readFileSync(join(ROOT, 'data/mounts.json'), 'utf8')).data.map((m) => 'id:' + m.id));
  const mountLinks = Object.values(drops.items).filter((it) => it[2] === 'collections/mounts/');
  push('  坐騎掉落的連結 key 都對得到坐騎頁 keyOf', mountLinks.length > 0 && mountLinks.every((it) => mounts.has(it[3])), `${mountLinks.length} 件`);
  const did = Object.keys(drops.data).find((k) => drops.data[k].some((i) => drops.items[i] && drops.items[i][2] === 'collections/mounts/'));
  const c = await openWith('?id=' + encodeURIComponent('duty:' + did));
  const det = c.doc.querySelector('details.drops');
  push('有掉落資料的副本卡片長出「資料列為此副本的產出」', !!det && /資料列為此副本的產出/.test(det.textContent), det ? det.querySelector('summary').textContent : '(沒有)');
  if (det) {
    det.open = true;
    det.dispatchEvent(new c.w.Event('toggle'));
    const a2 = det.querySelector('a[href*="collections/mounts/"]');
    push('  展開後坐騎連到坐騎頁的 ?id=', !!a2 && /\?id=id%3A\d+/.test(a2.getAttribute('href')), a2 ? a2.getAttribute('href') : '(沒有)');
    push('  註明來源與「不含機率」', /不含機率/.test(det.textContent), '');
  }
  // 掃程式碼的斷言要先拿掉註解（知識庫 §4.90）——註解裡正好寫著「不寫必掉」
  const code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
  push('  不寫「必掉」「機率 N%」之類的承諾', !/必掉|掉落率|機率 ?\d/.test(code), '');
  const si = JSON.parse(readFileSync(join(ROOT, 'data/site-index.json'), 'utf8'));
  const ti = si.types.findIndex((t) => t.label === '副本');
  const rows = si.data.filter((r) => r[1] === ti);
  push('命令面板的副本 key 改用 duty:<id>（同名不會篩出好幾張）', rows.length > 400 && rows.every((r) => /^duty:\d+$/.test(r[2])), rows[0] && rows[0][2]);
  push('  這幾條路徑都沒有 console error', [a, b, c].every((x) => x.err.length === 0), [a, b, c].flatMap((x) => x.err).slice(0, 1).join('') || '乾淨');
}

push('無 console error', errors.length === 0, errors.slice(0, 1).join('') || '乾淨');
push('沒有未捕捉的 rejection', unhandled.length === 0, unhandled.slice(0, 2).join(' | ') || '乾淨');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
