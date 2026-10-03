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
  // kind：卡片上的獎勵種類標籤（本站收藏頁的名稱，不是遊戲字串）
  { file: "mounts",      page: "collections/mounts/",      key: (e) => "id:" + e.id, kind: "坐騎" },
  { file: "minions",     page: "minions/",                 key: (e) => String(e.id), kind: "寵物" },   // 寵物頁 keyOf 是純 id
  { file: "orchestrion", page: "collections/orchestrion/", key: (e) => "id:" + e.id, kind: "樂譜" },
  { file: "emotes",      page: "collections/emotes/",      key: (e) => "id:" + e.id, kind: "表情" },
  { file: "barding",     page: "collections/barding/",     key: (e) => "id:" + e.id, kind: "鳥鞍" },
  { file: "ornaments",   page: "collections/ornaments/",   key: (e) => "id:" + e.id, kind: "時尚配飾" },
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
    for (const e of d) if (e.itemId && !collByItem.has(e.itemId)) collByItem.set(e.itemId, { p: c.page, k: c.key(e), kind: c.kind });
  }

  /* ── 獎勵內容（2026-10-04）──────────────────────────────────────────
     獎勵道具另外抓 ClassJobCategory 與 AdditionalData（只抓這 186 件）：
       · 九宮幻卡道具：AdditionalData = TripleTriadCard 的 row id（§4.10 那條可證的關聯），
         連到幻卡頁的 ?id=id:<卡 id>；**再用名稱驗一次**（「九宮幻卡：X」對卡名 X），對不上就不連。
       · 裝備：可裝備職業的文字。單一／少數職業一律用 data/equip.json 的職業名（鐵則）；
         **全職業**與**戰鬥精英＋魔法導師**這兩種群組才用 tw-locales.jobCategories 的官方字串——
         那張表的單一職業字串是舊譯（「木工師」＝刻木匠），不可以拿來顯示個別職業。 */
  const rewardIds = [...new Set(ach.map((a) => a.f["Item@as(raw)"]).filter(Boolean))];
  const rewardRows = await xiv.rows("Item", rewardIds, "ClassJobCategory@as(raw),AdditionalData@as(raw)",
    { cache: join(CACHE, "achievement-reward-items.json"), offline, label: "獎勵道具：" });
  const triad = new Map(JSON.parse(await readFile(join(DATA, "triple-triad.json"), "utf8")).data.map((c) => [c.id, c]));
  const equip = JSON.parse(await readFile(join(DATA, "equip.json"), "utf8"));
  const jobName = equip.names || {};
  const ALL_JOBS = 1, WAR_MAGIC = 34;            // ClassJobCategory：所有職業／戰鬥精英 魔法導師
  function jobsText(itemId, it) {
    const cat = rewardRows.get(itemId)?.["ClassJobCategory@as(raw)"];
    if (cat === ALL_JOBS || cat === WAR_MAGIC) {
      const t = twName(tw.jobCategories, cat);
      return t && isTw(t) ? t : null;
    }
    const names = (it.equip?.jobs || []).filter((j) => j !== "ADV").map((j) => jobName[j]);
    return names.length && names.every((n) => n && isTw(n)) ? names.join("、") : null;
  }
  function triadLink(itemId, it) {
    const card = triad.get(rewardRows.get(itemId)?.["AdditionalData@as(raw)"]);
    return card && it.name === "九宮幻卡：" + card.name ? { p: "collections/triple-triad/", k: "id:" + card.id, kind: "幻卡" } : null;
  }

  const catById = new Map(cats.map((c) => [c.id, c.f]));
  const kindOrder = new Map(kinds.map((k) => [k.id, k.f.Order || 0]));

  const stat = { noTw: 0, legacy: 0, noCat: 0, descMissing: 0, descNotTw: [], itemNoTw: [], noPatch: 0, markup: [], jobsMissing: [] };
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
        const coll = collByItem.get(itemId) || (it.category === "九宮幻卡" ? triadLink(itemId, it) : null);
        if (coll) { item.p = coll.p; item.k = coll.k; }
        else if (it.marketable) item.m = 1;
        if (it.icon) item.i = it.icon;
        /* 種類：連得到收藏頁的用那一頁的名稱（坐騎笛的道具分類是「其他」，寫「坐騎」才看得懂）；
           裝備統一叫「裝備」、另附細項；其餘照道具分類（台服官方字串） */
        item.c = coll ? coll.kind : it.equip ? "裝備" : it.category || null;
        if (it.equip) {
          item.eq = { lv: it.equip.level || null, il: it.ilvl || null, slot: it.category || null };
          const jt = jobsText(itemId, it);
          if (jt) item.eq.jobs = jt; else stat.jobsMissing.push(itemId);
        }
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
  const cstat = await enrichConditions(out, { tw, itemById, offline });

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
  const rewardKinds = {};
  for (const e of out) if (e.item) rewardKinds[e.item.c] = (rewardKinds[e.item.c] || 0) + 1;
  console.log(`  獎勵種類：${Object.entries(rewardKinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join("、")}`);
  console.log(`  裝備獎勵 ${out.filter((e) => e.item && e.item.eq).length}（職業文字查不到而留白 ${stat.jobsMissing.length}）`);
  console.log(`  版本查無 ${stat.noPatch}`);
  console.log(`  條件種類：${Object.entries(cstat.kind).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join("、")}`);
  console.log(`  系列 ${cstat.series} 個（${cstat.inSeries} 個成就）；前置成就 ${cstat.pre} 個；遊戲內隱藏 ${cstat.hidden} 個`);
  console.log(`  站內連結：${Object.entries(cstat.lk).map(([k, n]) => `${k} ${n}`).join("、")}；名稱對不上而不連：${Object.entries(cstat.lkSkip).map(([k, n]) => `${k} ${n}`).join("、") || "0"}`);
  console.log(`  可推論：${Object.entries(cstat.inf).map(([k, n]) => `${k} ${n}`).join("、")}`);
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

