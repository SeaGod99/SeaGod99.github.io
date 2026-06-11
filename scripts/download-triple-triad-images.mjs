// 幻卡卡面圖下載腳本
//
// 來源：ffxivcollect.com 的 sprite sheet（cards-large-*.png）
// 流程：
//   1. fetch ffxivcollect CSS → 解析每張卡的 sprite offset
//   2. 下載 sprite sheet PNG
//   3. 用 sharp 裁切每張卡（104×128），縮放至 208×256，壓縮 WebP
//   4. 存入 assets/triple-triad/{cardId}.webp
//
// 需求：Node 18+，需安裝 sharp：
//   npm install sharp
//
// 執行：
//   node scripts/download-triple-triad-images.mjs

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
const SPRITE_CACHE = join(ROOT, "assets", "triple-triad", "_sprite.png");

// ffxivcollect 資源（有時 hash 會變，腳本啟動時動態抓）
const FFXIVCOLLECT_CARDS_PAGE = "https://ffxivcollect.com/triad/cards/1";
const CARD_W = 104;
const CARD_H = 128;
const OUT_W = 208; // 放大 2x
const OUT_H = 256;

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

// 解析 CSS 取得 sprite URL 和 offset map
async function parseCss() {
  console.log("正在取得 ffxivcollect CSS...");

  // 先取 cards 頁面，從 HTML 找出 CSS URL
  const pageRes = await fetchWithRetry(FFXIVCOLLECT_CARDS_PAGE);
  const html = await pageRes.text();

  const cssMatch = html.match(/href="(\/assets\/application-[^"]+\.css)"/);
  if (!cssMatch) throw new Error("找不到 CSS URL");
  const cssUrl = `https://ffxivcollect.com${cssMatch[1]}`;

  // 從 CSS 找 sprite sheet URL
  const cssRes = await fetchWithRetry(cssUrl);
  const css = await cssRes.text();

  const spriteMatch = css.match(/url\(["']?(\/assets\/cards-large-[^"')]+\.png)["']?\)/);
  if (!spriteMatch) throw new Error("找不到 sprite sheet URL");
  const spriteUrl = `https://ffxivcollect.com${spriteMatch[1]}`;

  // 解析所有 .cards-large-N { background-position: -Xpx -Ypx }
  const offsetMap = {};
  const re = /img\.cards-large-(\d+)\s*\{[^}]*background-position:\s*(-?\d+)px\s+(-?\d+)px/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const id = parseInt(m[1]);
    const x = Math.abs(parseInt(m[2]));
    const y = Math.abs(parseInt(m[3]));
    offsetMap[id] = [x, y];
  }

  console.log(`  CSS 解析完成：${Object.keys(offsetMap).length} 張卡的 offset`);
  console.log(`  Sprite URL: ${spriteUrl}`);
  return { spriteUrl, offsetMap };
}

// 下載 sprite sheet（有快取就跳過）
async function downloadSprite(url) {
  if (await exists(SPRITE_CACHE)) {
    console.log("  Sprite sheet 已快取，略過下載");
    return;
  }
  console.log("正在下載 sprite sheet...");
  const res = await fetchWithRetry(url);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(SPRITE_CACHE, buf);
  console.log(`  已儲存：${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}

async function main() {
  const triad = JSON.parse(await readFile(TRIAD_JSON, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  // 取得 CSS 資料
  const { spriteUrl, offsetMap } = await parseCss();

  // 下載 sprite
  await downloadSprite(spriteUrl);
  const spriteBuf = await readFile(SPRITE_CACHE);

  console.log(`\n開始裁切 ${triad.data.length} 張卡...\n`);

  let ok = 0, skip = 0, fail = 0;
  let totalSize = 0;

  for (const card of triad.data) {
    const cardId = card.id;
    const dest = join(OUT_DIR, `${cardId}.webp`);

    if (await exists(dest)) {
      skip++;
      continue;
    }

    const offset = offsetMap[cardId];
    if (!offset) {
      console.warn(`  ✗ [${cardId}] ${card.name}：找不到 sprite offset`);
      fail++;
      continue;
    }

    try {
      const [x, y] = offset;
      const webp = await sharp(spriteBuf)
        .extract({ left: x, top: y, width: CARD_W, height: CARD_H })
        .resize(OUT_W, OUT_H, { kernel: "lanczos3" })
        .webp({ quality: 88 })
        .toBuffer();

      await writeFile(dest, webp);
      totalSize += webp.length;
      ok++;

      if ((ok + skip) % 50 === 0) {
        process.stdout.write(`\r  進度 ${ok + skip}/${triad.data.length}（裁切 ${ok}、略過 ${skip}、失敗 ${fail}）…`);
      }
    } catch (e) {
      fail++;
      console.warn(`\n  ✗ [${cardId}] ${card.name}：${e.message}`);
    }
  }

  process.stdout.write("\n");
  console.log(`\n完成：裁切 ${ok}、略過(已存在) ${skip}、失敗 ${fail}`);
  if (ok > 0) {
    console.log(`  WebP 總計 ${(totalSize / 1024).toFixed(0)} KB`);
    console.log(`  平均 ${(totalSize / ok / 1024).toFixed(1)} KB/張`);
  }
  console.log(`\n圖片存放於 assets/triple-triad/{cardId}.webp`);
  console.log(`Sprite 快取：assets/triple-triad/_sprite.png（可手動刪除）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
