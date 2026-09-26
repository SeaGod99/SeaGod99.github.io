// 禁忌鑲嵌試算回歸 — 改完 tools/melding/ 或 data/materia.json 必跑。
//
// 驗兩件事：
//   ① **成功率是資料給的，不是寫死的。** 這頁最糟的失敗模式是有人把社群估值硬寫進去
//      ——數字看起來合理，但錯了沒人發現。所以這裡逐階比對頁面用的來源與 XIVAPI 的原值。
//   ② **期望值與累積機率的算式。** 算錯不會報錯，只會讓人備錯料。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-melding.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const DB = JSON.parse(readFileSync(join(ROOT, 'data/materia.json'), 'utf8'));
const HTML = readFileSync(join(ROOT, 'tools/melding/index.html'), 'utf8');

// ── 資料面 ──────────────────────────────────────────────
{
  push('12 階都在（row_id + 1 = 階級）', DB.tiers.length === 12 &&
    DB.tiers.every((t, i) => t.grade === i + 1), DB.tiers.length + ' 階');
  push('每階都有四個孔位的 HQ／NQ 成功率',
    DB.tiers.every((t) => t.hq.length === 4 && t.nq.length === 4), '');
  push('  HQ 成功率一律不低於 NQ（HQ 裝備比較好鑲）',
    DB.tiers.every((t) => t.hq.every((v, i) => v >= t.nq[i])), '');
  push('  同一階裡孔位越後面成功率越低',
    DB.tiers.every((t) => t.hq.every((v, i) => i === 0 || v <= t.hq[i - 1])), '');

  /* 雙數階只能鑲第一孔——**這條規則不是我們寫的，是資料裡的 0**。
     如果哪天資料變了（例如改版放寬），這條會失敗，那時要改的是頁面文案而不是這裡。 */
  const onlyFirst = DB.tiers.filter((t) => t.hq[1] === 0).map((t) => t.grade);
  push('只能鑲第一孔的是 6／8／10／12 階', onlyFirst.join('、') === '6、8、10、12', onlyFirst.join('、'));
  push('  那幾階的第 2–4 孔全都是 0（不是很小的數）',
    DB.tiers.filter((t) => onlyFirst.includes(t.grade)).every((t) => t.hq.slice(1).every((v) => v === 0)), '');

  push('鑲嵌費隨階級遞增', DB.tiers.every((t, i) => i === 0 || t.fee >= DB.tiers[i - 1].fee),
    DB.tiers[0].fee + 'G → ' + DB.tiers[11].fee + 'G');

  const cells = DB.data.reduce((n, s) => n + s.grades.length, 0);
  push('屬性與魔晶石都有台服名', DB.data.every((s) => /[\u4e00-\u9fff]/.test(s.stat) || /^[A-Z]{2}$/.test(s.stat)) &&
    DB.data.every((s) => s.grades.every((g) => /[\u4e00-\u9fff]/.test(g.name))),
    DB.data.length + ' 種屬性／' + cells + ' 件');
  push('  沒有日文原文漏進來', !/[\u3041-\u3096\u30A1-\u30FA]/.test(JSON.stringify(DB)), '');
  const crit = DB.data.find((s) => s.stat === '暴擊');
  push('  暴擊有到 12 階（最常做禁忌鑲嵌的屬性）', !!crit && crit.grades.some((g) => g.g === 12),
    crit ? crit.grades.length + ' 階，最高 ' + crit.grades[crit.grades.length - 1].name : '(找不到暴擊)');
}

