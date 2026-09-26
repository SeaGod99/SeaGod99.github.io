// build-gc-supply.mjs — 產生 data/gc-supply.json（軍票取得成本排行的資料層）
//
// 站內的「貨幣變現排行」只回答「軍票換什麼划算」，反方向的「**軍票怎麼賺**」沒人答。
// 遊戲裡兩條主要途徑都在這份資料裡：
//
//   ① 軍需品調達任務：每天各職業有指定的交納品，交了給軍票＋經驗。
//      來源 Teamcraft gc-supply.json（2,518 筆，**全部有台服名**），
//      結構是「輪替日 → 職業 → [{itemId, count, reward{xp,seals}}]」。
//      ⚠ 刻意**不算「今天是第幾天」**——輪替與現實日期的對應沒有可靠來源，
//        猜錯會讓整頁在講錯的東西。改成「依職業列出所有可能的交納品」，
//        使用者自己對照遊戲內當天的指定即可，而「這件交了值多少軍票」本來就是固定的。
//
//   ② 專家交納：把不要的裝備交給軍需官，依**裝備等級**換軍票。
//      來源 XIVAPI v2 GCSupplyDutyReward，**row_id 就是 ilvl**（實測 ilvl 1→6、499→1724）。
//
// 職業名取自 data/equip.json 的 names（jobId → 代碼 → 台服名）。
//
// 執行（repo 根目錄）：
//   node scripts/build-gc-supply.mjs            # dry-run
//   node scripts/build-gc-supply.mjs --apply
//   node scripts/build-gc-supply.mjs --offline  # 用 out_data/cache 快取

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache");
const SUPPLY_CACHE = join(CACHE, "tc-gc-supply.json");
const REWARD_CACHE = join(CACHE, "gc-supply-reward.json");
const TC = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/gc-supply.json";
const V2 = "https://v2.xivapi.com/api/sheet";

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");
const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.json(); };

// gc-supply 的 jobId → equip.json 的職業代碼
const JOB_CODE = {
  8: "CRP", 9: "BSM", 10: "ARM", 11: "GSM", 12: "LTW", 13: "WVR", 14: "ALC", 15: "CUL",
  16: "MIN", 17: "BTN", 18: "FSH",
};

async function main() {
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const equip = JSON.parse(await readFile(join(DATA, "equip.json"), "utf8"));
  const byId = new Map(items.map((i) => [i.id, i]));

  let supply, rewards;
  if (offline || existsSync(SUPPLY_CACHE)) {
    if (!existsSync(SUPPLY_CACHE)) throw new Error(`--offline 但找不到 ${SUPPLY_CACHE}`);
    supply = JSON.parse(await readFile(SUPPLY_CACHE, "utf8"));
  } else {
    console.log("抓取 Teamcraft gc-supply.json…");
    supply = await getJson(TC);
    await mkdir(CACHE, { recursive: true });
    await writeFile(SUPPLY_CACHE, JSON.stringify(supply));
  }
  if (offline || existsSync(REWARD_CACHE)) {
    if (!existsSync(REWARD_CACHE)) throw new Error(`--offline 但找不到 ${REWARD_CACHE}`);
    rewards = JSON.parse(await readFile(REWARD_CACHE, "utf8"));
  } else {
    console.log("抓取 XIVAPI GCSupplyDutyReward…");
    const rows = [];
    let after = null;
    for (;;) {
      const d = await getJson(`${V2}/GCSupplyDutyReward?limit=500&fields=SealsExpertDelivery,SealsSupply,ExperienceSupply` + (after ? `&after=${after}` : ""));
      if (!d.rows?.length) break;
      rows.push(...d.rows.map((r) => ({ ilvl: r.row_id, expert: r.fields.SealsExpertDelivery || 0 })));
      after = d.rows[d.rows.length - 1].row_id;
      if (d.rows.length < 500) break;
    }
    rewards = rows;
    await mkdir(CACHE, { recursive: true });
    await writeFile(REWARD_CACHE, JSON.stringify(rewards));
  }

  /* ── ① 軍需品調達 ── */
  // jobId → Map(itemId → {count, seals, xp})。同一件在不同輪替日可能重複，取一筆即可
  const byJob = new Map();
  let total = 0, noTw = 0;
  for (const byJobOfDay of Object.values(supply)) {
    for (const [job, arr] of Object.entries(byJobOfDay)) {
      for (const e of arr || []) {
        total++;
        const it = byId.get(e.itemId);
        if (!it || !it.name || !isTw(it.name)) { noTw++; continue; }
        if (!byJob.has(job)) byJob.set(job, new Map());
        const m = byJob.get(job);
        if (!m.has(e.itemId)) {
          m.set(e.itemId, {
            id: e.itemId, name: it.name, category: it.category, icon: it.icon, patch: it.patch || null,
            count: e.count || 1, seals: e.reward?.seals || 0, xp: e.reward?.xp || 0,
          });
        }
      }
    }
  }
  const jobs = [];
  for (const [job, m] of byJob) {
    const code = JOB_CODE[job];
    const name = code ? equip.names[code] : null;
    if (!name) { console.log(`  ⚠ jobId ${job} 查不到台服職業名，跳過`); continue; }
    // 排序鍵固定：軍票由高到低、同值用物品 id（不可用會變的市價，§3.19）
    const list = [...m.values()].sort((a, b) => b.seals - a.seals || a.id - b.id);
    jobs.push({ jobId: Number(job), code, name, items: list });
  }
  jobs.sort((a, b) => a.jobId - b.jobId);

  /* ── ② 專家交納：ilvl → 軍票 ── */
  const expert = rewards.filter((r) => r.expert > 0).map((r) => [r.ilvl, r.expert]);

  console.log(`\n① 軍需品調達：${total} 筆原始資料 → ${jobs.length} 個職業、${jobs.reduce((n, j) => n + j.items.length, 0)} 件相異交納品`);
  for (const j of jobs) {
    const s = j.items.map((i) => i.seals);
    console.log(`  ${j.name.padEnd(8)} ${String(j.items.length).padStart(3)} 件　軍票 ${Math.min(...s)}–${Math.max(...s)}`);
  }
  if (noTw) console.log(`  無台服名而略過：${noTw} 筆`);
  console.log(`\n② 專家交納：ilvl ${expert[0][0]}–${expert[expert.length - 1][0]}，軍票 ${expert[0][1]}–${expert[expert.length - 1][1]}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  await writeFile(join(DATA, "gc-supply.json"), JSON.stringify({
    schema: "gc-supply",
    updated: new Date().toISOString().slice(0, 10),
    source: "Teamcraft gc-supply.json + XIVAPI v2 GCSupplyDutyReward（row_id 即 ilvl）+ data/items.json + equip.names",
    note: "刻意不算「今天輪到哪一組」——輪替與現實日期的對應無可靠來源；改為依職業列出所有可能的交納品",
    count: jobs.length,
    data: { jobs, expert },
  }));
  console.log(`\n✓ data/gc-supply.json（${jobs.length} 個職業、專家交納 ${expert.length} 階）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
