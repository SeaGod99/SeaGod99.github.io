// 樂譜頁補上「台服已開放、但 orchestrion.json 沒收」的曲子（只 append，不動既有條目）
//
// 為什麼需要：data/orchestrion.json **沒有建置腳本**（06-11 基準快照就存在，產它的腳本不在 repo 裡），
// 所以台服升版時它不會自己長出新曲。2026-08-11 升 7.21 時就漏了 18 首 7.2／7.21 的曲子，兩個月沒人發現；
// 7.25 又多 7 首。這支以 items.json（台服名）為準，把「管弦樂琴樂譜：」道具中已開放（patch ≤ gamePatch）
// 卻不在 orchestrion.json 的補進去。
//
// 各欄位來源：
//   name／icon／patch  data/items.json（道具名去掉「管弦樂琴樂譜：」前綴，與既有條目同一規則）
//   nameEn             ffxivcollect 的曲名（既有條目的 nameEn 也是曲名，不是道具名）
//   gameCategory       台服客戶端 Item.AdditionalData → OrchestrionUiparam.OrchestrionCategory → OrchestrionCategory.Name
//                      （與頁面的 12 類同一套字串）
//   category           資料片標籤，台服官方名（7.x＝黃金遺產；data/official-terms.json）
//   number             既有編號是「依客戶端 Orchestrion 列號排序的流水號」；為了不改動既有 724 首的編號，
//                      新曲從目前最大的流水號往後接（依列號順序）。只影響排序與「No.」顯示，收藏進度以 id 為鍵。
//   sources            ① 商店兌換：lib/client-shop-sources.mjs（Teamcraft 商店結構＋台服 NPC 名與地點）
//                      ② 任務：ffxivcollect 給英文任務名 → XIVAPI 查任務 id → 台服任務名（tw-quests.json，
//                         查不到再查台服客戶端 Quest.csv）；帶 questId，之後 patch-collection-quest-npc.mjs 會補接取點
//                      ③ 其餘：台服客戶端 Orchestrion.Description（官方的一句話取得方式，如「「阿卡狄亞登天鬥技場 次重量級1」獲得」）
//                      類型用 ffxivcollect 的分類，對照表與 backfill-sources.mjs 相同。
//
// 執行：node scripts/patch-orchestrion-add-missing.mjs [--apply] [--offline]
// 跑完接：patch-collection-quest-npc.mjs --apply（補任務接取點）→ minify-data／sync-meta（升版 SOP 的收尾）。

