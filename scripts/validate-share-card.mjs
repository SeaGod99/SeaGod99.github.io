// 套裝分享圖卡回歸 — 改完 tools/glamour/share-card.js 或 index.html 的
// `syncShareBtn` 必跑。
//
// ── 這支要守的是一個「不做」的決定 ────────────────────────────────────
// 路線圖的閘門是「多數卡片會開天窗就先補名再做圖」。2026-09-27 量測：
//   精選 95 套：500 件裡 99 件沒有台服名 → **66% 的套至少缺一件**
//   官方 1977 套：逐件只缺 6%，但 **35% 連整套繁中名都沒有**
// 而那 99 件的 iid 在主庫 items.json（台服 7.21）裡**完全不存在**——
// 台服未開放，所以「先補名」做不到（鐵則：對不到就是未開放，不用日英補）。
//
// 解法不是妥協成「缺的那列不畫」（卡片會有空洞，而卡片是拿去公開分享的），
// 而是**資料不齊全的套根本不提供那顆鈕**。這支就是在釘這件事：
//   ① `canMake()` 必須擋掉缺名、缺套名、缺圖、社群投稿四種情況。
//   ② 缺名時鈕要**整顆隱藏**，不是 disabled 也不是照按（按了會產出開天窗的卡）。
//   ③ 不可以拿日文／英文名補上去。
//
// 需要 jsdom：npm i jsdom --no-save
// 執行（repo 根目錄）：node scripts/validate-share-card.mjs

import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const G = join(ROOT, 'tools/glamour');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);

const JS = readFileSync(join(G, 'share-card.js'), 'utf8');
const HTML = readFileSync(join(G, 'index.html'), 'utf8');

function loadJsValue(file, name) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(G, file), 'utf8') + `;globalThis.__v=${name};`, ctx);
  return ctx.__v;
}
const CUR = loadJsValue('curated_outfits.js', '_CURATED_RAW');
const SETS = loadJsValue('official_sets.js', '_SETS_RAW');

// ── 在 jsdom 裡載入 share-card.js ───────────────────────
const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', (e) => errs.push(e.message));
const dom = new JSDOM('<!doctype html><body>', { runScripts: 'outside-only', url: 'https://x/', virtualConsole: vc });
const { window } = dom;
window.eval(JS);
const SC = window.ShareCard;

push('share-card.js 掛上 window.ShareCard', !!SC, '');
push('  尺寸是 1200×630（分享卡的標準比例）', SC.W === 1200 && SC.H === 630, SC.W + '×' + SC.H);

// ── ① canMake 的四道閘門 ───────────────────────────────
{
  const full = {
    type: 'set', name_zh: '風信子套裝', img: 'x.webp',
    pieces: [{ slot: '上身', zh: '風信子外衣', dye1: '煤煙黑' }],
  };
  push('資料齊全的套可以做', SC.canMake(full).ok, '');

  push('  社群投稿一律不做（那是投稿者的照片）',
    !SC.canMake({ type: 'mirapri', name: '某套', image: 'x', equipments: [{ slot: '上身', zh: '衣' }] }).ok,
    SC.canMake({ type: 'mirapri', name: '某套', image: 'x', equipments: [] }).why);

  const noSetName = Object.assign({}, full, { name_zh: '' });
  push('  沒有台服套名不做', !SC.canMake(noSetName).ok, SC.canMake(noSetName).why);

  const jaSetName = Object.assign({}, full, { name_zh: 'トレードウィンズ・アタイア' });
  push('  套名是日文原文也不做（不可以拿日文補）',
    !SC.canMake(jaSetName).ok, SC.canMake(jaSetName).why);

  const missPiece = Object.assign({}, full, {
    pieces: [{ slot: '上身', zh: '風信子外衣' }, { slot: '頭部', zh: '', ja: 'オラステリー・キャスターリボン' }],
  });
  const g = SC.canMake(missPiece);
  push('  有一件缺台服名就不做（卡片會開天窗）', !g.ok, g.why);
  push('    原因要講出缺幾件與為什麼', /1 件/.test(g.why) && /台服未開放/.test(g.why), g.why);

  const noImg = Object.assign({}, full, { img: '', imgSrc: '' });
  push('  沒有圖片不做', !SC.canMake(noImg).ok, SC.canMake(noImg).why);

  const noPieces = Object.assign({}, full, { pieces: [] });
  push('  沒有逐件資料不做', !SC.canMake(noPieces).ok, SC.canMake(noPieces).why);

  push('  每種擋掉的情況都給得出原因（要顯示在 title 上）',
    [noSetName, jaSetName, missPiece, noImg, noPieces].every((x) => SC.canMake(x).why.length > 3), '');
}

