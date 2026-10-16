// 髮型頁補上「台服已開放、但 hairstyles.json 沒收」的髮型樣式（只 append，不動既有條目）
//
// 為什麼需要：data/hairstyles.json **沒有建置腳本**，台服升版時不會自己長出新條目。
// 2026-10-10 升 7.25 時查到：7.15 的「半雙馬尾」、7.2 的「阿澤瑪」從沒進來，7.25 又多「蘑菇頭」。
//
// 判定：items.json 裡名稱以「髮型樣式：」開頭、patch ≤ gamePatch，而且是台服客戶端
//   CharaMakeCustomize.HintItem 指到的道具（＝真的會解鎖髮型，不是同名的其他東西）。
// 欄位：id＝道具 id（與既有條目相同）、name＝道具台服名（含前綴，與既有條目相同）、
//   nameEn＝英文道具名（out_data/en-items.msgpack）、icon／patch＝items.json。
// sources 是頁面的篩選分類字串（不是取得細節）：ffxivcollect 的分類對成頁面既有的字（副本掉落、主線任務…），
//   ffxivcollect 標可交易的再加「市場板」（既有 15 筆的用法）。對不上的分類不硬塞。
//
// 執行：node scripts/patch-hairstyles-add-missing.mjs [--apply] [--offline]

import { readFileSync, existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode } from "@msgpack/msgpack";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { pnum } from "./lib/tw-releases.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const FILE = join(DATA, "hairstyles.json");
const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");
const today = new Date().toISOString().slice(0, 10);
const PREFIX = "髮型樣式：";

// ffxivcollect 分類 → 頁面的分類字串（只收頁面語彙裡說得通的）
const TAG = {
  Dungeon: "副本掉落", Raid: "副本掉落", "Chaotic Raid": "副本掉落", Trial: "副本掉落",
  "V&C Dungeon": "副本掉落", "Deep Dungeon": "副本掉落",
  "Main Scenario Quest": "主線任務", Quest: "任務", "Gold Saucer": "金碟遊樂場",
  Event: "聯名活動", Premium: "商城", "Occult Crescent": "新月島", "Cosmic Exploration": "宇宙探索",
};

async function main() {
  const db = JSON.parse(readFileSync(FILE, "utf8"));
  const have = new Set(db.data.map((x) => x.id));
  const gamePatch = JSON.parse(readFileSync(join(DATA, "_meta.json"), "utf8")).gamePatch;
  const items = JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).data;
  const hint = new Set((await loadTcSheet("CharaMakeCustomize", { offline: OFFLINE })).map((r) => Number(r.HintItem)).filter(Boolean));

  const cache = join(ROOT, "out_data", "cache", "fc-hairstyles.json");
  let fc;
  if (existsSync(cache)) fc = JSON.parse(await readFile(cache, "utf8"));
  else {
    if (OFFLINE) throw new Error(`--offline 但找不到 ${cache}`);
    const r = await fetch("https://ffxivcollect.com/api/hairstyles?limit=999");
    if (!r.ok) throw new Error(`ffxivcollect hairstyles HTTP ${r.status}`);
    fc = await r.json();
    await mkdir(dirname(cache), { recursive: true });
    await writeFile(cache, JSON.stringify(fc));
  }
  const fcByItem = new Map((fc.results || []).map((x) => [x.item_id, x]));
  const en = decode(readFileSync(join(ROOT, "out_data", "en-items.msgpack")));
  const enName = (id) => { const v = en[id] ?? en[String(id)]; return typeof v === "string" ? v : v?.en ?? null; };

  const added = [];
  for (const i of items.filter((x) => x.name.startsWith(PREFIX)).sort((a, b) => a.id - b.id)) {
    if (have.has(i.id) || !i.patch || pnum(i.patch) > pnum(gamePatch)) continue;
    if (!hint.has(i.id)) { console.log(`  略過 ${i.id} ${i.name}：不是 CharaMakeCustomize 的解鎖道具`); continue; }
    const f = fcByItem.get(i.id);
    const tags = [...new Set((f?.sources || []).map((s) => TAG[s.type]).filter(Boolean))];
    if (f?.tradeable) tags.push("市場板");
    // newIn＝站上補進的版本（「✨ 本次新增」靠它標出補漏的舊條目，見 assets/js/patch-gate.js 的 isNewSince）
    const entry = { id: i.id, name: i.name, nameEn: enName(i.id), icon: i.icon, sources: tags, patch: i.patch, newIn: gamePatch };
    added.push(entry);
    console.log(`  + ${i.id} ${i.name}｜${entry.nameEn}｜${i.patch}｜${tags.join("、") || "（無分類）"}`);
  }
  console.log(`\n台服已開放卻沒收的髮型：${added.length} 個`);
  if (!added.length || !APPLY) { if (added.length) console.log("（dry-run，未寫入；加 --apply 套用）"); return; }
  db.data = db.data.concat(added);
  db.count = db.data.length;
  db.updated = today;
  const raw = readFileSync(FILE, "utf8");
  await writeFile(FILE, raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
  console.log(`✅ 已寫入，共 ${db.count} 個`);
}

main().catch((e) => { console.error("錯誤：", e.message); process.exit(1); });
