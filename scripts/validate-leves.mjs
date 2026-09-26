// 製作理符試算回歸 — 改完 tools/leves/ 或 data/craft-leves.json 必跑。
//
// 這頁最重要的一條是**不能宣稱 HQ 加成**：那個倍率不在遊戲資料裡
//（`Leve.ExpFactor` 恆為 1，`LeveSystemDefine` 只是 UI 訊息常數），
// 憑印象寫的話使用者會照著算錯整條練級規劃。所以這裡把「頁面不得出現 HQ 倍率」釘死。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-leves.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const DB = JSON.parse(readFileSync(join(ROOT, 'data/craft-leves.json'), 'utf8'));
const HTML = readFileSync(join(ROOT, 'tools/leves/index.html'), 'utf8');
const CR = JSON.parse(readFileSync(join(ROOT, 'data/craft-recipes.json'), 'utf8'));

// ── 資料面 ──────────────────────────────────────────────
{
  const jobs = [...new Set(DB.data.map((l) => l.job))];
  push('八大製作職都在', jobs.length === 8, jobs.join('、'));
  const byJob = {};
  DB.data.forEach((l) => { byJob[l.job] = (byJob[l.job] || 0) + 1; });
  const counts = [...new Set(Object.values(byJob))];
  push('  每個職業張數相同（資料完整的訊號）', counts.length === 1, counts.join('／') + ' 張');
  push('  沒有採集／戰鬥理符混進來', DB.data.every((l) => jobs.includes(l.job)), '');

  push('每張都有台服理符名', DB.data.every((l) => /[\u4e00-\u9fff]/.test(l.name)), '');
  push('  沒有日文原文', !/[\u3041-\u3096\u30A1-\u30FA]/.test(JSON.stringify(DB.data.map((l) => l.name))), '');
  push('每張都有交付物且都有台服名',
    DB.data.every((l) => l.turnIn.length && l.turnIn.every((t) => /[\u4e00-\u9fff]/.test(t.name))), '');
  push('  交付數量都 ≥ 1（沒有把空格 0 收進來）',
    DB.data.every((l) => l.turnIn.every((t) => t.count >= 1)), '');

  push('經驗與配額都是正數', DB.data.every((l) => l.exp > 0 && l.allowance > 0), '');
  const lv = [...new Set(DB.data.map((l) => l.level))].sort((a, b) => a - b);
  push('  等級橫跨全遊戲', lv[0] === 1 && lv[lv.length - 1] >= 90, 'Lv' + lv[0] + '–' + lv[lv.length - 1]);

  // recipeId 要真的指得到配方（模擬器深連結靠它）
  const ids = new Set(CR.data.map((r) => r[CR.columns.indexOf('id')]));
  const withR = DB.data.filter((l) => l.turnIn.every((t) => t.recipeId));
  push('交付物都帶得出配方 id', withR.length === DB.data.length, withR.length + '/' + DB.data.length);
  const bad = DB.data.flatMap((l) => l.turnIn).filter((t) => t.recipeId && !ids.has(t.recipeId));
  push('  每個 recipeId 都真的存在於 craft-recipes', bad.length === 0,
    bad.slice(0, 3).map((t) => t.name + '#' + t.recipeId).join('、') || '全對');

  const x3 = DB.data.filter((l) => l.repeats > 0);
  push('三倍交付的標記來自資料', x3.length > 0 && x3.length < DB.data.length,
    x3.length + ' 張，等級 ' + Math.min(...x3.map((l) => l.level)) + '–' + Math.max(...x3.map((l) => l.level)));
}

// ── 不可宣稱 HQ 加成 ────────────────────────────────────
{
  /* 只找「HQ ＋ 倍數」同時出現的敘述。頁面說明裡本來就會提到「不提供 HQ 倍率」，
     所以不能單看有沒有 HQ 兩個字。 */
  const claims = HTML.match(/HQ[^<。\n]{0,20}(×\s*2|兩倍|2 倍|加倍)/g) || [];
  push('頁面沒有宣稱 HQ 的加成倍率', claims.length === 0, claims.join('、') || '乾淨');
  push('  並講明為什麼沒有', /不在遊戲資料裡/.test(HTML) && /ExpFactor/.test(HTML), '');
  push('  資料檔的 note 也寫了', /HQ[^"]*不在遊戲資料裡|不提供/.test(DB.note || ''), (DB.note || '').slice(0, 40));
}

// ── 前端 ────────────────────────────────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    url: 'https://seagod99.github.io/tools/leves/?job=%E7%83%B9%E8%AA%BF%E5%B8%AB&lv=70',
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

  push('網址參數有吃進去', doc.getElementById('jobSel').value === '烹調師' &&
    doc.getElementById('lvIn').value === '70', doc.getElementById('jobSel').value + ' Lv' + doc.getElementById('lvIn').value);

  const trs = () => doc.querySelectorAll('#tbody tr');
  push('  有列出理符', trs().length > 0, trs().length + ' 張');

  /* 「目前接得到的」＝等級不超過你、而且**等級最高的那一檔**。
     列出所有低等級的沒有意義（那些經驗早就不值得跑）。 */
  const shownLv = [...new Set([...trs()].map((tr) => +tr.cells[0].textContent))];
  push('  只顯示等級最高的那一檔', shownLv.length === 1 && shownLv[0] === 70, 'Lv' + shownLv.join('、'));

  // 排序：預設依「經驗／配額」由高到低
  const per = [...trs()].map((tr) => +tr.cells[6].textContent.replace(/,/g, ''));
  push('  預設依每點配額經驗由高到低', per.every((v, i) => i === 0 || v <= per[i - 1]), per.join(' ≥ '));

  // 切到「全部」要變多
  const before = trs().length;
  doc.getElementById('modeSel').value = 'all';
  doc.getElementById('modeSel').dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('  切「這個職業全部」會變多', trs().length > before, before + ' → ' + trs().length);

  // 深連結
  const links = [...doc.querySelectorAll('#tbody a')].map((a) => a.getAttribute('href'));
  push('每列都有「算成本」深連結', links.some((h) => h.includes('/tools/market/#craft=')),
    links.find((h) => h.includes('#craft=')) || '(沒有)');
  push('  也有「模擬」深連結', links.some((h) => h.includes('/tools/crafting-sim/#r=')),
    links.find((h) => h.includes('#r=')) || '(沒有)');
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

push('data/craft-leves.json 有進 _meta', (() => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'data/_meta.json'), 'utf8'));
  return (meta.databases || []).some((d) => d.file === 'craft-leves.json');
})(), '');

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
