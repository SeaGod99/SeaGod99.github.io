// 建立 mounts.json 坐騎資料庫
//
// 資料來源：
//   data/mounts.json（現有）  繁中名、id、sources、patch（103 筆手動維護）
//   XIVAPI v2 Mount sheet     icon path_hr1、描述（英文）、ExtraSeats（額外座位）
//
// 輸出欄位：
//   id          Mount sheet row_id
//   name        繁中名（來自現有 mounts.json）
//   nameEn      英文名（XIVAPI Singular）
//   seats       可乘坐人數（1 + ExtraSeats）
//   icon        本地圖示路徑，如 /i/004000/004001_hr1.png
//   iconUrl     XIVAPI asset URL（本機跑腳本時可下載）
//   iconPath    原始 tex 路徑（供 download-mounts.mjs 使用）
//   description 坐騎描述（英文，來自 transient.Description）
//   sources     取得方式陣列（保留現有手動資料）
//   patch       版本（保留現有手動資料）
//
// 為什麼本機跑：Cowork 沙箱擋外網（v2.xivapi.com 全回 403）。
// 需 Node 18+（內建 fetch）。無需額外套件。
//
// 執行（repo 根目錄）：
//   node scripts/build-mounts.mjs

import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const MOUNTS_JS = join(__dirname, "..", "collections", "mounts", "mounts.js");
const OUT = join(DATA, "mounts_new.json");

const MOUNT_API = "https://v2.xivapi.com/api/sheet/Mount";
const MOUNT_FIELDS = ["Singular", "Icon", "ExtraSeats"].join(",");

// ui/icon/004000/004001_hr1.tex → /i/004000/004001_hr1.png（本地路徑）
function iconLocalPath(path_hr1) {
  if (!path_hr1) return null;
  const m = path_hr1.match(/ui\/icon\/(\d+)\/(\d+_hr1)\.tex/);
  return m ? `/i/${m[1]}/${m[2]}.png` : null;
}

// ui/icon/004000/004001_hr1.tex → XIVAPI asset URL
function iconUrl(path_hr1) {
  if (!path_hr1) return null;
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(path_hr1)}&format=png`;
}

// 抓 Mount sheet 全部筆數，回傳 Map(row_id → mount data)
async function fetchMounts() {
  const mounts = new Map();
  let after = 0;

  while (true) {
    const url = `${MOUNT_API}?fields=${encodeURIComponent(MOUNT_FIELDS)}&limit=500&after=${after}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mount sheet HTTP ${res.status} @ after=${after}`);
    const json = await res.json();
    const rows = json.rows || [];
    if (!rows.length) break;

    for (const r of rows) {
      const f = r.fields || {};
      if (!f.Singular) continue; // 空列跳過

      const path_hr1 = f.Icon?.path_hr1 || null;
      mounts.set(r.row_id, {
        nameEn: f.Singular,
        seats: 1 + (f.ExtraSeats || 0),
        icon: iconLocalPath(path_hr1),
        iconUrl: iconUrl(path_hr1),
        iconPath: path_hr1,
      });
    }

    after = rows[rows.length - 1].row_id;
    process.stdout.write(`\r  Mount 已抓 ${mounts.size} 筆…`);
    if (rows.length < 500) break;
  }
  process.stdout.write("\n");
  return mounts;
}

// 抓單筆描述（transient 欄位）
async function fetchDescription(rowId) {
  const url = `https://v2.xivapi.com/api/sheet/Mount/${rowId}?fields=Singular`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return json.transient?.Description || null;
}

// 從 collections/mounts/mounts.js 解析原始資料（真實來源，永遠完整）
async function loadExistingFromJs() {
  const content = await readFile(MOUNTS_JS, "utf8");
  const pattern = /\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)",\s*patch:\s*"([^"]+)",\s*sources:\s*(\[[^\]]+\])/gs;
  const map = new Map();
  for (const m of content.matchAll(pattern)) {
    const [, id, name, patch, srcRaw] = m;
    const types = [...srcRaw.matchAll(/type:\s*"([^"]+)"/g)].map(x => x[1]);
    const details = [...srcRaw.matchAll(/detail:\s*"([^"]+)"/g)].map(x => x[1]);
    map.set(Number(id), {
      name, patch,
      sources: types.map((t, i) => ({ type: t, detail: details[i] })),
    });
  }
  return map;
}

async function main() {
  // 1. 從 mounts.js 讀原始資料（不讀 mounts.json，避免讀到截斷版）
  process.stderr.write("讀取 collections/mounts/mounts.js…\n");
  const existingMap = await loadExistingFromJs();
  process.stderr.write(`  原始資料 ${existingMap.size} 筆\n`);

  // 2. 抓 XIVAPI Mount sheet
  process.stderr.write("抓 XIVAPI Mount sheet…\n");
  const apiMounts = await fetchMounts();
  process.stderr.write(`  API 共 ${apiMounts.size} 筆\n`);

  // 3. 合併：以現有繁中名為主，補上 API 資料
  const data = [];
  let matched = 0;
  let apiOnly = 0;

  // 先處理現有手動資料（有繁中名的）
  for (const [id, existing_m] of existingMap) {
    const api = apiMounts.get(id);
    if (api) {
      matched++;
      data.push({
        id,
        name: existing_m.name,
        nameEn: api.nameEn,
        seats: api.seats,
        icon: api.icon,
        iconUrl: api.iconUrl,
        iconPath: api.iconPath,
        description: null,          // 描述量大，不在此批量抓（見下方說明）
        sources: existing_m.sources || [],
        patch: existing_m.patch || null,
      });
    } else {
      // API 沒有此 id（罕見），保留原資料
      data.push({ ...existing_m, nameEn: existing_m.nameEn || null, icon: existing_m.icon || null });
    }
  }

  // 再補 API 有但現有沒有的（新坐騎）
  for (const [id, api] of apiMounts) {
    if (!existingMap.has(id)) {
      apiOnly++;
      data.push({
        id,
        name: api.nameEn,     // 無繁中名，暫用英文
        nameEn: api.nameEn,
        seats: api.seats,
        icon: api.icon,
        iconUrl: api.iconUrl,
        iconPath: api.iconPath,
        description: null,
        sources: [],
        patch: null,
        _noTwName: true,      // 標記待補繁中名
      });
    }
  }

  // 依 id 排序
  data.sort((a, b) => a.id - b.id);

  // 4. 輸出
  const out = {
    schema: "mounts",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "xivapi+manual",
    count: data.length,
    data,
  };
  const jsonStr = JSON.stringify(out, null, 2);

  // 直接寫檔
  await writeFile(OUT, jsonStr, "utf8");
  // 驗證
  const verify = JSON.parse(await readFile(OUT, "utf8"));
  if (verify.data.length !== out.count) {
    throw new Error(`寫入驗證失敗！預期 ${out.count} 筆，實際讀回 ${verify.data.length} 筆`);
  }

  process.stderr.write(`\n寫入 ${OUT}\n`);
  process.stderr.write(`  總計 ${data.length} 筆\n`);
  process.stderr.write(`    ├ 現有繁中名對應 API: ${matched} 筆\n`);
  process.stderr.write(`    └ API 新增（無繁中名）: ${apiOnly} 筆\n`);
  process.stderr.write("\n下一步：node scripts/download-mounts.mjs\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
