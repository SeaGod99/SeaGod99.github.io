/**
 * build-npcs.mjs
 * 從 Teamcraft TW 資料建立 NPC 參照表，輸出 /data/npcs.json
 *
 * 資料來源：
 *   - tw/tw-npcs.json       繁中 NPC 名稱（28529 筆）
 *   - tw/tw-npc-titles.json 繁中 NPC 稱號
 *   - npcs.json             NPC 位置座標（59851 筆）
 *
 * 過濾條件：有繁中名 + 有位置座標
 * 結果約 22000 筆
 *
 * 執行：node scripts/build-npcs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TC_BASE = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json';

// ─── 工具 ─────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  console.log(`  GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// ─── 步驟函式 ─────────────────────────────────────────────────────────────

/** 步驟 1：抓三個來源 */
async function fetchSources() {
  console.log('\n[1] 抓取 Teamcraft TW NPC 資料...');
  const [twNpcs, twTitles, tcNpcs] = await Promise.all([
    fetchJson(`${TC_BASE}/tw/tw-npcs.json`),
    fetchJson(`${TC_BASE}/tw/tw-npc-titles.json`),
    fetchJson(`${TC_BASE}/npcs.json`),
  ]);
  console.log(`  tw-npcs: ${Object.keys(twNpcs).length} 筆`);
  console.log(`  tw-npc-titles: ${Object.keys(twTitles).length} 筆`);
  console.log(`  npcs: ${Object.keys(tcNpcs).length} 筆`);
  return { twNpcs, twTitles, tcNpcs };
}

/** 步驟 2：合併資料，過濾有繁中名 + 有位置的 NPC */
function buildData({ twNpcs, twTitles, tcNpcs }) {
  console.log('\n[2] 合併資料...');

  const data = [];
  for (const [id, npc] of Object.entries(tcNpcs)) {
    const twName = twNpcs[id]?.tw;
    if (!twName || !npc.position) continue;

    const pos = npc.position;
    data.push({
      id:      parseInt(id),
      name:    twName,
      nameEn:  npc.en || null,
      title:   twTitles[id]?.tw || null,
      coords:  {
        mapId: pos.map  ?? null,
        x:     pos.x    ?? null,
        y:     pos.y    ?? null,
      },
    });
  }

  data.sort((a, b) => a.id - b.id);
  console.log(`  合併完成：${data.length} 筆`);
  return data;
}

/** 步驟 3：寫入 JSON */
function writeOutput(data) {
  const output = {
    schema:  'npcs',
    patch:   '7.2',
    updated: new Date().toISOString().slice(0, 10),
    source:  'teamcraft-tw',
    count:   data.length,
    data,
  };

  const outPath = path.join(ROOT, 'data/npcs.json');
  fs.writeFileSync(outPath, JSON.stringify(output));
  const size = fs.statSync(outPath).size;
  console.log(`\n✓ 輸出 ${outPath}（${data.length} 筆，${(size / 1024).toFixed(0)} KB）`);
}

// ─── 主流程 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== build-npcs.mjs ===');
  const sources = await fetchSources();
  const data    = buildData(sources);
  writeOutput(data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
