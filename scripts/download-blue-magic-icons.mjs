// 青魔法圖示下載腳本
// 用途：讀 /data/blue-magic.json，把每個法術的手帳圖示（icon 欄，/i/072000/0723xx.png）
//       從 XIVAPI 抓下來存進 /assets/blue-magic/，供頁面以本地路徑載入。
//
// 頁面端：collections/blue-magic/index.html 設 ICON_BASE='../../assets/blue-magic/'，
//        以 m.icon.split('/').pop() 取檔名載入（故本腳本不改寫 blue-magic.json）。
//
// 執行方式（在 repo 根目錄）：
//   node scripts/download-blue-magic-icons.mjs
// 需求：Node 18+（內建 fetch）。會自動跳過已存在的檔案，可重複執行補檔。

import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BM_JSON = join(ROOT, "data", "blue-magic.json");
const OUT_DIR = join(ROOT, "assets", "blue-magic");
const CDN = "https://xivapi.com"; // icon 路徑形如 /i/072000/072203.png

const exists = (p) => access(p).then(() => true).catch(() => false);

async function main() {
  const db = JSON.parse(await readFile(BM_JSON, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  // 收集不重複圖示：filename → 完整 URL
  const urlSet = new Map();
  for (const m of db.data) {
    if (!m.icon) continue;
    const fname = m.icon.split("/").pop();      // 072203.png
    urlSet.set(fname, CDN + m.icon);             // https://xivapi.com/i/072000/072203.png
  }

  console.log(`共 ${urlSet.size} 張圖示待處理 → ${OUT_DIR}`);

  let ok = 0, skip = 0, fail = 0;
  for (const [fname, url] of urlSet) {
    const outPath = join(OUT_DIR, fname);
    if (await exists(outPath)) { skip++; continue; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(outPath, buf);
      ok++;
      process.stdout.write(`\r  已下載 ${ok}，跳過 ${skip}，失敗 ${fail}...`);
    } catch (e) {
      fail++;
      console.error(`\n✗ ${fname}: ${e.message}`);
    }
  }

  console.log(`\n完成：下載 ${ok}，跳過 ${skip}，失敗 ${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
