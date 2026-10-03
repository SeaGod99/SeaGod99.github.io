// patch-collection-duty-links.mjs — 收藏頁的副本類取得方式補上 duty（連到副本圖鑑）
//
// 第二輪路線圖 duty-connect (d)：收藏頁寫「高難度副本：極神…」「副本掉落：…」，玩家想看那個副本
// 還掉什麼、要幾級，得自己切到副本圖鑑再搜一次。這支替副本類來源補 `duty: [[dungeons.json id, 名稱], …]`，
// 由共用的 CollectionTracker.sourceWhere() 統一畫成連結（各頁不用改）。
//
// 對應依序（任一步對不到就不接，不猜）：
//   ① 來源本身帶 contentId（幻卡）→ 直接用（contentId 就是 dungeons.json 的 id）
//   ② detail 裡出現 dungeons.json 的副本名 → 只認「兩邊都唯一」的名字，取最長的那個符合
//   ③ 寵物那種「共 N 個副本掉落」→ 用物品的 instance 來源經 scripts/lib/duty-map.mjs 反查；
//      N ≤ 3 且全部對得到時，順便把文字換成副本名（原本只寫「共 1 個副本掉落」，玩家不知道去哪刷）
//
// 冪等：跑第二次是 0 筆變動。重建收藏資料後再跑一次即可。
//
// 執行（repo 根目錄）：
//   node scripts/patch-collection-duty-links.mjs           # dry-run
//   node scripts/patch-collection-duty-links.mjs --apply   # 寫回（保留各檔原本的 minified／pretty 格式）

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { loadDutyMap } from "./lib/duty-map.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const apply = process.argv.includes("--apply");

const FILES = ["mounts", "minions", "orchestrion", "barding", "emotes", "triple-triad"];
const DUTY_TYPES = new Set(["副本", "副本掉落", "高難度副本", "異聞副本", "深層迷宮", "大型任務", "討伐戰", "多人副本", "多變迷宮"]);

function main() {
  const dm = loadDutyMap();
  const dungeons = [...dm.dungeons.values()];
  const cnt = new Map(); dungeons.forEach((d) => cnt.set(d.name, (cnt.get(d.name) || 0) + 1));
  const unique = dungeons.filter((d) => cnt.get(d.name) === 1 && d.name.length >= 2)
    .sort((a, b) => b.name.length - a.name.length);
  const om = decode(readFileSync(join(ROOT, "out_data", "obtainable-methods.msgpack")));
  const instOf = (itemId) => {
    const m = (om[itemId] || []).find((x) => x && x.type === "instance");
    return m && m.data ? m.data : null;
  };

  const stat = { "①": 0, "②": 0, "③": 0, miss: 0, same: 0 };
  const samples = {};
  for (const f of FILES) {
    const path = join(DATA, f + ".json");
    const raw = readFileSync(path, "utf8");
    const minified = !raw.includes('\n  "');
    const db = JSON.parse(raw);
    let changed = 0;
    for (const e of db.data) {
      for (const s of e.sources || []) {
        if (!DUTY_TYPES.has(s.type)) continue;
        // 已經接過且 id 都還有效的保留——規則③會把「共 N 個副本掉落」換成副本名，
        // 不保留的話下一輪規則②會從新文字比對出不同組合，來回翻動（冪等性）
        if (Array.isArray(s.duty) && s.duty.length && s.duty.every((d) => dm.dungeons.has(d[0]))) { stat.same++; continue; }
        let duty = null, rule = null, detail = s.detail;
        if (s.contentId != null && dm.dungeons.has(s.contentId)) {
          duty = [[s.contentId, dm.dungeons.get(s.contentId).name]]; rule = "①";
        }
        if (!duty && typeof s.detail === "string") {
          // 文字裡可能列了好幾個副本：全部找出來，去掉被別的符合名稱包含的短名（「真 X」vs「X」），最多 3 個
          const hits = unique.filter((d) => s.detail.includes(d.name));
          const keep = hits.filter((d) => !hits.some((o) => o !== d && o.name.includes(d.name)));
          if (keep.length && keep.length <= 3) { duty = keep.map((d) => [d.id, d.name]); rule = "②"; }
        }
        const mN = typeof s.detail === "string" && s.detail.match(/共 (\d+) 個副本掉落/);
        if (!duty && mN && e.itemId) {
          const ids = (instOf(e.itemId) || []).map((i) => dm.byInstance.get(i));
          const uniq = [...new Set(ids)];
          if (ids.length && uniq.length <= 3 && ids.every((x) => x != null)) {
            duty = uniq.map((id) => [id, dm.dungeons.get(id).name]); rule = "③";
            detail = s.detail.replace(mN[0], duty.map((d) => d[1]).join("、"));
          }
        }
        if (!duty) { stat.miss++; continue; }
        const same = JSON.stringify(s.duty) === JSON.stringify(duty) && s.detail === detail;
        if (same) { stat.same++; continue; }
        s.duty = duty; s.detail = detail;
        stat[rule]++; changed++;
        (samples[rule] ||= []).push(`${f}｜${e.name}｜${s.type}：${detail}`);
      }
    }
    if (apply && changed) writeFileSync(path, minified ? JSON.stringify(db) + (raw.endsWith("\n") ? "\n" : "") : JSON.stringify(db, null, 2) + "\n");
    console.log(`${f.padEnd(13)} 補 ${changed} 筆`);
  }
  console.log(`\n① contentId ${stat["①"]}、② 名稱 ${stat["②"]}、③ 反查 ${stat["③"]}；已是最新 ${stat.same}、對不到 ${stat.miss}`);
  for (const r of ["①", "②", "③"]) if (samples[r]) console.log(`  ${r} 例：${samples[r].slice(0, 2).join("　／　")}`);
  if (!apply) console.log("\n（dry-run，未寫入；加 --apply 才寫）");
}

main();
