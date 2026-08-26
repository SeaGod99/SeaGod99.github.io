// 製作模擬器資料層 — 產生 data/craft-actions.json 與 data/craft-recipes.json
//
// 為什麼要獨立一份而不是擴充 recipes.json：
//   recipes.json 的 `patch` 欄是 patch-backfill-all.mjs 事後補的，不是 build-recipes.mjs
//   產的（知識庫 §4.19「每個欄位都要有腳本產生」的反例）。重跑 build-recipes 會把
//   patch 洗掉，所以模擬器需要的欄位改走這支獨立腳本，不動主庫。
//
// 產出兩份：
//   data/craft-actions.json  製作技能表（繁中名 + CP + 解鎖等級 + 效率等機制參數）
//   data/craft-recipes.json  模擬用配方表（難度/品質/耐久 + rlvl 的除數與修正 + HQ 材料）
//
// 資料來源與各自的權威性：
//   · 技能繁中名   ← Teamcraft `tw/tw-craft-actions.json`＋`tw/tw-actions.json`
//                    （台服官方用字。**不可用簡轉繁**，見 CLAUDE.md 鐵則）
//   · CP／解鎖等級 ← XIVAPI v2 CraftAction／Action sheet（Cost、ClassJobLevel）
//   · 效率與規則   ← Teamcraft 模擬器（MIT, github.com/ffxiv-teamcraft/simulator）
//                    遊戲客戶端沒把效率寫進 sheet，全世界的模擬器都是硬寫的常數
//   · 配方數值     ← Teamcraft `recipes.json`（progressDivider/qualityDivider/modifier、
//                    conditionsFlag、HQ 材料的品質貢獻）× 本站 data/recipes.json（patch、職業）
//
// 版本閘門刻意不在這裡做：patch 欄照樣輸出，由前端 patch-gate.js 依 _meta.json 的
// gamePatch 過濾。台服升版時不用重跑這支（除非配方本身有變）。
//
// 執行：
//   node scripts/build-craft-sim.mjs            # 抓網路（約 13MB，Teamcraft 配方表）
//   node scripts/build-craft-sim.mjs --offline  # 用 out_data/cache/craft-sim 的快取
//   node scripts/build-craft-sim.mjs --refresh  # 強制重抓並更新快取

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const DATA = join(REPO, "data");
const CACHE = join(REPO, "out_data", "cache", "craft-sim");

const OFFLINE = process.argv.includes("--offline");
const REFRESH = process.argv.includes("--refresh");

const TC = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/";

/* ── 抓取（帶本機快取，13MB 的配方表不想每次重抓）───────────────────────── */

