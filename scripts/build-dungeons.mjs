/**
 * build-dungeons.mjs
 * 從 XIVAPI v2 ContentFinderCondition 抓全副本清單
 * 輸出 data/dungeons.json（符合 SCHEMA.md 2.6b）
 *
 * 用法：node scripts/build-dungeons.mjs
 * 需求：Node 18+（原生 fetch）
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../data/dungeons.json');
const BASE = 'https://v2.xivapi.com';

// 有效的 ContentType.value（在清單外的一律過濾）
// 2=Dungeon, 3=Guildhest, 4=Trial, 5=Raid, 21=DeepDungeon, 26=Eureka, 28=Ultimate/AllianceRaid, 30=Bozja
// 注意：幻卡(Triple Triad)、麻將、PvP(ContentType=6,9) 不在清單，直接過濾
// 絕境戰(Ultimate) 的 HighEndDuty=true，用此與 Alliance Raid 區分
const VALID_CONTENT_TYPES = new Set([2, 3, 4, 5, 21, 26, 28, 30]);

const EXPANSION_MAP = {
  'A Realm Reborn': 'ARR',
  'Heavensward': 'HW',
  'Stormblood': 'SB',
  'Shadowbringers': 'ShB',
  'Endwalker': 'EW',
  'Dawntrail': 'DT',
};

/**
 * 根據 ContentType.value、名稱、HighEndDuty、AllianceRoulette 決定 type 字串
 *
 * 注意：XIVAPI HighEndDuty 只對新版（EW 後）極神為 true，
 * 舊版極神需用名稱含 "(Extreme)" 判斷。
 * Alliance Raid 在 XIVAPI 中 ContentType=5（Raids）但有 AllianceRoulette=true，
 * 需優先判斷。
 */
function resolveType(ctValue, nameEn, highEnd, allianceRoulette, isSavage) {
  // Alliance Raid 優先（24人，ContentType=5 但有 AllianceRoulette）
  if (allianceRoulette) return 'alliance_raid';

  if (ctValue === 2) return 'dungeon';
  if (ctValue === 3) return 'guildhest';
  if (ctValue === 4) {
    // 極神：HighEndDuty=true（新版）或名稱含 (Extreme)（舊版）
    const isEx = highEnd || /\(Extreme\)/i.test(nameEn);
    return isEx ? 'trial_ex' : 'trial_hard';
  }
  if (ctValue === 5) return (highEnd || isSavage) ? 'raid_savage' : 'raid_normal';
  if (ctValue === 28 && highEnd) return 'ultimate';
  if (ctValue === 21) return 'deep_dungeon';
  if (ctValue === 26) return 'eureka';
  if (ctValue === 28) return 'alliance_raid';
  if (ctValue === 30) return 'bozja';
  return 'other';
}

/**
 * 分頁抓 XIVAPI sheet
 */
