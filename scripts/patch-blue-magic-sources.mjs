// 青魔法「取得方式」＋繁中招式名 權威化（來源：ffxiv-collection-tc）
//
// 來源檔：data/bluemage-sources-tc.json
//   ＝ cycleapple/ffxiv-collection-tc 的 data/bluemage_sources.json（繁中收藏站）
//   https://github.com/cycleapple/ffxiv-collection-tc
//   FFXIV 無官方繁中版；此站為台灣玩家社群繁中譯名與手帳取得方式整理。
//
// 本檔以該來源「完整覆寫」每個法術的 name / learnFrom，並移除舊的 learnFromMob：
//   method.type 映射：
//     special「自動習得」      → learnFrom {type:'預設'}（前端顯示「初始習得」）
//     special「…天青圖騰…」    → learnFrom {type:'圖騰', detail:圖騰名, cond, npc, npcLocation}
//                                （前端顯示「兌換習得」）
//     dungeon / raid / trail   → learnFrom {type:'副本', detail:副本名, mobs:[怪物…]}
//     mob / fate               → learnFrom {type:'野外', detail:地圖名, mobs:[怪物…]}
//   假面狂歡（Masked Carnivale）關卡無法習得青魔法 → 名稱以「假面狂歡」開頭的 dungeon
//     項目一律排除（已確認排除後無任何法術變零來源）。
//   同一 (type, 地點) 合併，怪物去重。
//
// 完整覆寫＝冪等，與執行順序無關。對齊以手帳編號 no 為準。
// 執行：node scripts/patch-blue-magic-sources.mjs ／ 重建 blue-magic.json 後需再跑。

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(DATA, "blue-magic.json");
const SRC = join(DATA, "bluemage-sources-tc.json");

const isCarnival = (s) => /^假面狂歡/.test(s || "");

// 解析 special 圖騰文字：「<條件>可從[<地點>]的[<NPC>]處獲得[<圖騰>]」
function parseTotem(text) {
  const m = text.match(/^(.*?)可從\[(.+?)\]的\[(.+?)\]處獲得\[(.+?)\]/);
  if (!m) return { detail: "天青圖騰", cond: text.trim() };
  return {
    detail: m[4].trim(),               // 圖騰名（天青圖騰）
    cond: m[1].trim().replace(/後$/, "後"), // 解鎖條件（學習N個技能後…）
    npc: m[3].trim(),
    npcLocation: m[2].trim(),
  };
}

function buildLearnFrom(methods) {
  const map = new Map();   // key = type|loc → { type, detail, mobs:Set }
  let totem = null, init = false;

  for (const m of (methods || [])) {
    if (m.type === "special") {
      if (/自動習得/.test(m.text)) init = true;
      else totem = parseTotem(m.text);       // 其餘 special 皆為天青圖騰兌換
      continue;
    }
    let type, loc;
    if (m.type === "dungeon" || m.type === "raid" || m.type === "trail") { type = "副本"; loc = m.name; }
    else if (m.type === "mob" || m.type === "fate") { type = "野外"; loc = m.map; }
    else continue;
    if (!loc || isCarnival(loc)) continue;   // 排除假面狂歡

    const key = type + "|" + loc;
    if (!map.has(key)) map.set(key, { type, detail: loc, mobs: new Set() });
    if (m.mob) String(m.mob).split(/[、,]/).forEach(x => { const t = x.trim(); if (t) map.get(key).mobs.add(t); });
  }

  const learnFrom = [];
  if (init) learnFrom.push({ type: "預設" });
  if (totem) learnFrom.push({ type: "圖騰", ...totem });
  for (const v of map.values()) {
    const e = { type: v.type, detail: v.detail };
    if (v.mobs.size) e.mobs = [...v.mobs];
    learnFrom.push(e);
  }
  return learnFrom;
}

const tc = JSON.parse(await readFile(SRC, "utf-8"));
const byNo = new Map();
for (const s of tc) byNo.set(Number(s.no), s);

const json = JSON.parse(await readFile(OUT, "utf-8"));
let nameSet = 0, lfSet = 0, mobRemoved = 0, miss = [];

for (const spell of json.data) {
  const s = byNo.get(spell.no);
  if (!s) { miss.push(spell.no); continue; }
  if (s.spell && spell.name !== s.spell) { spell.name = s.spell; nameSet++; }
  spell.learnFrom = buildLearnFrom(s.method);
  lfSet++;
  if ("learnFromMob" in spell) { delete spell.learnFromMob; mobRemoved++; }
}

const TMP = join(tmpdir(), "blue_magic_sources.json");
await writeFile(TMP, JSON.stringify(json, null, 2) + String.fromCharCode(10), "utf-8");
JSON.parse(await readFile(TMP, "utf-8"));   // 完整性檢查
await copyFile(TMP, OUT);

console.log("覆寫 learnFrom：" + lfSet + "｜更新名稱：" + nameSet + "｜移除 learnFromMob：" + mobRemoved);
if (miss.length) console.log("TC 來源缺 no：" + miss.join(", "));
