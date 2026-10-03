// 潛水艇航點查詢回歸 — 改完 tools/submarine/ 或 data/submarine.json 必跑。
//
// 最重要的一條：**部位名不可以從 `SubmarinePart.Slot` 編號推。**
// 實測 Slot 編號與道具順序完全不一致，照順序猜會四個部位全錯：
//   船首→Slot 2、艦橋→Slot 3、船體→Slot 0、船尾→Slot 1
// 正確關聯是 `Item.AdditionalData` = SubmarinePart 的 row id（同幻卡那條，§4.10）。
// 猜錯的話畫面上仍然有四個下拉選單、數值也照加，只是**全部加錯**。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-submarine.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const DB = JSON.parse(readFileSync(join(ROOT, 'data/submarine.json'), 'utf8'));
const HTML = readFileSync(join(ROOT, 'tools/submarine/index.html'), 'utf8');
const ITEMS = JSON.parse(readFileSync(join(ROOT, 'data/items.json'), 'utf8')).data;
const byId = new Map(ITEMS.map((i) => [i.id, i]));

// ── 部件 ────────────────────────────────────────────────
{
  push('部件 40 件（10 級 × 4 部位）', DB.parts.length === 40, DB.parts.length + ' 件');
  const bySlot = {};
  DB.parts.forEach((p) => { bySlot[p.slot] = (bySlot[p.slot] || 0) + 1; });
  push('  四個部位各 10 件', Object.keys(bySlot).length === 4 &&
    Object.values(bySlot).every((n) => n === 10), JSON.stringify(bySlot));

  /* 部位名必須與道具分類一致——那是台服官方的字，不是我們分的。 */
  const badSlot = DB.parts.filter((p) => {
    const it = byId.get(p.itemId);
    return !it || it.category !== '潛水艇組件（' + p.slot + '）';
  });
  push('部位名與道具分類逐件一致', badSlot.length === 0,
    badSlot.slice(0, 2).map((p) => p.name + '→' + p.slot).join('、') || DB.parts.length + ' 件全對');

  /* **Slot 編號與部位順序不一致**——這條就是用來擋「照順序猜」的。
     同一個 class 的四件，它們的 partId 必須不是照 船體/船首/船尾/艦橋 的自然順序遞增。 */
  const cls = DB.parts[0].class;
  const same = DB.parts.filter((p) => p.class === cls);
  push('同一級有四件', same.length === 4, same.map((p) => p.slot).join('、'));
  const byName = {};
  same.forEach((p) => { byName[p.slot] = p.partId; });
  push('  partId 不是照「船體→船首→船尾→艦橋」遞增（證明不能猜）',
    !(byName['船體'] < byName['船首'] && byName['船首'] < byName['船尾'] && byName['船尾'] < byName['艦橋']),
    ['船體', '船首', '船尾', '艦橋'].map((s) => s + '=' + byName[s]).join('、'));

  push('每件都有台服名', DB.parts.every((p) => /[\u4e00-\u9fff]/.test(p.name)), '');
  push('  數值欄位齊全', DB.parts.every((p) =>
    ['speed', 'range', 'surveillance', 'retrieval', 'favor'].every((k) => typeof p[k] === 'number')), '');
  push('  有負值的數值（沒有被誤當成缺值濾掉）', DB.parts.some((p) => p.range < 0 || p.surveillance < 0),
    DB.parts.filter((p) => p.range < 0 || p.surveillance < 0).length + ' 件有負值');
}

// ── 航點 ────────────────────────────────────────────────
{
  push('航點 123 個', DB.destinations.length === 123, DB.destinations.length + ' 個');
  push('  每個都有台服名', DB.destinations.every((d) => /[\u4e00-\u9fff]/.test(d.name)), '');
  push('  沒有日文原文', !/[\u3041-\u3096\u30A1-\u30FA]/.test(JSON.stringify(DB.destinations.map((d) => d.name))), '');
  push('  桶數只有 1／2／3／6', [...new Set(DB.destinations.map((d) => d.tanks))].sort((a, b) => a - b).join('／') === '1／2／3／6',
    [...new Set(DB.destinations.map((d) => d.tanks))].sort((a, b) => a - b).join('／'));
  push('  階級需求遞增到 130', Math.max(...DB.destinations.map((d) => d.rankReq)) === 130,
    Math.min(...DB.destinations.map((d) => d.rankReq)) + '–' + Math.max(...DB.destinations.map((d) => d.rankReq)));
  push('  時間與經驗都是正數', DB.destinations.every((d) => d.minutes > 0 && d.exp > 0), '');
}

