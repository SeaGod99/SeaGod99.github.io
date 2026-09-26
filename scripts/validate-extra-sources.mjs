// 理符報酬／收藏品交納回歸 — 改完 build-extra-sources.mjs、或兩個消費端
// （build-market-sources.mjs／build-item-sources.mjs）的合併處必跑。
//
// 三個會安靜出錯的地方：
//   ① **措辭承諾了資料給不起的東西。** 理符報酬是「池子裡隨機給一項」，
//      寫成「可獲得 X」會讓人跑一趟然後拿到別的東西。收藏品交納**講不出要交哪一件**
//      （`collectable` 欄位整份都是 1，是旗標不是物品 id）。
//   ② **分片層只走 om 的 key。** 收藏品交納那 127 件裡多數在 om 裡沒有任何條目
//      （所以先前顯示成「查無取得方式」），只跑 om 的話它們永遠補不進來、也不報錯。
//   ③ **雜訊蓋掉有用的管道。** 「火之碎晶」有 520 張理符可能給——講了等於沒講，
//      而且會把「去採」「去買」從 `normalizeEntries` 的 8 筆額度裡擠出去。
//
// 執行（repo 根目錄）：node scripts/validate-extra-sources.mjs

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORDER } from '../scripts/lib/obtainable.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').split('\\').join('/');
const results = [];
const push = (n, ok, d) => results.push([n, ok, d]);
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));

const EXTRA = read('data/extra-sources.json');
const MS = read('data/market-sources.json').data;
const TYPES = read('data/item-source-types.json');
const ITEMS = new Map(read('data/items.json').data.map((i) => [i.id, i.name]));
const BUILD = readFileSync(join(ROOT, 'scripts/build-extra-sources.mjs'), 'utf8');
const BMS = readFileSync(join(ROOT, 'scripts/build-market-sources.mjs'), 'utf8');
const BIS = readFileSync(join(ROOT, 'scripts/build-item-sources.mjs'), 'utf8');

const all = Object.entries(EXTRA.data);
const leve = all.filter(([, es]) => es.some((e) => e.t === '理符報酬'));
const col = all.filter(([, es]) => es.some((e) => e.t === '收藏品交納'));

// ── 資料量與台服名 ──────────────────────────────────────
{
  push('兩型都有產出', leve.length > 0 && col.length > 0,
    `理符 ${leve.length} 件／收藏品 ${col.length} 件`);
  push('  件數與 count 相符', EXTRA.count === all.length, `${EXTRA.count} / ${all.length}`);
  push('  每個 itemId 都在 items.json 裡', all.every(([id]) => ITEMS.has(Number(id))), '');
  push('  沒有日文假名', !/[\u3041-\u3096\u30A1-\u30FA]/.test(JSON.stringify(EXTRA.data)), '');
  const names = leve.flatMap(([, es]) => es.filter((e) => e.t === '理符報酬').map((e) => e.d));
  push('  理符名都是台服名（有漢字）', names.every((d) => /[\u4e00-\u9fff]/.test(d)), '');
}

