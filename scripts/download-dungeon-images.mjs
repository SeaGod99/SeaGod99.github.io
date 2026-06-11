/**
 * download-dungeon-images.mjs
 * 下載 dungeons.json 的副本 banner 圖片
 * 來源：XIVAPI /api/asset
 * 輸出：/assets/dungeons/{filename}.png
 *
 * 用法：node scripts/download-dungeon-images.mjs
 * 需求：Node 18+
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUNGEONS_PATH = resolve(__dirname, '../data/dungeons.json');
const OUT_DIR = resolve(__dirname, '../assets/dungeons');
const BASE = 'https://v2.xivapi.com';

// 限制並發數，避免打爆 API
const CONCURRENCY = 5;
const DELAY_MS = 100;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// /i/112000/112001_hr1.png → ui/icon/112000/112001_hr1.tex
function imagePathToTex(imgPath) {
  return imgPath.replace('/i/', 'ui/icon/').replace('.png', '.tex');
}

// /i/112000/112001_hr1.png → 112000_112001_hr1.webp
function imagePathToFilename(imgPath) {
  return imgPath.replace('/i/', '').replace(/\//g, '_').replace('.png', '.webp');
}

async function downloadOne(texPath, outPath) {
  const url = `${BASE}/api/asset?path=${encodeURIComponent(texPath)}&format=png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // 壓縮：轉 WebP，品質 85，縮至最大寬 400px
  await sharp(buf)
    .resize({ width: 600, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(outPath);
}

async function main() {
  console.log('=== download-dungeon-images.mjs ===');

  const db = JSON.parse(readFileSync(DUNGEONS_PATH, 'utf-8'));
  const entries = db.data.filter(x => x.image);
  console.log(`共 ${entries.length} 筆有圖片`);

  mkdirSync(OUT_DIR, { recursive: true });

  // 建立下載清單（略過已存在）
  const tasks = [];
  for (const entry of entries) {
    // image 可能已是本地路徑，用 imageUrl 還原原始路徑；或從 image 推導
    const srcPath = entry.imageUrl
      ? new URL(entry.imageUrl).searchParams.get('path')  // 從 imageUrl 取 tex path
      : imagePathToTex(entry.image);
    if (!srcPath || srcPath.startsWith('/assets')) {
      console.warn(`  ⚠ [${entry.id}] 無法取得原始圖片路徑，跳過`);
      continue;
    }
    const filename = srcPath.replace('ui/icon/', '').replace(/\//g, '_').replace('.tex', '.webp');
    const outPath = resolve(OUT_DIR, filename);
    if (existsSync(outPath)) continue;
    tasks.push({ entry, srcPath, filename, outPath });
  }

  if (tasks.length === 0) {
    console.log('所有圖片已存在，無需下載');
    return;
  }
  console.log(`需下載：${tasks.length} 張（已跳過 ${entries.length - tasks.length} 張）`);

  // 分批並發下載
  let done = 0, failed = 0;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async ({ entry, srcPath, filename, outPath }) => {
      try {
        await downloadOne(srcPath, outPath);
        done++;
        if (done % 20 === 0 || done === tasks.length) {
          console.log(`  ${done}/${tasks.length} 完成...`);
        }
      } catch (err) {
        failed++;
        console.warn(`  ✗ [${entry.id}] ${filename}: ${err.message}`);
      }
    }));
    if (i + CONCURRENCY < tasks.length) await sleep(DELAY_MS);
  }

  console.log(`\n完成：${done} 張下載、${failed} 張失敗`);
  console.log(`→ ${OUT_DIR}`);

  // 回寫 dungeons.json，把 image 路徑改為本地路徑
  console.log('\n更新 dungeons.json image 路徑為本地路徑...');
  let updated = 0;
  for (const entry of db.data) {
    if (!entry.image) continue;
    // 已是本地路徑就跳過
    if (entry.image.startsWith('/assets/dungeons/')) { updated++; continue; }
    const texPath = imagePathToTex(entry.image);
    const filename = texPath.replace('ui/icon/', '').replace(/\//g, '_').replace('.tex', '.webp');
    entry.imageUrl = `${BASE}/api/asset?path=${encodeURIComponent(texPath)}&format=png`;
    entry.image = `/assets/dungeons/${filename}`;
    updated++;
  }

  function sanitize(key, val) {
    if (typeof val === 'string') return val.replace(/\0/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '');
    return val;
  }
  const outStr = JSON.stringify(db, sanitize, 2);
  const buf = Buffer.from(outStr + '\n', 'utf-8');
  writeFileSync(DUNGEONS_PATH, buf.filter(b => b !== 0));
  console.log(`  更新 ${updated} 筆 image 路徑`);
}

main().catch(err => { console.error(err); process.exit(1); });
