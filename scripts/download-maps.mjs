// 地圖底圖下載腳本
// 用途：讀 /data/maps.json，把每張地圖底圖從 XIVAPI 抓下來存進 /assets/maps/
// 為什麼要本機跑：Cowork 沙箱擋外部網站，無法在那邊下載；在你自己電腦跑沒這限制。
//
// 執行方式（在 repo 根目錄）：
//   node scripts/download-maps.mjs            ← 預設只抓野外/主城（type: field/city/housing）
//   node scripts/download-maps.mjs --all      ← 連副本/特殊區域（dungeon/instance）一起抓
//   node scripts/download-maps.mjs --id 584   ← 只抓指定 mapId（可逗號分隔多個，無視 type）
// 需求：Node 18+（內建 fetch）。會自動跳過已存在的檔案，可重複執行補檔。
//
// 例：雲冠群島/Diadem（584）是採集點會用到、但 type=instance 被預設排除的地圖，
//     用 `--id 584` 即可單獨補它，不必 --all 多抓上百張副本圖。
//
// 2026-06-11 地圖ID統一修正計畫決議：底圖只下載野外/主城；
// 副本/特殊區域保留 image.url 欄位，需要時再抓（前端可直接用 url 或之後 --all 補）。

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

  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  // --id 584 / --id 584,585 / --id=584：只抓指定 mapId（無視 type）
  let wantIds = null;
  const idIdx = argv.findIndex((a) => a === "--id" || a === "--ids");
  const idEq = argv.find((a) => a.startsWith("--id=") || a.startsWith("--ids="));
  const idRaw = idIdx !== -1 ? argv[idIdx + 1] : idEq ? idEq.split("=")[1] : null;
  if (idRaw) wantIds = new Set(idRaw.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)));

  const WANT_TYPES = new Set(["field", "city", "housing"]);
  const entries = db.data.filter(
    (m) => m.image?.url && (wantIds ? wantIds.has(m.id) : all || WANT_TYPES.has(m.type))
  );
  const scope = wantIds ? `指定 id：${[...wantIds].join(",")}` : all ? "全部類型" : "field/city/housing";
  console.log(`共 ${entries.length} 張地圖待處理（${scope}）→ ${OUT_DIR}`);

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