// ── 明說不提供多點航程試算 ──────────────────────────────
{
  push('頁面講明不提供多點航程桶數試算', /不提供「勾幾個點跑一趟要幾桶」|公式不在遊戲資料裡/.test(HTML), '');
  push('  資料檔的 note 也寫了', /多點航程.*不提供|不在遊戲資料裡/.test(DB.note || ''), (DB.note || '').slice(-40));
  // 頁面裡不該出現任何「把多個航點的桶數加總」的算式
  push('  頁面沒有加總桶數的程式碼', !/tanks[\s\S]{0,40}reduce|reduce[\s\S]{0,40}tanks/.test(HTML), '');
}

// ── 前端 ────────────────────────────────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    url: 'https://seagod99.github.io/tools/submarine/?rank=60',
    virtualConsole: vc,
  });
  const { window } = dom, doc = window.document;
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 700));

  push('四個部位都有下拉選單', doc.querySelectorAll('#partFields select').length === 4,
    [...doc.querySelectorAll('#partFields select')].map((s) => s.dataset.slot).join('、'));
  push('  每個選單 10 個選項', [...doc.querySelectorAll('#partFields select')].every((s) => s.options.length === 10), '');

  const trs = () => doc.querySelectorAll('#tbody tr');
  push('列出全部航點', trs().length === DB.destinations.length, trs().length + ' 列');

  /* 去得了的要排前面——只依經驗／小時排的話，階級 60 會先看到 82 個灰掉的高階航點。 */
  const cls = [...trs()].map((tr) => tr.classList.contains('locked'));
  const firstLocked = cls.indexOf(true);
  const lastOpen = cls.lastIndexOf(false);
  push('去得了的排在前面', firstLocked > 0 && lastOpen < firstLocked,
    '第一個灰掉的在第 ' + firstLocked + ' 列、最後一個可去的在第 ' + lastOpen + ' 列');
  push('  可去的數量與階級相符', firstLocked === DB.destinations.filter((d) => d.rankReq <= 60).length,
    firstLocked + ' vs 資料 ' + DB.destinations.filter((d) => d.rankReq <= 60).length);

  // 同組內依經驗／小時遞減
  const perHr = [...trs()].slice(0, firstLocked).map((tr) => +tr.cells[7].textContent.replace(/,/g, ''));
  push('  可去的那組依經驗／小時遞減', perHr.every((v, i) => i === 0 || v <= perHr[i - 1]),
    perHr.slice(0, 3).join(' ≥ '));

  // 數值合計
  const tot = [...doc.querySelectorAll('#totals .tot')].map((e) => e.textContent.trim());
  push('有數值合計', tot.length >= 5, tot.join('　'));
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