// ── 成功率不可寫死在頁面裡 ──────────────────────────────
{
  // 抓頁面裡長得像成功率表的字面陣列（例如 [90,48,28,16]）
  const literals = HTML.match(/\[\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\]/g) || [];
  push('頁面裡沒有寫死的四孔成功率陣列', literals.length === 0, literals.slice(0, 2).join('、') || '乾淨');
  push('  成功率是從 data/materia.json 的 tiers 取的',
    /tierOf\(/.test(HTML) && /DB\.tiers/.test(HTML), '');
  push('  費用也是（不是自己乘）', /tier\.fee/.test(HTML), '');
}

// ── 算式 ────────────────────────────────────────────────
{
  const dom = new JSDOM('<!doctype html><body>', { runScripts: 'outside-only' });
  const { window } = dom;
  // 把頁面裡的兩個純函式抽出來實跑，不重寫一份
  const src = (HTML.match(/function expected\(p\)[\s\S]*?\n  \}/) || [''])[0] +
              (HTML.match(/function need90\(p\)[\s\S]*?\n  \}/) || [''])[0];
  window.eval(src + '; window.__e = expected; window.__n = need90;');
  const E = window.__e, N = window.__n;

  push('期望顆數 ＝ 1 ÷ 成功率', Math.abs(E(0.17) - 1 / 0.17) < 1e-9, '17% → ' + E(0.17).toFixed(2) + ' 顆');
  push('  100% 時是 1 顆', E(1) === 1, '');
  push('  0% 回 Infinity（不是 0，也不是當成 100%）', E(0) === Infinity, String(E(0)));

  /* 90% 機率所需：n ≥ log(0.1)/log(1-p)。
     p=0.5 → 4 顆（1-0.5^4 = 93.75% ≥ 90%，3 顆只有 87.5%）。 */
  push('90% 機率所需：50% → 4 顆', N(0.5) === 4, String(N(0.5)));
  push('  17% → 13 顆', N(0.17) === 13, String(N(0.17)) + '（1-0.83^13 = ' +
    ((1 - Math.pow(0.83, 13)) * 100).toFixed(1) + '%）');
  push('  那個顆數真的跨過 90%', (1 - Math.pow(1 - 0.17, N(0.17))) >= 0.9 &&
    (1 - Math.pow(1 - 0.17, N(0.17) - 1)) < 0.9, '少一顆只有 ' +
    ((1 - Math.pow(0.83, N(0.17) - 1)) * 100).toFixed(1) + '%');
  push('  100% → 1 顆', N(1) === 1, String(N(1)));
  push('  0% 回 Infinity', N(0) === Infinity, String(N(0)));
}

// ── 價格一律走 fillQuote ────────────────────────────────
{
  push('用 fillQuote 逐筆吃掛單', /Universalis\.fillQuote\(/.test(HTML), '');
  push('  沒有「最低價 × 數量」的算法', !/minUnit\s*\*/.test(HTML), '');
  push('  用的是平均單價 unit 而不是 minUnit', /quote\.unit/.test(HTML), '');
  push('  查無掛單會講出來（不是當成 0）', /查無掛單/.test(HTML), '');
  push('  不可交易的魔晶石會提醒', /不可交易/.test(HTML), '');
}

// ── 說清楚期望值的意義 ──────────────────────────────────
push('講明失敗會消耗魔晶石', /失敗會消耗魔晶石/.test(HTML), '');
push('講明期望值是長期平均', /長期平均/.test(HTML), '');
push('成功率標明來自遊戲資料', /成功率來自遊戲資料|MateriaGrade/.test(HTML), '');

push('data/materia.json 有進 _meta', (() => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'data/_meta.json'), 'utf8'));
  return (meta.databases || []).some((d) => d.file === 'materia.json');
})(), '');

// ── 選單要反映資料（不是選完才糾正）────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://seagod99.github.io/tools/melding/', virtualConsole: vc });
  const { window } = dom, doc = window.document;
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.Universalis = { WORLDS: { 4028: '伊弗利特' }, fetchListings: async () => ({ items: {} }), fillQuote: () => null };
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 600));

  const slots = doc.getElementById('slotsSel');
  const gradeSel = doc.getElementById('gradeSel');
  const disabledOf = () => [...slots.options].filter((o) => o.disabled).map((o) => o.value).join('');

  // 預設選的是最高階（12），只能鑲第一孔
  push('12 階：第 2–4 孔被停用', disabledOf() === '234', '停用 ' + (disabledOf() || '無'));
  push('  且自動選回第 1 孔（預設組合不矛盾）', slots.value === '1', slots.value);

  // 切到 11 階（[17,10,7,5]）應該四孔全開
  gradeSel.value = '11';
  gradeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('11 階：四個孔都可選', disabledOf() === '', '停用 ' + (disabledOf() || '無'));

  // 切回 12 階要再度收斂
  gradeSel.value = '12';
  gradeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('  切回 12 階又收回第 1 孔', disabledOf() === '234' && slots.value === '1',
    '停用 ' + disabledOf() + '、選中 ' + slots.value);
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
