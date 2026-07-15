/**
 * patch-dungeon-names.mjs
 * 用台服官方副本名（Teamcraft tw/tw-instances.json）校正 data/dungeons.json 的 name 欄位。
 *
 * 背景（docs/PROGRESS.md 二之二）：
 *   dungeons.json 原名稱來自中國服 ContentFinderCondition.csv + OpenCC 簡轉繁，
 *   有過度轉換（佈/布、託/托、蹟/跡、煉/練…）與譯名差異（利維亞桑/利維坦、神兵/武器…）。
 *   台服官方副本任務名在 Teamcraft tw-instances.json（key = 遊戲 CFC.Content 值，
 *   即 InstanceContent id：迷宮 1+、集團戰 10001+、討滅戰 20001+、大型任務 30001+）。
 *   注意：tw-places.json 只有 PlaceName（ARR 初版迷宮以外的副本「任務全名」不在其中），
 *   所以副本名校正用 tw-instances，不用 tw-places。
 *
 * 對應鏈：dungeons[].id（= ContentFinderCondition row id）
 *   → ContentFinderCondition.Content（XIVAPI v2，fields=Content@as(raw)）
 *   → tw-instances[Content].tw（台服官方名）
 *
 * 線上來源失敗時改用本地快取（沙箱離線可跑）：
 *   out_data/tw-instances-cache.json   tw-instances 子集（2026-06-11 staging）
 *   out_data/cfc-content.json          CFC id → Content id（2026-06-11 XIVAPI）
 *
 * tw-instances 沒有的（台服未開放內容）保留原名不動，列入報告。
 * 產出 diff 報告：docs/dungeons-名稱校正報告.md
 *
 * 用法：node scripts/patch-dungeon-names.mjs
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DUNGEONS_PATH = join(ROOT, 'data', 'dungeons.json');
const REPORT_PATH = join(ROOT, 'docs', 'dungeons-名稱校正報告.md');
const TWI_CACHE = join(ROOT, 'out_data', 'tw-instances-cache.json');
const CFC_CACHE = join(ROOT, 'out_data', 'cfc-content.json');

const TWI_URL = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-instances.json';
const XIVAPI = 'https://v2.xivapi.com/api/sheet/ContentFinderCondition';

// 台服官方副本名：線上抓 Teamcraft，失敗用快取
async function loadTwInstances() {
  try {
    const res = await fetch(TWI_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const map = {};
    for (const [id, v] of Object.entries(raw)) if (v && v.tw) map[id] = v.tw;
    console.log(`tw-instances（線上）：${Object.keys(map).length} 筆`);
    writeFileSync(TWI_CACHE, JSON.stringify(raw, null, 1) + '\n'); // 更新快取
    return map;
  } catch (e) {
    const raw = JSON.parse(readFileSync(TWI_CACHE, 'utf8'));
    const map = {};
    for (const [id, v] of Object.entries(raw)) if (v && v.tw) map[id] = v.tw;
    console.log(`tw-instances（快取，線上失敗：${e.message}）：${Object.keys(map).length} 筆`);
    return map;
  }
}

// CFC id → Content id：線上抓 XIVAPI（@as(raw) 避免巢狀展開），失敗用快取
async function loadCfcContent() {
  try {
    const map = {};
    let after = 0;
    while (true) {
      const url = `${XIVAPI}?fields=${encodeURIComponent('Content@as(raw)')}&limit=500&after=${after}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = json.rows || [];
      for (const r of rows) {
        const c = r.fields?.['Content@as(raw)'];
        if (c) map[r.row_id] = c;
      }
      if (rows.length < 500) break;
      after = rows[rows.length - 1].row_id;
    }
    console.log(`CFC→Content（線上）：${Object.keys(map).length} 筆`);
    writeFileSync(CFC_CACHE, JSON.stringify(map) + '\n'); // 更新快取
    return map;
  } catch (e) {
    const map = JSON.parse(readFileSync(CFC_CACHE, 'utf8'));
    console.log(`CFC→Content（快取，線上失敗：${e.message}）：${Object.keys(map).length} 筆`);
    return map;
  }
}

async function main() {
  console.log('=== patch-dungeon-names.mjs（台服官方名校正）===');
  const db = JSON.parse(readFileSync(DUNGEONS_PATH, 'utf8'));
  const [twInstances, cfcContent] = await Promise.all([loadTwInstances(), loadCfcContent()]);

  const changed = [];   // { id, type, old, new }
  const same = [];      // 已是官方名
  const unmatched = []; // 台服未開放（tw-instances 無此 Content）

  for (const d of db.data) {
    const content = cfcContent[d.id];
    const tw = content != null ? twInstances[content] : undefined;
    if (!tw) { unmatched.push(d); continue; }
    if (d.name === tw) { same.push(d); continue; }
    changed.push({ id: d.id, type: d.type, old: d.name, new: tw });
    d.name = tw;
  }

  db.updated = new Date().toISOString().slice(0, 10);
  db.source = 'xivapi+teamcraft-tw-instances';

  // 先寫 temp 再複製（避免掛載寫入截斷），並回讀驗證
  const tmp = join(tmpdir(), 'dungeons_patch.json');
  writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n');
  JSON.parse(readFileSync(tmp, 'utf8'));
  copyFileSync(tmp, DUNGEONS_PATH);
  JSON.parse(readFileSync(DUNGEONS_PATH, 'utf8'));

  // diff 報告
  const lines = [];
  lines.push('# dungeons.json 名稱校正報告（台服官方名）');
  lines.push('');
  lines.push(`產生時間：${db.updated} ｜ 來源：Teamcraft tw-instances.json（staging）＋ XIVAPI CFC.Content 對應`);
  lines.push('');
  lines.push(`- 總筆數：${db.data.length}`);
  lines.push(`- 改名：${changed.length}`);
  lines.push(`- 原本就與官方一致：${same.length}`);
  lines.push(`- 無台服官方名（未開放內容，保留簡轉繁名）：${unmatched.length}`);
  lines.push('');
  lines.push('## 改名清單（舊 → 新）');
  lines.push('');
  lines.push('| CFC id | type | 舊名（CN+OpenCC） | 新名（台服官方） |');
  lines.push('|---|---|---|---|');
  for (const c of changed) lines.push(`| ${c.id} | ${c.type} | ${c.old} | ${c.new} |`);
  lines.push('');
  lines.push('## 無官方名清單（保留原名）');
  lines.push('');
  lines.push('| CFC id | type | 現名 | nameEn |');
  lines.push('|---|---|---|---|');
  for (const d of unmatched) lines.push(`| ${d.id} | ${d.type} | ${d.name} | ${d.nameEn} |`);
  lines.push('');
  writeFileSync(REPORT_PATH, lines.join('\n'));

  console.log(`\n完成：改名 ${changed.length}、一致 ${same.length}、無官方名 ${unmatched.length}（共 ${db.data.length}）`);
  console.log('→', DUNGEONS_PATH);
  console.log('→', REPORT_PATH);
}

main().catch((e) => { console.error(e); process.exit(1); });
