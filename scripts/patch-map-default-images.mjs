// 修正 maps.json 裡誤填成佔位圖 `default/00` 的底圖 key
//
// 為什麼會錯：scripts/fix-mapkeys.mjs 以「英文地名」比對 XIVAPI 的 Map 列，
// 同名多列時取第一個（`if (!byPlace.has(k)) byPlace.set(k, m)`）。
// 「The Diadem」「The Crown of the Immaculate」在遊戲裡都有多列 Map，
// 其中一列的 Id 是佔位的 `default/00`（XIVAPI 上那是一張空白羊皮紙），
// 剛好被抓成第一個，於是前端畫出來是一張沒有地形的空白圖。
// fix-mapkeys.mjs 已加上「同名多列時跳過 default/00」的規則，本腳本負責把既有資料補正。
//
// 執行（repo 根目錄）：
//   node scripts/patch-map-default-images.mjs           ← dry-run，只列出要改什麼
//   node scripts/patch-map-default-images.mjs --apply   ← 實際寫入
//
// idempotent：已修正過再跑一次會回報「無需變更」。
// 需求：Node 18+（內建 fetch）；會連 XIVAPI 逐筆查該 Map 列的真實 Id 再寫入，不憑印象填。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_JSON = join(__dirname, "..", "data", "maps.json");
const API = "https://v2.xivapi.com/api/sheet/Map";

const PLACEHOLDER = "default/00";

function mkImage(key) {
  return {
    key,
    local: `/assets/maps/${key.replace("/", "_")}.jpg`,
    url: `https://v2.xivapi.com/api/asset/map/${key}`,
  };
}

async function realKeyOf(mapId) {
  const res = await fetch(`${API}/${mapId}?fields=Id,PlaceName.Name`);
  if (!res.ok) throw new Error(`Map ${mapId}：XIVAPI ${res.status}`);
  const json = await res.json();
  return {
    key: json.fields?.Id,
    place: json.fields?.PlaceName?.fields?.Name ?? "",
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = JSON.parse(await readFile(MAPS_JSON, "utf8"));

  const victims = db.data.filter((m) => m.image?.key === PLACEHOLDER);
  if (!victims.length) {
    console.log(`✓ 沒有 image.key = ${PLACEHOLDER} 的地圖，無需變更`);
    return;
  }
  console.log(`找到 ${victims.length} 筆用佔位圖的地圖，逐筆向 XIVAPI 查真實 Id：\n`);

  let changed = 0;
  for (const entry of victims) {
    const { key, place } = await realKeyOf(entry.id);
    if (!key || key === PLACEHOLDER) {
      console.log(`  ⚠ [${entry.id}] ${entry.name}：XIVAPI 也是 ${key || "（空）"}，跳過`);
      continue;
    }
    console.log(`  [${entry.id}] ${entry.name} / ${entry.nameEn}`);
    console.log(`      XIVAPI PlaceName：${place}`);
    console.log(`      ${PLACEHOLDER} → ${key}（${mkImage(key).local}）`);
    if (apply) entry.image = mkImage(key);
    changed++;
  }

  if (!changed) return;
  if (!apply) {
    console.log(`\n（dry-run）加 --apply 才會寫入 data/maps.json`);
    return;
  }
  await writeFile(MAPS_JSON, JSON.stringify(db, null, 2));
  console.log(`\n✅ 已寫入 data/maps.json，修正 ${changed} 筆`);
  console.log(`   底圖請再跑：node scripts/download-maps.mjs --id ${victims.map((v) => v.id).join(",")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