// ── ① 措辭不可承諾 ─────────────────────────────────────
{
  const ld = leve.flatMap(([, es]) => es.filter((e) => e.t === '理符報酬').map((e) => e.d));
  push('理符報酬每一條都寫「隨機報酬之一」',
    ld.length > 0 && ld.every((d) => d.indexOf('隨機報酬之一') >= 0),
    ld.filter((d) => d.indexOf('隨機報酬之一') < 0).slice(0, 1).join('') || `${ld.length} 條`);
  /* ⚠ 只能檢查**我們自己產的那一段**（最後一組括號），不能掃整條。
     理符名本身就可能帶這些字（實測「批發委託：用於保證精密品質的藥水」），
     掃整條會把上游的名字當成我們的承諾。 */
  const tails = ld.map((d) => d.slice(d.lastIndexOf('（')));
  push('  我們自己產的那段沒有承諾字眼（理符名本身可能帶「保證」，不算）',
    !tails.some((t) => /可獲得|必得|保證|一定/.test(t)),
    tails.filter((t) => /可獲得|必得|保證|一定/.test(t)).slice(0, 1).join('') || `${tails.length} 條`);
  push('  建置腳本把這條理由寫下來了', /隨機報酬之一.*不可省|不可以寫成「可獲得」/s.test(BUILD), '');

  const cd = col.flatMap(([, es]) => es.filter((e) => e.t === '收藏品交納').map((e) => e.d));
  push('收藏品交納不指名要交哪一件（資料給不起）',
    cd.length > 0 && cd.every((d) => /^交納 (Lv[\d–]+ )?收藏品（/.test(d)),
    cd.filter((d) => !/^交納 (Lv[\d–]+ )?收藏品（/.test(d)).slice(0, 1).join('') || `${cd.length} 條`);
  push('  沒有 Lvundefined（levelMin 有 184 筆是空的）',
    !/Lvundefined|LvNaN|Lvnull/.test(JSON.stringify(EXTRA.data)),
    (JSON.stringify(EXTRA.data).match(/Lv(undefined|NaN|null)/g) || []).slice(0, 2).join('、') || '乾淨');
  push('  沒有「收藏品 收藏品」這種重複（樣板拼接的老毛病）',
    !/收藏品 收藏品/.test(JSON.stringify(EXTRA.data)), '');
  push('  建置腳本記下 collectable 欄位是旗標不是 id',
    /collectable` 欄位不是物品 id|collectable` 欄位整份都是 1/.test(BUILD), '');
}

// ── ② 分片層走的是聯集 ─────────────────────────────────
{
  push('分片層走 om 與 extra 的聯集（不是只走 om 的 key）',
    /new Set\(\[\.\.\.Object\.keys\(om\), \.\.\.Object\.keys\(extra\)\]\)/.test(BIS), '');
  push('  市場頁也合併了 extra', /extra\[String\(id\)\] \|\| \[\]/.test(BMS), '');
  /* 實際驗一遍：收藏品交納那批裡挑幾件，確認真的出現在分片層的類型遮罩裡。
     只驗「腳本寫對了」不夠——分片是另外寫出去的檔。 */
  const idx = read('data/item-sources/_index.json');
  const shardOf = (id) => id >> 10;
  let found = 0, checked = 0;
  for (const [id] of col.slice(0, 12)) {
    const n = Number(id);
    const f = `data/item-sources/${shardOf(n)}.json`;
    if (!existsSync(join(ROOT, f))) continue;
    checked++;
    /* ⚠ 分片檔有信封：`{schema, shard, count, data}`。
       直接寫 `shard[id]` 會永遠是 undefined 而且不報錯——
       看起來像「資料沒寫進去」，其實是讀錯一層（第一版就是這樣）。 */
    const shard = read(f);
    const es = shard.data[id] || shard.data[String(n)];
    if (es && es.some((e) => e.t === '收藏品交納')) found++;
  }
  push('  收藏品交納真的寫進分片檔了', checked > 0 && found === checked,
    `${found}/${checked} 件在對應的片裡`);
  push('  _index.json 還在', !!idx && Object.keys(idx).length > 0, '');
}