/* ── 達成條件的結構（2026-10-04，第二輪路線圖 §10）────────────────────────────
   XIVAPI `Achievement` 的 Type／Key／Data 說明了「這個成就要做什麼」。每一類的意思都拿台服說明文字
   逐類對過（路線圖 §10 有數字），**不是憑印象**。產出的欄位：
     ck   條件種類（本站的描述性分類，用字取自說明文字；**不是遊戲內的分類名**，那個沒有台服來源）
     sr   [系列序, 第幾階, 共幾階]——同一計數器、門檻遞增的一組（310 個系列）
     pre  前置成就 id（「完成其他成就」類）
     lk   [[種類, 名稱, 站內路徑]]——**名稱對得上才連**（有幾筆 Key 指的不是說明寫的那個任務／副本）
     inf  [storageKey, "all"|"min", 值, 理由]——其他頁的標記足以推論已達成的條件
     h    遊戲內隱藏：1＝整個成就、2＝條件、3＝名稱與條件（AchievementHideCondition） */
const KIND_OF_TYPE = {
  1: "累計次數", 2: "完成其他成就", 3: "職業等級", 26: "職業等級", 4: "魔晶石鑲嵌", 5: "危險標的",
  6: "任務", 9: "任務", 24: "任務", 7: "討伐筆記", 8: "點亮地圖", 10: "陸行鳥搭檔",
  11: "對人戰", 12: "對人戰", 13: "對人戰", 17: "對人戰", 18: "對人戰", 19: "對人戰", 25: "對人戰",
  14: "副本", 15: "部族關係", 20: "開放飛行", 21: "收集寵物", 27: "釣魚", 29: "九宮幻卡",
};
const SERIES_BY_DATA = new Set([1, 3, 11, 15, 18, 21, 27, 28]);   // 門檻在 Data[0]、計數器在 Key
const SERIES_BY_KEY = new Set([4, 10, 12, 13, 17, 19]);           // 門檻就在 Key（整個 Type 是同一個計數器）
const TT_COUNT_KEY = 352;                                           // Type 1 的「獲得 N 種九宮幻卡」（說明逐筆驗）
const MINION_COUNT_KEY = 0;                                         // Type 21 的「收集 N 種寵物」
const REWARD_STORE = {                                               // 收藏頁 → 該頁存進度的 key
  "collections/mounts/": "ffxiv_mounts_owned", "minions/": "ffxiv_minions_owned",
  "collections/orchestrion/": "ffxiv_orchestrion_owned", "collections/barding/": "ffxiv_barding_owned",
  "collections/ornaments/": "ffxiv_ornaments_owned", "collections/triple-triad/": "ffxiv_triadcards_owned",
};
const REWARD_DATA = {
  "collections/mounts/": ["mounts", (e) => "id:" + e.id], "minions/": ["minions", (e) => String(e.id)],
  "collections/orchestrion/": ["orchestrion", (e) => "id:" + e.id], "collections/barding/": ["barding", (e) => "id:" + e.id],
  "collections/ornaments/": ["ornaments", (e) => "id:" + e.id], "collections/triple-triad/": ["triple-triad", (e) => "id:" + e.id],
};
const PAGE_NAME = {
  "collections/mounts/": "坐騎", "minions/": "寵物", "collections/orchestrion/": "樂譜",
  "collections/barding/": "鳥鞍", "collections/ornaments/": "時尚配飾", "collections/triple-triad/": "幻卡",
};

