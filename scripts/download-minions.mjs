// 寵物圖示下載 + 壓縮腳本
//
// 從 XIVAPI asset API 下載 PNG，用 sharp 壓縮成 WebP 存入 /assets/minions/
// 圖示原始約 40x40 px，WebP 品質 90，通常 < 5 KB/張
//
// 需求：Node 18+，需安裝 sharp：
//   npm install sharp
//
// 執行（repo 根目錄）：
//   node scripts/download-minions.mjs
//
// 已存在的 .webp 自動略過，可重複執行補檔。
// 完成後前端把 icon 路徑的 .png 改成 .webp，或直接改 minions.json。

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
const MINIONS_JSON = join(ROOT, "data", "minions.json");
const OUT_DIR = join(ROOT, "assets", "minions");

// iconUrl 裡的 path 參數 → 檔名（ui/icon/004000/004403_hr1.tex → 004403_hr1）
function iconFilename(iconUrl) {
  const m = iconUrl.match(/path=([^&]+)/);
  if (!m) return null;
  const path = decodeURIComponent(m[1]); // ui/icon/004000/004403_hr1.tex
  const base = path.split("/").pop().replace(".tex", ""); // 004403_hr1
  return `${base}.webp`;
}

const exists = (p) => access(p).then(() => true).catch(() => false);

async function main() {
  const db = JSON.parse(await readFile(MINIONS_JSON, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  const entries = db.data.filter((m) => m.iconUrl);
  console.log(`共 ${entries.length} 筆寵物圖示 → ${OUT_DIR}`);

  let ok = 0, skip = 0, fail = 0;
  let totalOriginal = 0, totalCompressed = 0;

  for (const m of entries) {
    const fname = iconFilename(m.iconUrl);
    if (!fname) { fail++; continue; }
    const dest = join(OUT_DIR, fname);

    if (await exists(dest)) { skip++; continue; }

    try {
      const res = await fetch(m.iconUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const png = Buffer.from(await res.arrayBuffer());
      const webp = await sharp(png).webp({ quality: 90 }).toBuffer();

      await writeFile(dest, webp);
      totalOriginal += png.length;
      totalCompressed += webp.length;
      ok++;

      if (ok % 50 === 0) {
        process.stdout.write(`\r  已完成 ${ok}/${entries.length - skip}…`);
      }
    } catch (e) {
      fail++;
      console.warn(`\n  ✗ [${m.id}] ${m.name || m.nameEn}: ${e.message}`);
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
  console.log(`\n圖片存放於 assets/minions/，前端路徑範例：`);
  console.log(`  /assets/minions/004403_hr1.webp`);
  console.log(`\n如需更新 minions.json 的 icon 欄位，執行：`);
  console.log(`  node -e "const d=require('./data/minions.json'); d.data.forEach(m=>{if(m.iconUrl){const p=decodeURIComponent(m.iconUrl.match(/path=([^&]+)/)[1]);const b=p.split('/').pop().replace('.tex','');m.icon='/assets/minions/'+b+'.webp';}}); require('fs').writeFileSync('./data/minions.json', JSON.stringify(d,null,2));"`);
}

main().catch((e) => { console.error(e); process.exit(1); });
