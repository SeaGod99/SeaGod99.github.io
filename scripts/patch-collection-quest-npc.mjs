// patch-collection-quest-npc.mjs — 收藏頁「任務」來源補上接取點
//
// 解決的問題：收藏頁看到「取得方式：任務」時，玩家還是不知道**去哪接**。
// 194 筆任務來源裡有 134 筆連任務名都沒有（detail 是 null 或就寫「任務」），
// 等於什麼都沒說。
//
// 兩層認定，**先可證、後退保守**，認不出來就原樣不動（不猜）：
//   ① 物品證：任務的 Reward／OptionalItemReward 裡就有這個收藏品的 itemId。
//      這是遊戲資料自己的關聯，不靠名稱相似度。一個條目有多筆任務來源時
//      （如「專屬陸行鳥」三個大國防聯軍各一條），再用 detail 的任務名配對到正確那條。
//   ② 名稱證：detail 抽得出任務名（整串，或「」裡那串）且在台服任務表**唯一命中**。
//      命中 0 或 2 筆以上一律放棄——同名任務配錯比沒有還糟。
//   每筆都標 `via: "reward" | "name"`，日後台服任務表更新時可以只複驗 name 那批。
//
// 補的欄位（只補不覆蓋既有的 questId）：
//   questId  任務 id
//   detail   任務的台服官方名（原本是 null／「任務」的才填；原本有字的不動）
//   level    接取等級
//   issuer   { id, name } 接取 NPC（data/npcs.json → npcs.msgpack 的 twNpcs）
//   at       { mapId, mapName, x, y } 接取地點與座標（Level 的 X/Z 換算，公式同 patch-aether-coords.mjs）
//
// 認不出來的 31 筆多半是季節活動任務——台服任務表裡沒有，屬於「台服未開放／已下架」，
// 照鐵則不補英文名、不猜，前端就是不顯示接取點。
//
// 執行（repo 根目錄）：
//   node scripts/patch-collection-quest-npc.mjs            # dry-run，印報告
//   node scripts/patch-collection-quest-npc.mjs --apply    # 寫入（pretty JSON，記得接 minify-data --apply）
//   node scripts/patch-collection-quest-npc.mjs --offline  # 只用 out_data/cache，不連網

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "out_data");
const CACHE = join(OUT, "cache");
const REWARD_CACHE = join(CACHE, "quest-rewards.json");
const LEVEL_CACHE = join(CACHE, "quest-levels.json");

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const offline = argv.includes("--offline");