async function enrichConditions(out, { tw }) {
  const conds = await xiv.sheet("Achievement",
    "Name,Type,Key@as(raw),Data@as(raw),AchievementHideCondition@as(raw),AchievementTarget@as(raw)",
    { cache: join(CACHE, "achievement-conditions-v2.json"), offline, label: "Achievement 條件：" });
  const C = new Map(conds.map((r) => [r.id, r.f]));
  const byId = new Map(out.map((a) => [a.id, a]));
  const twQuests = JSON.parse(await readFile(join(ROOT, "out_data", "tw-quests.json"), "utf8"));
  const { loadDutyMap } = await import("./lib/duty-map.mjs");
  const dm = loadDutyMap();
  const aether = JSON.parse(await readFile(join(DATA, "aether-currents.json"), "utf8")).zones;
  const hunting = JSON.parse(await readFile(join(DATA, "hunting-log.json"), "utf8")).data;
  const tribes = new Map(JSON.parse(await readFile(join(DATA, "beast-tribes.json"), "utf8")).data.map((t) => [t.id, t]));
  const rewardEntry = {};
  for (const [p, [file, key]] of Object.entries(REWARD_DATA)) {
    rewardEntry[p] = new Map(JSON.parse(await readFile(join(DATA, file + ".json"), "utf8")).data.map((e) => [key(e), e]));
  }
  const st = { kind: {}, series: 0, inSeries: 0, pre: 0, lk: {}, lkSkip: {}, inf: {}, hidden: 0 };
  const sp = (s) => String(s || "").replace(/[\s　]/g, "");

  // ① 系列
  const groups = new Map();
  for (const a of out) {
    const c = C.get(a.id); if (!c) continue;
    let g = null, th = null;
    if (SERIES_BY_DATA.has(c.Type)) { g = c.Type + ":" + c["Key@as(raw)"]; th = c["Data@as(raw)"][0]; }
    else if (SERIES_BY_KEY.has(c.Type)) { g = c.Type + ":*"; th = c["Key@as(raw)"]; }
    if (g == null || !th) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ a, th });
  }
  let gi = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const ths = arr.map((x) => x.th);
    if (new Set(ths).size !== ths.length) continue;          // 門檻重複＝不是單純的階梯，不收（目前 0 個）
    arr.sort((x, y) => x.th - y.th).forEach((x, i) => { x.a.sr = [gi, i + 1, arr.length]; });
    gi++; st.series++; st.inSeries += arr.length;
  }

  for (const a of out) {
    const c = C.get(a.id); if (!c) continue;
    const T = c.Type, key = c["Key@as(raw)"], data = c["Data@as(raw)"] || [];
    const kind = KIND_OF_TYPE[T] || "其他";
    a.ck = kind; st.kind[kind] = (st.kind[kind] || 0) + 1;
    const hide = c["AchievementHideCondition@as(raw)"];
    if (hide) { a.h = hide; st.hidden++; }
    const lk = [], inf = [];
    const addLk = (k, name, path) => { lk.push([k, name, path]); st.lk[k] = (st.lk[k] || 0) + 1; };
    const skip = (k) => { st.lkSkip[k] = (st.lkSkip[k] || 0) + 1; };

    // ② 前置成就
    if (T === 2) {
      const pre = [key, ...data].filter((x) => x && byId.has(x));
      if (pre.length) { a.pre = pre; st.pre++; }
    }
    // ③ 任務：說明裡寫的任務名要與 Key／Data 指的任務對得上才連
    if (T === 6 || T === 24 || T === 9) {
      const qid = T === 9 ? data[0] : key;
      const qn = twQuests[qid]?.tw;
      const m = (a.desc || "").match(/任務「([^」]+)」/);
      if (qn && m && (sp(qn) === sp(m[1]) || sp(qn).startsWith(sp(m[1]) + "（"))) addLk("任務", qn.trim(), "tools/quest-finder/?id=" + qid);
      else skip("任務");
    }
    // ④ 副本：Key＝InstanceContent → duty-map；說明裡要找得到副本名（去掉空白，或去掉「異聞迷宮 」這類前綴）
    if (T === 14) {
      const did = dm.byInstance.get(key);
      const nm = did != null ? dm.dungeons.get(did)?.name : null;
      const tail = nm ? nm.split(/[\s　]+/).pop() : null;
      if (nm && (sp(a.desc).includes(sp(nm)) || (tail && tail.length >= 3 && sp(a.desc).includes(tail)))) addLk("副本", nm, "tools/duty-codex/?id=duty:" + did);
      else skip("副本");
    }
    // ⑤ 開放飛行：說明「在 X 開放飛行」的 X 對到風脈泉頁的區域名（完全相同，或是區域名的結尾）
    if (T === 20) {
      const m = (a.desc || "").match(/在(.+?)開放飛行/);
      const z = m && aether.find((x) => x.zone === m[1] || x.zone.endsWith(m[1]));
      if (z) {
        addLk("風脈泉", z.zone, "tools/aether-currents/?q=" + encodeURIComponent(z.zone));
        const keys = (z.currents || []).map((cu) => "ac:" + cu.id);
        if (keys.length) inf.push(["ffxiv_aether_currents_unlocked", "all", keys, `風脈泉頁：「${z.zone}」的 ${keys.length} 個風脈泉全部標記`]);
      } else skip("風脈泉");
    }
    // ⑥ 討伐筆記：只給連結。**不推論**——那頁把同一隻怪算成各職業共用，但遊戲裡各職業的筆記是分開的
    if (T === 7) {
      const g = hunting.find((x) => (a.desc || "").includes(x.name + "討伐筆記"));
      if (g) addLk("討伐筆記", g.name, "collections/hunting-log/?f_group=" + encodeURIComponent(g.name)); else skip("討伐筆記");
    }
    // ⑦ 部族關係：Key＝BeastTribe id（18 族的等級都落在 1..maxRank 內、12 個英文說明直接寫了族名）
    if (T === 15 && tribes.has(key)) addLk("部族聲望", tribes.get(key).currency.name, "tools/beast-tribes/?tribe=" + key);
    // ⑧ 數量類：幻卡張數、寵物數（說明裡的數字要等於門檻才收）
    if (T === 1 && key === TT_COUNT_KEY) {
      const n = data[0], m = (a.desc || "").match(/獲得(\d+)種九宮幻卡/);
      if (m && +m[1] === n) {
        addLk("九宮幻卡", "幻卡追蹤", "collections/triple-triad/");
        inf.push(["ffxiv_triadcards_owned", "min", n, `幻卡頁已標記 ${n} 張以上`]);
      }
    }
    if (T === 21 && key === MINION_COUNT_KEY) {
      const n = data[0], m = (a.desc || "").match(/收集(\d+)種寵物/);
      if (m && +m[1] === n) {
        addLk("寵物", "寵物收藏追蹤", "minions/");
        inf.push(["ffxiv_minions_owned", "min", n, `寵物頁已標記 ${n} 種以上`]);
      }
    }
    // ⑨ 獎勵收藏品「只有成就這一個取得方式」→ 收藏頁標了就代表成就達成
    if (a.item && a.item.p && REWARD_STORE[a.item.p]) {
      const e = rewardEntry[a.item.p].get(a.item.k);
      const ss = (e && e.sources) || [];
      if (ss.length && ss.every((s) => s.type === "成就")) {
        a.item.only = 1;
        inf.push([REWARD_STORE[a.item.p], "all", [a.item.k], `${PAGE_NAME[a.item.p]}頁已標記獎勵「${a.item.n}」（它只能從這個成就取得）`]);
      }
    }
    if (lk.length) a.lk = lk;
    if (inf.length) { a.inf = inf; for (const x of inf) { const k = x[0].replace(/^ffxiv_/, ""); st.inf[k] = (st.inf[k] || 0) + 1; } }
  }
  return st;
}

main().catch((e) => { console.error(e); process.exit(1); });
