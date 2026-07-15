/**
 * build-barding.mjs
 *
 * 從 XIVAPI v2 抓鳥鞍（BuddyEquip）完整資料，含三部位圖示，
 * 並從 tw-items.msgpack 補繁中名稱。
 *
 * 注意：本腳本需要本機網路才能連 v2.xivapi.com。
 * 沙箱環境無法執行（外網被擋），請在本機執行。
 *
 * 執行前：npm i @msgpack/msgpack
 * 執行：node scripts/build-barding.mjs
 * 輸出：data/barding.json
 *
 * ── 資料架構說明 ──
 * BuddyEquip sheet：鳥鞍的 row_id、英文名、三部位圖示路徑
 * Item sheet：透過 search API 查 ItemAction.Action=1013（裝備鳥鞍），
 *             ItemAction.Data[0] = BuddyEquip.row_id → 反查 itemId
 * tw-items.msgpack：itemId → 繁中名稱（out_data/，台服官方譯名）
 * 圖示 URL：https://v2.xivapi.com/api/asset?path={path_hr1}&format=png
 *
 * 已知無對應物品的鳥鞍（itemId=null 屬正常）：
 *   1/5/9 三國 Saddle、13/14/15 職業鳥鞍（非道具取得）
 * 物品不在 tw-items 者＝台服未開放，名稱保留英文（不可用 XIVAPI 補）。
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
const msgpackBuf = readFileSync(join(ROOT, 'out_data/tw-items.msgpack'));
const twItems = decode(msgpackBuf); // { "itemId": { tw: "名稱" } }

function twName(itemId) {
  return twItems[String(itemId)]?.tw ?? null;
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

// ── Step 2：search API 找對應 itemId ──────────────────────────
// query: ItemAction.Action=1013（裝備鳥鞍），ItemAction.Data[0]=BuddyEquip row_id
console.log('查 Item sheet（search API, ItemAction.Action=1013）...');

async function fetchBardingItems() {
  // buddyRowId → itemId
  const map = {};
  let cursor = null;
  while (true) {
    const url = cursor
      ? `${XIVAPI}/api/search?cursor=${cursor}&fields=ItemAction.Data&limit=500`
      : `${XIVAPI}/api/search?sheets=Item&query=${encodeURIComponent('ItemAction.Action=1013')}&fields=ItemAction.Data&limit=500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Item search HTTP ${res.status}`);
    const json = await res.json();
    for (const r of json.results || []) {
      const buddyId = r.fields?.ItemAction?.fields?.Data?.[0];
      if (!buddyId) continue;
      const cur = map[buddyId];
      if (cur == null) { map[buddyId] = r.row_id; continue; }
      // 同一鳥鞍多個道具（復刻販售）：優先有台服譯名者，其次 itemId 較小者
      const curTw = !!twName(cur), newTw = !!twName(r.row_id);
      if ((newTw && !curTw) || (newTw === curTw && r.row_id < cur)) map[buddyId] = r.row_id;
    }
    if (!json.next) break;
    cursor = json.next;
  }
  return map;
}

const buddyToItem = await fetchBardingItems();
console.log(`找到 ${Object.keys(buddyToItem).length} 筆 BuddyEquip ↔ item 對應`);

// ── Step 3：合併，補繁中名稱 ────────────────────────────────────
console.log('合併資料...');

const data = [];
for (const [rowIdStr, bud] of Object.entries(buddyMap)) {
  const rowId = Number(rowIdStr);
  const itemId = buddyToItem[rowId] ?? null;
  const nameTw = itemId ? twName(itemId) : null;

  // 推斷 slot（依英文名關鍵字）
  let slot = '全套';
  const nameLow = bud.nameEn.toLowerCase();
  if (nameLow.includes('shaffron') || nameLow.includes('head')) slot = '頭';
  else if (nameLow.includes('half barding')) slot = '半套';
  else if (nameLow.includes('saddle') && !nameLow.includes('saddle bag')) slot = '鞍';

  data.push({
    id: rowId,
    name: nameTw ?? bud.nameEn,   // 無繁中名（台服未開放/無物品）保留英文
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
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
console.log(`✓ 輸出 ${outPath}（${data.length} 筆）`);

// 統計
const noItem = data.filter(d => d.itemId == null);
const noTw = data.filter(d => d.name === d.nameEn);
console.log(`itemId：${data.length - noItem.length}/${data.length}（null=${noItem.length}）`);
if (noTw.length > 0) {
  console.log(`${noTw.length} 筆無繁中名稱（無物品或台服未開放）：`);
  noTw.forEach(d => console.log(`  row ${d.id}: ${d.nameEn} (itemId=${d.itemId})`));
}
