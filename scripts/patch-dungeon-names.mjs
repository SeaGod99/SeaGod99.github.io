/**
 * patch-dungeon-names.mjs — 副本名稱與版本以台服客戶端為準
 *
 * 2026-10-10 改寫（原本是「Teamcraft tw-instances 校正」）。舊做法兩個洞：
 *   ① 對應鏈 CFC.Content → tw-instances[Content] **不看 ContentLinkType**：優雷卡、博茲雅、新月島的 Content
 *      是 PublicContent id，撞到同號的 InstanceContent（迷宮）——3 個優雷卡區域因此掛著「封鎖坑道銅鈴銅山」
 *      「天然要害沙斯塔夏溶洞」「名門府邸靜語莊園」。
 *   ② tw-instances 沒有的（台服未開放）**保留原本的簡轉繁名**（dungeons.json 最初是陸服 CFC＋OpenCC），
 *      patch 又是 null、閘門放行——國際服 7.3 以後的 23 個副本（阿卡狄亞登天鬥技場 重量級、妖星亂舞絕境戰…）
 *      就這樣上了副本圖鑑與命令面板。
 *
 * 現在（站主 10-10 拍板：名稱以台服客戶端為準）：
 *   名稱  dungeons[].id 就是 ContentFinderCondition 的 row id（優雷卡 4 筆實測對得上），直接取台服客戶端
 *         ContentFinderCondition.Name。**客戶端沒有台服名（列不存在或名稱空白）＝台服未開放 → name 設 null**
 *         （鐵則：不留簡轉繁名；前端與命令面板都以「有 name」為顯示條件）。nameSource 記 tw-client／none。
 *   版本  只補 patch 為 null 的（既有值不動——patch-dungeon-expansion.mjs 清掉過 18 筆錯的，見該檔）：
 *         a) 這一版客戶端才有台服名的（台服版本清單，scripts/lib/tw-releases.mjs 的前後兩版差集）→ 台服版號
 *         b) ContentLinkType 1（InstanceContent）→ Teamcraft patch-content 的 instancecontent
 *         c) 其他連結類型（PublicContent：優雷卡／博茲雅／新月島）→ 所在 TerritoryType 的 PlaceName 的版本
 *            （Teamcraft patch-content 的 placename）
 *         都查不到就維持 null。Teamcraft 的全球版本表沒有台服小版號（7.25 → 7.3），所以 a) 要先判。
 *         **補的版號主版本要等於該副本的資料片（expansion＝客戶端 ExVersion）**，對不上就維持 null（2026-10-11）：
 *         Teamcraft 的 instancecontent 版本表有 18 筆是錯的（黃金遺產的副本標 6.0、蒼天的標 2.45…），
 *         patch-dungeon-expansion.mjs 清掉後這支又照表補回去，兩支互相抵銷，資料一直是錯的。不猜 x.0。
 *
 * 來源都是快取（out_data/cache/）：台服客戶端 ContentFinderCondition／TerritoryType（tc-datamining）、
 * Teamcraft tc-patch-content.json／tc-patch-names.json。--offline 時缺快取就中止。
 * 報表寫到 docs/dungeons-名稱校正報告.md（改名清單、未開放清單、補版本統計）。
 *
 * 執行：node scripts/patch-dungeon-names.mjs [--apply] [--offline]
 * 跑完：node scripts/patch-collection-duty-links.mjs --apply → build-duty-drops.mjs --apply → validate-duty-codex.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTcSheet } from './lib/tc-datamining.mjs';
import { TW_RELEASES } from './lib/tw-releases.mjs';
import { isTw } from './lib/tw-text.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DUNGEONS_PATH = join(ROOT, 'data', 'dungeons.json');
const REPORT_PATH = join(ROOT, 'docs', 'dungeons-名稱校正報告.md');
const CACHE = join(ROOT, 'out_data', 'cache');
const APPLY = process.argv.includes('--apply');
const OFFLINE = process.argv.includes('--offline');

/* 資料片名（官方名與舊名都認）→ 主版本，給版號護欄用 */
const EXP_MAJOR = new Map(JSON.parse(readFileSync(join(ROOT, 'data', 'official-terms.json'), 'utf8')).expansions
  .flatMap((e) => [[e.name, e.major], ...(e.alias || []).map((a) => [a, e.major])]));

const clean = (s) => String(s || '').replace(/[\uE000-\uF8FF]/g, '').trim();

/** Teamcraft patch-content：{ 類型: Map(id → 版本字串) } */
function loadPatchContent() {
  const pcFile = join(CACHE, 'tc-patch-content.json'), pnFile = join(CACHE, 'tc-patch-names.json');
  if (!existsSync(pcFile) || !existsSync(pnFile)) throw new Error('缺 out_data/cache/tc-patch-content.json／tc-patch-names.json（patch-backfill-all.mjs 會抓）');
  const pc = JSON.parse(readFileSync(pcFile, 'utf8')), pn = JSON.parse(readFileSync(pnFile, 'utf8'));
  const out = {};
  for (const [pid, types] of Object.entries(pc)) {
    const ver = pn[pid]?.version;
    if (!ver) continue;
    for (const [t, ids] of Object.entries(types)) {
      out[t] ??= new Map();
      for (const id of ids) if (!out[t].has(id)) out[t].set(id, ver);
    }
  }
  return out;
}

