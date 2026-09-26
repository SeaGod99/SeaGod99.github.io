// build-pwa-icons.mjs — 從 assets/icons/icon.svg 產 PWA 安裝用的 PNG 圖示
//
// 為什麼不能只有 SVG：`manifest.json` 原本只掛一張 `sizes: "any"` 的 SVG。
// Chrome 桌面版吃得下，但**Android 的「加到主畫面」與安裝橫幅要求至少一張 192×192
// 與一張 512×512 的點陣圖**，只有 SVG 時安裝提示不會出現（也不報錯，就是安靜地沒有）。
// iOS Safari 另外只認 `<link rel="apple-touch-icon">`，那是 180×180 的 PNG。
//
// 尺寸與用途：
//   192  Android 主畫面／安裝橫幅的最低要求
//   512  安裝畫面與啟動畫面
//   180  iOS 的 apple-touch-icon
//   maskable 512  Android 自適應圖示（安全區只有中間 80%，所以另外畫、四周留白）
//
// maskable 為什麼要另外產：Android 會把圖示裁成圓形／圓角方形等各種形狀，
// 只保證中間 80% 的內容不被裁掉。直接拿原圖標 `purpose: maskable` 的話，
// 原圖的圓角背景會被裁掉一圈、變成「圓角裡再一個圓角」。這裡把原圖縮到 80%
// 再置中貼到純色底上。
//
// 執行（repo 根目錄）：
//   node scripts/build-pwa-icons.mjs            # dry-run，印要產什麼
//   node scripts/build-pwa-icons.mjs --apply    # 寫入 assets/icons/

import { readFile, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIR = join(ROOT, "assets", "icons");
const SRC = join(DIR, "icon.svg");

const apply = process.argv.includes("--apply");

// 背景色取自 manifest 的 background_color（tokens.css 的 --bg-base）
const BG = "#0a0c10";

const JOBS = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
];

async function main() {
  if (!existsSync(SRC)) throw new Error(`找不到來源 ${SRC}`);
  const svg = await readFile(SRC);
  console.log(`來源 assets/icons/icon.svg（${svg.length} bytes）\n`);

  for (const j of JOBS) {
    let buf;
    if (j.maskable) {
      // 安全區 80%：先縮到 80% 再置中貼到純色底
      const inner = Math.round(j.size * 0.8);
      const scaled = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
      buf = await sharp({
        create: { width: j.size, height: j.size, channels: 4, background: BG },
      })
        .composite([{ input: scaled, gravity: "centre" }])
        .png()
        .toBuffer();
    } else {
      buf = await sharp(svg, { density: 384 }).resize(j.size, j.size).png().toBuffer();
    }
    const out = join(DIR, j.name);
    const old = existsSync(out) ? statSync(out).size : 0;
    console.log(
      `  ${j.name.padEnd(26)} ${String(j.size).padStart(3)}px  ${(buf.length / 1024).toFixed(1)}KB` +
      (j.maskable ? "  （安全區 80%，四周留白）" : "") +
      (old ? `  （原有 ${(old / 1024).toFixed(1)}KB）` : "  （新檔）")
    );
    if (apply) await writeFile(out, buf);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  console.log("\n✓ assets/icons/");
  console.log("  記得 manifest.json 的 icons 要列到它們，並跑 node scripts/bump-sw-version.mjs");
}

main().catch((e) => { console.error(e); process.exit(1); });