async function fetchAll(sheet, fields) {
  const rows = [];
  let after = 0;
  const encoded = encodeURIComponent(fields);
  while (true) {
    const url = `${BASE}/api/sheet/${sheet}?fields=${encoded}&limit=500&after=${after}`;
    console.log(`  GET ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const json = await res.json();
    if (!json.rows?.length) break;
    rows.push(...json.rows);
    const last = json.rows.at(-1).row_id;
    if (json.rows.length < 500) break;
    after = last;
  }
  return rows;
}

async function main() {
  console.log('=== build-dungeons.mjs ===');

  const fields = [
    'Name',
    'ContentType.value',
    'ContentUICategory.Name',       // "Savage Raids (...)" 用來識別零式
    'ClassJobLevelRequired',
    'ClassJobLevelSync',
    'ItemLevelRequired',
    'ItemLevelSync',
    'ContentMemberType.MembersPerParty',  // 每小隊人數
    'ContentMemberType.PartyCount',       // 小隊數（Alliance=3, 一般=1）
    'RequiredExVersion.Name',
    'AllianceRoulette',
    'HighEndDuty',
    'PvP',
    'IsInDutyFinder',
    'SortKey',
    'Image',
    'Transient.Description',
  ].join(',');

  console.log('抓 ContentFinderCondition...');
  const rows = await fetchAll('ContentFinderCondition', fields);
  console.log(`  共 ${rows.length} 筆（含空行）`);

  const data = [];

  for (const row of rows) {
    const f = row.fields;

    // 過濾：Name 為空 → 跳過（絕境戰 IsInDutyFinder=false，不能用此過濾）
    if (!f.Name || f.Name.trim() === '') continue;
    // 非 DutyFinder 且非 HighEndDuty（絕境戰）→ 跳過
    if (!f.IsInDutyFinder && !f.HighEndDuty) continue;

    const ctValue       = f['ContentType.value'] ?? f.ContentType?.value ?? 0;
    const highEnd       = f.HighEndDuty ?? false;
    const isPvP         = f.PvP ?? false;
    const allianceRoul  = f.AllianceRoulette ?? false;
    const exName        = f['RequiredExVersion.Name'] ?? f.RequiredExVersion?.Name ?? '';
    const uiCategory    = f['ContentUICategory.Name'] ?? f.ContentUICategory?.Name ?? '';
    const nameEn        = f.Name.trim();

    // 過濾：ContentType 不在有效清單（幻卡/麻將/PvP 等）
    if (!VALID_CONTENT_TYPES.has(ctValue)) continue;

    // 判斷 Savage：ContentUICategory 含 "Savage"（舊版 HighEndDuty=false 但 UICategory 有標）
    const isSavage = /savage/i.test(uiCategory) || /\(Savage\)/i.test(nameEn);

    const type = resolveType(ctValue, nameEn, highEnd || isSavage, allianceRoul, isSavage);

    // 隊伍人數：依 type 推導（XIVAPI list endpoint 不展開嵌套欄位數值）
    // dungeon=4, trial=8, raid=8, alliance_raid=24, ultimate=8
    const partySizeByType = {
      dungeon: 4, guildhest: 4,
      trial_hard: 8, trial_ex: 8,
      raid_normal: 8, raid_savage: 8,
      alliance_raid: 24,
      ultimate: 8,
      deep_dungeon: null, eureka: null, bozja: null,
    };
    const partySize = partySizeByType[type] ?? null;

    // Image 路徑
    const imageObj = f.Image ?? null;
    const imagePath = imageObj?.path_hr1 ?? imageObj?.path ?? null;
    const image = imagePath ? imagePath.replace('ui/icon/', '/i/').replace('.tex', '.png') : null;

    data.push({
      id: row.row_id,
      name: null,           // 繁中名 — 需後續補（見 TODO）
      nameEn,
      type,
      patch: null,          // XIVAPI 無直接 patch 欄，需手動或另表補
      ilvlSync: f.ItemLevelSync > 0 ? f.ItemLevelSync : null,
      ilvlReq: f.ItemLevelRequired ?? 0,
      levelReq: f.ClassJobLevelRequired ?? 0,
      levelSync: f.ClassJobLevelSync > 0 ? f.ClassJobLevelSync : null,
      partySize,
      expansion: EXPANSION_MAP[exName] ?? exName ?? null,
      sortKey: f.SortKey ?? 0,
      highEndDuty: highEnd,
      image,
      unlock: {
        type: 'unknown',
        questName: null,
        questId: null,
      },
      bosses: [],
      rewards: {
        tomestones: null,
        itemLevel: null,
        itemIds: [],
        mounts: [],
        minions: [],
      },
      notes: f['Transient.Description'] ?? f.Transient?.Description ?? null,
    });
  }

  // 依 sortKey 排序
  data.sort((a, b) => a.sortKey - b.sortKey);

  const today = new Date().toISOString().slice(0, 10);
  const out = {
    schema: 'dungeons',
    patch: '7.2',
    updated: today,
    source: 'xivapi',
    count: data.length,
    data,
  };

  function sanitize(key, val) {
    if (typeof val === 'string') return val.replace(/\0/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '');
    return val;
  }
  const outStr = JSON.stringify(out, sanitize, 2);
  const buf = Buffer.from(outStr + '\n', 'utf-8');
  const clean = buf.filter(b => b !== 0);
  writeFileSync(OUT, clean);
  console.log(`\n完成：${data.length} 筆副本 → ${OUT}`);

  // 統計各 type 數量
  const typeStat = {};
  for (const d of data) typeStat[d.type] = (typeStat[d.type] ?? 0) + 1;
  console.log('\n各類型統計：');
  for (const [t, n] of Object.entries(typeStat).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${t}: ${n}`);
  }

  console.log(`
TODO（腳本不自動處理，需後續補齊）：
  1. name（繁中名）— ContentFinderCondition 無繁中，需另找來源
     可能方向：Teamcraft 的 i18n/zh.json 或 thewakingsands datamining
  2. patch — 無直接欄位，可對照 SortKey 或 RequiredExVersion 手動分配
  3. unlock.type/questName — 需查 UnlockCriteria 對應任務
  4. bosses — 需另表（ContentNpcEnemy 等）
  5. rewards.mounts/minions — 需對照 mounts.json/minions.json 的 sources
`);
}

main().catch(err => { console.error(err); process.exit(1); });
