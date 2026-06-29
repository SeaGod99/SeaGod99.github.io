// 表情「動作指南書」取得方式修正
//
// 問題：原本 163 個表情的取得方式是「習得自『演技教材·X』」——只說從哪本教材學，
//   卻沒講那本動作指南書（道具）怎麼取得，等於沒講。
//
// 修法：針對 type==="動作指南書" 的表情，改成「道具的真實取得來源」：
//   1) 優先用 TC 繁中收藏站（data/emotes-sources-tc.json，依繁中名/教材名對齊）——
//      含 NPC／幣／地點等完整繁中細節。
//   2) TC 沒有者，用 ffxivcollect（data/emotes-sources-fxc.json，依英文名 nameEn 對齊）
//      取得「真實來源類別」，譯成本站繁中分類；detail 沿用原本的繁中道具名「演技教材·X」。
//   3) 兩者皆無者，保留原樣。
// 其餘類型（預設／任務／成就等）不動。
//
// 來源檔：
//   data/emotes-sources-tc.json   ＝ cycleapple/ffxiv-collection-tc（繁中）
//   data/emotes-sources-fxc.json  ＝ ffxivcollect.com/api/emotes（英文上游，僅取類別）
//
// 完整覆寫＝冪等。執行：node scripts/patch-emotes-sources.mjs ／ 重建 emotes.json 後需再跑。

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "emotes.json");

const normZh = (s) => (s || "").replace(/^表情[:：]/, "").replace(/\s/g, "").trim();
const normEn = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// TC Source.Type（英文大類）→ 本站繁中分類（同 patch-mounts-tc.mjs）
function mapTcType(tcType, name) {
  switch (tcType) {
    case "Achievement": return "成就";
    case "MogStation": case "購買": return "商城";
    case "Crafting": return "製作";
    case "PvP": return "PvP";
    case "Event": return "節慶活動";
    case "Shop": case "Gil": return "商店";
    case "Quest": return /祭/.test(name) ? "節慶活動" : "任務";
    case "Instance":
      if (/異聞/.test(name)) return "異聞副本";
      if (/^極|零式|^絕|終極|神話/.test(name)) return "高難度副本";
      return "副本掉落";
    case "Container":
      if (/無人島/.test(name)) return "無人島";
      if (/寶藏/.test(name)) return "藏寶圖";
      if (/慶典|禮物|祭/.test(name)) return "節慶活動";
      return "寶箱";
    default: return tcType;
  }
}

// ffxivcollect type → 本站繁中分類
const FXC_TYPE = {
  Premium: "商城", Purchase: "商店", Quest: "任務", Event: "節慶活動",
  PvP: "PvP", "Gold Saucer": "金碟", "Treasure Hunt": "藏寶圖",
  Skybuilders: "伊修加德重建", "Cosmic Exploration": "宇宙探索",
  "Deep Dungeon": "深層迷宮", "V&C Dungeon": "異聞副本",
  "Occult Crescent": "新月島", Eureka: "尤雷卡", Bozja: "博茲雅",
  Tribal: "部族任務", Achievement: "成就", Raid: "高難度副本",
  Hunts: "狩獵", Other: "其他",
};

const json = JSON.parse(await readFile(OUT, "utf-8"));

const tc = JSON.parse(await readFile(join(DATA, "emotes-sources-tc.json"), "utf-8"));
const tcByName = {};
for (const e of tc) if (e.sources && e.sources.length) tcByName[normZh(e.name)] = e;

const fxc = JSON.parse(await readFile(join(DATA, "emotes-sources-fxc.json"), "utf-8"));
const fxcByName = {};
for (const e of fxc) fxcByName[normEn(e.nameEn)] = e;

let fromTC = 0, fromFXC = 0, kept = 0;

for (const e of json.data) {
  const bookSrc = (e.sources || []).find((s) => s.type === "動作指南書");
  if (!bookSrc) continue; // 只處理動作指南書類

  // 原繁中道具名「演技教材·X」（從 detail「習得自『…』」抽出，抽不到就用整段）
  const itemName = (bookSrc.detail.match(/「(.+?)」/) || [])[1] || bookSrc.detail;

  // 1) TC：依繁中名，其次教材名
  let t = tcByName[normZh(e.name)] || tcByName[normZh(itemName)];
  if (t) {
    e.sources = t.sources.map((s) => ({ type: mapTcType(s.type, s.name), detail: s.name }));
    fromTC++;
    continue;
  }

  // 2) ffxivcollect：依英文名取類別，detail 用原繁中道具名
  const f = e.nameEn ? fxcByName[normEn(e.nameEn)] : null;
  if (f && f.types.length) {
    e.sources = f.types.map((ty) => ({ type: FXC_TYPE[ty] || ty, detail: itemName }));
    fromFXC++;
    continue;
  }

  kept++; // 兩來源皆無 → 保留原樣
}

const TMP = join(tmpdir(), "emotes_sources.json");
await writeFile(TMP, JSON.stringify(json, null, 2) + "\n", "utf-8");
JSON.parse(await readFile(TMP, "utf-8")); // 完整性檢查
await copyFile(TMP, OUT);

console.log("動作指南書修正：TC 來源 " + fromTC + "｜ffxivcollect 類別 " + fromFXC + "｜無來源保留 " + kept);
