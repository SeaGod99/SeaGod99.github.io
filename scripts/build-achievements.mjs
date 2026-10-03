// build-achievements.mjs — 產生 data/achievements.json（成就追蹤頁的資料）
//
// README 原本把成就追蹤列為「擱置：無台服官方繁中名來源」。2026-09-23 確認 Teamcraft
// 的 tw/ 語系檔有成就名與達成條件（`tw-achievements`／`tw-achievement-descriptions`，
// 各 3,611 筆，已收進 out_data/tw-locales.msgpack），擱置理由不成立，2026-10-03 站主決定做。
//
// ── 只有三樣東西有台服來源，其餘一律不顯示 ──────────────────────────────
//   ✓ 成就名、達成條件（tw-locales）
//   ✓ 物品獎勵（data/items.json 的台服道具名）
//   ✓ 點數、圖示、版本（數字與路徑，不是字串）
//   ✗ **稱號名**：XIVAPI `Title` 只有英文 Masculine／Feminine，Teamcraft tw/ 51 個檔裡也沒有
//     （`tw-npc-titles` 是 NPC 頭銜，不是玩家稱號）。所以只記「這個成就有稱號獎勵」這件事，
//     **名字不寫**——不用英文補，也不憑印象翻（鐵則）。
//   ✗ **分類名**（戰鬥／PvP／角色…與底下 82 個子分類）：同樣沒有台服來源。分類只拿來
//     決定排列順序（同分類的成就排在一起，等同遊戲內的排列），**不當標籤顯示**。
//
// ── 不收的 ─────────────────────────────────────────────────────────
//   · 查不到台服名的（＝台服未開放）
//   · AchievementKind 13（Legacy）：舊版成就，已經不可能達成，放進可勾選的清單只會讓
//     分母灌水、讓人以為還拿得到。
//
// 執行（repo 根目錄）：
//   node scripts/build-achievements.mjs            # dry-run，印報告
//   node scripts/build-achievements.mjs --apply    # 寫入 data/achievements.json（直寫 minified）
//   node scripts/build-achievements.mjs --offline  # 只用 out_data/cache 的快照

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { xiv } from "./lib/xivapi.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache");
const TC = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const LEGACY_KIND = 13;   // AchievementKind 13 = Legacy（見檔頭）

// 物品獎勵若是收藏道具，連到該收藏頁的 ?id=（值＝該頁 keyOf 的輸出，見 docs/deep-links.md §2）
const COLLECTIONS = [
  { file: "mounts",      page: "collections/mounts/",      key: (e) => "id:" + e.id },
  { file: "minions",     page: "minions/",                 key: (e) => String(e.id) },   // 寵物頁 keyOf 是純 id
  { file: "orchestrion", page: "collections/orchestrion/", key: (e) => "id:" + e.id },
  { file: "emotes",      page: "collections/emotes/",      key: (e) => "id:" + e.id },
  { file: "barding",     page: "collections/barding/",     key: (e) => "id:" + e.id },
  { file: "ornaments",   page: "collections/ornaments/",   key: (e) => "id:" + e.id },
];

