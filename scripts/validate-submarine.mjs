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

push('data/submarine.json 有進 _meta', (() => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'data/_meta.json'), 'utf8'));
  return (meta.databases || []).some((d) => d.file === 'submarine.json');
})(), '');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
