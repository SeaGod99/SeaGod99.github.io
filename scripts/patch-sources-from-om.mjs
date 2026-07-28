/**
 * patch-sources-from-om.mjs
 *
 * 拿 data/obtainable-methods.json（本站既有、由遊戲商店／掉落資料建的庫）去補
 * 收藏頁裡 `sources` 是空陣列、但**前端真的看得到**的那些條目。
 *
 * 目前只有樂譜 3 筆符合（白帝竹林 4.2／月下芳華 4.3／高貝扎四天王之戰 6.28）。
 * om 對這 3 筆給的是 `{type:'instance', typeName:'討伐戰', totalInstances:1}`
 * ——**知道是討伐戰掉落，但 om 沒存是哪一場**。所以這裡只補 `{type:'討伐戰'}`，
 * 不帶 detail：頁面會顯示「討伐戰」標籤而不是「待補充」，這是誠實且有用的資訊
 * （玩家至少知道要去打討伐戰而不是逛商店），但不編造副本名。
 *
 * 查過但沒有用的路：
 *   · `data/orchestrion-sources-tc.json`（ffxiv-collection-tc 快照）只有 682/724，
 *     白帝竹林與月下芳華不在裡面；上游 collections_data.json 匯出於 2026-01-01，
 *     重抓也還是 682，**不是快照過期，是來源本來就沒收**。
 *   · `data/recipes.json`：這 3 筆都沒有配方（所以 TC 對高貝扎標的 "Craftable" 是錯的）。
 *   · `out_data/loot-sources.msgpack`：3865 筆裡查無這 3 個 itemId。
 *
 * 執行：
 *   node scripts/patch-sources-from-om.mjs           # dry-run
 *   node scripts/patch-sources-from-om.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const TARGETS = [
  { file: 'data/orchestrion.json', label: '樂譜' },
  { file: 'data/mounts.json', label: '坐騎' },
  { file: 'data/minions.json', label: '寵物' },
  { file: 'data/barding.json', label: '鳥鞍' },
];

// om 的 typeName（遊戲資料用語）→ 站內 sources[].type
const OM_TYPE_TW = {
  '討伐戰': '討伐戰', '副本': '副本', '大型任務': '大型任務',
  '兌換': '商店', '商店': '商店', '製作': '製作', '採集': '採集',
};

const readData = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const pnum = (p) => {
  if (p == null || p === '') return null;
  const m = String(p).match(/^(\d+)\.(\d+)/);
  return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, '0')}`) : null;
};
const released = (patch, gp) => {
  const v = pnum(patch), g = pnum(gp);
  return v == null || g == null ? true : v <= g;
};
// 與 collection-tracker.js 的預設 include 同步
const shownInUI = (e, gp) => e.name && e.name !== e.nameEn && e.order !== -1 && released(e.patch, gp);

function main() {
  const gp = readData('data/_meta.json').gamePatch;
  const om = readData('data/obtainable-methods.json');
  const omData = om.data || om;
  console.log(`gamePatch = ${gp}\n`);

  let totalFilled = 0;
  for (const t of TARGETS) {
    const full = path.join(ROOT, t.file);
    if (!fs.existsSync(full)) continue;
    const db = readData(t.file);
    const rows = db.data;
    const gaps = rows.filter((e) => (!e.sources || !e.sources.length) && shownInUI(e, gp));
    console.log(`━━ ${t.label} ━━  無 sources 且前端看得到：${gaps.length} 筆`);
    if (!gaps.length) continue;

    let filled = 0;
    for (const e of gaps) {
      const itemId = e.itemId ?? e.id;
      const methods = omData[itemId] || omData[String(itemId)] || [];
      if (!methods.length) { console.log(`   ✗ ${e.id} ${e.name}：om 也查不到，維持空白`); continue; }
      const types = [...new Set(methods.map((m) => OM_TYPE_TW[m.typeName]).filter(Boolean))];
      if (!types.length) {
        console.log(`   ✗ ${e.id} ${e.name}：om 的 typeName「${methods.map((m) => m.typeName).join('/')}」沒有對應的站內型別`);
        continue;
      }
      // om 只給得出型別、給不出「哪一場／哪個 NPC」時，就只寫型別，不編 detail
      const src = types.map((ty) => ({ type: ty }));
      console.log(`   ✓ ${e.id} ${e.name} → ${types.join('、')}（om 未提供名稱，只補型別）`);
      if (APPLY) e.sources = src;
      filled++;
    }
    totalFilled += filled;
    if (APPLY && filled) {
      db.updated = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(full, JSON.stringify(db, null, 2) + '\n', 'utf8');
      console.log(`   ✓ 已寫入 ${t.file}（${filled} 筆）`);
    }
  }

  console.log(`\n合計可補 ${totalFilled} 筆`);
  if (!APPLY) console.log('（dry-run，未寫入。加 --apply 才會寫檔）');
}

main();