async function grab(name, url) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, name);
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  if (OFFLINE) throw new Error(`--offline 但快取缺 ${name}，先跑一次連線版`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ← ${url}`);
  const text = await res.text();
  writeFileSync(file, text);
  return JSON.parse(text);
}

/* ── 技能表 ─────────────────────────────────────────────────────────────
   一筆技能＝一列。欄位意義：
     ids      八個製作職各自的 action id（順序＝刻木/鍛鐵/鑄甲/雕金/製革/裁衣/煉金/烹調，
              對應 jobId 8..15）。跨職共用的技能八個 id 相同也照列。
     nameSrc  'craft' = 查 tw-craft-actions.json；'action' = 查 tw-actions.json
     type     progress｜quality｜buff｜repair｜cp｜other（決定 UI 分組與配色）
     level    解鎖等級（跑完會用 XIVAPI 校驗）
     cp       基礎 CP（同上；連段折扣等變動成本由前端引擎處理）
     dur      基礎耐久消耗
     eff      效率（進度／品質技能；隨等級變動的寫成 {base, at, up}）
     succ     成功率（省略＝100）
     flags    引擎要用的特殊規則旗標，前端據此顯示提示文字
   效率／規則來源：Teamcraft 模擬器（MIT）。遊戲 sheet 不含效率，只能硬寫。 */
const ACTIONS = [
  // ── 進度 ──
  { key: "basicSynthesis",     ids: [100001, 100015, 100030, 100075, 100045, 100060, 100090, 100105], nameSrc: "craft", type: "progress", level: 1,  cp: 0,   dur: 10, eff: { base: 100, at: 31, up: 120 } },
  { key: "rapidSynthesis",     ids: [100363, 100364, 100365, 100366, 100367, 100368, 100369, 100370], nameSrc: "craft", type: "progress", level: 9,  cp: 0,   dur: 10, eff: { base: 250, at: 63, up: 500 }, succ: 50 },
  { key: "muscleMemory",       ids: [100379, 100380, 100381, 100382, 100383, 100384, 100385, 100386], nameSrc: "craft", type: "progress", level: 54, cp: 6,   dur: 10, eff: { base: 300 }, flags: ["firstStep", "selfBuff"] },
  { key: "carefulSynthesis",   ids: [100203, 100204, 100205, 100206, 100207, 100208, 100209, 100210], nameSrc: "craft", type: "progress", level: 62, cp: 7,   dur: 10, eff: { base: 150, at: 82, up: 180 } },
  { key: "groundwork",         ids: [100403, 100404, 100405, 100406, 100407, 100408, 100409, 100410], nameSrc: "craft", type: "progress", level: 72, cp: 18,  dur: 20, eff: { base: 300, at: 86, up: 360 }, flags: ["halfIfLowDurability"] },
  { key: "intensiveSynthesis", ids: [100315, 100316, 100317, 100318, 100319, 100320, 100321, 100322], nameSrc: "craft", type: "progress", level: 78, cp: 6,   dur: 10, eff: { base: 400 }, flags: ["requiresGood"] },
  { key: "prudentSynthesis",   ids: [100427, 100428, 100429, 100430, 100431, 100432, 100433, 100434], nameSrc: "craft", type: "progress", level: 88, cp: 18,  dur: 5,  eff: { base: 180 }, flags: ["noWasteNot"] },
  // ── 品質 ──
  { key: "basicTouch",         ids: [100002, 100016, 100031, 100076, 100046, 100061, 100091, 100106], nameSrc: "craft", type: "quality", level: 5,  cp: 18,  dur: 10, eff: { base: 100 } },
  { key: "hastyTouch",         ids: [100355, 100356, 100357, 100358, 100359, 100360, 100361, 100362], nameSrc: "craft", type: "quality", level: 9,  cp: 0,   dur: 10, eff: { base: 100 }, succ: 60, flags: ["grantsExpedience"] },
  { key: "standardTouch",      ids: [100004, 100018, 100034, 100078, 100048, 100064, 100093, 100109], nameSrc: "craft", type: "quality", level: 18, cp: 32,  dur: 10, eff: { base: 125 }, comboCp: 18, flags: ["comboBasicTouch"] },
  { key: "byregotsBlessing",   ids: [100339, 100340, 100341, 100342, 100343, 100344, 100345, 100346], nameSrc: "craft", type: "quality", level: 50, cp: 24,  dur: 10, eff: { base: 100 }, flags: ["needsInnerQuiet", "consumesInnerQuiet", "effByInnerQuiet"] },
  { key: "preciseTouch",       ids: [100128, 100129, 100130, 100131, 100132, 100133, 100134, 100135], nameSrc: "craft", type: "quality", level: 53, cp: 18,  dur: 10, eff: { base: 150 }, flags: ["requiresGood", "extraInnerQuiet"] },
  { key: "prudentTouch",       ids: [100227, 100228, 100229, 100230, 100231, 100232, 100233, 100234], nameSrc: "craft", type: "quality", level: 66, cp: 25,  dur: 5,  eff: { base: 100 }, flags: ["noWasteNot"] },
  { key: "advancedTouch",      ids: [100411, 100412, 100413, 100414, 100415, 100416, 100417, 100418], nameSrc: "craft", type: "quality", level: 68, cp: 46,  dur: 10, eff: { base: 150 }, comboCp: 18, flags: ["comboStandardTouch"] },
  { key: "reflect",            ids: [100387, 100388, 100389, 100390, 100391, 100392, 100393, 100394], nameSrc: "craft", type: "quality", level: 69, cp: 6,   dur: 10, eff: { base: 300 }, flags: ["firstStep", "extraInnerQuiet"] },
  { key: "preparatoryTouch",   ids: [100299, 100300, 100301, 100302, 100303, 100304, 100305, 100306], nameSrc: "craft", type: "quality", level: 71, cp: 40,  dur: 20, eff: { base: 200 }, flags: ["extraInnerQuiet"] },
  { key: "trainedEye",         ids: [100283, 100284, 100285, 100286, 100287, 100288, 100289, 100290], nameSrc: "craft", type: "quality", level: 80, cp: 250, dur: 0,  eff: null, flags: ["firstStep", "maxQuality", "levelDiff10", "notExpert"] },
  { key: "trainedFinesse",     ids: [100435, 100436, 100437, 100438, 100439, 100440, 100441, 100442], nameSrc: "craft", type: "quality", level: 90, cp: 32,  dur: 0,  eff: { base: 100 }, flags: ["needsInnerQuiet10"] },
  { key: "refinedTouch",       ids: [100443, 100444, 100445, 100446, 100447, 100448, 100449, 100450], nameSrc: "craft", type: "quality", level: 92, cp: 24,  dur: 10, eff: { base: 100 }, flags: ["comboBasicTouchIq"] },
  { key: "daringTouch",        ids: [100451, 100452, 100453, 100454, 100455, 100456, 100457, 100458], nameSrc: "craft", type: "quality", level: 96, cp: 0,   dur: 10, eff: { base: 150 }, succ: 60, flags: ["needsExpedience"] },
  // ── 增益 ──
  { key: "veneration",         ids: [19297, 19298, 19299, 19300, 19301, 19302, 19303, 19304], nameSrc: "action", type: "buff",   level: 15, cp: 18, dur: 0, duration: 4 },
  { key: "wasteNot",           ids: [4631, 4632, 4633, 4634, 4635, 4636, 4637, 4638],         nameSrc: "action", type: "buff",   level: 15, cp: 56, dur: 0, duration: 4 },
  { key: "greatStrides",       ids: [260, 261, 262, 263, 264, 265, 266, 267],                 nameSrc: "action", type: "buff",   level: 21, cp: 32, dur: 0, duration: 3 },
  { key: "innovation",         ids: [19004, 19005, 19006, 19007, 19008, 19009, 19010, 19011], nameSrc: "action", type: "buff",   level: 26, cp: 18, dur: 0, duration: 4 },
  { key: "finalAppraisal",     ids: [19012, 19013, 19014, 19015, 19016, 19017, 19018, 19019], nameSrc: "action", type: "buff",   level: 42, cp: 1,  dur: 0, duration: 5, flags: ["noTick"] },
  { key: "wasteNotII",         ids: [4639, 4640, 4641, 4642, 4643, 4644, 19002, 19003],       nameSrc: "action", type: "buff",   level: 47, cp: 98, dur: 0, duration: 8 },
  { key: "manipulation",       ids: [4574, 4575, 4576, 4577, 4578, 4579, 4580, 4581],         nameSrc: "action", type: "repair", level: 65, cp: 96, dur: 0, duration: 8 },
  // ── 其他 ──
  { key: "mastersMend",        ids: [100003, 100017, 100032, 100047, 100062, 100077, 100092, 100107], nameSrc: "craft", type: "repair", level: 7,   cp: 88,  dur: 0, flags: ["repair30"] },
  { key: "observe",            ids: [100010, 100023, 100040, 100053, 100070, 100082, 100099, 100113], nameSrc: "craft", type: "other",  level: 13,  cp: 7,   dur: 0 },
  { key: "tricksOfTheTrade",   ids: [100371, 100372, 100373, 100374, 100375, 100376, 100377, 100378], nameSrc: "craft", type: "cp",     level: 13,  cp: 0,   dur: 0, flags: ["requiresGood", "restoreCp20"] },
  { key: "delicateSynthesis",  ids: [100323, 100324, 100325, 100326, 100327, 100328, 100329, 100330], nameSrc: "craft", type: "other",  level: 76,  cp: 32,  dur: 10, eff: { base: 100 }, effProgress: { base: 100, at: 94, up: 150 } },
  { key: "immaculateMend",     ids: [100467, 100468, 100469, 100470, 100471, 100472, 100473, 100474], nameSrc: "craft", type: "repair", level: 98,  cp: 112, dur: 0, flags: ["repairFull"] },
  { key: "trainedPerfection",  ids: [100475, 100476, 100477, 100478, 100479, 100480, 100481, 100482], nameSrc: "craft", type: "other",  level: 100, cp: 0,   dur: 0, flags: ["onceOnly", "nextFreeDurability"] },
  // ── 專家專用技能（台服官方用字＝「專家」，出自技能說明「專家專用技能」與道具 10336 專家水晶）──
  { key: "carefulObservation", ids: [100395, 100396, 100397, 100398, 100399, 100400, 100401, 100402], nameSrc: "craft", type: "other", level: 55, cp: 0, dur: 0, flags: ["specialist", "rerollCondition", "noTick"] },
  { key: "heartAndSoul",       ids: [100419, 100420, 100421, 100422, 100423, 100424, 100425, 100426], nameSrc: "craft", type: "other", level: 86, cp: 0, dur: 0, flags: ["specialist", "onceOnly", "actsAsGood", "noTick"] },
  { key: "quickInnovation",    ids: [100459, 100460, 100461, 100462, 100463, 100464, 100465, 100466], nameSrc: "craft", type: "buff",  level: 96, cp: 0, dur: 0, duration: 1, flags: ["specialist", "onceOnly", "asInnovation", "noTick"] },
];

/* 工匠等級 → rlvl 對照（用於「等級低於配方時的進度／品質懲罰」判斷）。
   遊戲 sheet 沒有直接的對照欄，這張表是社群模擬器共用的常數；
   來源 Teamcraft simulator src/model/tables.ts（MIT）。1–50 為等值故不列。 */
const LEVEL_TABLE = {
  51: 120, 52: 125, 53: 130, 54: 133, 55: 136, 56: 139, 57: 142, 58: 145, 59: 148, 60: 150,
  61: 260, 62: 265, 63: 270, 64: 273, 65: 276, 66: 279, 67: 282, 68: 285, 69: 288, 70: 290,
  71: 390, 72: 395, 73: 400, 74: 403, 75: 406, 76: 409, 77: 412, 78: 415, 79: 418, 80: 420,
  81: 517, 82: 520, 83: 525, 84: 530, 85: 535, 86: 540, 87: 545, 88: 550, 89: 555, 90: 560,
  91: 650, 92: 653, 93: 656, 94: 660, 95: 665, 96: 670, 97: 675, 98: 680, 99: 685, 100: 690,
};

/* 品質% → HQ 機率%（索引 0..100）。同樣是客戶端常數，來源同上。 */
const HQ_TABLE = [
  1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8,
  9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 13, 13, 14, 14, 14, 15, 15, 15, 16, 16, 17, 17,
  17, 18, 18, 18, 19, 19, 20, 20, 21, 22, 23, 24, 26, 28, 31, 34, 38, 42, 47, 52, 58, 64, 68, 71,
  74, 76, 78, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 94, 96, 98, 100,
];

/* ── 主流程 ─────────────────────────────────────────────────────────── */

async function main() {
  const meta = JSON.parse(readFileSync(join(DATA, "_meta.json"), "utf8"));
  const gamePatch = meta.gamePatch || "7.21";
  const today = new Date().toISOString().slice(0, 10);

  console.log("抓取來源…");
  const twCraft = await grab("tw-craft-actions.json", TC + "tw/tw-craft-actions.json");
  const twAct = await grab("tw-actions.json", TC + "tw/tw-actions.json");
  const twCraftDesc = await grab("tw-craft-descriptions.json", TC + "tw/tw-craft-descriptions.json");
  const twActDesc = await grab("tw-action-descriptions.json", TC + "tw/tw-action-descriptions.json");
  const tcRecipes = await grab("recipes.json", TC + "recipes.json");
  const rlt = await grab("recipe-level-table.json", TC + "recipe-level-table.json");
  console.log(`  Teamcraft 配方 ${tcRecipes.length} 筆、rlvl 表 ${Object.keys(rlt).length} 列`);

  /* ── 技能：補繁中名，並用 XIVAPI 校驗 CP／等級 ── */
  const twName = (a) => {
    const src = a.nameSrc === "craft" ? twCraft : twAct;
    for (const id of a.ids) {
      const row = src[id];
      if (row && row.tw) return row.tw;
    }
    return null;
  };

  /* 技能說明也一起收：前端滑到技能上顯示官方說明文，比自己寫一句更可信。
     原文是客戶端的標記語言，要處理三種東西（換行保留，前端用 white-space 呈現）：
       <UIForeground>F201F4</UIForeground>…<UIForeground>01</UIForeground>
         → 強調色的開關標記，標籤與裡面的色碼要一起拿掉（只刪標籤會留下 F201F4 這種殘字）
       <If(條件)>A<Else/>B</If>
         → 依職業／等級變動的數值。由內而外取「成立」那一支＝滿級數值
           （效率的等級分段在技能鈕上已經標成 100→120，這裡取滿級值不會互相矛盾）
       其餘殘留標籤 → 直接刪 */
  const cleanDesc = (raw) => {
    let s = String(raw).replace(/<(UIForeground|UIGlow)>[^<]*<\/\1>/g, "");
    // 條件用 [^>]* 而不是 .*?：懶惰量詞在比對失敗時會往後擴張，
    // 曾因此一口氣吞掉巢狀的內層 <If(...)>，把 120／100 兩支併成「120100」
    const innermostIf = /<If\([^>]*\)>((?:(?!<If\()[\s\S])*?)<Else\/>((?:(?!<\/If>)[\s\S])*?)<\/If>/;
    for (let i = 0; i < 20 && innermostIf.test(s); i++) s = s.replace(innermostIf, "$1");
    return s
      .replace(/<[^>]*>/g, "")
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t　]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  };

  const twDesc = (a) => {
    const src = a.nameSrc === "craft" ? twCraftDesc : twActDesc;
    for (const id of a.ids) {
      const row = src[id];
      if (row && row.tw) return cleanDesc(row.tw);
    }
    return null;
  };

  const actions = ACTIONS.map((a) => ({ ...a, name: twName(a), desc: twDesc(a) }));
  const noDesc = actions.filter((a) => !a.desc);
  if (noDesc.length) console.log(`  ⚠️  ${noDesc.length} 個技能查無台服說明文：${noDesc.map((a) => a.key).join(", ")}`);
  const missing = actions.filter((a) => !a.name);
  if (missing.length) {
    console.log(`  ⚠️  ${missing.length} 個技能查無台服官方名：${missing.map((a) => a.key).join(", ")}`);
    console.log("     （台服未開放的技能不該進資料表，請確認 ids 是否正確）");
  }

  let checked = 0, mismatch = 0;
  if (!OFFLINE) {
    console.log("以 XIVAPI 校驗 CP 與解鎖等級…");
    const fetchSheet = async (sheet, ids, fields) => {
      const url = `https://v2.xivapi.com/api/sheet/${sheet}?rows=${ids.join(",")}&fields=${fields}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`XIVAPI ${sheet} HTTP ${res.status}`);
      const j = await res.json();
      return new Map(j.rows.map((r) => [r.row_id, r.fields]));
    };
    const craftRows = await fetchSheet("CraftAction",
      actions.filter((a) => a.nameSrc === "craft").map((a) => a.ids[0]), "Name,ClassJobLevel,Cost");
    const actRows = await fetchSheet("Action",
      actions.filter((a) => a.nameSrc === "action").map((a) => a.ids[0]), "Name,ClassJobLevel,PrimaryCostValue");
    for (const a of actions) {
      const row = a.nameSrc === "craft" ? craftRows.get(a.ids[0]) : actRows.get(a.ids[0]);
      if (!row) { console.log(`  ⚠️  XIVAPI 查無 ${a.key}（id ${a.ids[0]}）`); continue; }
      a.nameEn = row.Name;
      checked++;
      const cp = a.nameSrc === "craft" ? row.Cost : row.PrimaryCostValue;
      if (cp !== a.cp) { console.log(`  ⚠️  ${a.key} CP 不符：本表 ${a.cp}、XIVAPI ${cp}`); mismatch++; }
      if (row.ClassJobLevel !== a.level) { console.log(`  ⚠️  ${a.key} 等級不符：本表 ${a.level}、XIVAPI ${row.ClassJobLevel}`); mismatch++; }
    }
    console.log(`  校驗 ${checked} 個技能，不符 ${mismatch} 處`);
  }

  const actionsOut = {
    schema: "craft-actions",
    patch: gamePatch,
    updated: today,
    source: "teamcraft tw-craft-actions/tw-actions（繁中名）+ XIVAPI CraftAction/Action（CP、等級）+ teamcraft simulator（效率與規則，MIT）",
    count: actions.length,
    levelTable: LEVEL_TABLE,
    hqTable: HQ_TABLE,
    data: actions,
  };
  writeFileSync(join(DATA, "craft-actions.json"), JSON.stringify(actionsOut));
  console.log(`✓ data/craft-actions.json — ${actions.length} 個技能`);

  /* ── 配方：本站主庫（patch／職業）× Teamcraft（模擬用數值）── */
  const local = JSON.parse(readFileSync(join(DATA, "recipes.json"), "utf8")).data;
  const tcById = new Map(tcRecipes.map((r) => [r.id, r]));

  // rlvl 表只留模擬會用到的四欄（除數／修正），16KB 換掉逐筆重複
  const rlvlTable = {};
  for (const [k, v] of Object.entries(rlt)) {
    rlvlTable[k] = [v.progressDivider, v.qualityDivider, v.progressModifier, v.qualityModifier];
  }

  const columns = ["id", "itemId", "jobId", "lvl", "rlvl", "stars", "durability", "quality",
                   "progress", "hq", "expert", "conditionsFlag", "requiredQuality",
                   "craftsmanshipReq", "controlReq", "patch", "hqIngredients"];
  const rows = [];
  let noTc = 0, divergent = 0, notCrafter = 0;
  for (const r of local) {
    // 只收八大製作職（jobId 8–15）。工會工坊（jobId 0，id 形如 "fc1"）與無人島
    // （jobId -10）不是用製作技能做的，沒有 rlvl／除數，模擬器對它們沒有意義。
    if (!(r.jobId >= 8 && r.jobId <= 15)) { notCrafter++; continue; }
    const t = tcById.get(r.id);
    if (!t) { noTc++; continue; }
    // 逐筆確認「配方自帶的除數／修正」與 rlvl 表一致——不一致代表 rlvl 表不足以
    // 代表這筆（得改成逐筆存），所以要吵出來而不是安靜吃掉
    const tbl = rlvlTable[t.rlvl];
    if (!tbl || tbl[0] !== t.progressDivider || tbl[1] !== t.qualityDivider ||
        tbl[2] !== (t.progressModifier ?? 100) || tbl[3] !== (t.qualityModifier ?? 100)) {
      divergent++;
    }
    const hqIng = (t.ingredients || [])
      .filter((g) => g.quality > 0)
      .map((g) => [g.id, g.amount, g.quality]);
    rows.push([
      r.id, r.itemId, r.jobId, r.level, r.rlvl, r.stars, r.durability, r.quality, r.progress,
      t.hq ? 1 : 0, t.expert ? 1 : 0, t.conditionsFlag || 15, t.requiredQuality || 0,
      t.craftsmanshipReq || 0, t.controlReq || 0, r.patch || null, hqIng,
    ]);
  }
  if (notCrafter) console.log(`  · 排除 ${notCrafter} 筆非製作職配方（工會工坊／無人島）`);
  if (noTc) console.log(`  ⚠️  ${noTc} 筆本站配方在 Teamcraft 找不到（模擬器不收）`);
  if (divergent) console.log(`  ⚠️  ${divergent} 筆的除數／修正與 rlvl 表不一致——rlvl 表不足以代表配方，需改逐筆存`);

  const recipesOut = {
    schema: "craft-recipes",
    patch: gamePatch,
    updated: today,
    source: "data/recipes.json（patch、職業）× teamcraft recipes.json（模擬用數值）",
    count: rows.length,
    columns,
    rlvlTable,
    data: rows,
  };
  writeFileSync(join(DATA, "craft-recipes.json"), JSON.stringify(recipesOut));
  const kb = (JSON.stringify(recipesOut).length / 1024) | 0;
  console.log(`✓ data/craft-recipes.json — ${rows.length} 筆配方（${kb}KB）`);

  await buildConsumables(gamePatch, today);
}

