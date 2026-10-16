// patch-npc-renames.mjs — 收藏頁取得方式裡的 NPC 舊名（Teamcraft）換成台服客戶端名
//
// 為什麼需要（2026-10-11）：npcs.json 改成台服客戶端名後（patch-npc-names-client.mjs），有 67 位 NPC 的名字
// 用字不同：芙莉妮→雜貨商芙莉妮、常花→雜貨商常花、蜜茲圖→蜜茲特、廣域交易商 茲姆圖→廣域交易商 茲姆特、船頭→船夫…
// 收藏頁的取得方式文字（社群站來的「芙莉妮：5,000 金幣（伊修加爾德上層）」）還寫舊名，造成兩個問題：
//   ① 畫面上與 NPC 商店目錄、市場頁的名字不一樣
//   ② patch-collection-shop-links.mjs「來源寫了 NPC 就只認同名的」→ 7 筆連到商店目錄的連結因此斷掉
//
// ⚠ **只動 NPC 名的位置，不做子字串替換**：「船頭小屋」是官方地名、「年輕的導師與粗暴的男子」是官方任務名、
//   「風景畫：船頭小屋」是官方物品名——它們都含舊 NPC 名，整串替換會把官方字串改壞。這支只認：
//     sources[].issuer.name、sources[].npcName、sources[].npc、幻卡的 npcName  →  整串等於舊名才換
//     sources[].detail                                              →  以「舊名：」或「舊名（」開頭才換開頭
//   另外「雜貨商柯特克」這種新名本身就含舊名（柯特克），所以一律比對整串／開頭，不會重複換。
//
// 對照表每次都重新推導（不依賴 git 歷史）：同一個 NPC id 的 Teamcraft 名（out_data/npcs.msgpack 的 twNpcs）
// 與台服客戶端 ENpcResident 名，摺疊中點後仍不同的才算；同一個舊名對到兩個以上新名的不收（不猜）。
//
// 執行：node scripts/patch-npc-renames.mjs [--apply] [--offline]
// 跑完：node scripts/patch-collection-shop-links.mjs --apply（把斷掉的商店連結接回來）

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { clientNameMap, cleanName, usable } from "./lib/client-names.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const APPLY = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");
const { decode } = createRequire(join(ROOT, "package.json"))("@msgpack/msgpack");
const fold = (s) => String(s || "").replace(/[·・‧•]/g, "・");
const FILES = ["mounts.json", "minions.json", "emotes.json", "ornaments.json", "barding.json", "orchestrion.json",
  "hairstyles.json", "triple-triad.json", "blue-magic.json", "gardening.json"];

/** 舊名（Teamcraft，已摺中點）→ 台服客戶端名 */
export async function npcRenameMap({ offline: off = true } = {}) {
  const tw = decode(readFileSync(join(ROOT, "out_data", "npcs.msgpack"))).twNpcs || {};
  const client = await clientNameMap("npc", { offline: off });
  const cand = new Map();
  for (const [id, v] of Object.entries(tw)) {
    const old = cleanName(v?.tw);
    const neu = client.get(Number(id));
    if (!usable(old) || !neu || fold(old) === fold(neu)) continue;
    const k = fold(old);
    if (!cand.has(k)) cand.set(k, new Set());
    cand.get(k).add(neu);
  }
  /* 第二個來源：npcs.json 的 nameTc（patch-npc-names-client.mjs 換名時留下的 Teamcraft 舊名）。
     out_data/npcs.msgpack 的 Teamcraft 表比 npcs.json 的來源新，有些舊名（蜜茲圖、廣域交易商 茲姆圖）它已經改掉了，推不出來。 */
  for (const n of JSON.parse(readFileSync(join(DATA, "npcs.json"), "utf8")).data) {
    if (!n.nameTc || !n.name || fold(n.nameTc) === fold(n.name)) continue;
    const k = fold(n.nameTc);
    if (!cand.has(k)) cand.set(k, new Set());
    cand.get(k).add(n.name);
  }
  return new Map([...cand].filter(([, s]) => s.size === 1).map(([k, s]) => [k, [...s][0]]));
}

async function main() {
  const map = await npcRenameMap({ offline });
  console.log(`NPC 改名對照：${map.size} 組（Teamcraft 舊名 → 台服客戶端名，一對一）`);
  const olds = [...map.keys()].sort((a, b) => b.length - a.length);   // 長的先比，避免「船頭」搶走「城下碼頭的船頭」
  const exact = (s) => (typeof s === "string" && map.has(fold(s)) ? map.get(fold(s)) : null);
  const prefix = (s) => {
    if (typeof s !== "string") return null;
    const f = fold(s);
    for (const o of olds) if (f.startsWith(o + "：") || f.startsWith(o + "（")) return map.get(o) + s.slice(o.length);
    return null;
  };
  let touched = 0;
  for (const file of FILES) {
    const raw = readFileSync(join(DATA, file), "utf8");
    const db = JSON.parse(raw);
    const changes = [];
    const fixField = (obj, k, how, label) => {
      const v = obj?.[k];
      const t = how(v);
      if (t && t !== v) { changes.push(`${label}：${v} → ${t}`); obj[k] = t; }
    };
    for (const e of db.data || []) {
      const label = `${e.id} ${e.name ?? ""}`;
      fixField(e, "npcName", exact, label);
      fixField(e, "npc", prefix, label);
      for (const s of Array.isArray(e.sources) ? e.sources : []) {
        if (!s || typeof s !== "object") continue;
        if (s.issuer) fixField(s.issuer, "name", exact, label);
        fixField(s, "npcName", exact, label);
        fixField(s, "npc", exact, label);
        fixField(s, "detail", prefix, label);
      }
    }
    console.log(`${file.padEnd(18)} ${changes.length} 處`);
    for (const c of changes.slice(0, 12)) console.log(`    ${c}`);
    if (changes.length > 12) console.log(`    …另 ${changes.length - 12} 處`);
    if (APPLY && changes.length) {
      if (db.updated) db.updated = new Date().toISOString().slice(0, 10);
      await writeFile(join(DATA, file), raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
      touched++;
    }
  }
  console.log(APPLY ? `✓ 已寫入 ${touched} 個檔` : "（dry-run，未寫入；加 --apply 套用）");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
