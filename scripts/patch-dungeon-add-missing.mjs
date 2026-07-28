/**
 * patch-dungeon-add-missing.mjs
 *
 * 把 `build-dungeons.mjs` 先前漏掉的副本**增量補進** data/dungeons.json。
 *
 * ── 為什麼是增量而不是重建 ────────────────────────────────────────────────
 * `dungeons.json` 上面疊了好幾層人工／半人工校正（`patch-dungeon-names.mjs` 校正過
 * 108 筆台服官方名、`patch-dungeon-expansion.mjs` 補了 386 筆資料片並清掉 18 筆錯的
 * patch），整包重建會全部洗掉。所以這支只加「目前沒有的列」，既有的一律不動。
 *
 * ── 漏掉的原因 ────────────────────────────────────────────────────────────
 * `build-dungeons.mjs` 有一道 `if (!IsInDutyFinder && !HighEndDuty) continue;`。
 * 深宮（ContentType 21）／禁地優雷卡（26）／多變迷宮（30）都有**自己的進入介面**，
 * 不掛在一般隨機任務裡，所以 `IsInDutyFinder` 一律是 false，整批被這行擋掉——
 * 即使 21/26/30 明明就在 `VALID_CONTENT_TYPES` 白名單裡。build 腳本已加豁免，
 * 這支則負責把既有資料補齊。
 *
 * 實際代價：幻卡有 10 張卡的取得方式指向多變迷宮，先前只能顯示「副本 ×3」。
 *
 * ── 台服繁中名怎麼來 ──────────────────────────────────────────────────────
 * 沿用 `patch-dungeon-names.mjs` 的對應鏈，**不自己翻譯**：
 *   CFC row id → `ContentFinderCondition.Content`（InstanceContent id）
 *              → Teamcraft `tw/tw-instances.json` 的 `.tw`
 * 三座多變迷宮實測都查得到，而且台服叫「**多變迷宮**」不是「異聞迷宮」
 * （36001 多變迷宮 希拉狄哈水道／36002 六根山／36003 阿羅阿羅島）——
 * 這正是不能憑印象寫名字的例子。
 *
 * **拿不到台服名的一律不加**（依繁中名鐵則：台服未開放就不顯示），列在報告裡。
 *
 * 執行：
 *   node scripts/patch-dungeon-add-missing.mjs            # dry-run
 *   node scripts/patch-dungeon-add-missing.mjs --apply
 *   node scripts/patch-dungeon-add-missing.mjs --offline  # 只用 out_data/ 快取
 * 改完記得跑：node scripts/validate-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const OFFLINE = process.argv.includes('--offline');

const V2 = 'https://v2.xivapi.com/api/sheet';
const TW_INSTANCES = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-instances.json';
const CACHE_CFC = path.join(ROOT, 'out_data', 'cfc-missing-rows.json');
const CACHE_TWI = path.join(ROOT, 'out_data', 'tw-instances.json');

// 與 build-dungeons.mjs 同一份白名單／豁免清單，改任一邊要同步另一邊
const VALID_CONTENT_TYPES = new Set([2, 3, 4, 5, 7, 21, 26, 28, 30]);
const DUTY_FINDER_EXEMPT_TYPES = new Set([7, 21, 26, 30]);

// ContentType → 本站 type 字串（只涵蓋本支會補的那幾類；其餘沿用 build 腳本的判斷）
const TYPE_BY_CT = { 7: 'quest_battle', 21: 'deep_dungeon', 26: 'eureka', 30: 'variant_dungeon' };

// ExVersion row id → 站內統一的資料片繁中名（同 patch-dungeon-expansion.mjs）
const EXVERSION_TW = {
  0: '原初之地', 1: '蒼天之禁地', 2: '紅蓮之狂潮',
  3: '暗影之逆焰', 4: '曉月之終途', 5: '金曦之遺輝',
};

const readData = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(700 * i);
    }
  }
}

/** 抓整張 ContentFinderCondition（含判斷所需欄位＋Content 連結） */
async function loadCfc() {
  if (fs.existsSync(CACHE_CFC)) return readData('out_data/cfc-missing-rows.json');
  if (OFFLINE) { console.warn('  ⚠ --offline 且無快取，無法繼續'); process.exit(1); }
  const fields = ['Name', 'ContentType', 'IsInDutyFinder', 'HighEndDuty', 'PvP',
    'RequiredExVersion', 'ContentUICategory', 'ClassJobLevelRequired', 'ClassJobLevelSync',
    'ItemLevelRequired', 'ItemLevelSync', 'SortKey', 'Image', 'Content'].join(',');
  console.log('  抓 ContentFinderCondition…');
  const out = [];
  let after = 0;
  for (;;) {
    const j = await fetchJson(`${V2}/ContentFinderCondition?fields=${encodeURIComponent(fields)}&limit=500&after=${after}`);
    const rows = j.rows || [];
    if (!rows.length) break;
    for (const r of rows) {
      const f = r.fields || {};
      out.push({
        id: r.row_id,
        name: (f.Name || '').trim(),
        ct: f['ContentType.value'] ?? f.ContentType?.value ?? f.ContentType?.row_id ?? 0,
        inDutyFinder: !!f.IsInDutyFinder,
        highEnd: !!f.HighEndDuty,
        pvp: !!f.PvP,
        exVersion: f.RequiredExVersion?.row_id ?? null,
        uiCategory: f.ContentUICategory?.fields?.Name ?? f['ContentUICategory.Name'] ?? '',
        levelReq: f.ClassJobLevelRequired ?? 0,
        levelSync: f.ClassJobLevelSync ?? 0,
        ilvlReq: f.ItemLevelRequired ?? 0,
        ilvlSync: f.ItemLevelSync ?? 0,
        sortKey: f.SortKey ?? 0,
        imagePath: f.Image?.path_hr1 ?? f.Image?.path ?? null,
        contentId: f.Content?.row_id ?? f.Content?.value ?? null,
      });
    }
    after = rows[rows.length - 1].row_id;
    if (rows.length < 500) break;
    await sleep(120);
  }
  fs.mkdirSync(path.dirname(CACHE_CFC), { recursive: true });
  fs.writeFileSync(CACHE_CFC, JSON.stringify(out) + '\n', 'utf8');
  console.log(`  已快取 ${out.length} 列到 ${path.relative(ROOT, CACHE_CFC)}`);
  return out;
}

