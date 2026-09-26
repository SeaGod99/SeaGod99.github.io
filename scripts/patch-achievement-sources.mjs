// patch-achievement-sources.mjs — 把收藏頁「成就」來源補成「官方成就名＋達成條件」
//
// 現況（實測 2026-09-25）：站內 6 個收藏庫共 112 筆成就來源，
//   · 成就名早已是台服官方名（先前幾輪補過），但
//   · **35 筆 `detail` 是 null**（寵物 18／坐騎 7／樂譜 7／鳥鞍 3），畫面上只寫「成就」兩個字
//   · **沒有任何一處寫出「這個成就要怎麼達成」**——「成就『蒼天騎士』」本身答不出要做什麼
//
// 這支做兩件事：
//   ① 用 XIVAPI v2 `Achievement.Item`（成就 → 獎勵道具）反查，把 null 的 detail 補成官方成就名
//   ② 對所有成就來源補 `achievementId` 與 `condition`（達成條件，取自 tw-achievement-descriptions）
//
// 名稱與條件一律取自 out_data/tw-locales.msgpack 的 achievements／achievementDescriptions
// （Teamcraft 台服語系檔，3,611 筆）。**查不到就留原狀，不用英文補**。
//
// 成就名 → id 的對應走「台服官方名完全相符」。同名成就（如各職業同名系列）會有多筆，
// 此時**不猜**：若該名稱對到多個 id 且達成條件不同，只補名稱不補條件，並列在報告裡。
//
// 執行（repo 根目錄）：
//   node scripts/patch-achievement-sources.mjs            # dry-run
//   node scripts/patch-achievement-sources.mjs --apply
//   node scripts/patch-achievement-sources.mjs --offline  # 用 out_data/cache 快取

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache");
const CACHE_FILE = join(CACHE, "achievements-v2.json");
const V2 = "https://v2.xivapi.com/api/sheet";

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

// 有成就來源的收藏庫
const FILES = ["mounts", "minions", "orchestrion", "barding", "emotes", "triple-triad"];

const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.json(); };

async function fetchAchievements() {
  const rows = [];
  let after = null;
  for (;;) {
    const d = await getJson(`${V2}/Achievement?limit=500&fields=${encodeURIComponent("Item@as(raw),Points,AchievementCategory@as(raw)")}` + (after ? `&after=${after}` : ""));
    if (!d.rows?.length) break;
    rows.push(...d.rows.map((r) => ({ id: r.row_id, item: r.fields["Item@as(raw)"] || 0, points: r.fields.Points || 0 })));
    after = d.rows[d.rows.length - 1].row_id;
    if (d.rows.length < 500) break;
    process.stdout.write(`\r  Achievement: ${rows.length}`);
  }
  process.stdout.write("\n");
  return rows;
}

