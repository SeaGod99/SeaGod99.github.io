/**
 * patch-triple-triad-new-cards.mjs
 *
 * 把 data/triple-triad.json 補到「台服實際有的卡片張數」，並校正 patch 與手帳排序。
 *
 * 為什麼需要這支：`build-triple-triad-all.mjs` 把張數寫死成 `TOTAL_CARDS = 425`，
 * 之後台服開了新卡也不會被抓進來（7.1 的 426–435 就這樣漏掉整整 10 張）。而完整
 * 重建要 60–90 分鐘（步驟 2 要掃 28529 個 NPC），且會蓋掉既有的手動校正，所以改用
 * 這支「只補缺的」增量腳本。**台服開新卡之後跑這支，不要整包重建。**
 *
 * 張數的真實來源＝`data/items.json` 裡 category「九宮幻卡」的卡片道具數（台服客戶端
 * 資料，item 有就是台服有）。第 N 個卡片道具（依 itemId 排序）＝編號 N，這條位置對應
 * 已對既有 425 張全數驗證過，腳本每次跑也會再驗一次，不符就中止。
 *
 * 補進來的每一筆都來自可回查的來源，沒有一項是憑印象寫的：
 *   名稱／patch／icon  — data/items.json（台服）
 *   英文名             — XIVAPI v2 TripleTriadCard.Name
 *   星級／四向數值／類型 — XIVAPI v2 TripleTriadCardResident（rarity row ＝星數，已驗證）
 *   取得方式           — XIVAPI v2 TripleTriadCardResident.Acquisition（＝遊戲卡片一覽裡
 *                        的「取得方法」），再依指向的 sheet 分流：
 *                          ContentFinderCondition → data/dungeons.json 取繁中副本名
 *                          ENpcResident 且該 NPC 有 TripleTriad 牌組 → NPC對戰
 *                            （固定／隨機由牌組的 Fixed／Variable 欄決定）
 *                          ENpcResident 但沒有牌組 → 商店（只記 NPC 與地點，不猜貨幣）
 *   NPC 繁中名／座標    — data/npcs.json；地圖繁中名 — data/maps.json
 *   手帳排序           — TripleTriadCardResident 的 `Order`＋`UIPriority`（見下）
 *
 * **遊戲手帳的排列順序不是編號**（2026-07-26 使用者指出「有 15 張放在最後一頁，沒有在
 * 對應的編號內」）。實際規則＝先 `UIPriority` 再 `Order`：420 張 UIPriority=0 的卡依
 * Order 1–420 排，剩下 15 張 UIPriority=5 的**FF 歷代主角卡**（編號 68–80 的光之戰士→
 * 雷光、252 諾克提斯、405 克萊夫，SortKey 都是 48）Order 也是 1–15，於是整批被推到
 * 最後一頁（位置 421–435）。這兩欄寫進資料的 `order`／`uiPriority`，前端就照
 * (uiPriority, order) 排，頁面的每一頁才跟遊戲同一批卡。**不要改回照 id 排。**
 *
 * ※ XIVAPI **v1 已停在舊版本**（TripleTriadCard/426 直接 404），所以這支只用 v2。
 *
 * 執行：
 *   node scripts/patch-triple-triad-new-cards.mjs            # dry-run，只印要改什麼
 *   node scripts/patch-triple-triad-new-cards.mjs --apply    # 寫入 data/triple-triad.json
 * 補完新卡記得跑：
 *   node scripts/download-triple-triad-images.mjs            # 補卡面圖（先刪 _sprite.png 快取）
 *   node scripts/validate-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const V2 = 'https://v2.xivapi.com/api/sheet';
const TYPE_TW = { 1: '蠻神', 2: '拂曉', 3: '獸人', 4: '帝國' };   // 同 build-triple-triad-all.mjs

// dungeons.json 的 type → 本檔 sources[].type（沿用 triple-triad.json 既有用語）
const CONTENT_TYPE_TW = {
  dungeon: '副本', guildhest: '副本',
  alliance_raid: '多人副本',
  trial_hard: '討伐戰', trial_ex: '討伐戰',
  raid_normal: '大型任務', raid_savage: '大型任務', ultimate: '絕境戰',
};

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function v2(pathAndQuery, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(`${V2}/${pathAndQuery}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(800 * i);
    }
  }
}

// ── 台服卡片道具（＝張數與繁中名的真實來源）──────────────────────────────
function twCardItems() {
  const items = readJson('data/items.json');
  return (items.data || items)
    .filter((it) => it.category === '九宮幻卡')
    .sort((a, b) => a.id - b.id)
    .map((it) => ({
      itemId: it.id,
      name: it.name.replace('九宮幻卡：', ''),
      patch: it.patch ?? null,
      icon: Number((String(it.icon).match(/(\d+)\.png/) || [])[1]) || null,
    }));
}

async function main() {
  const triad = readJson('data/triple-triad.json');
  const cards = triad.data;
  const items = twCardItems();
  const npcs = new Map((readJson('data/npcs.json').data || []).map((n) => [n.id, n]));
  const maps = new Map((readJson('data/maps.json').data || []).map((m) => [m.id, m]));
  const dungeons = new Map((readJson('data/dungeons.json').data || []).map((d) => [d.id, d]));

  console.log(`目前 triple-triad.json：${cards.length} 張（編號 1–${Math.max(...cards.map((c) => c.id))}）`);
  console.log(`台服 items.json 的九宮幻卡卡片道具：${items.length} 張`);

  // 位置對應驗證：第 N 個卡片道具必須對上編號 N 的名稱，否則後面全錯
  const mismatch = cards.filter((c) => items[c.id - 1] && c.name !== items[c.id - 1].name);
  if (mismatch.length) {
    console.error(`✗ 位置對應驗證失敗（${mismatch.length} 筆名稱不符），中止：`);
    mismatch.slice(0, 5).forEach((c) => console.error(`   編號 ${c.id}：資料「${c.name}」vs 道具「${items[c.id - 1].name}」`));
    process.exit(1);
  }
  console.log(`✓ 位置對應驗證通過（${cards.length} 張名稱全對）`);

  const have = new Set(cards.map((c) => c.id));
  const missing = items.map((_, i) => i + 1).filter((id) => !have.has(id));
  console.log(`\n缺的卡：${missing.length ? missing.join(', ') : '（無）'}`);

  // ── 補新卡 ──────────────────────────────────────────────────────────────
  const added = [];
  for (const id of missing) {
    const it = items[id - 1];
    const [card, res] = await Promise.all([
      v2(`TripleTriadCard/${id}?fields=Name`),
      v2(`TripleTriadCardResident/${id}?fields=Top,Right,Bottom,Left,TripleTriadCardRarity,TripleTriadCardType,Acquisition`),
    ]);
    const f = res.fields || {};
    const typeRow = f.TripleTriadCardType?.row_id ?? 0;
    const row = {
      id,
      name: it.name,
      nameEn: card.fields?.Name ?? null,
      stars: f.TripleTriadCardRarity?.row_id ?? null,   // rarity row id ＝星數（已對既有卡驗證）
      type: TYPE_TW[typeRow] ?? null,
      numbers: { top: f.Top ?? null, right: f.Right ?? null, bottom: f.Bottom ?? null, left: f.Left ?? null },
      sources: await acquisitionSources(f.Acquisition, id, { npcs, maps, dungeons }),
      patch: it.patch,
      icon: it.icon,
    };
    added.push(row);
    console.log(`  + 編號 ${id} ${row.name}（${row.nameEn}）★${row.stars} ver ${row.patch}` +
      ` ${JSON.stringify(row.numbers)} → ${row.sources.map(srcLabel).join(' / ') || '（取得方式待補）'}`);
    await sleep(120);
  }

  // ── 校正 patch ────────────────────────────────────────────────────────────
  // 一律以「卡片道具的 patch」為準（台服客戶端資料）。既有值來自 XIVAPI v1 的
  // GamePatch，對新卡並不可靠：15 張是 null（版本閘門與版本篩選都吃不到），另有
  // 11 張偏早（黑貓標 6.5 但道具是 7.01；編號 414–417 標 6.0 但道具是 7.0——
  // 卡片不可能比它的道具還早出現，所以偏早的一定是錯的那邊）。
  // ※ 不要拿「patch 隨編號單調遞增」當驗證：實測有 29 處交錯（例：編號 173 是
  //   3.55b、174 是 3.5），編號並非嚴格按上線時間發配。
  const fixes = [];
  for (const c of cards) {
    const it = items[c.id - 1];
    if (it?.patch && c.patch !== it.patch) fixes.push([c, it.patch]);
  }
  const nulls = fixes.filter(([c]) => c.patch == null).length;
  console.log(`\n要校正 patch 的既有卡：${fixes.length} 張（其中 ${nulls} 張原本是 null）`);
  fixes.forEach(([c, p]) => console.log(`    編號 ${c.id} ${c.name}：${c.patch ?? 'null'} → ${p}`));

  // ── 手帳排序（order／uiPriority）─────────────────────────────────────────
  // 檔頭說明過：遊戲手帳照 (UIPriority, Order) 排，不是照編號。整批抓回來寫進資料。
  const all = cards.concat(added);
  const orderRows = [];
  for (let start = 0; start < all.length; start += 100) {
    const ids = all.slice(start, start + 100).map((c) => c.id);
    const r = await v2(`TripleTriadCardResident?rows=${ids.join(',')}&fields=Order,UIPriority`);
    orderRows.push(...(r.rows || []));
    await sleep(120);
  }
  const orderOf = new Map(orderRows.map((r) => [r.row_id, r.fields]));
  const missOrder = all.filter((c) => !orderOf.has(c.id));
  if (missOrder.length) console.warn(`  ⚠ 有 ${missOrder.length} 張抓不到 Order（${missOrder.slice(0, 5).map((c) => c.id).join(',')}…），維持原值`);
  const orderFixes = all.filter((c) => {
    const f = orderOf.get(c.id);
    return f && (c.order !== f.Order || c.uiPriority !== f.UIPriority);
  });
  const offNumber = all.filter((c) => (orderOf.get(c.id)?.UIPriority ?? 0) !== 0);
  console.log(`\n手帳排序：要更新 ${orderFixes.length} 張的 order／uiPriority`);
  console.log(`  「編號外」的卡（UIPriority ≠ 0，遊戲排在最後一頁）共 ${offNumber.length} 張：` +
    offNumber.map((c) => `${c.id} ${c.name}`).join('、'));

  if (!APPLY) {
    console.log('\n（dry-run，未寫入。加 --apply 才會寫進 data/triple-triad.json）');
    return;
  }

  fixes.forEach(([c, p]) => { c.patch = p; });
  all.forEach((c) => {
    const f = orderOf.get(c.id);
    if (!f) return;
    c.order = f.Order;              // 手帳位置（同 UIPriority 內遞增）
    c.uiPriority = f.UIPriority;    // 0＝一般卡；5＝FF 歷代主角卡，遊戲排在最後一頁
  });
  triad.data = all.sort((a, b) => a.id - b.id);   // 檔案本身仍按編號存，排序交前端做
  triad.count = triad.data.length;

  triad.updated = new Date().toISOString().slice(0, 10);
  triad.source = 'xivapi+items+npcs+maps+dungeons';
  fs.writeFileSync(path.join(ROOT, 'data/triple-triad.json'), JSON.stringify(triad, null, 2) + '\n', 'utf8');
  console.log(`\n✓ 已寫入 data/triple-triad.json：${triad.count} 張（新增 ${added.length}、校正 patch ${fixes.length}、更新排序 ${orderFixes.length}）`);
  console.log('  接著跑：node scripts/download-triple-triad-images.mjs（補卡面圖）→ node scripts/validate-data.mjs');
}

function srcLabel(s) {
  return s.type + (s.npcName ? '：' + s.npcName + (s.dropType ? `[${s.dropType}]` : '') : (s.detail ? '：' + s.detail : ''));
}

// Acquisition ＝遊戲卡片一覽的「取得方法」欄，依它指向的 sheet 分流
async function acquisitionSources(acq, cardId, { npcs, maps, dungeons }) {
  if (!acq || !acq.sheet) return [];

  if (acq.sheet === 'ContentFinderCondition') {
    const d = dungeons.get(acq.row_id);
    if (!d) { console.warn(`    ⚠ 編號 ${cardId}：dungeons.json 沒有 contentId ${acq.row_id}，取得方式留空`); return []; }
    const type = CONTENT_TYPE_TW[d.type];
    if (!type) console.warn(`    ⚠ 編號 ${cardId}：未對應的副本類型 ${d.type}，暫記為「副本」`);
    return [{ type: type || '副本', contentId: d.id, detail: d.name }];
  }

  if (acq.sheet === 'ENpcResident') {
    const npc = npcs.get(acq.row_id);
    if (!npc) { console.warn(`    ⚠ 編號 ${cardId}：npcs.json 沒有 NPC ${acq.row_id}，取得方式留空`); return []; }
    const map = npc.coords ? maps.get(npc.coords.mapId) : null;
    const location = npc.coords
      ? { mapId: npc.coords.mapId, mapName: map ? map.name : null, x: npc.coords.x, y: npc.coords.y }
      : null;

    // 這個 NPC 是幻卡對手嗎？看 ENpcBase.ENpcData 有沒有掛 TripleTriad 牌組
    const base = await v2(`ENpcBase/${acq.row_id}?fields=ENpcData`);
    const deckRow = (base.fields?.ENpcData || []).find((x) => x && x.sheet === 'TripleTriad' && x.value);
    if (!deckRow) {
      return [{ type: '商店', npcId: npc.id, npcName: npc.name, location,
                detail: npc.name + (location?.mapName ? `（${location.mapName}）` : '') }];
    }
    const deck = await v2(`TripleTriad/${deckRow.row_id}?fields=TripleTriadCardFixed,TripleTriadCardVariable`);
    const ids = (a) => (a || []).map((x) => x && x.row_id).filter(Boolean);
    const fixed = ids(deck.fields?.TripleTriadCardFixed);
    const dropType = fixed.includes(cardId) ? '固定'
      : ids(deck.fields?.TripleTriadCardVariable).includes(cardId) ? '隨機' : null;
    return [{ type: 'NPC對戰', npcId: npc.id, npcName: npc.name, npcTitle: null, dropType, location }];
  }

  console.warn(`    ⚠ 編號 ${cardId}：沒處理過的 Acquisition sheet「${acq.sheet}」，取得方式留空`);
  return [];
}

main().catch((e) => { console.error(e); process.exit(1); });
