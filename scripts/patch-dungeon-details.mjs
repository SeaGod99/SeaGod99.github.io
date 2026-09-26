// patch-dungeon-details.mjs — 把 dungeons.json 裡一直空著的欄位補起來
//
// `build-dungeons.mjs` 只抓得到 ContentFinderCondition 的骨架（名稱／等級／人數／圖），
// 檔尾的 TODO 列了四項沒補的，其中 unlock／rewards 至今 **0% 覆蓋**。這支補得回來的部分：
//
//   timeLimit   `InstanceContent.TimeLimitmin` —— **674/674 全有**，站內別處沒有這個數字
//   clearExp    `InstanceContent.InstanceClearExp`（只有舊內容有，新內容改成隨等級縮放）
//   clearGil    `InstanceContent.InstanceClearGil`
//   unlock      `Quest.InstanceContentUnlock` → IC → CFC，台服任務名走 out_data/tw-quests.json
//
// ── 查過但補不回來的，寫在這裡免得下一輪重查 ────────────────────────────
// · `ContentFinderCondition.UnlockCriteria`／`UnlockType`**整表都是 0**，不是解鎖任務
//   （前 16 個經典副本逐一看過）。名字看起來像，但不是那個東西。
// · `Quest.InstanceContentUnlock` **只有 48 筆任務、42 個相異副本**。多數副本是主線解鎖，
//   而那個關聯在任務腳本裡、不在 sheet 欄位上。所以**解鎖任務覆蓋率本來就低**，
//   補不到的一律留 null 讓前端不顯示——不要為了好看去猜。
// · `InstanceContent.BNpcBaseBoss` 只有 19% 有值，且是 BNpcBase（模型）不是 BNpcName（名字），
//   對不回可顯示的 BOSS 名。**bosses 這欄這輪不動。**
//
// 執行（repo 根目錄）：
//   node scripts/patch-dungeon-details.mjs            # dry-run，印報告
//   node scripts/patch-dungeon-details.mjs --apply    # 寫入（直寫 minified，與現檔一致）
//   node scripts/patch-dungeon-details.mjs --offline  # 只用 out_data/cache 的快照

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { xiv } from "./lib/xivapi.mjs";
import { isTw } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

