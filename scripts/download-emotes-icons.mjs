// 表情圖示下載 + 壓縮腳本
//
// 從 XIVAPI 下載表情 PNG（data/emotes.json 的 icon 欄位，格式 /i/246000/246201.png），
// 用 sharp 壓縮成 WebP 存入 /assets/emotes/，前端改用地端圖片。
//
// 需求：Node 18+，需安裝 sharp：
//   npm install sharp
//
// 執行（repo 根目錄）：
//   node scripts/download-emotes-icons.mjs
//
// 已存在的 .webp 自動略過，可重複執行補檔。
// 檔名取 icon 的基底數字（/i/246000/246201.png → 246201.webp）。

import { readFile, mkdir, writeFile, access } from "node:fs/promises";
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
const EMOTES_JSON = join(ROOT, "data", "emotes.json");
const OUT_DIR = join(ROOT, "assets", "emotes");
const ICON_BASE = "https://xivapi.com";

// /i/246000/246201.png → 246201.webp
function iconFilename(icon) {
  const base = icon.split("/").pop().replace(/\.png$/i, "");
  return `${base}.webp`;
}

// /i/246000/246461.png → https://beta.xivapi.com/api/1/asset/ui/icon/246000/246461.tex?format=png
// 較新的表情圖示舊版 xivapi.com 索引沒有，改用 beta API 取得。
function betaUrl(icon) {
  const m = icon.match(/\/i\/(\d+)\/(\d+)\.png$/i);
  if (!m) return null;
  return `https://beta.xivapi.com/api/1/asset/ui/icon/${m[1]}/${m[2]}.tex?format=png`;
}

// 先試正式站，404 再退到 beta；回傳 PNG buffer 或 throw。
async function fetchIcon(icon) {
  const res = await fetch(`${ICON_BASE}${icon}`);
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  if (res.status === 404) {
    const beta = betaUrl(icon);
    if (beta) {
      const res2 = await fetch(beta);
      if (res2.ok) return Buffer.from(await res2.arrayBuffer());
      throw new Error(`HTTP ${res.status} / beta HTTP ${res2.status}`);
    }
  }
  throw new Error(`HTTP ${res.status}`);
}

const exists = (p) => access(p).then(() => true).catch(() => false);

async function main() {
  const db = JSON.parse(await readFile(EMOTES_JSON, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  const entries = db.data.filter((e) => e.icon);
  console.log(`共 ${entries.length} 筆表情圖示 → ${OUT_DIR}`);

  let ok = 0, skip = 0, fail = 0;
  let totalOriginal = 0, totalCompressed = 0;

  for (const e of entries) {
    const fname = iconFilename(e.icon);
    const dest = join(OUT_DIR, fname);

    if (await exists(dest)) { skip++; continue; }

    try {
      const png = await fetchIcon(e.icon);
      const webp = await sharp(png).webp({ quality: 90 }).toBuffer();

      await writeFile(dest, webp);
      totalOriginal += png.length;
      totalCompressed += webp.length;
      ok++;

      if (ok % 50 === 0) {
        process.stdout.write(`\r  已完成 ${ok}/${entries.length - skip}…`);
      }
    } catch (err) {
      fail++;
      console.warn(`\n  ✗ [${e.id}] ${e.name || e.nameEn}: ${err.message}`);
    }

    // 對 API 客氣一點，避免 rate limit
    await new Promise((r) => setTimeout(r, 100));
  }

  process.stdout.write("\n");
  console.log(`\n完成：下載壓縮 ${ok}、略過(已存在) ${skip}、失敗 ${fail}`);
  if (ok > 0) {
    console.log(`  原始 PNG 總計 ${(totalOriginal / 1024).toFixed(0)} KB`);
    console.log(`  壓縮 WebP 總計 ${(totalCompressed / 1024).toFixed(0)} KB`);
    console.log(`  壓縮率 ${((1 - totalCompressed / totalOriginal) * 100).toFixed(0)}%`);
  }
  console.log(`\n圖片存放於 assets/emotes/，前端路徑範例：/assets/emotes/246201.webp`);
}

main().catch((e) => { console.error(e); process.exit(1); });
