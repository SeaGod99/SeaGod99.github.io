// 表情（emotes）資料重建腳本
//
// 重建 data/emotes.json：補繁中名 + 取得來源（sources），並修正欄位語意。
//
// 背景：舊版把 Emote.UnlockLink 誤當成物品 id，反查到神典石/過期裝備，於是
// 198 筆需解鎖表情 name=null 被前端隱藏。實測證實正確的反查路徑是反向走
// Item.ItemAction：表情書物品（一律名為「Ballroom Etiquette -」/台服「演技教材·」）的
// ItemAction.Data[0] == Emote.UnlockLink。舊版書 Data=[UnlockLink,5211,EmoteId]，
// 新版書 Data=[UnlockLink,<其他>,0]，唯一穩定關係是 Data[0]==UnlockLink，故以名稱列舉
// 全部表情書、再以 Data[0] 對回 UnlockLink（一本書可解鎖共用同 UnlockLink 的多個表情）。
//
// 來源分桶：
//   UnlockLink=0          → 預設動作（角色初始即可用）
//   有對應表情書物品        → 動作指南書（itemId 連市場、台服書名來自 tw-items）
//   UnlockLink>=65536      → 任務獎勵（UnlockLink 即 Quest row id，繁中名走 Cafemaker→OpenCC）
//   MANUAL_SOURCES 命中     → 任務/成就/App（小值 UnlockLink、無書物品；來源逐筆查 FFXIV
//                            wiki + ffxivcollect 佐證，繁中任務/成就名走 XIVAPI→Cafemaker→OpenCC）
//   其餘                   → sources 留空，列入未補報告
//
// 繁中名：全 292 筆走 Cafemaker 簡中 Emote 名 → opencc-js s2twp，與站內既有作法一致。
//
// 需 Node 18+（內建 fetch），需安裝 opencc-js、@msgpack/msgpack：
//   npm install opencc-js @msgpack/msgpack
//
// 執行（repo 根目錄）：
//   node scripts/build-emotes.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { decode } from "@msgpack/msgpack";
import * as OpenCC from "opencc-js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EMOTES_JSON = join(ROOT, "data", "emotes.json");
const TW_FILE = join(ROOT, "out_data", "tw-items.msgpack");
const REPORT = join(ROOT, "data", "scripts", "emotes-unsourced.txt");

const XIVAPI = "https://v2.xivapi.com/api";
const CAFE = "https://cafemaker.wakingsands.com";

// 小值 UnlockLink、無表情書的手動來源（金碟/任務/成就/App），key = UnlockLink。
// 同一 UnlockLink 解鎖的多個表情共用一筆。繁中任務/成就名由 XIVAPI 英文名→Quest/Achievement
// row → Cafemaker Name_chs → OpenCC s2twp 取得；佐證：FFXIV consolegameswiki + ffxivcollect API。
const MANUAL_SOURCES = {
  23:  { type: "任務", detail: "任務「另一類軍禮」獎勵" },        // Acting the Part
  24:  { type: "任務", detail: "任務「冬日的活動」獎勵" },        // Toss Fit Workout
  27:  { type: "任務", detail: "任務「快樂的律動之舞」獎勵" },    // Good for What Ales You
  28:  { type: "任務", detail: "任務「為誰而舞」獎勵" },          // Saw That One Coming
  29:  { type: "任務", detail: "任務「舞女的夢想舞臺」獎勵" },    // Help Me, Lord of the Dance
  30:  { type: "任務", detail: "任務「白髮鬼」獎勵" },            // The Hammer
  229: { type: "任務", detail: "任務「天長地久」獎勵" },          // The Ties That Bind
  244: { type: "任務", detail: "任務「隨風而逝的結局」獎勵" },    // Her Last Vow
  283: { type: "任務", detail: "任務「敬畏之人」獎勵" },          // Sundrop the Beat
  305: { type: "任務", detail: "任務「命運的齒輪」獎勵" },        // Causes and Costs
  306: { type: "任務", detail: "任務「四國聯合軍演」獎勵" },      // A Spectacle for the Ages
  318: { type: "任務", detail: "任務「友人的微笑」獎勵" },        // The Burdens We Bear
  332: { type: "任務", detail: "任務「伊修加德的盟友們」獎勵" },  // Eternity, Loyalty, Honesty
  334: { type: "任務", detail: "任務「匿名信疑雲」獎勵" },        // Letters from No One
  340: { type: "任務", detail: "任務「遨遊大海！」獎勵" },        // In Soroban We Trust（開放潛水）
  373: { type: "成就", detail: "成就「可靠的隊長1」獎勵" },       // Dear Leader I（健身系列）
  406: { type: "App",  detail: "下載並登入 Companion App（手機）" }, // Companion App
};

const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch (_) { /* retry */ }
    await sleep(300);
  }
  return null;
}

// 撈所有表情書物品，以 UnlockLink(Data[0]) 為 key，回傳 { unlockLink: itemId }。
// 一本書可解鎖共用同 UnlockLink 的多個表情。書名有「Ballroom Etiquette」（演技教材）與
// 「Battlefield Etiquette」（軍事系列）兩類，故以 Name~"Etiquette" 列舉；再聯集舊版
// Data[1]=5211 標記掃描，雙保險避免漏網（兩者都以 Data[0]==UnlockLink 對回表情）。
async function searchItems(query) {
  const out = [];
  let cursor = null, page = 0;
  do {
    let url = `${XIVAPI}/search?sheets=Item&query=${query}&fields=ItemAction.Data&limit=500`;
    if (cursor) url += `&cursor=${cursor}`;
    const j = await getJson(url);
    out.push(...(j?.results || []));
    cursor = j?.next;
    page++;
  } while (cursor && page < 20);
  return out;
}

