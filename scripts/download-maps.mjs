// 地圖底圖下載腳本
// 用途：讀 /data/maps.json，把每張地圖底圖從 XIVAPI 抓下來存進 /assets/maps/
// 為什麼要本機跑：Cowork 沙箱擋外部網站，無法在那邊下載；在你自己電腦跑沒這限制。
//
// 執行方式（在 repo 根目錄）：
//   node scripts/download-maps.mjs
// 需求：Node 18+（內建 fetch）。會自動跳過已存在的檔案，可重複執行補檔。

import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MAPS_JSON = join(ROOT, "data", "maps.json");
const OUT_DIR = join(ROOT, "assets", "maps");

const exists = (p) => access(p).then(() => true).catch(() => false);

async function main() {
  const db = JSON.parse(await readFile(MAPS_JSON, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  const entries = db.data.filter((m) => m.image?.url);
  console.log(`共 ${entries.length} 張地圖待處理 → ${OUT_DIR}`);

  let ok = 0, skip = 0, fail = 0;
  for (const m of entries) {
    // 本地檔名：把 image.local 的 /assets/maps/ 去掉
    const fname = m.image.local.split("/").pop();
    const dest = join(OUT_DIR, fname);

    if (await exists(dest)) { skip++; continue; }

    try {
      const res = await fetch(m.image.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      ok++;
      console.log(`  ✓ [${m.id}] ${m.name} → ${fname} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      fail++;
      console.warn(`  ✗ [${m.id}] ${m.name} (${m.image.key}): ${e.message}`);
    }
    // 對 API 客氣一點
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n完成：下載 ${ok}、略過(已存在) ${skip}、失敗 ${fail}`);
  if (fail) console.log("失敗多半是 mapKey 對不上，請到 https://v2.xivapi.com 確認該地圖的 Map.Id 圖層代號後修正 maps.json。");
}

main().catch((e) => { console.error(e); process.exit(1); });
