// 台服新版開放的收藏品：補上「向誰、用什麼換」與「哪個成就給的」（只補細節是空的來源）
//
// 為什麼需要：收藏頁的取得方式靠 ffxiv-collection-tc 與 Teamcraft 的取得管道，兩者都沒有台服新版的內容。
// 新條目只剩 ffxivcollect 給的類型（「新月島」「部族任務」「成就」），細節是空的；
// 而取得方式是收藏頁最優先的資訊（知識庫 §2.1）。
//
// 範圍刻意收窄：**只動台服版本清單裡的道具**（scripts/lib/tw-release-*.json，客戶端前後兩版的差集），
// 而且只補「細節是空的」來源——既有條目、已有細節的來源一律不碰（那些有自己的來源與補丁腳本）。
//
//   兌換／購買  lib/client-shop-sources.mjs：Teamcraft 商店結構＋台服 NPC 名與地點 →
//              { type: 沿用原本的類型, detail: "力之魔石 ×99", issuer: { name, verb }, at }
//   成就獎勵    data/achievements.json 的 item 欄（獎勵道具）→
//              { type: "成就", detail: 成就名, achievementId, condition: 達成條件 }
//   都查不到    保持原樣（不猜）
//
// 涵蓋：mounts／minions／emotes／ornaments／barding（以 itemId 對）。樂譜與髮型由各自的 add-missing 腳本處理。
// 另外校正（含樂譜）：接取點的 mapId 不在 maps.json 的改成 null——新地圖（新月島南部 967、渴望灣 1003）
//   還沒收進 maps.json，地名與座標照留（2026-10-10，見 lib/client-shop-sources.mjs 檔頭）。
// 冪等。執行：node scripts/patch-collection-client-shops.mjs [--apply]

import { readFileSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TW_RELEASES } from "./lib/tw-releases.mjs";
import { createShopSources } from "./lib/client-shop-sources.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const APPLY = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);
const FILES = ["mounts.json", "minions.json", "emotes.json", "ornaments.json", "barding.json"];

const released = new Set();
for (const rel of TW_RELEASES) {
  const f = join(__dirname, "lib", rel.file);
  if (!existsSync(f)) throw new Error(`找不到 ${f}，先跑 node scripts/patch-tw-release.mjs --build`);
  for (const id of JSON.parse(readFileSync(f, "utf8")).items) released.add(id);
}

// 獎勵道具 → 成就（同一件被多個成就給時取 id 最小的，並在報告列出）
const byReward = new Map();
for (const a of JSON.parse(readFileSync(join(DATA, "achievements.json"), "utf8")).data) {
  const id = a.item?.id;
  if (!id) continue;
  if (!byReward.has(id)) byReward.set(id, []);
  byReward.get(id).push(a);
}

const shops = await createShopSources({ root: ROOT, offline: true });
const emptyDetail = (s) => s && typeof s === "object" && (s.detail == null || s.detail === "");

let touchedFiles = 0;
for (const file of FILES) {
  const raw = readFileSync(join(DATA, file), "utf8");
  const db = JSON.parse(raw);
  const changes = [];
  for (const e of db.data) {
    if (!e.itemId || !released.has(e.itemId)) continue;
    const srcs = Array.isArray(e.sources) ? e.sources : [];
    const blank = srcs.filter(emptyDetail);
    if (srcs.length && !blank.length) {
      /* 已經有細節：不改它。但如果整筆都沒寫「向誰換」（例：表情「轉圈」只有「習得自動作指南書」），
         而商店表查得到兌換處，就把兌換處**附加**上去——原本那句照留。 */
      if (srcs.some((s) => s.issuer || s.shop || s.achievementId)) continue;
      const extra = shops.sourcesFor(e.itemId, { type: srcs[0].type || "兌換" });
      if (!extra.length || srcs.some((s) => extra.some((x) => x.detail === s.detail))) continue;
      e.sources = srcs.concat(extra);
      changes.push(`${e.id} ${e.name}：（附加）` + extra.map((s) => `${s.type}｜${s.detail}｜${s.issuer.verb}：${s.issuer.name}`).join("；"));
      continue;
    }
    const type = blank[0]?.type || srcs[0]?.type || "兌換";
    let add = [];
    const ach = (byReward.get(e.itemId) || []).sort((a, b) => a.id - b.id)[0];
    if (ach && (type === "成就" || !srcs.length)) {
      add = [{ type: "成就", detail: ach.name, achievementId: ach.id, condition: ach.desc || null }];
    } else {
      add = shops.sourcesFor(e.itemId, { type });
    }
    if (!add.length) continue;
    // 換掉「細節是空的」那幾筆，其餘來源原樣保留
    e.sources = srcs.filter((s) => !emptyDetail(s)).concat(add);
    changes.push(`${e.id} ${e.name}：` + add.map((s) => `${s.type}｜${s.detail}` +
      (s.issuer ? `｜${s.issuer.verb}：${s.issuer.name}${s.at ? `＠${s.at.mapName}` : ""}` : "") +
      (s.achievementId ? `｜成就 #${s.achievementId}` : "")).join("；"));
  }
  console.log(`${file.padEnd(16)} 補 ${changes.length} 筆`);
  for (const c of changes) console.log(`    ${c}`);
  if (APPLY && changes.length) {
    db.updated = today;
    await writeFile(join(DATA, file), raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
    touchedFiles++;
  }
}

/* 接取點的 mapId 要對得到 maps.json，雙向校正：
   · mapId 不在 maps.json（新地圖還沒收）→ 記 null，地名與座標照留
   · mapId 是 null、但地名現在能**唯一**對到 maps.json 的某張圖（例：10-10 補進新月島南部 967、渴望灣 1003）→ 補回 mapId */
const mapList = JSON.parse(readFileSync(join(DATA, "maps.json"), "utf8")).data;
const mapIds = new Set(mapList.map((m) => m.id));
const mapByName = new Map();
for (const m of mapList) if (m.name) mapByName.set(m.name, mapByName.has(m.name) ? null : m.id);   // 同名多張＝不唯一
for (const file of [...FILES, "orchestrion.json"]) {
  const raw = readFileSync(join(DATA, file), "utf8");
  const db = JSON.parse(raw);
  const fixed = [];
  for (const e of db.data) for (const s of e.sources || []) {
    if (!s || !s.at) continue;
    if (s.at.mapId != null && !mapIds.has(s.at.mapId)) { fixed.push(`${e.id} ${e.name}＠${s.at.mapName}（${s.at.mapId} → null）`); s.at.mapId = null; }
    else if (s.at.mapId == null && mapByName.get(s.at.mapName)) { s.at.mapId = mapByName.get(s.at.mapName); fixed.push(`${e.id} ${e.name}＠${s.at.mapName}（null → ${s.at.mapId}）`); }
  }
  if (!fixed.length) continue;
  console.log(`${file.padEnd(16)} 接取點 mapId 校正：${fixed.length} 筆（${fixed.slice(0, 3).join("、")}${fixed.length > 3 ? "…" : ""}）`);
  if (APPLY) {
    await writeFile(join(DATA, file), raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
    touchedFiles++;
  }
}
console.log(APPLY ? `\n✅ 已寫入 ${touchedFiles} 個檔` : "\n（dry-run，未寫入；加 --apply 套用）");
