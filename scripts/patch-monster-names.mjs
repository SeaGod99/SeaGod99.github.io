/**
 * patch-monster-names.mjs
 * 用台服官方怪物名（Teamcraft tw/tw-mobs.json）替換 data/monsters.json 的 name 欄位。
 *
 * 背景（docs/PROGRESS.md 二之二）：
 *   monsters.json 14361 筆名稱全是中國服 BNpcName.csv + OpenCC 簡轉繁，非台服官方譯名。
 *   tw-mobs.json key = BNpcName id（對 monsters[].baseId），value = { tw: 台服官方名 }。
 *
 * 規則：
 *   - tw-mobs 有的 baseId：name 換成官方名，並標 nameSource:"tw-mobs"
 *     （官方名與現有名相同也標，代表已官方確認）
 *   - tw-mobs 沒有的：保留現有簡轉繁名，不加 nameSource
 *   - tw-mobs 值含日文假名（ラベル削除予定 等佔位字串）或全為「？」者視為無資料
 *   - 其他欄位（positions、drops、huntRank…）一律不動
 *
 * ⚠ 沙箱擋外網（tw-mobs.json 614KB，web_fetch 會截斷），本腳本需在本機執行：
 *     node scripts/patch-monster-names.mjs
 *   需求：Node 18+（內建 fetch）
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MONSTERS_PATH = join(ROOT, 'data', 'monsters.json');
const TW_MOBS_URL = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-mobs.json';

// 佔位/無效值：含日文假名，或全是全形問號
function isJunk(s) {
  return /[぀-ヿ]/.test(s) || /^[？?]+$/.test(s);
}

async function main() {
  console.log('=== patch-monster-names.mjs（monsters 名稱台服化）===');

  console.log('抓取 tw-mobs.json…');
  const res = await fetch(TW_MOBS_URL);
  if (!res.ok) throw new Error(`tw-mobs.json HTTP ${res.status}`);
  const twMobs = await res.json(); // res.json() 失敗即代表下載不完整，直接中止
  console.log(`  tw-mobs ${Object.keys(twMobs).length} 筆`);

  const db = JSON.parse(readFileSync(MONSTERS_PATH, 'utf8'));
  console.log(`  monsters ${db.data.length} 筆`);

  let replaced = 0, confirmedSame = 0, noTw = 0, junk = 0;
  for (const m of db.data) {
    const v = twMobs[m.baseId];
    const tw = v && v.tw;
    if (!tw || isJunk(tw)) { tw && isJunk(tw) ? junk++ : noTw++; continue; }
    if (m.name !== tw) { m.name = tw; replaced++; }
    else confirmedSame++;
    m.nameSource = 'tw-mobs';
  }

  db.updated = new Date().toISOString().slice(0, 10);
  db.source = 'tw-mobs+datamining-cn+teamcraft+xivapi+items';

  // 先寫 temp、回讀驗證，再複製到目標（避免大檔寫入截斷）
  const tmp = join(tmpdir(), 'monsters_patch.json');
  writeFileSync(tmp, JSON.stringify(db));
  JSON.parse(readFileSync(tmp, 'utf8'));
  copyFileSync(tmp, MONSTERS_PATH);
  const check = JSON.parse(readFileSync(MONSTERS_PATH, 'utf8'));
  if (check.data.length !== db.data.length) throw new Error('寫入後筆數不符！');

  console.log(`\n完成（共 ${db.data.length} 筆）：`);
  console.log(`  改名（CN+OpenCC → 台服官方）：${replaced}`);
  console.log(`  官方名與原名相同（已標 nameSource）：${confirmedSame}`);
  console.log(`  tw-mobs 無資料（保留簡轉繁名）：${noTw}（另佔位字串 ${junk}）`);
  console.log('→', MONSTERS_PATH);
  console.log('\n跑完請更新 docs/PROGRESS.md 與 data/_meta.json 的 monsters 狀態。');
}

main().catch((e) => { console.error(e); process.exit(1); });
