// duty-map.mjs — Teamcraft 副本 id（InstanceContent row id）→ data/dungeons.json 的 id（ContentFinderCondition row id）
//
// 兩邊是**不同的 id 空間**：dungeons.json 的 id 是副本搜尋器的 CFC id（174＝死者宮殿 1–10 層），
// obtainable-methods／tw-instances 用的是副本本體的 InstanceContent id。直接拿兩邊的數字比只有約 100 個
// 「剛好重疊」，而且多數對錯（同 §4.10 外站 id 撞號）。
//
// 對應順序：
//   ① id：out_data/cfc-content.json（CFC id → InstanceContent id）反查。一個 InstanceContent 對到多個 CFC 的不收。
//   ② 名稱：①對不到時，用 tw-instances 的台服名比 dungeons.json 的 name——**只收兩邊都唯一的名字**
//      （dungeons.json 有 5 組同名、tw-instances 有 10 個名字對多個 id，如一般／高難度的阿修羅殲滅戰），
//      同名的寧可不接，否則掉落會被安靜地併到錯的那張卡。
//
// 用法：
//   import { loadDutyMap } from "./lib/duty-map.mjs";
//   const dm = loadDutyMap();           // { byInstance: Map<instanceId, dungeonId>, dungeons: Map<id, entry>, stat }

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadDutyMap() {
  const dungeons = JSON.parse(readFileSync(join(ROOT, "data", "dungeons.json"), "utf8")).data;
  const tw = JSON.parse(readFileSync(join(ROOT, "out_data", "tw-instances.json"), "utf8"));
  const cfc = JSON.parse(readFileSync(join(ROOT, "out_data", "cfc-content.json"), "utf8"));
  const byId = new Map(dungeons.map((d) => [d.id, d]));

  const cfcOfContent = new Map();
  for (const [c, content] of Object.entries(cfc)) {
    const a = cfcOfContent.get(content) || []; a.push(Number(c)); cfcOfContent.set(content, a);
  }
  const nameCount = new Map(); dungeons.forEach((d) => nameCount.set(d.name, (nameCount.get(d.name) || 0) + 1));
  const twNameCount = new Map();
  for (const v of Object.values(tw)) if (v && v.tw) twNameCount.set(v.tw, (twNameCount.get(v.tw) || 0) + 1);
  const byUniqueName = new Map(dungeons.filter((d) => nameCount.get(d.name) === 1).map((d) => [d.name, d.id]));

  const byInstance = new Map();
  const stat = { viaId: 0, viaName: 0, ambiguous: 0, conflict: [] };
  const ids = new Set([...Object.keys(tw).map(Number), ...cfcOfContent.keys()]);
  for (const inst of ids) {
    let did = null;
    const cs = (cfcOfContent.get(inst) || []).filter((c) => byId.has(c));
    if (cs.length === 1) { did = cs[0]; stat.viaId++; }
    else if (cs.length > 1) stat.ambiguous++;
    const twn = tw[inst] && tw[inst].tw;
    const byName = twn && twNameCount.get(twn) === 1 ? byUniqueName.get(twn) : undefined;
    if (did != null && byName != null && byName !== did) stat.conflict.push(`${inst} ${twn}: id→${did} 名稱→${byName}`);
    if (did == null && byName != null) { did = byName; stat.viaName++; }
    if (did != null) byInstance.set(inst, did);
  }
  return { byInstance, dungeons: byId, stat };
}
