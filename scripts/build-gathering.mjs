// 從 Teamcraft nodes.json 建立 gathering.json（全採集點：限時+一般）
//
// 為什麼本機跑：Cowork 沙箱擋外網，無法在 session 內抓 Teamcraft / GitHub raw。
// 在你電腦跑沒這限制。需 Node 18+（內建 fetch）。
//
// 執行（repo 根目錄）：
//   node scripts/build-gathering.mjs
//
// 來源：Teamcraft libs/data/.../nodes.json（節點主表，含座標/時間/物品）
// 輸出：data/gathering.json（信封格式，data[] 為節點陣列）
//
// 物品繁中名稱不在本表，由 items id 連 items.json 主表顯示（見 SCHEMA.md 2.5）。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "gathering.json");

const TC_BASE = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";
const NODES_URL = `${TC_BASE}/nodes.json`;

// Teamcraft node type → 繁中 + 職業（對應 FFXIV GatheringType 列舉）
// 0 = 礦脈, 1 = 岩脈（皆採礦工 MIN/16）；2 = 良材, 3 = 草場（皆園藝工 BTN/17）
// 職業名用台服官方譯名，見 SCHEMA.md 1.8 JOBS 字典
const TYPE_MAP = {
  0: { typeName: "礦脈", job: "採礦工", jobId: 16 },
  1: { typeName: "岩脈", job: "採礦工", jobId: 16 },
  2: { typeName: "良材", job: "園藝工", jobId: 17 },
  3: { typeName: "草場", job: "園藝工", jobId: 17 },
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  console.log("抓取 Teamcraft nodes.json…");
  const nodes = await fetchJson(NODES_URL);
  const ids = Object.keys(nodes);
  console.log(`  原始節點 ${ids.length} 筆`);

  const data = [];
  for (const id of ids) {
    const n = nodes[id];
    // 過濾佔位節點：無 type 對照、無座標、或完全沒物品
    if (!(n.type in TYPE_MAP)) continue;
    if (n.map == null || n.x == null) continue;
    // 過濾 EventItem 偽 id（≥2000000，非 items.json 的物品 id 空間，連不到主表）
    const isRealItem = (id) => id < 2000000;
    const items = Array.isArray(n.items) ? n.items.filter(Boolean).filter(isRealItem) : [];
    const hidden = Array.isArray(n.hiddenItems) ? n.hiddenItems.filter(Boolean).filter(isRealItem) : [];
    if (!items.length && !hidden.length) continue;

    const t = TYPE_MAP[n.type];
    data.push({
      id: Number(id),
      type: n.type,
      typeName: t.typeName,
      job: t.job,
      jobId: t.jobId,
      level: n.level ?? 0,
      items,
      hiddenItems: hidden,
      coords: {
        mapId: n.map ?? null,
        zoneId: n.zoneid ?? null,
        x: n.x ?? null,
        y: n.y ?? null,
        radius: n.radius ?? null,
      },
      limited: !!n.limited,
      spawns: Array.isArray(n.spawns) ? n.spawns : [],
      duration: n.duration ?? 0,
      legendary: !!n.legendary,
      ephemeral: !!n.ephemeral,
      // Teamcraft 無地圖資訊的節點（map=0）保留但標記，前端地圖功能須跳過
      ...(!n.map ? { mapMissing: true } : {}),
    });
  }

  data.sort((a, b) => a.id - b.id);

  const out = {
    schema: "gathering",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "teamcraft",
    count: data.length,
    data,
  };
  await writeFile(OUT, JSON.stringify(out));
  const timed = data.filter((d) => d.limited).length;
  console.log(`\n寫入 ${OUT}`);
  console.log(`  採集點 ${data.length} 筆（限時 ${timed}、一般 ${data.length - timed}）`);
  console.log("  各類：", JSON.stringify(
    data.reduce((a, d) => ((a[d.typeName] = (a[d.typeName] || 0) + 1), a), {})
  ));
  console.log("\n提醒：物品名稱需 items.json 主表。若還沒建 items，先做全物品庫再串。");
}

main().catch((e) => { console.error(e); process.exit(1); });
