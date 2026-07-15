// 鳥鞍圖示下載腳本
// 用途：讀 /data/barding.json，把三部位圖示從 XIVAPI 抓下來存進 /assets/barding/
//
// 執行方式（在 repo 根目錄）：
//   node scripts/download-barding-icons.mjs
// 需求：Node 18+（內建 fetch）。會自動跳過已存在的檔案，可重複執行補檔。

import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BARDING_JSON = join(ROOT, "data", "barding.json");
const OUT_DIR = join(ROOT, "assets", "barding");

const exists = (p) => access(p).then(() => true).catch(() => false);

// 從 URL 取出檔名，例如 ?path=ui/icon/058000/058501_hr1.tex&format=png → 058501_hr1.png
function urlToFilename(url) {
  const m = url.match(/path=([^&]+)/);
  if (!m) return null;
  // ui/icon/058000/058501_hr1.tex → 058501_hr1.png
  return m[1].split("/").pop().replace(".tex", ".png");
}

async function main() {
  const db = JSON.parse(await readFile(BARDING_JSON, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  // 收集所有不重複的圖示 URL
  const urlSet = new Map(); // filename → url
  for (const b of db.data) {
    for (const url of [b.iconHead, b.iconBody, b.iconLegs]) {
      if (!url) continue;
      const fname = urlToFilename(url);
      if (fname) urlSet.set(fname, url);
    }
  }

  console.log(`共 ${urlSet.size} 張圖示待處理 → ${OUT_DIR}`);

  let ok = 0, skip = 0, fail = 0;
  for (const [fname, url] of urlSet) {
    const outPath = join(OUT_DIR, fname);
    if (await exists(outPath)) {
      skip++;
      continue;
    }
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

  if (ok > 0 || skip === urlSet.size) {
    // 更新 barding.json，把 iconHead/Body/Legs 改為本地路徑
    console.log("更新 barding.json 為本地路徑...");
    for (const b of db.data) {
      for (const key of ["iconHead", "iconBody", "iconLegs"]) {
        if (!b[key]) continue;
        const fname = urlToFilename(b[key]);
        if (fname) b[key] = `/assets/barding/${fname}`;
      }
    }
    db.source = "xivapi+tw-items (icons local)";
    await writeFile(BARDING_JSON, JSON.stringify(db, null, 2), "utf8");
    console.log("✓ barding.json 已更新為本地路徑");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