import { readFileSync, existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { createShopSources } from "./lib/client-shop-sources.mjs";
import { isTranslated } from "./lib/tw-text.mjs";
import { pnum } from "./lib/tw-releases.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const FILE = join(DATA, "orchestrion.json");
const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");
const today = new Date().toISOString().slice(0, 10);
const PREFIX = "管弦樂琴樂譜：";

// ffxivcollect 英文分類 → 站內繁中分類（與 scripts/backfill-sources.mjs 的 TYPE_TW 同一份）
const TYPE_TW = {
  Achievement: "成就", Quest: "任務", Crafting: "製作", Gathering: "採集",
  Purchase: "商店", "Gold Saucer": "金碟", PvP: "PvP", Hunts: "狩獵",
  "Treasure Hunt": "藏寶圖", FATE: "危命任務", Event: "節慶活動",
  Premium: "商城", Voyages: "探索航行", Tribal: "部族任務", Venture: "雇員探險",
  "Island Sanctuary": "無人島", Skybuilders: "伊修加德重建", Bozja: "博茲雅",
  Eureka: "尤雷卡", "Deep Dungeon": "深層迷宮", Dungeon: "副本掉落",
  Trial: "高難度副本", Raid: "副本掉落", "Chaotic Raid": "副本掉落",
  "V&C Dungeon": "異聞副本", "Wondrous Tails": "天書奇談",
  "Cosmic Exploration": "宇宙探索", "Occult Crescent": "新月島", Other: "其他",
};
// 資料片標籤：台服官方名（data/official-terms.json；2026-10-11 起既有條目的 category 也已改官方，見 patch-expansion-names.mjs）
const EXPANSION = Object.fromEntries(
  JSON.parse(readFileSync(join(ROOT, "data", "official-terms.json"), "utf8")).expansions.map((e) => [e.major, e.name]));

async function cachedJson(name, url) {
  const file = join(ROOT, "out_data", "cache", name);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  if (OFFLINE) throw new Error(`--offline 但找不到 ${file}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  const j = await r.json();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(j));
  return j;
}

async function main() {
  const db = JSON.parse(readFileSync(FILE, "utf8"));
  const rows = db.data;
  const have = new Set(rows.map((x) => x.itemId));
  const gamePatch = JSON.parse(readFileSync(join(DATA, "_meta.json"), "utf8")).gamePatch;
  const items = JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data;
  const itemById = new Map(items.map((i) => [i.id, i]));

  const missing = items
    .filter((i) => i.name.startsWith(PREFIX) && !have.has(i.id) && i.patch && pnum(i.patch) <= pnum(gamePatch))
    .sort((a, b) => a.id - b.id);
  console.log(`items.json 有 ${items.filter((i) => i.name.startsWith(PREFIX)).length} 件樂譜道具，orchestrion.json ${rows.length} 首；` +
    `已開放（≤${gamePatch}）卻沒收的 ${missing.length} 首`);
  if (!missing.length) return;

  const clientItem = new Map((await loadTcSheet("Item", { offline: OFFLINE })).map((r) => [r.id, r]));
  const orch = new Map((await loadTcSheet("Orchestrion", { offline: OFFLINE })).map((r) => [r.id, r]));
  const ui = new Map((await loadTcSheet("OrchestrionUiparam", { offline: OFFLINE })).map((r) => [r.id, r]));
  const cat = new Map((await loadTcSheet("OrchestrionCategory", { offline: OFFLINE })).map((r) => [r.id, r.Name]));
  const fc = await cachedJson("fc-orchestrions.json", "https://ffxivcollect.com/api/orchestrions?limit=9999");
  const fcByItem = new Map((fc.results || []).map((x) => [x.item_id, x]));
  const shops = await createShopSources({ root: ROOT, offline: true });
  const twQuests = JSON.parse(readFileSync(join(ROOT, "out_data", "tw-quests.json"), "utf8"));
  let clientQuest = null;

  async function questByEnglishName(en) {
    if (OFFLINE) return null;
    const url = `https://v2.xivapi.com/api/search?sheets=Quest&query=${encodeURIComponent(`Name="${en}"`)}&fields=Name`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const hit = (await r.json()).results?.[0];
    if (!hit) return null;
    const id = hit.row_id;
    let tw = twQuests[id]?.tw ?? twQuests[id]?.name ?? (typeof twQuests[id] === "string" ? twQuests[id] : null);
    if (!tw) {
      clientQuest ||= new Map((await loadTcSheet("Quest", { offline: OFFLINE })).map((q) => [q.id, q.Name]));
      tw = clientQuest.get(id);
    }
    return tw && isTranslated(tw) ? { id, name: tw.trim() } : null;
  }

  // 新曲的流水號從既有主序列（不含 AdditionalData＝0 的 4 筆特例）的最大值往後接
  const mainMax = Math.max(...rows.filter((x) => x.number < 1000).map((x) => x.number));
  let next = mainMax + 1;

  const added = [];
  const withRow = missing.map((i) => ({ i, row: Number(clientItem.get(i.id)?.AdditionalData || 0) }))
    .sort((a, b) => (a.row || 1e9) - (b.row || 1e9));
  for (const { i, row } of withRow) {
    const o = orch.get(row);
    const name = i.name.slice(PREFIX.length);
    if (o?.Name && o.Name !== name) console.log(`  ⚠ ${i.id} 道具名「${name}」≠ 客戶端曲名「${o.Name}」（照既有規則用道具名）`);
    const gameCategory = cat.get(Number(ui.get(row)?.OrchestrionCategory)) || null;
    const f = fcByItem.get(i.id);
    const fcTypes = [...new Set((f?.sources || []).map((s) => TYPE_TW[s.type]).filter(Boolean))];
    const type = fcTypes[0] || "其他";
    const desc = (o?.Description || "").replace(/\s*\n\s*/g, " ").trim();

    const sources = [];
    const shop = shops.sourcesFor(i.id, { type });
    sources.push(...shop);
    if (type === "任務") {
      const q = await questByEnglishName((f.sources.find((s) => s.type === "Quest") || {}).text);
      if (q) sources.push({ type: "任務", detail: q.name, questId: q.id });
    }
    // 官方說明：沒有商店與任務來源時當主要來源；有商店來源但說明還提到別的管道（寶箱等）時也補上
    const descAddsInfo = desc && isTranslated(desc) && (!sources.length || !/^[^，。]*交換$/.test(desc));
    if (descAddsInfo && !(type === "任務" && sources.length)) sources.push({ type, detail: desc });
    if (!sources.length) sources.push({ type, detail: null });

    const entry = {
      id: i.id,
      name,
      nameEn: f?.name ?? null,
      number: next++,
      itemId: i.id,
      icon: i.icon,
      category: EXPANSION[Math.floor(pnum(i.patch))] ?? null,
      patch: i.patch,
      // 站上補進的版本：補的是舊條目時 patch 比使用者看過的版本還早，「✨ 本次新增」要靠這欄才標得出來
      newIn: gamePatch,
      sources,
      gameCategory,
    };
    added.push(entry);
    console.log(`  + No.${entry.number} ${entry.name}（${entry.patch}｜${gameCategory}）` +
      sources.map((s) => `\n      ${s.type}：${s.detail ?? ""}${s.issuer ? `｜${s.issuer.verb}：${s.issuer.name}${s.at ? `＠${s.at.mapName}` : ""}` : ""}${s.questId ? `｜questId ${s.questId}` : ""}`).join(""));
  }

  if (!APPLY) { console.log(`\n（dry-run，未寫入；加 --apply 會 append ${added.length} 首）`); return; }
  db.data = rows.concat(added);
  db.count = db.data.length;
  db.updated = today;
  await writeFile(FILE, JSON.stringify(db) + "\n");
  console.log(`\n✅ 已寫入 ${added.length} 首，共 ${db.count} 首`);
}

main().catch((e) => { console.error("錯誤：", e.message); process.exit(1); });
