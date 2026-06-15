// 補上 triple-triad.json 中 NPC對戰 sources 的地點資訊
//
// 來源：data/npcs.json（npcId -> coords.mapId/x/y，22079 筆）
//      data/maps.json（mapId -> 繁中地名，210 筆）
// 對應：triple-triad.json 每筆 sources[].type === "NPC對戰" 的項目，
//      補上 location: { mapId, mapName, x, y }（npcs.json 無座標的維持原狀）
//
// 執行（repo 根目錄）：
//   node scripts/patch-triple-triad-locations.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const TT_FILE = join(DATA, "triple-triad.json");
const NPCS_FILE = join(DATA, "npcs.json");
const MAPS_FILE = join(DATA, "maps.json");

async function main() {
  console.log("讀取 triple-triad.json / npcs.json / maps.json…");
  const ttFile = JSON.parse(await readFile(TT_FILE, "utf8"));
  const npcs = JSON.parse(await readFile(NPCS_FILE, "utf8")).data;
  const maps = JSON.parse(await readFile(MAPS_FILE, "utf8")).data;

  const npcMap = new Map(npcs.map(n => [n.id, n]));
  const mapNameMap = new Map(maps.map(m => [m.id, m.name]));

  let resolved = 0, noCoords = 0, noNpc = 0, other = 0;

  for (const card of ttFile.data) {
    for (const src of card.sources || []) {
      if (src.type !== "NPC對戰") { other++; continue; }
      const npc = npcMap.get(src.npcId);
      if (!npc) { noNpc++; continue; }
      if (!npc.coords) { noCoords++; continue; }
      const mapName = mapNameMap.get(npc.coords.mapId) || null;
      src.location = {
        mapId: npc.coords.mapId,
        mapName,
        x: npc.coords.x,
        y: npc.coords.y,
      };
      resolved++;
    }
  }

  ttFile.updated = new Date().toISOString().slice(0, 10);
  ttFile.source = "xivapi+items+npcs+maps";

  await writeFile(TT_FILE, JSON.stringify(ttFile, null, 2));

  console.log(`\n補上地點 ${resolved} 筆`);
  console.log(`NPC 無座標資料：${noCoords} 筆`);
  console.log(`找不到 NPC：${noNpc} 筆`);
  console.log(`寫入 ${TT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