async function main() {
  const db = JSON.parse(await readFile(join(DATA, "dungeons.json"), "utf8"));
  const twQuests = JSON.parse(await readFile(join(ROOT, "out_data", "tw-quests.json"), "utf8"));

  const icRows = await xiv.sheet(
    "InstanceContent",
    "ContentFinderCondition@as(raw),InstanceClearExp,InstanceClearGil,TimeLimitmin",
    { limit: 500, cache: "out_data/cache/instance-content.json", offline, label: "  InstanceContent：" }
  );
  const questRows = await xiv.sheet(
    "Quest",
    "Name,InstanceContentUnlock@as(raw),ClassJobLevel",
    { limit: 500, cache: "out_data/cache/quests-unlock.json", offline, label: "  Quest：" }
  );

  // IC row id → CFC id（dungeons.json 的 id 就是 CFC id）
  const icToCfc = new Map();
  const byCfc = new Map();
  for (const r of icRows) {
    const cfc = r.f["ContentFinderCondition@as(raw)"];
    if (!cfc) continue;
    icToCfc.set(r.id, cfc);
    byCfc.set(cfc, r.f);
  }

  /* 解鎖任務：Quest → InstanceContent → CFC。
     同一個副本可能被多筆任務指到（不同種族的起始任務共用一個副本），
     **取任務 id 最小的那筆**——那是最早開放的版本，也讓重跑的結果穩定。 */
  const unlockByCfc = new Map();
  for (const q of questRows) {
    const ic = q.f["InstanceContentUnlock@as(raw)"];
    if (!ic) continue;
    const cfc = icToCfc.get(ic);
    if (!cfc) continue;
    const prev = unlockByCfc.get(cfc);
    // ⚠ `ClassJobLevel` 回的是陣列（每個職業一格，`[19, 0]`），直接印會變成 "Lv19,0"
    const lv = Array.isArray(q.f.ClassJobLevel) ? q.f.ClassJobLevel.find((x) => x > 0) : q.f.ClassJobLevel;
    if (!prev || q.id < prev.id) unlockByCfc.set(cfc, { id: q.id, level: lv || null });
  }

  const stat = {
    time: 0, exp: 0, gil: 0, unlock: 0, nullImg: 0,
    unlockNoTw: 0, noIc: 0, unchanged: 0,
  };
  const samples = [];

  for (const d of db.data) {
    const ic = byCfc.get(d.id);
    let touched = false;

    if (ic) {
      if (ic.TimeLimitmin && d.timeLimit !== ic.TimeLimitmin) { d.timeLimit = ic.TimeLimitmin; stat.time++; touched = true; }
      if (ic.InstanceClearExp) { d.clearExp = ic.InstanceClearExp; stat.exp++; touched = true; }
      if (ic.InstanceClearGil) { d.clearGil = ic.InstanceClearGil; stat.gil++; touched = true; }
    } else {
      stat.noIc++;
    }

    /* `image` 欄有 80 筆指向 `000000_hr1.png`——那是遊戲資料的「沒有圖」佔位 id，
       不是真的有一張叫 000000 的圖。留著的話前端每次載入都會打出一串 404，
       而且 `no-img` 的退場要等 onerror 才觸發（畫面會閃一下）。改成 null 讓前端一開始就知道。 */
    if (d.image && /\/000000(_hr1)?\.png$/.test(d.image)) { d.image = null; stat.nullImg++; touched = true; }

    const u = unlockByCfc.get(d.id);
    if (u) {
      /* 台服名查不到就整筆不補（鐵則：不落英文／日文）。
         `isTw()` 會擋掉未翻譯的日文原文與遊戲內部佔位列（知識庫 §4.72）。 */
      const tw = twQuests[u.id] && twQuests[u.id].tw;
      if (isTw(tw)) {
        d.unlock = { type: "quest", questName: tw, questId: u.id, questLevel: u.level };
        stat.unlock++;
        touched = true;
        if (samples.length < 8) samples.push(`${d.name} ← 任務「${tw}」(Lv${u.level ?? "?"})`);
      } else {
        stat.unlockNoTw++;
      }
    }

    if (!touched) stat.unchanged++;
  }

  const n = db.data.length;
  const pct = (x) => `${x}/${n}（${Math.round((x / n) * 100)}%）`;
  console.log(`\n副本 ${n} 筆`);
  console.log(`  時限 timeLimit   ${pct(stat.time)}`);
  console.log(`  通關 EXP         ${pct(stat.exp)}（只有舊內容有，新內容隨等級縮放）`);
  console.log(`  通關 gil         ${pct(stat.gil)}`);
  console.log(`  解鎖任務         ${pct(stat.unlock)}${stat.unlockNoTw ? `；台服名查無而跳過 ${stat.unlockNoTw} 筆` : ""}`);
  console.log(`  image 是 000000 佔位 → 改成 null：${stat.nullImg} 筆`);
  console.log(`  沒有對應 InstanceContent：${stat.noIc} 筆（幻想戰／任務戰鬥那類本來就不在這張表）`);
  console.log(`  完全沒動到：${stat.unchanged} 筆`);
  if (samples.length) console.log(`\n解鎖任務樣本：\n  ${samples.join("\n  ")}`);

  if (!apply) {
    console.log("\n（dry-run，未寫入；加 --apply 才寫）");
    return;
  }
  db.updated = new Date().toISOString().slice(0, 10);
  // 現檔就是 minified（單行），維持一致；dungeons.json 不在 minify-data.mjs 的清單裡
  await writeFile(join(DATA, "dungeons.json"), JSON.stringify(db));
  console.log("\n✓ data/dungeons.json（直寫 minified）");
}

main().catch((e) => { console.error(e); process.exit(1); });
