// 部族聲望試算回歸 — 改完 tools/beast-tribes/ 或 data/beast-tribes.json 必跑。
//
// 四個會安靜出錯的地方：
//   ① **部族名接錯表。** 上游的 `tribes`（Teamcraft `tw/tw-tribes.json`）是**玩家種族**
//      （中原之民＝Midlander），而它的 row id 恰好與 `BeastTribe` 的前 16 列對得上——
//      照 id 接會得到 16 個看起來很正常但全錯的名字（同 §4.10）。
//      所以本站以**貨幣道具名**標示，資料檔裡不可以出現那些種族名。
//   ② **「盟友」階的門檻是 0。** 它不是靠聲望累積解鎖的（要先做完盟友部族任務），
//      照抄 0 會讓試算算出「立刻就到」。資料裡要寫 null，試算不可把它當終點。
//   ③ **`BeastTribe.MinLevel` 有 11 列是 0**，不是接取等級。等級要取任務的 `ClassJobLevel`。
//   ④ **「每天接幾個」不在資料裡**（是遊戲配額規則），不可以寫死成事實。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-beast-tribes.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const DB = JSON.parse(readFileSync(join(ROOT, 'data/beast-tribes.json'), 'utf8'));
const HTML = readFileSync(join(ROOT, 'tools/beast-tribes/index.html'), 'utf8');
const BUILD = readFileSync(join(ROOT, 'scripts/build-beast-tribes.mjs'), 'utf8');
const ITEMS = new Map(JSON.parse(readFileSync(join(ROOT, 'data/items.json'), 'utf8')).data.map((i) => [i.id, i.name]));

// ── 資料 ────────────────────────────────────────────────
{
  push('18 個部族', DB.data.length === 18, DB.data.length + ' 個');
  push('  9 階都在', DB.ranks.length === 9, DB.ranks.map((r) => r.name).join('、'));
  push('  階級名都是台服名', DB.ranks.every((r) => /[\u4e00-\u9fff]/.test(r.name)), '');
  push('  沒有日文假名', !/[\u3041-\u3096\u30A1-\u30FA]/.test(JSON.stringify(DB)), '');

  push('每個部族都有貨幣道具（那就是識別）',
    DB.data.every((t) => t.currency && t.currency.id && t.currency.name), '');
  push('  貨幣名與 items.json 一致（不是自己編的）',
    DB.data.every((t) => ITEMS.get(t.currency.id) === t.currency.name),
    DB.data.filter((t) => ITEMS.get(t.currency.id) !== t.currency.name).map((t) => t.currency.name).join('、') || '18/18 相符');
  push('  每個部族都有資料片與等級', DB.data.every((t) => t.expansion && t.level > 0),
    '例：' + DB.data[0].currency.name + '／' + DB.data[0].expansion + '／Lv' + DB.data[0].level);
  push('  每個部族都有 rep 表（各階任務給多少聲望）',
    DB.data.every((t) => t.rep && Object.keys(t.rep).length > 0), '');
  push('  rep 的值都是正數', DB.data.every((t) => Object.values(t.rep).every((v) => v > 0)), '');
}

// ── ① 不可以接到玩家種族表 ──────────────────────────────
{
  /* 那 16 個名字是 Teamcraft `tw/tw-tribes.json` 的內容（玩家種族）。
     只要資料檔裡出現任何一個，就代表接錯表了。 */
  const RACE_TRIBES = ['中原之民', '高地之民', '森林之民', '黑影之民', '平原之民', '沙漠之民',
    '逐日之民', '護月之民', '北洋之民', '紅焰之民', '晨曦之民', '暮暉之民', '掠日之民',
    '迷蹤之民', '密林之民', '山林之民'];
  const blob = JSON.stringify(DB);
  const hit = RACE_TRIBES.filter((n) => blob.indexOf(n) >= 0);
  push('資料裡沒有玩家種族名（那張表不是蠻族，row id 恰好對得上）',
    hit.length === 0, hit.join('、') || '乾淨');
  push('  建置腳本把這個坑寫下來了',
    /玩家種族/.test(BUILD) && /照 id 接會全錯|row id 恰好/.test(BUILD), '');
  push('  頁面也對使用者講明為什麼用貨幣名', /部族名沒有台服來源/.test(HTML), '');
  push('  資料檔沒有 tribeName 之類的欄位（查不到就不放）',
    !DB.data.some((t) => t.name || t.tribeName), '');
}

