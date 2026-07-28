/**
 * patch-triple-triad-prose-sources.mjs
 *
 * 把 triple-triad.json 裡僅存的兩筆「英文散文 detail」改寫成站內的結構化來源。
 * 上游（wiki）給的是整句英文，前端會原樣印出來，違反繁中名鐵則：
 *
 *   卡 323 究極戰士G型
 *     "Purchased from C'intana in Mor Dhona (X:22.7, Y:6.7) for 1 Ruby Totem,
 *      1 Emerald Totem, and 1 Diamond Totem"
 *   卡 370 貓耳小員
 *     "Purchased from Horrendous Hoarder in Unnamed Island (12.6, 28.3)
 *      for Seafarer's Cowrie"
 *
 * ── 每個名字都是查來的，沒有一個是翻的 ──────────────────────────────────
 *   C'intana          → `data/npcs.json` nameEn 比對 → 1033259 卡·因塔娜
 *                       （座標 mapId 25 摩杜納 22.8, 6.67，與英文句子的 22.7/6.7 吻合）
 *   Horrendous Hoarder→ `out_data/npcs.msgpack`（Teamcraft en + twNpcs）→ 1043463 貿易小員
 *   Ruby/Emerald/Diamond Totem
 *                     → `out_data/en-items.msgpack` 反查 itemId → `items.json` 台服名
 *                       29001 紅色未知蠻神圖騰／32132 綠色未知蠻神圖騰／33480 白色未知蠻神圖騰
 *   Seafarer's Cowrie → 同上 → 37549 **謝爾達萊青船幣**
 *
 * ※ 卡 323 的型別由「討伐戰」改成「商店」：它的取得動作就是找 NPC 兌換，
 *   圖騰來自極神只是圖騰本身的來源。三種圖騰仍寫在 detail 裡，看得到那層關聯。
 *
 * 冪等：偵測到 detail 已經是繁中就不動。
 *
 * 執行：
 *   node scripts/patch-triple-triad-prose-sources.mjs           # dry-run
 *   node scripts/patch-triple-triad-prose-sources.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const readData = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// 每筆都附上「這個名字從哪裡查到的」，改動前請照著重查一次
const REWRITES = [
  {
    cardId: 323,
    matchEn: /^Purchased from C'intana/,
    build: () => ({
      type: '商店',
      npcId: 1033259,            // npcs.json：nameEn "C'intana" 唯一命中
      npcName: '卡·因塔娜',
      location: { mapId: 25, mapName: '摩杜納', x: 22.8, y: 6.67 },
      itemCost: [
        { itemId: 29001, name: '紅色未知蠻神圖騰', qty: 1 },
        { itemId: 32132, name: '綠色未知蠻神圖騰', qty: 1 },
        { itemId: 33480, name: '白色未知蠻神圖騰', qty: 1 },
      ],
      detail: '卡·因塔娜（摩杜納）— 紅色未知蠻神圖騰×1、綠色未知蠻神圖騰×1、白色未知蠻神圖騰×1',
    }),
  },
  {
    // 上游只留了英文副本名、型別還標成「多人副本」（實際是多變迷宮）。
    // dungeons.json 2026-07-28 補收多變迷宮後，nameEn 就對得上了：CFC 945 → 多變迷宮 六根山。
    cardId: 386,
    matchEn: /^Mount Rokkon$/,
    build: (dungeons) => {
      const d = dungeons.find((x) => x.nameEn === 'Mount Rokkon');
      if (!d) return null;
      return { type: '多變迷宮', contentId: d.id, detail: d.name };
    },
  },
  {
    cardId: 370,
    matchEn: /^Purchased from Horrendous Hoarder/,
    build: () => ({
      type: '無人島',
      npcId: 1043463,            // out_data/npcs.msgpack：en "Horrendous Hoarder" → tw 貿易小員
      npcName: '貿易小員',
      location: { mapId: 772, mapName: '無名島', x: 12.6, y: 28.3 },
      itemCost: [{ itemId: 37549, name: '謝爾達萊青船幣', qty: null }],
      detail: '貿易小員（無名島）— 以謝爾達萊青船幣兌換',
    }),
  },
];

function main() {
  const p = path.join(ROOT, 'data/triple-triad.json');
  const db = readData('data/triple-triad.json');
  const dungeons = readData('data/dungeons.json').data;
  let changed = 0;

  for (const rw of REWRITES) {
    const card = db.data.find((c) => c.id === rw.cardId);
    if (!card) { console.log(`  ✗ 找不到編號 ${rw.cardId} 的卡，略過`); continue; }
    const idx = (card.sources || []).findIndex((s) => s.detail && rw.matchEn.test(s.detail));
    if (idx < 0) {
      const done = (card.sources || []).some((s) => s.detail && /[一-鿿]/.test(s.detail));
      console.log(`  ・編號 ${rw.cardId} ${card.name}：${done ? '已是繁中，不動' : '找不到要改的英文句子'}`);
      continue;
    }
    const next = rw.build(dungeons);
    if (!next) { console.log(`  ✗ 編號 ${rw.cardId}：查不到對應的副本，維持原樣不猜`); continue; }
    console.log(`  ✓ 編號 ${rw.cardId} ${card.name}`);
    console.log(`      舊：${card.sources[idx].type}｜${card.sources[idx].detail}`);
    console.log(`      新：${next.type}｜${next.detail}`);
    if (APPLY) card.sources[idx] = next;
    changed++;
  }

  const leftEn = db.data.reduce((n, c) =>
    n + (c.sources || []).filter((s) => s.detail && !/[一-鿿]/.test(s.detail)).length, 0);
  console.log(`\n可改寫 ${changed} 筆；改完後仍為純英文的 detail：${APPLY ? leftEn : leftEn - changed} 筆`
    + `（＝14 個成就名，Title/Achievement 非物品、tw-items 不涵蓋，全站對成就譯名的立場是擱置）`);

  if (!APPLY) { console.log('\n（dry-run，未寫入。加 --apply 才會寫檔）'); return; }
  if (!changed) return;
  db.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(p, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log('✓ 已寫入 data/triple-triad.json');
}

main();
