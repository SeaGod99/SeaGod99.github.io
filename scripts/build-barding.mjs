/**
 * build-barding.mjs
 *
 * 從 XIVAPI v2 抓鳥鞍（BuddyEquip）完整資料，含三部位圖示，
 * 並從 tw-items.msgpack 補繁中名稱。
 *
 * 注意：本腳本需要本機網路才能連 v2.xivapi.com。
 * 沙箱環境無法執行（DNS 被擋），請在本機執行。
 *
 * 執行前：npm i @msgpack/msgpack
 * 執行：node scripts/build-barding.mjs
 * 輸出：data/barding.json
 *
 * ── 資料架構說明 ──
 * BuddyEquip sheet：鳥鞍的 row_id、英文名、三部位圖示路徑
 * Item sheet：物品的 itemId，透過 ItemAction.Data[0] = BuddyEquip.row_id 反查
 * tw-items.msgpack：itemId → 繁中名稱
 * 圖示 URL：https://v2.xivapi.com/api/asset?path={path_hr1}&format=png
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { decode } from '@msgpack/msgpack';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');

// ── 設定 ────────────────────────────────────────────────────
const XIVAPI = 'https://v2.xivapi.com';
const PATCH = '7.2';

// 圖示 URL builder（hr1 高解析）
const iconUrl = (path) =>
  `${XIVAPI}/api/asset?path=${path}&format=png`;

// ── 載入 tw-items ────────────────────────────────────────────
console.log('載入 tw-items.msgpack...');
const msgpackBuf = readFileSync(join(ROOT, 'data/tw-items.msgpack'));
const twItems = decode(msgpackBuf); // { "itemId": { tw: "名稱" } }

function twName(itemId) {
  return twItems[String(itemId)]?.tw ?? twItems[itemId]?.tw ?? null;
}

// ── Step 1：抓 BuddyEquip（row_id → icon paths）────────────────
console.log('抓 BuddyEquip sheet...');

async function fetchAllBuddyEquip() {
  const fields = encodeURIComponent('Name,IconHead,IconBody,IconLegs');
  const rows = [];
  let after = 0;
  while (true) {
    const url = `${XIVAPI}/api/sheet/BuddyEquip?fields=${fields}&limit=500&after=${after}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.rows?.length) break;
    rows.push(...json.rows);
    const last = json.rows.at(-1).row_id;
    if (json.rows.length < 500) break;
    after = last;
  }
  return rows;
}

const buddyEquipRows = await fetchAllBuddyEquip();
console.log(`BuddyEquip: ${buddyEquipRows.length} rows`);

// 建立 rowId → { nameEn, iconHead, iconBody, iconLegs }
const buddyMap = {};
for (const row of buddyEquipRows) {
  const f = row.fields;
  if (!f.Name) continue; // 跳過空名稱
  buddyMap[row.row_id] = {
    nameEn: f.Name,
    iconHead: f.IconHead?.path_hr1 ? iconUrl(f.IconHead.path_hr1) : null,
    iconBody: f.IconBody?.path_hr1 ? iconUrl(f.IconBody.path_hr1) : null,
    iconLegs: f.IconLegs?.path_hr1 ? iconUrl(f.IconLegs.path_hr1) : null,
  };
}

// ── Step 2：從 Item sheet 找對應 itemId ────────────────────────
// ItemAction.Data[0] = BuddyEquip row_id
// 分批掃 Item rows（鳥鞍 itemId 集中在 6020~35000 左右，但也有散落的）
// 策略：掃全部 Item，取 ItemAction.Data[0] != 0 且在 buddyMap 中的
console.log('掃 Item sheet 找 BuddyEquip 對應...');

async function fetchItemsForBarding() {
  // ItemAction type 931 = BuddyEquip（但無法直接篩，全掃太慢）
  // 改策略：只抓有 ItemAction.Data[0] 且名稱含 Barding/Saddle 關鍵字的 item
  // 但 XIVAPI 不支援全文搜尋，改用已知 itemId 範圍分段抓

  const fields = encodeURIComponent('Name,ItemAction.Data,ItemAction.Action');
  const result = []; // [{itemId, buddyRowId, nameEn}]

  // 已知鳥鞍物品 itemId 分布（手動確認的範圍區間）
  const ranges = [
    [6020, 6032],   // 2.x 早期
    [6995, 6995],
    [7056, 7056],
    [7550, 7552],
    [8570, 8571],
    [8718, 8718],
    [9355, 9355],
    [10082, 10083],
    [12077, 12083],
    [12991, 12991],
    [13111, 13111],
    [13286, 13286],
    [14080, 14081],
    [14860, 14860],
    [15129, 15129],
    [15427, 15428],
    [16557, 16560],
    [16926, 16926],
    [17522, 17522],
    [20558, 20563],
    [21042, 21043],
    [21191, 21191],
    [21924, 21925],
    [23037, 23037],
    [24143, 24144],
    [24799, 24800],
    [27986, 27989],
    [28616, 28617],
  ];

  // 逐段抓（用 after + limit 涵蓋範圍）
  // 改為全掃策略：從 6020 到 40000，每批 500
  let after = 6019;
  const MAX_ITEM_ID = 45000;

  while (after < MAX_ITEM_ID) {
    const url = `${XIVAPI}/api/sheet/Item?fields=${fields}&limit=500&after=${after}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.rows?.length) break;

    for (const row of json.rows) {
      const data0 = row.fields?.ItemAction?.fields?.Data?.[0];
      const actionId = row.fields?.ItemAction?.fields?.Action?.value;
      // Action 1013 = 裝備鳥鞍，過濾掉坐騎笛（1322）等其他類型
      if (data0 && buddyMap[data0] && actionId === 1013) {
        result.push({ itemId: row.row_id, buddyRowId: data0, nameEn: row.fields.Name });
      }
    }

    const last = json.rows.at(-1).row_id;
    process.stdout.write(`\r  掃到 item ${last}，找到 ${result.length} 筆...`);
    if (json.rows.length < 500) break;
    after = last;
  }
  console.log('');
  return result;
}

const itemMatches = await fetchItemsForBarding();
console.log(`找到 ${itemMatches.length} 筆 item ↔ BuddyEquip 對應`);

// ── Step 3：合併，補繁中名稱 ────────────────────────────────────
console.log('合併資料...');

// buddyRowId → itemId 對應表
const buddyToItem = {};
for (const m of itemMatches) {
  buddyToItem[m.buddyRowId] = m.itemId;
}

const data = [];
for (const [rowIdStr, bud] of Object.entries(buddyMap)) {
  const rowId = Number(rowIdStr);
  const itemId = buddyToItem[rowId] ?? null;
  const nameTw = itemId ? twName(itemId) : null;

  // 推斷 slot（根據圖示是否與通用圖示不同）
  // 頭/身/腿只要有任兩個圖示相同通常代表「半套」或「全套」
  // 這裡簡單判斷：三個都有且不同=全套；僅有部分不同=判 nameEn
  let slot = '全套';
  const nameLow = bud.nameEn.toLowerCase();
  if (nameLow.includes('shaffron') || nameLow.includes('head')) slot = '頭';
  else if (nameLow.includes('half barding')) slot = '半套';
  else if (nameLow.includes('saddle') && !nameLow.includes('saddle bag')) slot = '鞍';

  data.push({
    id: rowId,
    name: nameTw ?? bud.nameEn,   // 無繁中名就先用英文
    nameEn: bud.nameEn,
    itemId,
    slot,
    iconHead: bud.iconHead,
    iconBody: bud.iconBody,
    iconLegs: bud.iconLegs,
    sources: [],   // 來源留空，後續手動補
    patch: '',     // 後續補
  });
}

// 依 id 排序
data.sort((a, b) => a.id - b.id);

// ── Step 4：輸出 ────────────────────────────────────────────────
const output = {
  schema: 'barding',
  patch: PATCH,
  updated: new Date().toISOString().slice(0, 10),
  source: 'xivapi+tw-items',
  count: data.length,
  data,
};

const outPath = join(ROOT, 'data/barding.json');
writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`✓ 輸出 ${outPath}（${data.length} 筆）`);

// 統計有無繁中名稱
const noTw = data.filter(d => d.name === d.nameEn).length;
if (noTw > 0) {
  console.log(`⚠ ${noTw} 筆無繁中名稱（台服未開放或 itemId 未找到）：`);
  data.filter(d => d.name === d.nameEn).forEach(d => console.log(`  row ${d.id}: ${d.nameEn} (itemId=${d.itemId})`));
}