/* ── 四艘存檔 ────────────────────────────────────────────
   一個部隊最多四艘，玩家真的會分別配索敵艇／回收艇。三個會安靜出錯的地方：
     ① **切艇前沒先存**，剛改的那一艘就丟了（而且看不出來，因為畫面已經換掉了）。
     ② **存選單的索引而不是 itemId**，改版一加部件就整份錯位——
        選到的還是個有效部件，只是不是你選的那個。
     ③ **本機存檔蓋掉網址參數**，那別人分享的配置連結就等於沒用。 */
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    url: 'https://seagod99.github.io/tools/submarine/',
    virtualConsole: vc,
  });
  const { window } = dom, doc = window.document;
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } },
  });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 700));

  const boats = () => [...doc.querySelectorAll('.boat')];
  push('四艘固定存在（遊戲裡就是四格，不是可增刪的清單）', boats().length === 4, boats().length + ' 個');
  push('  只有一艘是選取狀態',
    boats().filter((b) => b.getAttribute('aria-pressed') === 'true').length === 1, '');
  push('  每個頁籤都顯示那一艇的階級',
    boats().every((b) => /階級 \d+/.test(b.textContent)), boats()[0].textContent.trim());

  // 在 1 號艇改階級與一個部件
  const rank = doc.getElementById('rankIn');
  const sel0 = doc.querySelector('#partFields select');
  rank.value = '77';
  rank.dispatchEvent(new window.Event('input', { bubbles: true }));
  const pick = sel0.options[2].value;
  sel0.value = pick;
  sel0.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('改動即時存起來', !!store.ffxiv_submarine_boats, '');
  push('  key 是 ffxiv_ 開頭（否則首頁備份掃不到）',
    Object.keys(store).every((k) => k.indexOf('ffxiv_') === 0), Object.keys(store).join('、'));
  const saved = JSON.parse(store.ffxiv_submarine_boats);
  push('  存的是 itemId 不是選單索引（改版加部件才不會錯位）',
    Object.values(saved.boats[0].parts).every((v) => Number(v) > 100),
    JSON.stringify(saved.boats[0].parts));
  push('  頁籤上的階級跟著更新', /階級 77/.test(boats()[0].textContent), boats()[0].textContent.trim());

  // 切到 2 號艇：應該是預設值，且 1 號的不能被覆蓋
  boats()[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('切到 2 號艇時階級回到預設（各艇獨立）', rank.value === '1', 'rank=' + rank.value);
  push('  aria-pressed 跟著移過去',
    boats()[1].getAttribute('aria-pressed') === 'true' && boats()[0].getAttribute('aria-pressed') === 'false', '');
  const s2 = JSON.parse(store.ffxiv_submarine_boats);
  push('  1 號艇的設定還在（切艇前先存了）', s2.boats[0].rank === 77, 's2.boats[0].rank=' + s2.boats[0].rank);
  push('  active 記下來了', s2.active === 1, 'active=' + s2.active);

  // 切回 1 號艇：值要回來
  boats()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('切回 1 號艇值回得來', rank.value === '77' && sel0.value === pick,
    'rank=' + rank.value + '／part=' + (sel0.value === pick ? '相同' : '不同'));

  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

/* 網址參數優先於本機存檔 */
{
  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    url: 'https://seagod99.github.io/tools/submarine/?rank=120',
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom, doc = window.document;
  const store = { ffxiv_submarine_boats: JSON.stringify({ active: 0, boats: [{ parts: {}, rank: 33 }, {}, {}, {}] }) };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: () => {}, key: () => null, get length() { return 0; } },
  });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 700));
  push('網址參數優先於本機存檔（不然分享連結等於沒用）',
    doc.getElementById('rankIn').value === '120',
    '存檔是 33、網址是 120 → ' + doc.getElementById('rankIn').value);
  push('  套用後寫回當前那一艘', JSON.parse(store.ffxiv_submarine_boats).boats[0].rank === 120,
    'boats[0].rank=' + JSON.parse(store.ffxiv_submarine_boats).boats[0].rank);
}

/* 掉落物：資料裡沒有，所以頁面要講明不做（同 §4.71 的優雷卡 NM 天氣） */
{
  push('頁面講明不提供「哪個航點掉什麼」', /不提供「哪個航點掉什麼」/.test(HTML), '');
  push('  並寫出理由（資料表裡沒有掉落欄位）',
    /SubmarineExplorationLog/.test(HTML) && /只有名稱與地點/.test(HTML), '');
  push('  資料檔裡沒有 drops 欄位（對不到就不放）',
    !JSON.stringify(DB).includes('"drops"'), '');
}