const V2 = "https://v2.xivapi.com/api/sheet";
const F = (s) => encodeURIComponent(s);
const getJson = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${u} HTTP ${r.status}`);
  return r.json();
};

// 有 itemId 又有「任務」來源的收藏檔。幻卡不在這裡——它沒有 itemId，
// 而且它的任務來源已由 patch-triple-triad-sources.mjs 另外處理。
const FILES = ["mounts", "minions", "orchestrion", "barding", "emotes"];

const QUEST_FIELDS =
  "Name,ClassJobLevel,IssuerStart@as(raw),IssuerLocation@as(raw)," +
  "Reward@as(raw),OptionalItemReward@as(raw)";

async function fetchQuestRewards() {
  const rows = [];
  let after = null;
  for (;;) {
    const d = await getJson(`${V2}/Quest?limit=100&fields=${F(QUEST_FIELDS)}` + (after ? `&after=${after}` : ""));
    if (!d.rows?.length) break;
    for (const x of d.rows) {
      const f = x.fields;
      const rw = [...(f["Reward@as(raw)"] || []), ...(f["OptionalItemReward@as(raw)"] || [])].filter(Boolean);
      rows.push({
        id: x.row_id, n: f.Name, lv: f.ClassJobLevel?.[0] ?? null,
        iss: f["IssuerStart@as(raw)"] || 0, loc: f["IssuerLocation@as(raw)"] || 0, rw,
      });
    }
    after = d.rows[d.rows.length - 1].row_id;
    process.stdout.write(`\r  Quest: ${rows.length}`);
    if (d.rows.length < 100) break;
  }
  process.stdout.write("\n");
  return rows;
}

async function fetchLevels(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const d = await getJson(`${V2}/Level?rows=${chunk.join(",")}&fields=${F("X,Z,Map@as(raw)")}`);
      for (const r of d.rows) out[r.row_id] = r.fields;
    } catch {
      // rows= 只要有一個不存在就整批 404，退回逐筆
      for (const id of chunk) {
        try { const d = await getJson(`${V2}/Level/${id}?fields=${F("X,Z,Map@as(raw)")}`); out[id] = d.fields; } catch {}
      }
    }
  }
  return out;
}

// detail 裡抽任務名：優先取「」裡那串，否則整串；明顯不是任務名的一律回 null
function questNameOf(detail) {
  if (!detail) return null;
  const m = String(detail).match(/「([^」]+)」/);
  const d = (m ? m[1] : String(detail)).trim();
  if (!d || d === "任務" || /^Lv\.?\d/.test(d)) return null;
  return d;
}

async function main() {
  const twQuests = JSON.parse(await readFile(join(OUT, "tw-quests.json"), "utf8"));
  const npcs = JSON.parse(await readFile(join(DATA, "npcs.json"), "utf8")).data;
  const maps = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8")).data;
  const npcMsg = decode(await readFile(join(OUT, "npcs.msgpack")));
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const mapById = new Map(maps.map((m) => [m.id, m]));
  const npcName = (id) => npcById.get(id)?.name || npcMsg.twNpcs?.[id]?.tw || npcMsg.twNpcs?.[id] || null;

  // ── 任務獎勵表 ──
  let quests;
  if (offline || existsSync(REWARD_CACHE)) {
    if (!existsSync(REWARD_CACHE)) throw new Error(`--offline 但找不到 ${REWARD_CACHE}`);
    quests = JSON.parse(await readFile(REWARD_CACHE, "utf8"));
    console.log(`任務獎勵表用快取：${quests.length} 筆`);
  } else {
    console.log("抓取 Quest 獎勵全表…");
    quests = await fetchQuestRewards();
    await mkdir(CACHE, { recursive: true });
    await writeFile(REWARD_CACHE, JSON.stringify(quests));
  }
  const qById = new Map(quests.map((q) => [q.id, q]));
  const byItem = new Map();
  for (const q of quests) for (const it of q.rw) {
    if (!byItem.has(it)) byItem.set(it, []);
    byItem.get(it).push(q.id);
  }
  const byTwName = new Map();
  for (const [id, v] of Object.entries(twQuests)) {
    if (!v?.tw) continue;
    if (!byTwName.has(v.tw)) byTwName.set(v.tw, []);
    byTwName.get(v.tw).push(Number(id));
  }

  // ── 第一輪：決定每筆來源要綁哪個任務 ──
  const plan = [];   // { file, entry, src, questId, via }
  const stat = { total: 0, reward: 0, name: 0, already: 0, unresolved: 0 };
  const unresolved = [];

  const dbs = {};
  for (const f of FILES) dbs[f] = JSON.parse(await readFile(join(DATA, `${f}.json`), "utf8"));

  for (const f of FILES) {
    for (const e of dbs[f].data) {
      const qs = (e.sources || []).filter((s) => s.type === "任務");
      if (!qs.length) continue;
      // 這個收藏品被哪些任務當獎勵送出（且該任務有台服名）
      const cands = e.itemId ? (byItem.get(e.itemId) || []).filter((id) => twQuests[id]?.tw) : [];
      for (const s of qs) {
        stat.total++;
        if (s.questId) { stat.already++; continue; }   // 既有的不覆蓋

        let hit = null, via = null;
        // ① 物品證
        if (cands.length === 1 && qs.length === 1) { hit = cands[0]; via = "reward"; }
        else if (cands.length) {
          const want = questNameOf(s.detail);
          const m = want ? cands.find((id) => twQuests[id].tw === want) : null;
          if (m) { hit = m; via = "reward"; }
        }
        // ② 名稱證（唯一命中才算）
        if (!hit) {
          const want = questNameOf(s.detail);
          const n = want ? byTwName.get(want) : null;
          if (n && n.length === 1) { hit = n[0]; via = "name"; }
        }
        if (!hit) {
          stat.unresolved++;
          unresolved.push(`${f}:${e.name}${s.detail ? `（${s.detail}）` : "（無任務名）"}`);
          continue;
        }
        stat[via]++;
        plan.push({ file: f, entry: e, src: s, questId: hit, via });
      }
    }
  }

  // ── 地點座標 ──
  const levelIds = [...new Set(plan.map((p) => qById.get(p.questId)?.loc).filter(Boolean))];
  let levels = existsSync(LEVEL_CACHE) ? JSON.parse(await readFile(LEVEL_CACHE, "utf8")) : {};
  const missLv = levelIds.filter((id) => !levels[id]);
  if (missLv.length) {
    if (offline) console.log(`⚠️  --offline，${missLv.length} 個接取點沒有座標快取，這批的 at 會留 null`);
    else {
      console.log(`抓取 Level（${missLv.length} 筆）…`);
      Object.assign(levels, await fetchLevels(missLv));
      await mkdir(CACHE, { recursive: true });
      await writeFile(LEVEL_CACHE, JSON.stringify(levels));
    }
  }
  function toMapCoords(levelId) {
    const lv = levels[levelId];
    if (!lv) return null;
    const m = mapById.get(lv["Map@as(raw)"]);
    if (!m) return null;                                   // 副本／室內的實例地圖不在 maps.json
    const c = (m.sizeFactor ?? 100) / 100;
    const conv = (w, o) => Math.round(((41 / c) * ((w + o) * c + 1024) / 2048 + 1) * 10) / 10;
    return { mapId: m.id, mapName: m.name, x: conv(lv.X, m.offsetX ?? 0), y: conv(lv.Z, m.offsetY ?? 0) };
  }

  // ── 第二輪：寫進來源物件 ──
  const cover = { npc: 0, at: 0, filledDetail: 0 };
  for (const p of plan) {
    const q = qById.get(p.questId);
    const tw = twQuests[p.questId].tw;
    p.src.questId = p.questId;
    p.src.via = p.via;
    if (!questNameOf(p.src.detail)) { p.src.detail = tw; cover.filledDetail++; }
    if (q.lv != null) p.src.level = q.lv;
    const nm = q.iss ? npcName(q.iss) : null;
    if (nm) { p.src.issuer = { id: q.iss, name: nm }; cover.npc++; }
    const at = toMapCoords(q.loc);
    if (at) { p.src.at = at; cover.at++; }
  }

  // ── 報告 ──
  console.log(`\n任務來源 ${stat.total} 筆`);
  console.log(`  已有 questId（不動）  ${stat.already}`);
  console.log(`  物品證解出            ${stat.reward}`);
  console.log(`  任務名唯一命中        ${stat.name}`);
  console.log(`  無法認定（原樣不動）  ${stat.unresolved}`);
  console.log(`\n補進去的 ${plan.length} 筆裡：`);
  console.log(`  有接取 NPC   ${cover.npc}/${plan.length}`);
  console.log(`  有地點座標   ${cover.at}/${plan.length}`);
  console.log(`  順便補上任務名 ${cover.filledDetail} 筆（原本是 null 或只寫「任務」）`);

  console.log(`\n樣本：`);
  for (const p of plan.slice(0, 8)) {
    console.log(`  ${p.file}:${p.entry.name} → 「${p.src.detail}」Lv${p.src.level ?? "?"}` +
      `${p.src.issuer ? ` ${p.src.issuer.name}` : ""}${p.src.at ? `＠${p.src.at.mapName} (${p.src.at.x}, ${p.src.at.y})` : ""}（${p.via === "reward" ? "物品證" : "名稱證"}）`);
  }
  if (unresolved.length) {
    console.log(`\n認不出來而略過 ${unresolved.length} 筆（多為季節活動任務，台服任務表裡沒有）：`);
    for (const u of unresolved.slice(0, 20)) console.log(`  ${u}`);
    if (unresolved.length > 20) console.log(`  …還有 ${unresolved.length - 20} 筆`);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const touched = [...new Set(plan.map((p) => p.file))];
  for (const f of touched) {
    await writeFile(join(DATA, `${f}.json`), JSON.stringify(dbs[f], null, 2) + "\n", "utf8");
    console.log(`✓ data/${f}.json`);
  }
  console.log("\n接著跑：node scripts/minify-data.mjs --apply && node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