async function fetchBookMap() {
  const map = {};
  const items = [
    ...(await searchItems('Name~"Etiquette"')),
    ...(await searchItems("ItemAction.Data[1]=5211")),
  ];
  for (const it of items) {
    const d = it.fields?.ItemAction?.fields?.Data;
    if (d && d[0]) map[d[0]] = it.row_id;
  }
  return map;
}

// 批次取 Emote 表（UnlockLink / EmoteCategory）
async function fetchEmoteSheet(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const url = `${XIVAPI}/sheet/Emote?rows=${chunk.join(",")}&fields=UnlockLink,EmoteCategory.Name`;
    const j = await getJson(url);
    for (const row of j?.rows || []) {
      out[row.row_id] = {
        unlockLink: row.fields.UnlockLink ?? 0,
        category: row.fields.EmoteCategory?.fields?.Name || null,
      };
    }
    await sleep(120);
  }
  return out;
}

// Cafemaker 簡中名 → 繁中
async function fetchTwName(sheet, id) {
  const j = await getJson(`${CAFE}/${sheet}/${id}?columns=Name_chs`);
  const chs = j?.Name_chs;
  return chs ? toTW(chs).trim() : null;
}

async function main() {
  console.log("讀取 emotes.json + tw-items…");
  const db = JSON.parse(await readFile(EMOTES_JSON, "utf8"));
  const tw = decode(await readFile(TW_FILE)); // { itemId: { tw } }
  const twName = (id) => tw[id]?.tw || tw[String(id)]?.tw || null;

  const ids = db.data.map((e) => e.id);

  console.log("反查表情書物品（Etiquette 書 ∪ Data[1]=5211 → Data[0]=UnlockLink）…");
  const bookMap = await fetchBookMap();
  console.log(`  表情書物品 ${Object.keys(bookMap).length} 本`);

  console.log("取 Emote 表（UnlockLink / 分類）…");
  const sheet = await fetchEmoteSheet(ids);

  const buckets = { default: 0, book: 0, quest: 0, manual: 0, unsourced: 0 };
  const unsourced = [];
  const questNameCache = new Map();

  console.log("補繁中名 + 組來源（Cafemaker，約 300 筆，請稍候）…");
  let done = 0;
  for (const e of db.data) {
    // 繁中名：全部重抓 Cafemaker→OpenCC，失敗則保留原 name
    const tw_ = await fetchTwName("Emote", e.id);
    if (tw_) e.name = tw_;

    const meta = sheet[e.id] || {};
    const unlockLink = meta.unlockLink ?? (e.unlockLink || 0);
    const bookItemId = bookMap[unlockLink]; // 以 UnlockLink 反查表情書

    e.unlockLink = unlockLink;
    e.category = meta.category || null;
    e.itemId = bookItemId || null; // 正名：只有真實表情書物品才填 itemId

    if (unlockLink === 0) {
      e.sources = [{ type: "預設", detail: "預設動作（角色初始即可使用）" }];
      buckets.default++;
    } else if (bookItemId) {
      const bn = twName(bookItemId);
      e.sources = [{ type: "動作指南書", detail: bn ? `習得自「${bn}」` : "習得自動作指南書" }];
      buckets.book++;
    } else if (unlockLink >= 65536) {
      let qn = questNameCache.get(unlockLink);
      if (qn === undefined) {
        qn = await fetchTwName("Quest", unlockLink);
        questNameCache.set(unlockLink, qn);
      }
      e.sources = [{ type: "任務", detail: qn ? `任務「${qn}」獎勵` : "任務獎勵" }];
      buckets.quest++;
    } else if (MANUAL_SOURCES[unlockLink]) {
      e.sources = [{ ...MANUAL_SOURCES[unlockLink] }];
      buckets.manual++;
    } else {
      e.sources = []; // 仍無來源，列入未補報告
      buckets.unsourced++;
      unsourced.push(`${e.id}\t${e.command}\t${e.nameEn}\t${e.name || ""}\tUnlockLink=${unlockLink}\tcat=${e.category || ""}`);
    }

    if (++done % 25 === 0) process.stdout.write(`\r  ${done}/${db.data.length}…`);
    await sleep(60);
  }
  process.stdout.write("\n");

  // 重新排欄位順序，寫回
  db.source = "xivapi+itemaction+cafemaker+tw-items";
  db.updated = new Date().toISOString().slice(0, 10);
  db.data = db.data.map((e) => ({
    id: e.id,
    name: e.name ?? null,
    nameEn: e.nameEn,
    command: e.command,
    unlockLink: e.unlockLink,
    itemId: e.itemId,
    icon: e.icon,
    category: e.category,
    sources: e.sources,
    patch: e.patch ?? null,
  }));

  await writeFile(EMOTES_JSON, JSON.stringify(db, null, 2) + "\n", "utf8");

  const namedCount = db.data.filter((e) => e.name).length;
  console.log(`\n完成。繁中名 ${namedCount}/${db.data.length}`);
  console.log(`來源分桶：預設 ${buckets.default}、動作指南書 ${buckets.book}、任務 ${buckets.quest}、手動(任務/成就/App) ${buckets.manual}、未補 ${buckets.unsourced}`);

  await writeFile(
    REPORT,
    `# 表情來源未補清單（${db.data.length} 中 ${unsourced.length} 筆）\n` +
    `# 仍無法定位來源者，需逐筆查 FFXIV wiki / ffxivcollect 補 sources。\n` +
    `# id\tcommand\tnameEn\tname\tunlockLink\tcategory\n` +
    unsourced.join("\n") + "\n",
    "utf8"
  );
  console.log(`未補清單 → ${REPORT}（${unsourced.length} 筆）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