// ── ② 盟友階的門檻 ─────────────────────────────────────
{
  const allied = DB.ranks.find((r) => r.rank === 8);
  push('「盟友」階的門檻寫 null 不是 0（它不靠聲望累積）',
    !!allied && allied.req === null, allied ? String(allied.req) : '(沒有第 8 階)');
  push('  第 0 階（無）也是 null', (DB.ranks.find((r) => r.rank === 0) || {}).req === null, '');
  push('  其餘七階的門檻是遞增的正數', (() => {
    const mid = DB.ranks.filter((r) => r.rank >= 1 && r.rank <= 7).map((r) => r.req);
    return mid.length === 7 && mid.every((v, i) => v > 0 && (i === 0 || v > mid[i - 1]));
  })(), DB.ranks.filter((r) => r.rank >= 1 && r.rank <= 7).map((r) => r.req).join('→'));
  push('  頁面講明盟友階不靠聲望', /不靠聲望累積/.test(HTML), '');
  push('  試算只認門檻不是 null 的階', /r\.req != null/.test(HTML), '');
}

// ── ③ MinLevel 不可信 ──────────────────────────────────
{
  push('建置腳本記下 MinLevel 不可信（11 列是 0）',
    /MinLevel` 不是接取等級|MinLevel.*11 列是 0/.test(BUILD), '');
  push('  等級取自任務的 ClassJobLevel', /ClassJobLevel/.test(BUILD), '');
  push('  每個部族的等級都 > 0（沒有沿用 MinLevel 的 0）',
    DB.data.every((t) => t.level > 0), DB.data.filter((t) => !(t.level > 0)).length + ' 個是 0');
}

// ── ④ 每天接幾個是輸入不是事實 ─────────────────────────
{
  push('「每天接幾個」是可改的輸入欄', /id="perDay"/.test(HTML), '');
  push('  頁面講明它不是查來的', /不是查來的/.test(HTML) && /每日配額規則/.test(HTML), '');
  push('  資料檔沒有 perDay／questsPerDay 欄位',
    !/perDay|questsPerDay/.test(JSON.stringify(DB.data)), '');
  push('  不做跨部族配額最佳化（提案自己說沒有最佳化空間）',
    /不做跨部族的配額分配最佳化/.test(HTML), '');
}

// ── 前端 ────────────────────────────────────────────────
{
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://seagod99.github.io/tools/beast-tribes/', virtualConsole: vc });
  const { window } = dom, doc = window.document;
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: () => {}, key: () => null, get length() { return 0; } },
  });
  window.fetch = async (u) => {
    const rel = String(u).replace(/^.*\/(data|assets)\//, '$1/');
    if (!existsSync(join(ROOT, rel))) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  window.eval([...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join(';\n'));
  await new Promise((r) => setTimeout(r, 500));

  push('部族選單有 18 個選項', doc.querySelectorAll('#tribeSel option').length === 18,
    doc.querySelectorAll('#tribeSel option').length + ' 個');
  push('  選項用貨幣名＋資料片＋等級標示',
    /（.+・Lv\d+）$/.test(doc.querySelector('#tribeSel option').textContent),
    doc.querySelector('#tribeSel option').textContent);
  push('  門檻表畫出來', doc.querySelectorAll('#tbody tr').length > 0,
    doc.querySelectorAll('#tbody tr').length + ' 列');
  /* 上限階要反映資料：2.x 的四族上限是階 4，不該列到誓約。 */
  {
    const arr = DB.data.find((t) => t.maxRank === 4);
    doc.getElementById('tribeSel').value = String(arr.id);
    doc.getElementById('tribeSel').dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const opts = [...doc.querySelectorAll('#curRank option')].map((o) => +o.value);
    push('  上限階反映資料（2.x 四族只到階 4）',
      Math.max(...opts) === 4, arr.currency.name + ' → 階 ' + opts.join(',') );
  }
  // 換回一個上限 8 的部族
  {
    const big = DB.data.find((t) => t.maxRank === 8);
    doc.getElementById('tribeSel').value = String(big.id);
    doc.getElementById('tribeSel').dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const opts = [...doc.querySelectorAll('#curRank option')].map((o) => +o.value);
    push('  上限 8 的部族最高只到階 7（盟友不列）', Math.max(...opts) === 7, '階 ' + opts.join(','));
  }

  // 試算：從階 1 到階 7
  const cur = doc.getElementById('curRank'), tgt = doc.getElementById('tgtRank');
  cur.value = '1'; cur.dispatchEvent(new window.Event('change', { bubbles: true }));
  tgt.value = '7'; tgt.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const res = () => doc.getElementById('result').textContent;
  push('算出天數', /\d+ 天/.test(res()), res().replace(/\s+/g, ' ').slice(0, 90));
  const days1 = +(res().match(/(\d[\d,]*) 天/) || [])[1].replace(/,/g, '');

  // 每天接更多 → 天數要變少
  doc.getElementById('perDay').value = '6';
  doc.getElementById('perDay').dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const days2 = +(res().match(/(\d[\d,]*) 天/) || [])[1].replace(/,/g, '');
  push('  每天接更多天數就變少', days2 < days1, days1 + ' → ' + days2);

  // 已累積聲望 → 天數不增加
  doc.getElementById('perDay').value = '3';
  doc.getElementById('perDay').dispatchEvent(new window.Event('input', { bubbles: true }));
  doc.getElementById('curRep').value = '100';
  doc.getElementById('curRep').dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const days3 = +(res().match(/(\d[\d,]*) 天/) || [])[1].replace(/,/g, '');
  push('  已累積聲望後天數不會變多', days3 <= days1, days1 + ' → ' + days3);

  // 目標不高於目前 → 要講明，不可以算出 0 天假裝完成
  tgt.value = '1'; tgt.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('  目標不高於目前時給明確訊息', /目標階級要比目前高/.test(res()), res().trim().slice(0, 40));

  // 推算值要標出來
  tgt.value = '7'; tgt.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  push('  用推算值的階級有標記（≈）',
    doc.querySelectorAll('#tbody .est').length > 0,
    doc.querySelectorAll('#tbody .est').length + ' 處標記');
  push('  有推算時結果區也警告', /有階級沒有任務資料/.test(res()), '');

  // 貨幣連結
  const link = doc.getElementById('shopLink');
  push('  連得到貨幣變現排行且帶貨幣 id', /\.\.\/gc-exchange\/\?c=\d+/.test(link.getAttribute('href')),
    link.getAttribute('href'));
  push('  連結文字帶貨幣名', /能換什麼/.test(link.textContent) && /幣|判|券/.test(link.textContent),
    link.textContent.trim());

  push('  設定存進 ffxiv_ 開頭的 key', !!store.ffxiv_beast_tribes, Object.keys(store).join('、'));
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

// ── 登記 ────────────────────────────────────────────────
{
  const nav = readFileSync(join(ROOT, 'assets/js/nav.js'), 'utf8');
  push('已登記在 nav.js', /tools\/beast-tribes\//.test(nav), '');
  const home = readFileSync(join(ROOT, 'index.html'), 'utf8');
  push('  首頁有卡片且帶 data-added',
    /tools\/beast-tribes\/"[^>]*data-added="\d{4}-\d{2}-\d{2}"/.test(home), '');
  const meta = JSON.parse(readFileSync(join(ROOT, 'data/_meta.json'), 'utf8'));
  push('  data/beast-tribes.json 有進 _meta',
    (meta.databases || []).some((d) => d.file === 'beast-tribes.json'), '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