async function main() {
  console.log('=== patch-dungeon-names.mjs（台服客戶端）===');
  const raw = readFileSync(DUNGEONS_PATH, 'utf8');
  const db = JSON.parse(raw);
  const rel = TW_RELEASES[TW_RELEASES.length - 1];
  const [cfc, cfcPrev, tt] = await Promise.all([
    loadTcSheet('ContentFinderCondition', { offline: OFFLINE }),
    loadTcSheet('ContentFinderCondition', { offline: OFFLINE, sha: rel.prev.sha }),
    loadTcSheet('TerritoryType', { offline: OFFLINE }),
  ]);
  const byId = new Map(cfc.map((r) => [r.id, r]));
  const prevNamed = new Set(cfcPrev.filter((r) => isTw(clean(r.Name))).map((r) => r.id));
  const ttPlace = new Map(tt.map((r) => [r.id, Number(r.PlaceName) || null]));
  const pc = loadPatchContent();

  const changed = [], same = [], unreleased = [], patchFilled = { release: 0, instance: 0, place: 0 }, patchMissing = [], patchConflict = [];
  for (const d of db.data) {
    const r = byId.get(d.id);
    const tw = r ? clean(r.Name) : '';
    if (!tw || !isTw(tw)) {
      // 台服未開放：不留簡轉繁名
      if (d.name !== null) unreleased.push({ id: d.id, type: d.type, old: d.name, nameEn: d.nameEn });
      d.name = null;
      d.nameSource = 'none';
      continue;
    }
    if (d.name === tw) same.push(d.id);
    else changed.push({ id: d.id, type: d.type, old: d.name, new: tw });
    d.name = tw;
    d.nameSource = 'tw-client';
    if (d.patch == null) {
      let p = null, how = null;
      if (!prevNamed.has(d.id)) { p = rel.version; how = 'release'; }
      else if (r.ContentLinkType === '1') { p = pc.instancecontent?.get(Number(r.Content)) ?? null; how = 'instance'; }
      else { const place = ttPlace.get(Number(r.TerritoryType)); p = place ? pc.placename?.get(place) ?? null : null; how = 'place'; }
      const want = EXP_MAJOR.get(d.expansion), got = p ? Number(String(p).split('.')[0]) : null;
      if (p && want && got !== want) { patchConflict.push(`${d.id} ${tw}：${how} 給 ${p}，資料片是 ${d.expansion}`); p = null; }
      if (p) { d.patch = p; patchFilled[how]++; } else patchMissing.push(`${d.id} ${tw}`);
    }
  }

  console.log(`改名 ${changed.length}、原本就一致 ${same.length}、台服未開放（名稱清成 null）${unreleased.length}`);
  for (const c of changed) console.log(`   ${c.id} [${c.type}] ${c.old} → ${c.new}`);
  for (const u of unreleased) console.log(`   ✗ ${u.id} [${u.type}] ${u.old ?? '（已是 null）'}（${u.nameEn}）`);
  console.log(`補 patch：台服版本清單 ${patchFilled.release}、InstanceContent ${patchFilled.instance}、地區名 ${patchFilled.place}；仍為 null ${patchMissing.length}`);
  if (patchConflict.length) console.log(`   版號與資料片對不上而不補 ${patchConflict.length}：${patchConflict.join('、')}`);
  if (patchMissing.length) console.log(`   ${patchMissing.slice(0, 20).join('、')}${patchMissing.length > 20 ? '…' : ''}`);

  // 報告
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '# dungeons.json 名稱校正報告（台服客戶端）', '',
    `產生時間：${today} ｜ 來源：台服客戶端解包 ContentFinderCondition（依 row id）＋ Teamcraft patch-content（只補 null 的 patch）`, '',
    `- 總筆數：${db.data.length}`, `- 改名：${changed.length}`, `- 原本就與官方一致：${same.length}`,
    `- 台服未開放（客戶端沒有台服名，名稱設 null、前端不顯示）：${db.data.filter((d) => d.name === null).length}`, '',
    '## 改名清單（舊 → 新）', '', '| CFC id | type | 舊名 | 新名（台服客戶端） |', '|---|---|---|---|',
    ...changed.map((c) => `| ${c.id} | ${c.type} | ${c.old ?? ''} | ${c.new} |`), '',
    '## 台服未開放（名稱為 null）', '', '| CFC id | type | nameEn |', '|---|---|---|',
    ...db.data.filter((d) => d.name === null).map((d) => `| ${d.id} | ${d.type} | ${d.nameEn} |`), '',
  ];

  if (!APPLY) { console.log('\n（dry-run，未寫入；加 --apply 寫 data/dungeons.json 與報告）'); return; }
  db.updated = today;
  db.source = 'xivapi＋台服客戶端解包 ContentFinderCondition（名稱）＋Teamcraft patch-content（版本）';
  writeFileSync(DUNGEONS_PATH, raw.includes('\n  "') ? JSON.stringify(db, null, 2) + '\n' : JSON.stringify(db) + '\n');
  writeFileSync(REPORT_PATH, lines.join('\n'));
  console.log(`\n✓ ${DUNGEONS_PATH}\n✓ ${REPORT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
