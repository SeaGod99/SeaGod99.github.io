// 下載坐騎 icon 圖片到 /assets/mounts/
//
// 來源：data/mounts.json 的 iconUrl 欄位（XIVAPI asset）
// 輸出：assets/mounts/004001_hr1.png（依 icon 路徑的檔名）
//
// 已存在的圖片會跳過（不重複下載）。
// 需 Node 18+（內建 fetch）。無需額外套件。
//
// 執行（repo 根目錄）：
//   node scripts/download-mounts.mjs

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_FILE = join(ROOT, "data", "mounts.json");
const OUT_DIR = join(ROOT, "assets", "mounts");

// 限制同時下載數量，避免被封鎖
const CONCURRENCY = 5;
// 每次下載後等待（ms）
const DELAY_MS = 100;

async function fileExists(path) {
  try { await access(path); return true; }
  catch { return false; }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadIcon(mount, outDir) {
  if (!mount.iconUrl || !mount.iconPath) return { id: mount.id, status: "skip_no_url" };

  // 從 iconPath 取得檔名：ui/icon/004000/004001_hr1.tex → 004001_hr1.png
  const filename = basename(mount.iconPath).replace(".tex", ".png");
  const outPath = join(outDir, filename);

  if (await fileExists(outPath)) return { id: mount.id, status: "exists", filename };

  const res = await fetch(mount.iconUrl);
  if (!res.ok) return { id: mount.id, status: `http_${res.status}`, filename };

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return { id: mount.id, status: "downloaded", filename };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const db = JSON.parse(await readFile(DATA_FILE, "utf8"));
  const mounts = db.data.filter((m) => m.iconUrl);
  console.log(`坐騎 icon 共 ${mounts.length} 筆，輸出至 assets/mounts/`);

  let downloaded = 0, skipped = 0, errors = 0;

  // 分批處理
  for (let i = 0; i < mounts.length; i += CONCURRENCY) {
    const batch = mounts.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((m) => downloadIcon(m, OUT_DIR)));

    for (const r of results) {
      if (r.status === "downloaded") downloaded++;
      else if (r.status === "exists") skipped++;
      else { errors++; console.warn(`  ✗ id=${r.id} ${r.status}`); }
    }

    process.stdout.write(`\r  進度 ${Math.min(i + CONCURRENCY, mounts.length)}/${mounts.length}（下載 ${downloaded}、略過 ${skipped}、錯誤 ${errors}）`);
    if (i + CONCURRENCY < mounts.length) await sleep(DELAY_MS);
  }

  console.log("\n\n完成。");
  console.log(`  下載 ${downloaded}、略過（已存在）${skipped}、錯誤 ${errors}`);
  console.log(`  圖片位置：assets/mounts/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
