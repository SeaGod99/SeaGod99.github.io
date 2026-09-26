// 練級裝備路線回歸 — 改完 tools/leveling-gear/ 或 data/leveling-gear/ 必跑。
//
// 三個安靜的失敗模式：
//   ① **前緣算錯**：每個職業×部位只存「可穿的最高 ilvl 換人時」那一筆。
//      算錯的話畫面上仍然有東西，只是少了幾階或多了沒意義的列。
//   ② **取得管道沒填上**：`ItemSources.getMany()` 失敗時那一欄只是留白，不會報錯。
//   ③ **槽位對照表寫死錯了**：slot 13 是雙手武器不是靈魂水晶，寫錯整頁的分組都跑掉。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-leveling-gear.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const DIR = join(ROOT, 'data/leveling-gear');
const IDX = JSON.parse(readFileSync(join(DIR, '_index.json'), 'utf8'));
const HTML = readFileSync(join(ROOT, 'tools/leveling-gear/index.html'), 'utf8');
const ITEMS = JSON.parse(readFileSync(join(ROOT, 'data/items.json'), 'utf8')).data;
const byId = new Map(ITEMS.map((i) => [i.id, i]));

// ── 資料面 ──────────────────────────────────────────────
{
  const files = readdirSync(DIR).filter((f) => /^[A-Z]{3}\.json$/.test(f));
  push('每個職業一個檔', files.length === IDX.jobs.length, files.length + ' 檔 / 索引 ' + IDX.jobs.length);
  push('  索引裡的職業都有繁中名', IDX.jobs.every((j) => /[\u4e00-\u9fff]/.test(j.name)),
    IDX.jobs.slice(0, 4).map((j) => j.name).join('、'));

  /* 槽位對照：**13 是雙手武器不是靈魂水晶**。用資料自己驗——
     拿該 slot 的物品分類眾數對一次，寫錯就會看出來。 */
  const catOf = (slot) => {
    const c = {};
    ITEMS.forEach((i) => { if (i.equip && i.equip.slot === slot) c[i.category] = (c[i.category] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  };
  const checks = [[3, '頭部防具'], [4, '身體防具'], [9, '耳飾'], [12, '戒指']];
  for (const [slot, want] of checks) {
    const top = catOf(slot);
    push(`slot ${slot} 的眾數分類是「${want}」`, top && top[0] === want, top ? top[0] + ' ' + top[1] + ' 件' : '(無)');
  }
  const top13 = catOf(13);
  push('slot 13 是武器（雙手），不是靈魂水晶', top13 && /槍|斧|武器|弓|刀|杖|書/.test(top13[0]),
    top13 ? top13[0] : '(無)');
  push('  對照表裡 13 標成「雙手武器」', IDX.slotNames['13'] === '雙手武器', IDX.slotNames['13']);
  push('  沒有 slot 6（腰帶 6.0 已移除）', !IDX.slotNames['6'] &&
    !ITEMS.some((i) => i.equip && i.equip.slot === 6), '');

  // 前緣本身：ilvl 嚴格遞增、等級不遞減
  const job = JSON.parse(readFileSync(join(DIR, 'DRG.json'), 'utf8'));
  let badMono = [], badLv = [];
  for (const [slot, list] of Object.entries(job.slots)) {
    for (let i = 1; i < list.length; i++) {
      if (list[i].ilvl <= list[i - 1].ilvl) badMono.push(slot + '#' + i);
      if (list[i].lv < list[i - 1].lv) badLv.push(slot + '#' + i);
    }
  }
  push('前緣的 ilvl 嚴格遞增', badMono.length === 0, badMono.slice(0, 3).join('、') || '龍騎士全部位皆是');
  push('  等級門檻不遞減', badLv.length === 0, badLv.slice(0, 3).join('、') || '正確');

  // 每筆都要對得回 items.json，且台服名一致
  const flat = Object.values(job.slots).flat();
  const bad = flat.filter((x) => {
    const it = byId.get(x.id);
    return !it || it.name !== x.name || (it.ilvl || 0) !== x.ilvl;
  });
  push('每筆都對得回 items.json 且名稱／ilvl 一致', bad.length === 0,
    bad.slice(0, 2).map((x) => x.name).join('、') || flat.length + ' 筆全對');
  push('  沒有日文原文', !/[\u3041-\u3096\u30A1-\u30FA]/.test(JSON.stringify(flat.map((x) => x.name))), '');

  /* 那件 Lv1／i560 的耳飾是**真資料**，不該被排除掉。
     它存在這件事本身要驗——哪天上游改了，頁面文案也要跟著改。 */
  const ear = (job.slots['9'] || []);
  const lowLvHighIlvl = ear.filter((x) => x.lv <= 10 && x.ilvl >= 400);
  push('Lv1 就能裝備的高品級配件仍在資料裡（沒被誤刪）', lowLvHighIlvl.length > 0,
    lowLvHighIlvl.map((x) => x.name + ' Lv' + x.lv + ' i' + x.ilvl).join('、') || '(沒有了——頁面說明要改)');
}

// ── 前端 ────────────────────────────────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    url: 'https://seagod99.github.io/tools/leveling-gear/?job=DRG&lv=70',
    virtualConsole: vc,
  });
  const { window } = dom, doc = window.document;
  const fetched = [];
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    fetched.push(rel);
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  Object.defineProperty(window.Document.prototype, 'currentScript', {
    configurable: true, get: () => ({ src: 'https://x/assets/js/item-sources.js' }),
  });
  window.eval(readFileSync(join(ROOT, 'assets/js/item-sources.js'), 'utf8'));
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 1400));

  push('網址參數有吃進去', doc.getElementById('jobSel').value === 'DRG' &&
    doc.getElementById('lvIn').value === '70', doc.getElementById('jobSel').value + ' Lv' + doc.getElementById('lvIn').value);
  const slots = doc.querySelectorAll('.slot');
  push('  畫出各部位', slots.length >= 10, slots.length + ' 個部位');
  push('  預設每部位 3 個候選', doc.querySelectorAll('.slot')[0].querySelectorAll('.cand').length === 3,
    doc.querySelectorAll('.slot')[0].querySelectorAll('.cand').length + ' 個');
  push('  第一個候選標成 best', !!doc.querySelector('.cand.best'), '');

  // 顯示的每一件都必須是「等級 ≤ 70」
  const lvs = [...doc.querySelectorAll('.cand .meta')].map((e) => {
    const m = /Lv(\d+)/.exec(e.textContent); return m ? +m[1] : null;
  }).filter((x) => x != null);
  push('  沒有超過等級的裝備', lvs.every((l) => l <= 70), lvs.filter((l) => l > 70).slice(0, 3).join('、') || lvs.length + ' 件全對');

  // ② 取得管道真的有填上
  const srcEls = [...doc.querySelectorAll('[data-src]')];
  const filled = srcEls.filter((e) => e.textContent.trim().length > 0);
  push('取得管道有填上（不是永遠留白）', filled.length > 0,
    filled.length + '/' + srcEls.length + ' 件　例：' + (filled[0] ? filled[0].textContent.slice(0, 40) : ''));
  push('  有去載分片層', fetched.some((u) => u.includes('item-sources/')),
    fetched.filter((u) => u.includes('item-sources')).slice(0, 2).join('、') || '沒載');

  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

// ── 說清楚做不到的事 ────────────────────────────────────
push('頁面講明只依 ilvl 不算副屬性', /不算副屬性/.test(HTML), '');
push('  講明為什麼每部位列多個', /Lv1 就能裝備但品級很高|列第一名/.test(HTML), '');
push('  取得管道查不到會講「沒寫不代表拿不到」', /沒寫不代表拿不到/.test(HTML), '');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