/* ── 料理／藥品 ──────────────────────────────────────────────────────────
   為什麼要這份：實際玩家一定是吃補在做，而料理加成是「百分比 ＋ 上限」兩段，
   心算很容易錯。沒有這份，使用者只能自己把吃補後的數值填進工匠數值，等於把
   算術丟回給使用者。

   來源分工：
     · 加成數值 ← Teamcraft foods.json／medicines.json（源自 ItemFood sheet：
                  Relative＝是否為百分比、Value/ValueHQ＝%、Max/MaxHQ＝上限）
     · 繁中名   ← data/items.json（＝tw-items 快照；查不到就是台服未開放，
                  依專案鐵則直接不收，不用英文補）
     · patch    ← 同上，交給前端 patch-gate.js 過濾

   只收含 Craftsmanship／Control／CP 任一加成的（製作用），採集用的 GP／獲得力不收。 */
async function buildConsumables(gamePatch, today) {
  const foods = await grab("foods.json", TC + "foods.json");
  const meds = await grab("medicines.json", TC + "medicines.json");
  const items = new Map(
    JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data.map((x) => [x.id, x])
  );

  // Teamcraft 的 Bonuses 是以屬性名為 key 的物件；只取這三個並縮成短鍵
  const KEYS = { Craftsmanship: "cms", Control: "ctl", CP: "cp" };

  const out = [];
  let noTw = 0;
  for (const [kind, list] of [["food", foods], ["medicine", meds]]) {
    for (const row of list) {
      const b = row.Bonuses || {};
      const picked = {};
      for (const [src, dst] of Object.entries(KEYS)) {
        const v = b[src];
        if (!v) continue;
        // [是否百分比, NQ 值, NQ 上限, HQ 值, HQ 上限]
        picked[dst] = [v.Relative ? 1 : 0, v.Value ?? 0, v.Max ?? 0,
                       v.ValueHQ ?? v.Value ?? 0, v.MaxHQ ?? v.Max ?? 0];
      }
      if (!Object.keys(picked).length) continue;

      const item = items.get(row.ID);
      if (!item) { noTw++; continue; }   // 台服未開放：不收，不用英文名補

      out.push({
        id: row.ID,
        name: item.name,
        kind,
        ilvl: row.LevelItem || item.ilvl || 0,
        patch: item.patch || null,
        bonuses: picked,
      });
    }
  }
  out.sort((a, b) => (b.ilvl - a.ilvl) || (a.id - b.id));

  if (noTw) console.log(`  · 排除 ${noTw} 個查無台服繁中名的料理／藥品（未開放）`);

  const consumOut = {
    schema: "craft-consumables",
    patch: gamePatch,
    updated: today,
    source: "teamcraft foods/medicines（加成數值，源自 ItemFood）× data/items.json（台服繁中名、patch）",
    count: out.length,
    data: out,
  };
  writeFileSync(join(DATA, "craft-consumables.json"), JSON.stringify(consumOut));
  const nf = out.filter((x) => x.kind === "food").length;
  console.log(`✓ data/craft-consumables.json — 料理 ${nf}、藥品 ${out.length - nf}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