async function loadTwInstances() {
  if (fs.existsSync(CACHE_TWI)) return readData('out_data/tw-instances.json');
  if (OFFLINE) { console.warn('  ⚠ --offline 且無 tw-instances 快取，補不到台服名'); return {}; }
  console.log('  下載 Teamcraft tw-instances.json…');
  const j = await fetchJson(TW_INSTANCES);
  fs.mkdirSync(path.dirname(CACHE_TWI), { recursive: true });
  fs.writeFileSync(CACHE_TWI, JSON.stringify(j), 'utf8');
  console.log(`  已快取（${Object.keys(j).length} 筆）`);
  return j;
}

async function main() {
  const dPath = path.join(ROOT, 'data/dungeons.json');
  const db = readData('data/dungeons.json');
  const have = new Set(db.data.map((d) => d.id));
  console.log(`dungeons.json 目前 ${db.data.length} 筆`);

  const cfc = await loadCfc();
  const twi = await loadTwInstances();

  // 套 build-dungeons 的規則（含新的豁免），找出「合法但目前沒收」的列
  const missing = cfc.filter((r) => {
    if (!r.name) return false;
    if (!VALID_CONTENT_TYPES.has(r.ct)) return false;
    if (r.pvp) return false;
    if (!r.inDutyFinder && !r.highEnd && !DUTY_FINDER_EXEMPT_TYPES.has(r.ct)) return false;
    return !have.has(r.id);
  });
  console.log(`\n合法但目前沒收的：${missing.length} 筆`);

  const added = [], noTw = [];
  for (const r of missing) {
    const t = r.contentId != null ? (twi[r.contentId] || twi[String(r.contentId)]) : null;
    const tw = t && (t.tw || t.name);
    if (!tw) { noTw.push(r); continue; }
    const isSavage = /savage/i.test(r.uiCategory) || /\(Savage\)/i.test(r.name);
    added.push({
      id: r.id,
      name: tw,
      nameEn: r.name,
      type: TYPE_BY_CT[r.ct] || (isSavage ? 'raid_savage' : 'dungeon'),
      patch: null,                       // 無權威來源，留 null（見 patch-dungeon-expansion 的說明）
      ilvlSync: r.ilvlSync > 0 ? r.ilvlSync : null,
      ilvlReq: r.ilvlReq ?? 0,
      levelReq: r.levelReq ?? 0,
      levelSync: r.levelSync > 0 ? r.levelSync : null,
      partySize: null,                   // 這幾類沒有固定隊伍人數
      expansion: EXVERSION_TW[r.exVersion] ?? '',
      expansionId: r.exVersion ?? null,
      sortKey: r.sortKey ?? 0,
      highEndDuty: r.highEnd,
      image: r.imagePath ? r.imagePath.replace('ui/icon/', '/i/').replace('.tex', '.png') : null,
      unlock: { type: 'unknown', questName: null, questId: null },
      bosses: [],
      rewards: { tomestones: null, itemLevel: null, itemIds: [], mounts: [], minions: [] },
      notes: null,
    });
  }

  const byType = {};
  added.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
  console.log(`  有台服官方名、可加入：${added.length} 筆`
    + (Object.keys(byType).length ? `（${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join('、')}）` : ''));
  added.forEach((a) => console.log(`     + ${a.id} ${a.name}（${a.nameEn}）${a.expansion}`));
  console.log(`  無台服名、依鐵則不加：${noTw.length} 筆`);
  noTw.slice(0, 12).forEach((r) => console.log(`     - ${r.id} ${r.name}（ContentType ${r.ct}）`));
  if (noTw.length > 12) console.log(`     …其餘 ${noTw.length - 12} 筆`);

  if (!added.length) { console.log('\n沒有可加入的列。'); return; }
  if (!APPLY) { console.log('\n（dry-run，未寫入。加 --apply 才會寫進 data/dungeons.json）'); return; }

  db.data = db.data.concat(added).sort((a, b) => (a.sortKey || 0) - (b.sortKey || 0));
  db.count = db.data.length;
  db.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(dPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log(`\n✓ 已寫入 data/dungeons.json：${db.count} 筆（新增 ${added.length}）`);
  console.log('  接著跑：node scripts/patch-triple-triad-source-names.mjs --apply');
  console.log('         node scripts/patch-blue-magic-content-ids.mjs --apply');
  console.log('         node scripts/validate-data.mjs');
}

main().catch((e) => { console.error(e); process.exit(1); });