// ── 飛空艇（2026-10-03）──────────────────────────────────
/* 同一條鐵則：部位名取自道具分類、部件靠 AdditionalData 對 AirshipExplorationPart，
   航點名 row id 對齊之外再用「Sea of Clouds NN ↔ 雲海NN」驗一次；載客航班不是探索航點。
   飛空艇的等級表沒有能力值加成，頁面只做相加，不判定成功與否。 */
{
  const A = DB.airship || { parts: [], destinations: [], levels: [] };
  push('飛空艇部件 28 件、四個部位各 7 件', A.parts.length === 28 &&
    ['船體', '艤裝', '船首', '船尾'].every((s) => A.parts.filter((p) => p.slot === s).length === 7), A.parts.length + ' 件');
  const bad = A.parts.filter((p) => byId.get(p.itemId)?.category !== '飛空艇組件（' + p.slot + '）');
  push('  部位名與道具分類逐件一致（不從 Slot 推）', bad.length === 0, bad.slice(0, 2).map((p) => p.name).join('、'));
  push('  partId 1–28 一對一', new Set(A.parts.map((p) => p.partId)).size === 28 && A.parts.every((p) => p.partId >= 1 && p.partId <= 28), '');
  push('飛空艇航點 24 個，名稱都是「雲海NN」', A.destinations.length === 24 && A.destinations.every((d) => /^雲海\d\d$/.test(d.name)), A.destinations.length + ' 個');
  push('  載客航班（雲冠群島）不收', !A.destinations.some((d) => /雲冠/.test(d.name)), '');
  push('  建置腳本用英文名驗 row id 對齊', /Sea of Clouds \(\\d\+\)/.test(readFileSync(join(ROOT, 'scripts/build-submarine.mjs'), 'utf8')), '');
  push('等級表 50 階、只有可載量與升級經驗（沒有能力值加成）', A.levels.length === 50 &&
    A.levels.every((l) => Object.keys(l).sort().join() === 'capacity,expToNext,rank'), A.levels.length + ' 階');

  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const store = { ffxiv_airship: JSON.stringify({ parts: { 船體: A.parts.find((p) => p.slot === '船體' && p.class === 7)?.itemId }, rank: 20 }) };
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://seagod99.github.io/tools/submarine/?t=air', virtualConsole: vc });
  const { window } = dom, doc = window.document;
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; } } });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 800));
  push('?t=air 直接停在飛空艇分頁', doc.getElementById('airView').hidden === false && doc.getElementById('subView').hidden === true &&
    doc.getElementById('modeAir').getAttribute('aria-pressed') === 'true', window.location.search);
  push('  四個部位的選單、每個 7 個選項', [...doc.querySelectorAll('#airFields select')].length === 4 &&
    [...doc.querySelectorAll('#airFields select')].every((s) => s.options.length === 7), '');
  push('  存檔還原：階級 20、船體是存的那件', doc.getElementById('airRank').value === '20' &&
    +doc.getElementById('al-船體').value === JSON.parse(store.ffxiv_airship).parts.船體, '');
  const sel = [...doc.querySelectorAll('#airFields select')].map((s) => A.parts.find((p) => p.itemId === +s.value));
  const want = ['surveillance', 'retrieval', 'speed', 'range', 'favor'].map((k) => sel.reduce((t, p) => t + p[k], 0));
  const got = [...doc.querySelectorAll('#airTotals .tot b')].slice(0, 5).map((b) => +b.textContent);
  push('  能力值＝四件部件相加（不加等級加成）', JSON.stringify(want) === JSON.stringify(got), got.join('／'));
  const trs = [...doc.querySelectorAll('#airBody tr')];
  const firstLocked = trs.findIndex((tr) => tr.classList.contains('locked'));
  push('  24 列、階級 20 去得了的排前面', trs.length === 24 && firstLocked === A.destinations.filter((d) => d.rankReq <= 20).length, `第一個灰掉的在第 ${firstLocked} 列`);
  doc.getElementById('airRank').value = '35';
  doc.getElementById('airRank').dispatchEvent(new window.Event('input', { bubbles: true }));
  push('  改階級會存回 ffxiv_airship（存 itemId）', JSON.parse(store.ffxiv_airship).rank === 35 &&
    Object.values(JSON.parse(store.ffxiv_airship).parts).every((id) => A.parts.some((p) => p.itemId === id)), store.ffxiv_airship);
  push('  停在飛空艇分頁時網址不被潛水艇參數蓋掉', window.location.search === '?t=air', window.location.search);
  doc.getElementById('modeSub').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  push('  切回潛水艇：網址換回潛水艇的參數', /rank=/.test(window.location.search) && doc.getElementById('airView').hidden === true, window.location.search);
  push('  頁面講明不判定成功、沒有等級加成', /不判定/.test(HTML) && /沒有能力值加成/.test(HTML), '');
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

push('data/submarine.json 有進 _meta', (() => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'data/_meta.json'), 'utf8'));
  return (meta.databases || []).some((d) => d.file === 'submarine.json');
})(), '');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
