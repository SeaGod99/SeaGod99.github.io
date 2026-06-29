// 樂譜（orchestrion）取得方式補完
//
// 問題：原 sources 只有繁中「type」（金碟/商店/副本掉落…），但 584/852 項 detail 是空的，
//   只說類別卻沒講細節（哪個 NPC／副本／材料）。
//
// 修法（比照表情 patch-emotes-sources.mjs）：
//   1) 優先 TC 繁中（data/orchestrion-sources-tc.json，依繁中名對齊）——含 NPC／幣／地點
//      等完整繁中細節；type 一併改用 TC 對應（與 detail 一致）。
//   2) TC 沒有者，用 ffxivcollect（data/orchestrion-sources-fxc.json，依英文名 nameEn 對齊）
//      取真實「類別」，譯成本站繁中分類；detail 留空（ffxivcollect 的細節是英文，不採用）。
//   3) 兩者皆無 → 保留原樣。
//   名稱一律不動（台服官方含正規英文曲名，如 Answers / Heavensward）。
//
// 完整覆寫＝冪等。執行：node scripts/patch-orchestrion-sources.mjs ／ 重建後需再跑。

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "orchestrion.json");

const normZh = (s) => (s || "").replace(/\s/g, "").trim();
const normEn = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// TC Source.Type → 本站繁中分類（Instance/Container 依 detail 名細分）
function mapTcType(tcType, name) {
  switch (tcType) {
    case "MogStation": return "商城";
    case "Quest": return "任務";
    case "Shop": case "Gil": return "商店";
    case "Crafting": return "製作";
    case "Event": return "節慶活動";
    case "Achievement": return "成就";
    case "Submarine": return "探索航行";
    case "FATE": return "危命任務";
    case "Container":
      if (/寶藏/.test(name)) return "藏寶圖";
      if (/無人島/.test(name)) return "無人島";
      return "其他";
    case "Instance":
      if (/死者宮殿|天獄之塔|歐米茄之檻|深層/.test(name)) return "深層迷宮";
      if (/異聞/.test(name)) return "異聞副本";
      if (/零式|^極|絕|神話/.test(name)) return "高難度副本";
      return "副本掉落";
    default: return tcType;
  }
}

// ffxivcollect type → 本站繁中分類
const FXC_TYPE = {
  Achievement: "成就", "Cosmic Exploration": "宇宙探索", Premium: "商城",
  Raid: "副本掉落", Quest: "任務", Voyages: "探索航行", "Treasure Hunt": "藏寶圖",
  Trial: "高難度副本", Dungeon: "副本掉落", "V&C Dungeon": "異聞副本",
  Event: "節慶活動", "Gold Saucer": "金碟", Tribal: "部族任務",
  "Deep Dungeon": "深層迷宮", "Occult Crescent": "新月島", "Wondrous Tails": "天書奇談",
  Crafting: "製作", FATE: "危命任務", Hunts: "狩獵", Purchase: "商店",
  "Island Sanctuary": "無人島", Skybuilders: "伊修加德重建", PvP: "PvP",
  Bozja: "博茲雅", Gathering: "採集", Eureka: "尤雷卡", Other: "其他",
};

const json = JSON.parse(await readFile(OUT, "utf-8"));

const tc = JSON.parse(await readFile(join(DATA, "orchestrion-sources-tc.json"), "utf-8"));
const tcByName = {};
for (const e of tc) tcByName[normZh(e.name)] = e;

const fxc = JSON.parse(await readFile(join(DATA, "orchestrion-sources-fxc.json"), "utf-8"));
const fxcByName = {};
for (const e of fxc) fxcByName[normEn(e.nameEn)] = e;

let fromTC = 0, fromFXC = 0, kept = 0;

for (const r of json.data) {
  const t = tcByName[normZh(r.name)];
  if (t) {
    r.sources = t.sources.map((s) => ({ type: mapTcType(s.type, s.name), detail: s.name }));
    fromTC++;
    continue;
  }
  const f = r.nameEn ? fxcByName[normEn(r.nameEn)] : null;
  if (f && f.types.length) {
    r.sources = f.types.map((ty) => ({ type: FXC_TYPE[ty] || ty, detail: null }));
    fromFXC++;
    continue;
  }
  kept++;
}

const TMP = join(tmpdir(), "orchestrion_sources.json");
await writeFile(TMP, JSON.stringify(json, null, 2) + "\n", "utf-8");
JSON.parse(await readFile(TMP, "utf-8"));
await copyFile(TMP, OUT);

console.log("取得方式：TC 繁中細節 " + fromTC + "｜ffxivcollect 類別 " + fromFXC + "｜保留原樣 " + kept);
