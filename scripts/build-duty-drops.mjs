// build-duty-drops.mjs — 產生 data/duty-drops.json（副本圖鑑的「資料列為此副本的產出」）
//
// 第一輪路線圖的 dungeon-codex 提案有「解鎖」與「掉落」兩半，09-26 只做了解鎖（32/520），
// 掉落那半沒做也沒寫理由。資料其實在：out_data/obtainable-methods.msgpack 的 instance 來源
// （9,079 組 物品×副本）——站內 item-sources 分片層早就拿它當取得管道在用了，這裡只是反過來查。
//
// 副本 id 對應走 scripts/lib/duty-map.mjs：Teamcraft 的副本 id 是 InstanceContent，dungeons.json 的是
// ContentFinderCondition，兩個空間不同，靠 out_data/cfc-content.json 反查，對不到才退回「兩邊都唯一的名稱」。
//
// 措辭與範圍（鐵則 2、3）：
//   · 只說「資料列為此副本的產出」——**不寫機率、不寫必掉、不排行**。上游是 Teamcraft 整理的掉落資料，
//     可能不完整；頁面要寫出來源。
//   · 物品名只用台服名（items.json＋isTw），對不到的不列。
//
// 每件物品帶分類與連結：
//   收藏道具 → 連該收藏頁的 ?id=（值＝各頁 keyOf 的輸出，見 docs/deep-links.md §2）
//   裝備（data/equip.json 的 items）→「裝備」；其餘 →「其他」；可交易的另外連市場頁
//
// 執行（repo 根目錄）：
//   node scripts/build-duty-drops.mjs           # dry-run，印覆蓋率與大小
//   node scripts/build-duty-drops.mjs --apply   # 寫入（直寫 minified）

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";
import { isTw } from "./lib/tw-text.mjs";
import { loadDutyMap } from "./lib/duty-map.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const apply = process.argv.includes("--apply");
const J = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

// 分類代號（前端依這個順序分區）
const CATS = ["坐騎", "寵物", "樂譜", "幻卡", "表情", "髮型", "鳥鞍", "時尚配飾", "裝備", "其他"];
const COLL = [
  ["mounts", "坐騎", "collections/mounts/", (e) => "id:" + e.id],
  ["minions", "寵物", "minions/", (e) => String(e.id)],          // 寵物頁 keyOf 是純 id
  ["orchestrion", "樂譜", "collections/orchestrion/", (e) => "id:" + e.id],
  ["emotes", "表情", "collections/emotes/", (e) => "id:" + e.id],
  ["barding", "鳥鞍", "collections/barding/", (e) => "id:" + e.id],
  ["ornaments", "時尚配飾", "collections/ornaments/", (e) => "id:" + e.id],
];

function main() {
  const dm = loadDutyMap();
  const items = new Map(J("items.json").data.map((i) => [i.id, i]));
  const equip = J("equip.json").items || {};
  const equipSet = new Set(Array.isArray(equip) ? equip.map((x) => x.id ?? x) : Object.keys(equip).map(Number));

  const link = new Map();   // itemId → [分類, 頁面, key]
  for (const [f, cat, page, key] of COLL) {
    for (const e of J(f + ".json").data) if (e.itemId && !link.has(e.itemId)) link.set(e.itemId, [cat, page, key(e)]);
  }
  for (const h of J("hairstyles.json").data) if (items.has(h.id)) link.set(h.id, ["髮型", "collections/hairstyles/", "id:" + h.id]);   // 髮型的 id 就是樣式書道具 id（39/39）
  // 幻卡：卡片沒有 itemId，道具名是「九宮幻卡：X」，用唯一卡名對回
  const tt = J("triple-triad.json").data;
  const ttCount = new Map(); tt.forEach((c) => ttCount.set(c.name, (ttCount.get(c.name) || 0) + 1));
  const ttByName = new Map(tt.filter((c) => ttCount.get(c.name) === 1).map((c) => [c.name, c.id]));
  for (const it of items.values()) {
    const m = it.name && it.name.match(/^九宮幻卡：(.+)$/);
    if (m && ttByName.has(m[1])) link.set(it.id, ["幻卡", "collections/triple-triad/", "id:" + ttByName.get(m[1])]);
  }

  const om = decode(readFileSync(join(ROOT, "out_data", "obtainable-methods.msgpack")));
  const byDuty = new Map();
  const stat = { pairs: 0, mapped: 0, noTw: 0 };
  for (const [iidStr, ms] of Object.entries(om)) {
    const iid = Number(iidStr);
    const it = items.get(iid);
    for (const m of ms || []) {
      if (m.type !== "instance") continue;
      for (const inst of m.data || []) {
        stat.pairs++;
        const did = dm.byInstance.get(inst);
        if (did == null) continue;
        if (!it || !isTw(it.name)) { stat.noTw++; continue; }
        stat.mapped++;
        const a = byDuty.get(did) || new Set(); a.add(iid); byDuty.set(did, a);
      }
    }
  }

  // 物品字典：[名稱, 分類序號, 連結頁, key, 可交易]（只收被引用到的）
  const dict = {};
  const catOf = (iid) => (link.get(iid) || [equipSet.has(iid) ? "裝備" : "其他"])[0];
  const data = {};
  for (const [did, set] of [...byDuty].sort((a, b) => a[0] - b[0])) {
    const ids = [...set].sort((a, b) => CATS.indexOf(catOf(a)) - CATS.indexOf(catOf(b)) || a - b);
    data[did] = ids;
    for (const iid of ids) {
      if (dict[iid]) continue;
      const it = items.get(iid), l = link.get(iid);
      dict[iid] = [it.name, CATS.indexOf(catOf(iid)), l ? l[1] : 0, l ? l[2] : 0, it.marketable ? 1 : 0];
    }
  }

  const out = {
    schema: "duty-drops",
    updated: new Date().toISOString().slice(0, 10),
    source: "out_data/obtainable-methods.msgpack 的 instance 來源（Teamcraft）× scripts/lib/duty-map.mjs × data/items.json",
    note: "「資料列為此副本的產出」：上游整理的掉落資料，不含機率、可能不完整。items 的欄位＝[名稱, cats 序號, 收藏頁路徑或 0, 該頁 ?id= 的值或 0, 可交易 1/0]",
    cats: CATS,
    count: Object.keys(data).length,
    items: dict,
    data,
  };
  const json = JSON.stringify(out);
  const byCat = {};
  for (const v of Object.values(dict)) byCat[CATS[v[1]]] = (byCat[CATS[v[1]]] || 0) + 1;
  const dungeons = J("dungeons.json").data;
  const byType = {};
  for (const d of dungeons) { const t = byType[d.type] || (byType[d.type] = [0, 0]); t[1]++; if (data[d.id]) t[0]++; }
  console.log(`物品×副本 ${stat.pairs} 組 → 對得到副本且有台服名 ${stat.mapped}（對得到副本但物品無台服名 ${stat.noTw}）`);
  console.log(`副本 ${out.count}／${dungeons.length}；物品 ${Object.keys(dict).length} 件`);
  console.log(`依類型：${Object.entries(byType).map(([t, [a, b]]) => `${t} ${a}/${b}`).join("、")}`);
  console.log(`物品分類：${CATS.map((c) => `${c} ${byCat[c] || 0}`).join("、")}`);
  console.log(`大小 ${(json.length / 1024).toFixed(0)}KB／gzip ${(gzipSync(json).length / 1024).toFixed(1)}KB`);
  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  writeFileSync(join(DATA, "duty-drops.json"), json);
  console.log("\n✓ data/duty-drops.json（直寫 minified）");
}

main();