// ── ③ 雜訊過濾 ─────────────────────────────────────────
{
  push('建置腳本有「出現在太多理符池子就不收」的門檻',
    /MAX_POOLS_FOR_SIGNAL/.test(BUILD), '');
  /* 碎晶那類不該出現在理符報酬裡——它們到處都拿得到，而且會佔掉額度。
     用名字找幾個確定會被濾掉的樣本。 */
  const shardNames = leve.map(([id]) => ITEMS.get(Number(id)) || '');
  push('  碎晶類沒有被收進理符報酬（520 張理符都可能給，講了等於沒講）',
    !shardNames.some((n) => /^[火冰風土雷水]之碎晶$/.test(n)),
    shardNames.filter((n) => /碎晶$/.test(n)).slice(0, 3).join('、') || '沒有碎晶');
  push('  同一件物品最多列 2 張理符',
    leve.every(([, es]) => es.filter((e) => e.t === '理符報酬').length <= 2),
    Math.max(...leve.map(([, es]) => es.filter((e) => e.t === '理符報酬').length)) + ' 張');
  /* 同一張理符不可以在同一件物品下出現兩次——一張理符的 LeveRewardItem
     可以指到多個 group，不以理符 id 去重時畫面上會是兩行一樣的字。 */
  const dup = leve.filter(([, es]) => {
    const ds = es.filter((e) => e.t === '理符報酬').map((e) => e.d);
    return new Set(ds).size !== ds.length;
  });
  push('  沒有兩行一模一樣的理符（第一版有，因為一張理符指到多個 group）',
    dup.length === 0, dup.length ? ITEMS.get(Number(dup[0][0])) : '乾淨');
}

// ── 排序與額度：新兩型不可以擠掉確定的管道 ──────────────
{
  push('兩型都登記在 ORDER 裡（沒登記會排到最後且不穩定）',
    ORDER.indexOf('理符報酬') >= 0 && ORDER.indexOf('收藏品交納') >= 0, '');
  const iLeve = ORDER.indexOf('理符報酬');
  push('  排在採集／NPC商店／兌換之後（那些是確定的管道）',
    iLeve > ORDER.indexOf('採集') && iLeve > ORDER.indexOf('NPC商店') && iLeve > ORDER.indexOf('兌換'), '');
  push('  排在可製作之前（製作是最後手段）',
    iLeve < ORDER.indexOf('可製作'), '');
  /* 實測有沒有真的擠掉東西：拿同時有採集與理符報酬的物品，
     確認採集仍然在（ORDER 生效）。 */
  const both = Object.entries(MS).filter(([, es]) =>
    es.some((e) => e.t === '理符報酬') && es.some((e) => e.t === '採集'));
  push('  同時有採集與理符報酬時採集排前面',
    both.length > 0 && both.every(([, es]) =>
      es.findIndex((e) => e.t === '採集') < es.findIndex((e) => e.t === '理符報酬')),
    both.length + ' 件同時有兩型');
  push('  每件物品仍不超過 8 筆管道',
    Object.values(MS).every((es) => es.length <= 8), '');
}

// ── 前端的篩選選項自己長出來 ────────────────────────────
{
  push('item-source-types 收了新的兩型',
    TYPES.types.indexOf('理符報酬') >= 0 && TYPES.types.indexOf('收藏品交納') >= 0,
    TYPES.types.length + ' 種類型');
  const market = readFileSync(join(ROOT, 'tools/market/market.js'), 'utf8');
  /* 選項名單要從資料檔自己長出來——寫死的話新增一種管道會從篩選裡安靜消失。
     這正是這一輪新增兩型後不必改前端的原因。 */
  push('  市場頁的篩選選項從資料檔長出來（不是寫死的清單）',
    !/理符報酬/.test(market) && !/收藏品交納/.test(market),
    '市場頁沒有寫死任何管道名');
}

// ── 登記 ────────────────────────────────────────────────
{
  const meta = read('data/_meta.json');
  push('extra-sources.json 有進 _meta',
    (meta.databases || []).some((d) => d.file === 'extra-sources.json'), '');
  const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  push('  指令表登記了 build-extra-sources.mjs', /build-extra-sources\.mjs/.test(claude), '');
}

let fail = 0;
for (const [n, ok, d] of results) { console.log(`${ok ? '✓' : '✗'} ${n}  ${d ?? ''}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} 項失敗（共 ${results.length}）` : `\n全部通過（${results.length} 項）`);
process.exit(fail ? 1 : 0);