async function cachedJson(file, url) {
  const path = join(CACHE, file);
  if (existsSync(path)) return JSON.parse(await readFile(path, "utf8"));
  if (offline) throw new Error(`--offline 但找不到快取 ${path}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  const j = await r.json();
  await mkdir(CACHE, { recursive: true });
  await writeFile(path, JSON.stringify(j));
  return j;
}

// "ui/icon/026000/026002.tex" → "/i/026000/026002.png"（同 items.json 的 icon 格式，前端自己補 CDN 前綴）
const iconPath = (ic) => {
  const m = ic && ic.path && ic.path.match(/ui\/icon\/(\d{6})\/(\d{6})\.tex$/);
  return m ? `/i/${m[1]}/${m[2]}.png` : null;
};

async function main() {
  const tw = await loadTwLocales();

  const ach = await xiv.sheet("Achievement",
    "Name,Points,Order,Icon,Item@as(raw),Title@as(raw),AchievementCategory@as(raw)",
    { cache: join(CACHE, "achievements-full-v2.json"), offline, label: "Achievement：" });
  const cats = await xiv.sheet("AchievementCategory", "AchievementKind@as(raw),Order",
    { cache: join(CACHE, "achievement-categories-v2.json"), offline, label: "AchievementCategory：" });
  const kinds = await xiv.sheet("AchievementKind", "Order",
    { cache: join(CACHE, "achievement-kinds-v2.json"), offline, label: "AchievementKind：" });

  // 版本：Teamcraft patch-content 的 achievement 類（同 patch-backfill-all.mjs 的反查法）
  const content = await cachedJson("tc-patch-content.json", `${TC}/patch-content.json`);
  const names = await cachedJson("tc-patch-names.json", `${TC}/patch-names.json`);
  const patchOf = new Map();
  for (const [pid, obj] of Object.entries(content)) {
    for (const id of obj.achievement || []) if (!patchOf.has(id)) patchOf.set(id, names[pid]?.version ?? null);
  }

  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const itemById = new Map(items.map((i) => [i.id, i]));

  const collByItem = new Map();
  for (const c of COLLECTIONS) {
    const d = JSON.parse(await readFile(join(DATA, c.file + ".json"), "utf8")).data;
    for (const e of d) if (e.itemId && !collByItem.has(e.itemId)) collByItem.set(e.itemId, { p: c.page, k: c.key(e) });
  }

  const catById = new Map(cats.map((c) => [c.id, c.f]));
  const kindOrder = new Map(kinds.map((k) => [k.id, k.f.Order || 0]));

  const stat = { noTw: 0, legacy: 0, noCat: 0, descMissing: 0, descNotTw: [], itemNoTw: [], noPatch: 0, markup: [] };
  const rows = [];
  for (const a of ach) {
    const name = twName(tw.achievements, a.id);
    if (!name || !isTw(name)) { stat.noTw++; continue; }
    const cat = catById.get(a.f["AchievementCategory@as(raw)"]);
    if (!cat) { stat.noCat++; continue; }
    const kind = cat["AchievementKind@as(raw)"];
    if (kind === LEGACY_KIND) { stat.legacy++; continue; }

    let desc = twName(tw.achievementDescriptions, a.id);
    if (desc && /<[^>]+>/.test(desc)) stat.markup.push(`${a.id} ${desc.slice(0, 40)}`);
    // 說明也要各自過守門：名字翻了不代表說明也翻了（CLAUDE.md 技能說明那條的教訓）
    if (desc && !isTw(desc)) { stat.descNotTw.push(`${a.id} ${desc.slice(0, 30)}`); desc = null; }
    if (!desc) stat.descMissing++;

    const itemId = a.f["Item@as(raw)"] || 0;
    let item = null;
    if (itemId) {
      const it = itemById.get(itemId);
      if (it && isTw(it.name)) {
        item = { id: itemId, n: it.name };
        const coll = collByItem.get(itemId);
        if (coll) { item.p = coll.p; item.k = coll.k; }
        else if (it.marketable) item.m = 1;
      } else stat.itemNoTw.push(itemId);
    }

    const patch = patchOf.get(a.id) ?? null;
    if (!patch) stat.noPatch++;

    rows.push({
      sortKey: [kindOrder.get(kind) || 99, cat.Order || 0, a.f["AchievementCategory@as(raw)"], a.f.Order || 0, a.id],
      e: {
        id: a.id,
        name,
        desc: desc || null,
        pts: a.f.Points || 0,
        patch,
        icon: iconPath(a.f.Icon),
        ...(item ? { item } : {}),
        ...(a.f["Title@as(raw)"] ? { title: 1 } : {}),
      },
    });
  }

  // ord＝遊戲內的排列（種類 → 分類 → 分類內順序）。只存名次，不存分類 id——分類沒有台服名，
  // 前端也不該拿它做任何顯示。
  rows.sort((x, y) => { for (let i = 0; i < 5; i++) if (x.sortKey[i] !== y.sortKey[i]) return x.sortKey[i] - y.sortKey[i]; return 0; });
  const out = rows.map((r, i) => ({ ...r.e, ord: i }));

  // ── 報告 ──
  const pts = out.reduce((s, e) => s + e.pts, 0);
  const withItem = out.filter((e) => e.item).length;
  const withColl = out.filter((e) => e.item && e.item.p).length;
  const withTitle = out.filter((e) => e.title).length;
  console.log(`\nAchievement 全表 ${ach.length} 列 → 收錄 ${out.length} 個（總點數 ${pts}）`);
  console.log(`  不收：查無台服名 ${stat.noTw}、舊版（Legacy）${stat.legacy}、分類查無 ${stat.noCat}`);
  console.log(`  達成條件：缺 ${stat.descMissing}（其中未翻譯被守門擋下 ${stat.descNotTw.length}）；含標記 ${stat.markup.length}`);
  if (stat.descNotTw.length) console.log(`    擋下的說明：${stat.descNotTw.slice(0, 5).join("／")}`);
  if (stat.markup.length) console.log(`    含標記：${stat.markup.slice(0, 5).join("／")}`);
  console.log(`  物品獎勵 ${withItem}（連得到收藏頁 ${withColl}）；道具查無台服名而不列 ${stat.itemNoTw.length}`);
  console.log(`  有稱號獎勵 ${withTitle}（稱號名無台服來源，只記旗標）`);
  console.log(`  版本查無 ${stat.noPatch}`);
  const byPatch = {};
  for (const e of out) { const b = e.patch ? e.patch.split(".")[0] + ".x" : "?"; byPatch[b] = (byPatch[b] || 0) + 1; }
  console.log(`  版本分佈：${Object.entries(byPatch).sort().map(([p, n]) => `${p}×${n}`).join("、")}`);
  const ptsDist = {};
  for (const e of out) ptsDist[e.pts] = (ptsDist[e.pts] || 0) + 1;
  console.log(`  點數分佈：${Object.entries(ptsDist).sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}點×${n}`).join("、")}`);
  console.log(`  前 3 個（遊戲內排列）：${out.slice(0, 3).map((e) => `${e.name}｜${e.desc}`).join("　")}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const db = {
    schema: "achievements",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 Achievement／AchievementCategory ＋ Teamcraft tw-achievements／tw-achievement-descriptions（out_data/tw-locales.msgpack）＋ Teamcraft patch-content ＋ data/items.json",
    note: "稱號名與分類名沒有台服來源：title 只是旗標、ord 只是遊戲內排列名次，兩者都不可拿來顯示文字。舊版（Legacy）成就不收。",
    count: out.length,
    data: out,
  };
  await writeFile(join(DATA, "achievements.json"), JSON.stringify(db));
  console.log(`\n✓ data/achievements.json（${out.length} 個，直寫 minified）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply && node scripts/build-site-index.mjs");
}

main().catch((e) => { console.error(e); process.exit(1); });
