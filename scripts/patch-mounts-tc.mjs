// 坐騎名稱＋取得方式 權威化（來源：ffxiv-collection-tc 繁中收藏站）
//
// 來源檔：data/mounts-sources-tc.json
//   ＝ cycleapple/ffxiv-collection-tc 的 collections_data.json「Mounts」收藏
//   （每筆 {id, name(繁中), sources:[{name(繁中含NPC/材料/地點), type(英文大類)}]}）。
//   https://github.com/cycleapple/ffxiv-collection-tc
//
// 為什麼需要：原 build-mounts.mjs 的名稱有 56 筆走 cn-opencc（簡中→OpenCC 簡轉繁），
//   與繁中正名不符（例 ahriman 簡轉繁「冥鬼之眼」，繁中正名「惡精靈」）；取得方式則
//   全部來自手動 mounts.js（build 自註「大量錯位、待人工校對」）。本檔以 TC 直接繁中
//   「完整覆寫」TC 有的坐騎之 name 與 sources；台服未開放（TC 沒有）者保留原樣（英文）。
//
// type 映射：TC 的 Source.Type（英文大類）→ 本站既有繁中分類（保留標籤顏色與篩選）。
//   Instance/Quest/Container 為大類，依 Source.Name 以 FFXIV 命名慣例細分。
//   detail 直接用 TC 的 Source.Name（已是完整繁中）。
//
// 完整覆寫＝冪等。對齊以坐騎 id（Mount sheet row_id）為準。
// 執行：node scripts/patch-mounts-tc.mjs ／ 重建 mounts.json 後需再跑。

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "mounts.json");
const SRC = join(DATA, "mounts-sources-tc.json");

// 已知資料片主線任務（用於 Quest → 主線任務 判斷）
const MSQ = /曉月之終途|黃金遺產|漆黑的反叛者|蒼天的伊修加德|紅蓮的解放者|重生之境|滄海雲帆|風脈/;

function mapType(tcType, name) {
  switch (tcType) {
    case "Achievement": return "成就";
    case "MogStation":
    case "購買": return "商城";
    case "Crafting": return "製作";
    case "PvP": return "PvP";
    case "Event": return "節慶活動";
    case "Shop":
    case "Gil": return "商店";
    case "Quest":
      if (/祭/.test(name)) return "節慶活動";
      if (MSQ.test(name)) return "主線任務";
      return "任務";
    case "Instance":
      if (/異聞/.test(name)) return "異聞副本";
      if (/^極|零式|^絕|終極|神話|武器/.test(name)) return "高難度副本";
      return "副本掉落";
    case "Container":
      if (/無人島/.test(name)) return "無人島";
      if (/寶藏/.test(name)) return "藏寶圖";
      if (/南方戰線|常風地帶|博茲雅|扎杜諾爾/.test(name)) return "博茲雅";
      if (/慶典|禮物|祭/.test(name)) return "節慶活動";
      return "寶箱";
    default: return tcType;
  }
}

const tc = JSON.parse(await readFile(SRC, "utf-8"));
const byId = new Map();
for (const it of tc) byId.set(it.id, it);

const json = JSON.parse(await readFile(OUT, "utf-8"));
let nameSet = 0, srcSet = 0, keptManual = 0, skipped = 0;
const typeTally = {};

for (const m of json.data) {
  const t = byId.get(m.id);
  if (!t) { skipped++; continue; }          // TC 沒有（台服未開放）→ 保留原樣
  if (t.name && m.name !== t.name) { m.name = t.name; nameSet++; }
  m.nameSource = "tc";                        // 名稱來源＝TC 直接繁中
  const tcSources = (t.sources || []).map(s => {
    const type = mapType(s.type, s.name);
    typeTally[type] = (typeTally[type] || 0) + 1;
    return { type, detail: s.name };
  });
  // TC 有取得方式才覆寫；TC 未提供者保留原手動資料（避免抹掉既有資訊）
  if (tcSources.length) { m.sources = tcSources; srcSet++; }
  else keptManual++;
}

json.source = "tc-collection+xivapi(icon)";
json.updated = new Date().toISOString().slice(0, 10);

const TMP = join(tmpdir(), "mounts_tc.json");
await writeFile(TMP, JSON.stringify(json, null, 2) + "\n", "utf-8");
JSON.parse(await readFile(TMP, "utf-8"));    // 完整性檢查
await copyFile(TMP, OUT);

console.log("更新名稱：" + nameSet + "｜覆寫取得方式：" + srcSet + "｜TC無故保留手動：" + keptManual + "｜台服未開放保留：" + skipped);
console.log("type 分布：" + JSON.stringify(typeTally));