// ── ② 列的內容 ─────────────────────────────────────────
{
  const e = {
    type: 'set', name_zh: 'A', img: 'x',
    pieces: [
      { slot: '上身', zh: '衣', dye1: '煤煙黑', dye2: '素雪白' },
      { slot: '腳部', zh: '鞋', dye1: '—', dye2: '—' },
      { slot: '頭部', zh: '', ja: 'カブト' },
    ],
  };
  const rs = SC.rows(e);
  push('缺名的整列不畫（canMake 之外的雙保險）', rs.length === 2, rs.length + ' 列');
  push('  兩個染色用「／」併成一欄', rs[0].dye === '煤煙黑／素雪白', rs[0].dye);
  push('  「—」不算染色（那是「沒染」的佔位）', rs[1].dye === '', JSON.stringify(rs[1].dye));
  /* 染劑的 RGB 不在本站資料裡（dyes.json 只有名稱與分類），
     自己配色會畫出與遊戲內不同的顏色。所以只寫名字，不畫色塊。 */
  push('  沒有畫染色色塊（RGB 不在資料裡，自己配色會與遊戲不同）',
    !/fillStyle\s*=\s*dyeColor|dyeRgb|DYE_RGB/.test(JS) && /染劑的 RGB 不在本站資料裡/.test(JS), '');
}

// ── ③ 前端接線：缺資料就整顆隱藏 ────────────────────────
{
  push('index.html 有分享鈕且預設隱藏',
    /id="share-btn"[^>]*style="display:none"/.test(HTML), '');
  push('  載了 share-card.js', /<script src="share-card\.js">/.test(HTML), '');
  push('  在 openModal 裡統一同步（三個 render 各接一次會漏）',
    /\/\/ 三個 render 函式各自填內容[\s\S]{0,80}syncShareBtn\(e\);/.test(HTML), '');
  push('  不齊全時整顆隱藏（不是 disabled、也不是照按）',
    /btn\.style\.display = gate\.ok \? "" : "none";/.test(HTML), '');
  push('  把原因寫在 title 上', /btn\.title = gate\.ok \? [^:]+: gate\.why;/.test(HTML), '');
  push('  不齊全時不掛 onclick', /btn\.onclick = gate\.ok \?/.test(HTML), '');
  push('  產生失敗會講出來（不靜默失敗）', /圖卡產生失敗：/.test(HTML), '');
  push('  產生中會把鈕鎖住（避免連按產生多張）', /btn\.disabled = true;/.test(HTML), '');
}

// ── ④ 實際涵蓋率：這個閘門擋掉多少 ──────────────────────
{
  /* **這一條是這支腳本的重點。** 量出來才知道閘門擋掉的比例，
     而那個比例本身就是「為什麼不硬做」的證據。 */
  const okCur = CUR.filter((e) => SC.canMake(Object.assign({}, e, { type: 'curated' })).ok).length;
  const okSet = SETS.filter((e) => SC.canMake(e).ok).length;
  push('精選有一部分做得出來（不是全軍覆沒）', okCur > 0,
    okCur + ' / ' + CUR.length + ' 套（' + (okCur / CUR.length * 100).toFixed(0) + '%）');
  push('  官方大多做得出來', okSet > SETS.length * 0.5,
    okSet + ' / ' + SETS.length + ' 套（' + (okSet / SETS.length * 100).toFixed(0) + '%）');
  /* 精選有六成以上被擋掉是**預期的**——那些裝備的 iid 在台服主庫裡不存在。
     這條斷言在「有人偷偷拿日文名補上去」時會失敗。 */
  push('  精選被擋掉的比例仍然很高（台服未開放的裝備補不了名）',
    okCur < CUR.length * 0.6,
    '擋掉 ' + (CUR.length - okCur) + ' 套（若這個數字突然變小，先確認不是拿日英名補的）');
  push('  合計做得出來的套數', okCur + okSet > 1000, (okCur + okSet) + ' 套');
}

// ── 說明與署名 ─────────────────────────────────────────
{
  push('檔頭寫下量測與「為什麼不硬做」', /66% 的套至少缺一件/.test(JS) && /台服還沒開放的物品/.test(JS), '');
  push('  卡片有署名且講明是玩家自製', /玩家自製非官方工具/.test(JS) && /水神的工具箱/.test(JS), '');
  push('  卡片用 tokens.css 的色值（不自己開色票，§3.6）',
    /getPropertyValue\(name\)/.test(JS) && /--bg-card/.test(JS), '');
  /* 守門要驗**行為**不是驗字面寫法（範圍可以寫成字元或 \uXXXX，兩種都對）。
     這裡照 `scripts/lib/tw-text.mjs` 的規則逐項確認：
     要有漢字、有假名就擋，而 `・`（U+30FB）與 `ー`（U+30FC）**不算假名**
     ——台服名真的會用到它們（例：「水神・零式」那種中點）。 */
  const cases = [
    ['風信子外衣', true, '純漢字'],
    ['トレードウィンズ・アタイア', false, '片假名要擋'],
    ['オラステリー', false, '片假名要擋'],
    ['ひらがな', false, '平假名要擋'],
    ['Tradewinds Attire', false, '純英文沒有漢字'],
    ['', false, '空字串'],
    ['   ', false, '全空白'],
    ['寄葉五一式治癒軍帽', true, '長的繁中名'],
    ['水神‧零式的衣', true, '中點不算假名'],
  ];
  const bad = cases.filter(([s, want]) => SC.isTw(s) !== want);
  push('  台服名守門與站內一致（要漢字、有假名就擋、中點不算假名）',
    bad.length === 0, bad.map(([s]) => JSON.stringify(s)).join('、') || cases.length + ' 個案例都對');
  push('  無 console error', errs.length === 0, errs.slice(0, 1).join('') || '乾淨');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
