// 幻卡卡面圖下載腳本
//
// 來源：ffxivcollect.com 每張卡自己的大圖（/assets/cards/large/<cardId>-<hash>.png，208×256）
// 流程：
//   1. 讀 data/triple-triad.json，挑出還沒有 webp 的卡
//   2. 逐張抓卡片頁 /triad/cards/<cardId>，從 HTML 取出該卡的大圖 URL（檔名帶 hash，不能硬猜）
//   3. 下載後用 sharp 壓成 WebP（q88；來源已是 208×256，尺寸不符才縮放）
//   4. 存入 assets/triple-triad/{cardId}.webp
//
// ※ 2026-07-26 改寫：ffxivcollect 已經不再用 sprite sheet（CSS 裡的 cards-large-*.png 沒了，
//   舊流程會停在「找不到 sprite sheet URL」）。順帶移除 assets/triple-triad/_sprite.png 這個
//   7.7MB 的快取檔——它本來就只是中間產物，留在 assets/ 會跟著發佈上 GitHub Pages 佔額度，
//   而且「CSS offset 是新的、快取 sprite 是舊的」還會安靜地裁錯圖。
//
// 需求：Node 18+，需安裝 sharp：
//   npm install sharp
//
// 執行：
//   node scripts/download-triple-triad-images.mjs           # 只補缺的
//   node scripts/download-triple-triad-images.mjs --force    # 全部重抓（覆蓋既有）

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  console.error("找不到 sharp，請先執行：npm install sharp");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TRIAD_JSON = join(ROOT, "data", "triple-triad.json");
const OUT_DIR = join(ROOT, "assets", "triple-triad");

const SITE = "https://ffxivcollect.com";
const OUT_W = 208;
const OUT_H = 256;
const FORCE = process.argv.includes("--force");

const exists = (p) => access(p).then(() => true).catch(() => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ffxiv-toolbox)" },
      });
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === retries - 1) throw e;
      console.warn(`  retry ${i + 1}: ${e.message}`);
      await sleep(delay * (i + 1));
    }
  }
}

// 從卡片頁取出該卡大圖的 URL（檔名帶內容 hash，只能從 HTML 拿）
async function cardImageUrl(cardId) {
  const res = await fetchWithRetry(`${SITE}/triad/cards/${cardId}`);
  const html = await res.text();
  const m = html.match(new RegExp(`/assets/cards/large/${cardId}-[a-f0-9]+\\.png`));
  return m ? SITE + m[0] : null;
}

async function main() {
  const triad = JSON.parse(await readFile(TRIAD_JSON, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  const todo = [];
  for (const card of triad.data) {
    if (!FORCE && (await exists(join(OUT_DIR, `${card.id}.webp`)))) continue;
    todo.push(card);
  }
  console.log(`共 ${triad.data.length} 張卡，需要下載 ${todo.length} 張` +
    (todo.length && todo.length <= 30 ? `（編號 ${todo.map((c) => c.id).join(", ")}）` : ""));
  if (!todo.length) { console.log("卡面圖已齊全，無事可做。"); return; }

  let ok = 0, fail = 0, totalSize = 0;
  for (const card of todo) {
    try {
      const url = await cardImageUrl(card.id);
      if (!url) { console.warn(`  ✗ [${card.id}] ${card.name}：卡片頁找不到大圖 URL`); fail++; continue; }
      const buf = Buffer.from(await (await fetchWithRetry(url)).arrayBuffer());
      const img = sharp(buf);
      const meta = await img.metadata();
      const webp = await (meta.width === OUT_W && meta.height === OUT_H
        ? img
        : img.resize(OUT_W, OUT_H, { kernel: "lanczos3" })
      ).webp({ quality: 88 }).toBuffer();
      await writeFile(join(OUT_DIR, `${card.id}.webp`), webp);
      totalSize += webp.length;
      ok++;
      console.log(`  ✓ [${card.id}] ${card.name}（${meta.width}×${meta.height} → ${(webp.length / 1024).toFixed(1)} KB）`);
    } catch (e) {
      fail++;
      console.warn(`  ✗ [${card.id}] ${card.name}：${e.message}`);
    }
    await sleep(250);
  }

  console.log(`\n完成：下載 ${ok}、失敗 ${fail}`);
  if (ok > 0) console.log(`  WebP 總計 ${(totalSize / 1024).toFixed(0)} KB（平均 ${(totalSize / ok / 1024).toFixed(1)} KB/張）`);
  console.log(`圖片存放於 assets/triple-triad/{cardId}.webp`);
}

main().catch((e) => { console.error(e); process.exit(1); });