async function main() {
  const tw = await loadTwLocales();

  let ach;
  if (offline || existsSync(CACHE_FILE)) {
    if (!existsSync(CACHE_FILE)) throw new Error(`--offline 但找不到 ${CACHE_FILE}`);
    ach = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    console.log(`Achievement 用快取：${ach.length} 列`);
  } else {
    console.log("抓取 XIVAPI v2 Achievement…");
    ach = await fetchAchievements();
    await mkdir(CACHE, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(ach));
  }

  // 台服名 → [成就 id]（同名可能多筆）
  const byName = new Map();
  for (const a of ach) {
    const n = twName(tw.achievements, a.id);
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(a.id);
  }
  // 獎勵道具 → 成就 id（一件道具理論上只由一個成就給，實測若有多筆則列出）
  const byItem = new Map();
  for (const a of ach) {
    if (!a.item) continue;
    if (!byItem.has(a.item)) byItem.set(a.item, []);
    byItem.get(a.item).push(a.id);
  }
  console.log(`成就總數 ${ach.length}；有台服名 ${[...byName.values()].reduce((n, v) => n + v.length, 0)}；有道具獎勵 ${byItem.size} 件`);

  const stats = { total: 0, filledName: 0, addedCond: 0, renamed: [], ambiguous: [], stillNull: [], noCond: [] };
  const changes = [];

  for (const file of FILES) {
    const path = join(DATA, `${file}.json`);
    const db = JSON.parse(await readFile(path, "utf8"));
    let touched = 0;

    for (const e of db.data) {
      for (const s of e.sources || []) {
        if (!/成就/.test(s.type || "")) continue;
        stats.total++;

        // ① detail 為空 → 用道具反查成就名
        if (!s.detail) {
          const ids = e.itemId ? byItem.get(e.itemId) : null;
          if (ids && ids.length === 1) {
            const n = twName(tw.achievements, ids[0]);
            if (n) { s.detail = n; s.achievementId = ids[0]; stats.filledName++; touched++; }
          }
          if (!s.detail) { stats.stillNull.push(`${file}／${e.name}`); continue; }
        }

        // ② 由成就名解出 id 與達成條件
        //    站內寫法有「成就「X」」「成就「X」獎勵」「X」三種，先剝掉外框字
        const bare = String(s.detail).replace(/^成就[「『]?/, "").replace(/[」』](獎勵)?$/, "").trim();
        let id = s.achievementId || null;
        if (!id) {
          const ids = byName.get(bare) || byName.get(s.detail);
          if (ids && ids.length === 1) id = ids[0];
          else if (ids && ids.length > 1) {
            // 同名多筆：條件不同就不猜，只留名稱
            const conds = new Set(ids.map((i) => twName(tw.achievementDescriptions, i)).filter(Boolean));
            if (conds.size === 1) id = ids[0];
            else { stats.ambiguous.push(`${file}／${e.name}：「${bare}」對到 ${ids.length} 個成就且條件不同`); continue; }
          }
        }
        // 名稱查不到 → 改用「獎勵道具」反查。這是可證的關聯（Achievement.Item），
        // **不要做名稱模糊比對**（§4.24：模糊比對找不到時退回最像的一個＝靜默給錯答案）。
        // 實測會在這裡落網的是非官方名殘留，例如站內寫「海之都的凱旋4」，
        // 台服官方名其實是「海都的凱旋4」。對得到就一併把名稱改成官方名。
        if (!id && e.itemId) {
          const ids = byItem.get(e.itemId);
          if (ids && ids.length === 1) {
            const official = twName(tw.achievements, ids[0]);
            if (official) {
              if (official !== bare) {
                stats.renamed.push(`${file}／${e.name}：「${bare}」→ 官方名「${official}」`);
                s.detail = official;
              }
              id = ids[0];
            }
          }
        }
        if (!id) { stats.noCond.push(`${file}／${e.name}：「${bare}」查無成就`); continue; }

        const cond = twName(tw.achievementDescriptions, id);
        if (s.achievementId !== id) { s.achievementId = id; touched++; }
        if (cond && s.condition !== cond) { s.condition = cond; stats.addedCond++; touched++; }
        else if (!cond) stats.noCond.push(`${file}／${e.name}：「${bare}」無達成條件字串`);
      }
    }

    if (touched) changes.push({ file, path, db, touched });
  }

  console.log(`\n成就來源共 ${stats.total} 筆`);
  console.log(`  detail 為空 → 由道具反查補上官方成就名：${stats.filledName} 筆`);
  console.log(`  補上達成條件：${stats.addedCond} 筆`);
  if (stats.stillNull.length) console.log(`  仍無名稱（道具查不到對應成就）：${stats.stillNull.length}\n    ${stats.stillNull.slice(0, 12).join("\n    ")}`);
  if (stats.renamed.length) console.log(`  非官方名 → 由獎勵道具反查改成台服官方名：${stats.renamed.length}\n    ${stats.renamed.join("\n    ")}`);
  if (stats.ambiguous.length) console.log(`  同名多筆且條件不同，只留名稱：${stats.ambiguous.length}\n    ${stats.ambiguous.slice(0, 8).join("\n    ")}`);
  if (stats.noCond.length) {
    console.log(`  查無成就或無條件字串：${stats.noCond.length}（名稱不在台服成就表、也沒有獎勵道具可反查`);
    console.log(`    → 很可能是非官方名殘留，但**沒有可證的關聯就不改**，維持原狀）`);
    console.log(`    ${stats.noCond.slice(0, 10).join("\n    ")}`);
  }
  console.log(`\n會變動的檔案：${changes.map((c) => `${c.file}(${c.touched})`).join("、") || "無"}`);

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  for (const c of changes) {
    c.db.updated = new Date().toISOString().slice(0, 10);
    const raw = await readFile(c.path, "utf8");
    const pretty = raw.includes("\n  ");
    await writeFile(c.path, pretty ? JSON.stringify(c.db, null, 2) : JSON.stringify(c.db));
  }
  console.log(`\n✓ 已更新 ${changes.length} 個資料檔`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
