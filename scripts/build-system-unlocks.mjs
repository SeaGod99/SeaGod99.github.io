// build-system-unlocks.mjs — 產生 data/system-unlocks.json（系統解鎖索引的資料層）
//
// 回答的問題：「這個系統要解什麼任務才會開？任務在哪接？幾級？前面還卡著什麼？」
// 站內目前 27 個工具沒有任何一頁回答得出來，回鍋與新手玩家最常卡在這裡。
//
// 輸出兩份清單（同一個檔，前端一次載完）：
//   data[]  系統／工具的解鎖任務（對照表人工維護，見 lib/system-unlock-map.mjs）
//   jobs[]  職業與行會：44 個職業各自的解鎖任務、行會地點、前置職業等級、靈魂水晶
//           進階職業（24）走 `ClassJob.UnlockQuest`，**完全不靠人工對照**；
//           基礎職（20）的 UnlockQuest 是 0，對照表在 lib/system-unlock-map.mjs 的 GUILD_QUESTS。
//
// 資料來源全部是台服官方字串：
//   任務名   out_data/tw-quests.json（5,132 筆）
//   NPC 名   data/npcs.json → 退到 out_data/npcs.msgpack 的 twNpcs
//   地名     data/maps.json（座標由 Level sheet 的 X/Z 換算，公式同 patch-aether-coords.mjs）
//   手帳章節 out_data/tw-locales.msgpack 的 journalGenre
//   系統名   **本站自己的頁面名稱**（見 lib/system-unlock-map.mjs 檔頭說明）
//   職業名   data/equip.json 的 names 表（CLAUDE.md 指定的職業名權威來源）
//   靈魂水晶 data/items.json
//   職能名   out_data/tw-locales.msgpack 的 jobCategories（ClassJobCategory 186-190／30-33）
//            唯一的加工是砍掉尾巴的「（設限特職除外）」——那是分類的技術但書、不是職能名本身，
//            砍法是機械的（去掉結尾整組全形括號），不涉及翻譯。
//
// 閘門（任何一道不過就中止或留白，不會安靜給錯答案）：
//   ① 對照表的英文任務名必須**恰好唯一命中**（gcVariants 者允許 3 筆）；
//      命中 0 或數量不對就中止，確認過的缺口用 --allow-missing "英文名" 具名放行
//   ② 任務查不到台服名 → 整條 drop 並列名（台服未開放）
//   ③ 其餘每個字串欄位查不到台服來源 → 留 null，並在摘要逐欄報覆蓋率
//   ④ 行會任務：9 個戰鬥職的 Quest.ClassJobUnlock 必須等於對照表寫的 classJob
//   ⑤ 行會任務：台服任務名必須含「行會」（擋「初為訓練師」「如何成為機工士」這種名字很像的）
//   ⑥ 職業查不到 equip.json 的繁中名 → 整條 drop（台服未開放，例如馴獸師 BST）
//
// 執行（repo 根目錄）：
//   node scripts/build-system-unlocks.mjs                  # dry-run，印報告
//   node scripts/build-system-unlocks.mjs --apply          # 寫入
//   node scripts/build-system-unlocks.mjs --offline        # 用 out_data/cache 的快取
//   node scripts/build-system-unlocks.mjs --find 幻卡      # 查候選任務（新增對照表條目時用）
//   node scripts/build-system-unlocks.mjs --allow-missing "Some Quest"

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { SYSTEMS, NO_SINGLE_QUEST, GUILD_QUESTS } from "./lib/system-unlock-map.mjs";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "out_data");
const CACHE = join(OUT, "cache");
const QUEST_CACHE = join(CACHE, "quests-v2.json");
const LEVEL_CACHE = join(CACHE, "quest-levels.json");
const JOB_CACHE = join(CACHE, "classjob-v2.json");
const MAPPLACE_CACHE = join(CACHE, "quest-map-places.json");

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const offline = argv.includes("--offline");
const findArg = argv.includes("--find") ? argv[argv.indexOf("--find") + 1] : null;
const allowMissing = new Set(
  argv.reduce((acc, a, i) => (a === "--allow-missing" ? [...acc, argv[i + 1]] : acc), [])
);

const V2 = "https://v2.xivapi.com/api/sheet";
const F = (s) => encodeURIComponent(s);
const getJson = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${u} HTTP ${r.status}`);
  return r.json();
};

const QUEST_FIELDS =
  "Name,ClassJobLevel,JournalGenre@as(raw),PreviousQuest@as(raw),IssuerStart@as(raw)," +
  "IssuerLocation@as(raw),SortKey,Expansion@as(raw),InstanceContentUnlock@as(raw)," +
  "ClassJobUnlock@as(raw),BeastTribe@as(raw),Type,QuestParams";

async function fetchQuests() {
  const rows = [];
  let after = null;
  for (;;) {
    const d = await getJson(`${V2}/Quest?limit=100&fields=${F(QUEST_FIELDS)}` + (after ? `&after=${after}` : ""));
    if (!d.rows?.length) break;
    for (const r of d.rows) {
      // QuestParams 很大，只留帶腳本指令的（解鎖訊號都在這裡）
      const qp = (r.fields.QuestParams || []).filter((p) => p.ScriptInstruction);
      rows.push({ id: r.row_id, f: { ...r.fields, QuestParams: qp } });
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

const CLASSJOB_FIELDS =
  "Abbreviation,NameEnglish,UnlockQuest@as(raw),ItemSoulCrystal@as(raw)," +
  "ClassJobParent@as(raw),StartingLevel,Role,JobIndex,DohDolJobIndex,ClassJobCategory@as(raw)";

// 職能分類：186-190 是現行的五分法（防護／治療／近戰／遠程物理／遠程魔法，設限特職除外），
// 30-33 是粗分類（戰鬥精英／魔法導師／大地使者／能工巧匠），基礎職與青魔只落在後者。
// 順序即優先序：先找得到細的就用細的。
const ROLE_CATS = [186, 187, 188, 189, 190, 33, 32, 30, 31];

async function fetchClassJobBundle(questIds) {
  const cj = await getJson(`${V2}/ClassJob?limit=60&fields=${F(CLASSJOB_FIELDS)}`);
  // ClassJobCategory 的成員是「每個職業縮寫一個 boolean 欄位」。`?rows=` 不指名 fields 時
  // 只回 Name（這裡踩過一次：cats 全部拿回來卻一個 true 都沒有，職能整排是 null），
  // 逐筆取才拿得到完整欄位——9 筆而已。
  const cats = { rows: [] };
  for (const id of ROLE_CATS) cats.rows.push(await getJson(`${V2}/ClassJobCategory/${id}`));
  // ClassJobRequired 不在 Quest 全表快取的欄位裡（全表抓它太貴），只對用得到的任務補抓
  const req = {};
  for (let i = 0; i < questIds.length; i += 50) {
    const chunk = questIds.slice(i, i + 50);
    const d = await getJson(`${V2}/Quest?rows=${chunk.join(",")}&fields=${F("ClassJobRequired@as(raw)")}`);
    for (const r of d.rows) req[r.row_id] = r.fields["ClassJobRequired@as(raw)"] || 0;
  }
  return {
    jobs: cj.rows.map((r) => ({ id: r.row_id, f: r.fields })),
    cats: cats.rows.map((r) => ({ id: r.row_id, f: r.fields })),
    req,
  };
}

async function main() {
  const twQuests = JSON.parse(await readFile(join(OUT, "tw-quests.json"), "utf8"));
  const npcs = JSON.parse(await readFile(join(DATA, "npcs.json"), "utf8")).data;
  const maps = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8")).data;
  const npcMsg = decode(await readFile(join(OUT, "npcs.msgpack")));
  const placeMsg = decode(await readFile(join(OUT, "places.msgpack")));
  const tw = await loadTwLocales();
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const mapById = new Map(maps.map((m) => [m.id, m]));

  // ── 任務表 ──
  let rows;
  if (offline || existsSync(QUEST_CACHE)) {
    if (!existsSync(QUEST_CACHE)) throw new Error(`--offline 但找不到 ${QUEST_CACHE}`);
    rows = JSON.parse(await readFile(QUEST_CACHE, "utf8"));
    console.log(`任務表用快取：${rows.length} 筆`);
  } else {
    console.log("抓取 Quest 全表…");
    rows = await fetchQuests();
    await mkdir(CACHE, { recursive: true });
    await writeFile(QUEST_CACHE, JSON.stringify(rows));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));

  // ── --find：查候選（新增對照表條目時用）──
  if (findArg) {
    const hits = rows.filter((r) =>
      (r.f.Name || "").toLowerCase().includes(findArg.toLowerCase()) ||
      (twQuests[r.id]?.tw || "").includes(findArg)
    );
    console.log(`\n「${findArg}」命中 ${hits.length} 筆：`);
    for (const r of hits.slice(0, 30)) {
      const sig = r.f.QuestParams.filter((p) => /^(HOW_TO|UNLOCK_)/.test(p.ScriptInstruction))
        .map((p) => `${p.ScriptInstruction}=${p.ScriptArg}`);
      console.log(`  ${r.id} Lv${r.f.ClassJobLevel?.[0] ?? "?"} 「${twQuests[r.id]?.tw || "（無台服名）"}」 ${r.f.Name}`);
      if (sig.length) console.log(`        訊號：${sig.join(" ")}`);
    }
    if (hits.length > 30) console.log(`  …還有 ${hits.length - 30} 筆`);
    return;
  }

  // ── 閘門①：英文名唯一命中 ──
  const resolved = [];
  const fatal = [];
  for (const sys of SYSTEMS) {
    // 三團版本的英文名帶後綴，如「Squadron and Commander (Twin Adder)」，故用前綴比對；
    // 一般條目一律要求完全相等，避免「My Little Chocobo」誤吃到「My Little Chocobo Companion」這種。
    const hits = sys.gcVariants
      ? rows.filter((r) => r.f.Name === sys.questEn || (r.f.Name || "").startsWith(sys.questEn + " ("))
      : rows.filter((r) => r.f.Name === sys.questEn);
    const want = sys.gcVariants ? 3 : 1;
    if (hits.length !== want) {
      if (allowMissing.has(sys.questEn)) {
        console.log(`  ⓘ 具名放行：「${sys.questEn}」命中 ${hits.length} 筆（預期 ${want}）`);
        continue;
      }
      fatal.push(`${sys.key}「${sys.questEn}」命中 ${hits.length} 筆，預期 ${want}`);
      continue;
    }
    resolved.push({ sys, hits });
  }
  // ── 閘門④⑤：行會任務對照表 ──
  // 英文名唯一命中 → 有 ClassJobUnlock 就比對 → 台服名必須含「行會」。
  const guildByJob = new Map();
  for (const g of GUILD_QUESTS) {
    const hits = rows.filter((r) => r.f.Name === g.questEn);
    if (hits.length !== 1) {
      if (allowMissing.has(g.questEn)) { console.log(`  ⓘ 具名放行：「${g.questEn}」命中 ${hits.length} 筆（預期 1）`); continue; }
      fatal.push(`行會任務「${g.questEn}」命中 ${hits.length} 筆，預期 1`);
      continue;
    }
    const r = hits[0];
    const cjU = r.f["ClassJobUnlock@as(raw)"] || 0;
    if (cjU && cjU !== g.classJob) {
      fatal.push(`行會任務「${g.questEn}」的 ClassJobUnlock=${cjU}，對照表寫 ${g.classJob}`);
      continue;
    }
    const twTitle = twQuests[r.id]?.tw;
    if (twTitle && !twTitle.includes("行會")) {
      if (allowMissing.has(g.questEn)) { console.log(`  ⓘ 具名放行：「${g.questEn}」台服名「${twTitle}」不含「行會」`); }
      else { fatal.push(`行會任務「${g.questEn}」的台服名「${twTitle}」不含「行會」，疑似抓錯任務`); continue; }
    }
    guildByJob.set(g.classJob, r);
  }

  if (fatal.length) {
    console.error(`\n✗ 對照表對不上遊戲資料，中止（確認過的缺口用 --allow-missing "英文名" 放行）：`);
    for (const f of fatal) console.error(`   ${f}`);
    process.exit(1);
  }

  // ── 職業表 ──
  const jobQuestIds = [];
  let bundle;
  if (offline || existsSync(JOB_CACHE)) {
    if (!existsSync(JOB_CACHE)) throw new Error(`--offline 但找不到 ${JOB_CACHE}`);
    bundle = JSON.parse(await readFile(JOB_CACHE, "utf8"));
    console.log(`職業表用快取：${bundle.jobs.length} 個 ClassJob`);
  } else {
    console.log("抓取 ClassJob／ClassJobCategory…");
    // 進階職業的解鎖任務由 ClassJob.UnlockQuest 指定；基礎職用上面驗過的行會任務
    const probe = await getJson(`${V2}/ClassJob?limit=60&fields=${F("UnlockQuest@as(raw)")}`);
    for (const r of probe.rows) if (r.fields["UnlockQuest@as(raw)"]) jobQuestIds.push(r.fields["UnlockQuest@as(raw)"]);
    for (const r of guildByJob.values()) jobQuestIds.push(r.id);
    bundle = await fetchClassJobBundle([...new Set(jobQuestIds)]);
    await mkdir(CACHE, { recursive: true });
    await writeFile(JOB_CACHE, JSON.stringify(bundle));
  }

  // ── 地點座標 ──
  const jobLevelIds = bundle.jobs
    .map((j) => byId.get(j.f["UnlockQuest@as(raw)"]))
    .concat([...guildByJob.values()])
    .filter(Boolean)
    .map((r) => r.f["IssuerLocation@as(raw)"]);
  const levelIds = [...new Set(
    resolved.flatMap(({ hits }) => hits.map((r) => r.f["IssuerLocation@as(raw)"])).concat(jobLevelIds).filter(Boolean)
  )];
  let levels;
  if (existsSync(LEVEL_CACHE)) {
    levels = JSON.parse(await readFile(LEVEL_CACHE, "utf8"));
    const miss = levelIds.filter((id) => !levels[id]);
    if (miss.length && !offline) Object.assign(levels, await fetchLevels(miss));
  } else {
    if (offline) throw new Error(`--offline 但找不到 ${LEVEL_CACHE}`);
    console.log(`抓取 Level（${levelIds.length} 筆）…`);
    levels = await fetchLevels(levelIds);
  }
  await mkdir(CACHE, { recursive: true });
  await writeFile(LEVEL_CACHE, JSON.stringify(levels));

  // data/maps.json 只收 210 張外景地圖，副本／室內的實例地圖不在裡面（雙劍士行會的
  // 「雪絨花商會」就是這種）。這些拿不到 sizeFactor 也就算不出座標，但 Map.PlaceName
  // 還是查得到官方繁中地名——退而給地名、座標留 null，總比整格空白好。
  const instMaps = {};
  const unknownMaps = [...new Set(levelIds.map((id) => levels[id]?.["Map@as(raw)"]).filter((m) => m && !mapById.has(m)))];
  if (unknownMaps.length) {
    if (existsSync(MAPPLACE_CACHE)) Object.assign(instMaps, JSON.parse(await readFile(MAPPLACE_CACHE, "utf8")));
    const miss = unknownMaps.filter((m) => !(m in instMaps));
    if (miss.length && !offline) {
      for (const m of miss) {
        try {
          const d = await getJson(`${V2}/Map/${m}?fields=${F("PlaceName@as(raw)")}`);
          instMaps[m] = d.fields["PlaceName@as(raw)"] || 0;
        } catch { instMaps[m] = 0; }
      }
      await writeFile(MAPPLACE_CACHE, JSON.stringify(instMaps));
    }
  }

  // 世界座標 → 地圖座標（同 patch-aether-coords.mjs）
  function toMapCoords(levelId) {
    const lv = levels[levelId];
    if (!lv) return null;
    const m = mapById.get(lv["Map@as(raw)"]);
    if (!m) {
      const nm = twName(placeMsg.twPlaces, instMaps[lv["Map@as(raw)"]]);
      return nm ? { mapId: null, mapName: nm, x: null, y: null } : null;
    }
    const c = (m.sizeFactor ?? 100) / 100;
    const conv = (w, o) => Math.round(((41 / c) * ((w + o) * c + 1024) / 2048 + 1) * 10) / 10;
    return { mapId: m.id, mapName: m.name, x: conv(lv.X, m.offsetX ?? 0), y: conv(lv.Z, m.offsetY ?? 0) };
  }
  const npcName = (id) => npcById.get(id)?.name || twName(npcMsg.twNpcs, id);

  // ── 組裝 ──
  const cover = { quest: 0, npc: 0, place: 0, genre: 0, prev: 0, total: 0 };
  const dropped = [];
  const out = [];

  // 單一任務的完整描述。無台服名回 null（閘門②：台服未開放），其餘欄位查不到就留 null。
  // 系統解鎖與職業解鎖共用同一份邏輯，兩邊的覆蓋率也算在同一組計數器裡。
  function questDetail(r) {
    const name = twQuests[r.id]?.tw;
    if (!name) return null;
    cover.total++; cover.quest++;

    const issuerId = r.f["IssuerStart@as(raw)"] || null;
    const issuer = issuerId ? npcName(issuerId) : null;
    if (issuer) cover.npc++;
    const at = toMapCoords(r.f["IssuerLocation@as(raw)"]);
    if (at) cover.place++;
    const genre = twName(tw.journalGenre, r.f["JournalGenre@as(raw)"]);
    if (genre) cover.genre++;

    // 前置任務：只往上追一層（再往上多半接到主線，列出來反而是雜訊）
    const prev = (r.f["PreviousQuest@as(raw)"] || [])
      .filter(Boolean)
      .map((pid) => (twQuests[pid]?.tw ? { id: pid, name: twQuests[pid].tw, level: byId.get(pid)?.f.ClassJobLevel?.[0] ?? null } : null))
      .filter(Boolean);
    if (prev.length) cover.prev++;

    return {
      id: r.id,
      name,
      nameEn: r.f.Name,
      level: r.f.ClassJobLevel?.[0] ?? null,
      genre: genre || null,
      issuer: issuer ? { id: issuerId, name: issuer } : null,
      at,
      prev,
    };
  }

  for (const { sys, hits } of resolved) {
    const quests = [];
    for (const r of hits) {
      const q = questDetail(r);
      if (q) quests.push(q);
    }
    if (!quests.length) { dropped.push(`${sys.key}（${sys.name}）：任務無台服名`); continue; }
    out.push({
      key: sys.key, name: sys.name, tool: sys.tool || null,
      basis: sys.basis,
      ...(sys.gcVariants ? { gcVariants: true } : {}),
      quests,
    });
  }

  // ── 職業與行會 ──
  const jobTw = JSON.parse(await readFile(join(DATA, "equip.json"), "utf8")).names;
  const itemById = new Map(JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data.map((i) => [i.id, i]));
  // 職能：細分類優先，同一個職業只取第一個命中的
  const roleOf = new Map();
  for (const cid of ROLE_CATS) {
    const cat = bundle.cats.find((c) => c.id === cid);
    if (!cat) continue;
    const label = (twName(tw.jobCategories, cid) || "").replace(/（[^（）]*）$/, "");
    if (!label) continue;
    for (const [abbr, on] of Object.entries(cat.f)) {
      if (on === true && !roleOf.has(abbr)) roleOf.set(abbr, { id: cid, name: label });
    }
  }

  const jobs = [];
  const jobDropped = [];
  for (const j of bundle.jobs) {
    const abbr = j.f.Abbreviation;
    if (!abbr) continue;                                   // row 0（冒險者）沒有縮寫
    const twJobName = jobTw[abbr];
    if (!twJobName) { jobDropped.push(`${abbr}（${j.f.NameEnglish}）：equip.json 查無繁中職業名`); continue; }  // 閘門⑥

    const unlockQ = j.f["UnlockQuest@as(raw)"] || 0;
    const kind = unlockQ ? "job" : "class";
    const qRow = unlockQ ? byId.get(unlockQ) : guildByJob.get(j.id);
    if (!qRow) { jobDropped.push(`${twJobName}：查無解鎖任務（UnlockQuest=${unlockQ}）`); continue; }
    const quest = questDetail(qRow);
    if (!quest) { jobDropped.push(`${twJobName}：解鎖任務「${qRow.f.Name}」無台服名`); continue; }

    // 前置職業：ClassJobParent 指向自己就是基礎職本身，不算前置
    const parentId = j.f["ClassJobParent@as(raw)"] || 0;
    const parentAbbr = parentId && parentId !== j.id ? bundle.jobs.find((x) => x.id === parentId)?.f.Abbreviation : null;
    const parent = parentAbbr && jobTw[parentAbbr] ? { id: parentId, abbr: parentAbbr, name: jobTw[parentAbbr] } : null;

    // 接取條件：ClassJobRequired 指名某個職業（ARR 的四職＋忍者這種），否則任何職業到該等級即可
    const reqId = bundle.req[quest.id] || 0;
    const reqAbbr = reqId ? bundle.jobs.find((x) => x.id === reqId)?.f.Abbreviation : null;
    const requires = reqAbbr && jobTw[reqAbbr]
      ? { id: reqId, abbr: reqAbbr, name: jobTw[reqAbbr], level: quest.level }
      : quest.level > 1 ? { id: null, abbr: null, name: null, level: quest.level } : null;

    const soulId = kind === "job" ? j.f["ItemSoulCrystal@as(raw)"] || 0 : 0;
    const soul = soulId && itemById.has(soulId)
      ? { id: soulId, name: itemById.get(soulId).name, icon: itemById.get(soulId).icon }
      : null;

    jobs.push({
      id: j.id, abbr, name: twJobName, nameEn: j.f.NameEnglish, kind,
      role: roleOf.get(abbr) || null,
      parent,
      requires,
      soulCrystal: soul,
      quest,
    });
  }
  jobs.sort((a, b) => a.id - b.id);

  // ── 報告 ──
  const pct = (n) => `${n}/${cover.total}（${((n / cover.total) * 100).toFixed(0)}%）`;
  console.log(`\n對照表 ${SYSTEMS.length} 條 → 解出 ${out.length} 個系統、${cover.total} 條任務`);
  console.log(`  任務台服名  ${pct(cover.quest)}`);
  console.log(`  接取 NPC    ${pct(cover.npc)}`);
  console.log(`  地點＋座標  ${pct(cover.place)}`);
  console.log(`  手帳章節    ${pct(cover.genre)}`);
  console.log(`  有前置任務  ${pct(cover.prev)}`);
  if (dropped.length) console.log(`\n台服未開放而略過：\n  ${dropped.join("\n  ")}`);

  console.log(`\n已知查不到單一解鎖任務（不寫進輸出，僅備查）：`);
  for (const [, name, why] of NO_SINGLE_QUEST) console.log(`  ${name}：${why}`);

  console.log("\n解出的系統：");
  for (const s of out) {
    const q = s.quests[0];
    console.log(`  ${s.name.padEnd(14)} Lv${String(q.level).padStart(2)} 「${q.name}」${q.issuer ? ` ${q.issuer.name}` : ""}${q.at ? `＠${q.at.mapName}${q.at.x == null ? "" : ` (${q.at.x}, ${q.at.y})`}` : ""}${s.gcVariants ? "（三團各一）" : ""}`);
  }

  // ── 職業報告 ──
  const nClass = jobs.filter((j) => j.kind === "class").length;
  const nJob = jobs.filter((j) => j.kind === "job").length;
  console.log(`\n職業 ${jobs.length} 個（基礎職 ${nClass}／進階職 ${nJob}）`);
  console.log(`  有職能分類  ${jobs.filter((j) => j.role).length}/${jobs.length}`);
  console.log(`  有前置職業  ${jobs.filter((j) => j.parent).length}/${jobs.length}`);
  console.log(`  有靈魂水晶  ${jobs.filter((j) => j.soulCrystal).length}/${nJob}（進階職才有）`);
  console.log(`  行會任務由對照表解出 ${guildByJob.size}／${GUILD_QUESTS.length}，其餘 ${nJob} 個走 ClassJob.UnlockQuest`);
  if (jobDropped.length) console.log(`\n職業略過：\n  ${jobDropped.join("\n  ")}`);
  console.log("\n解出的職業：");
  for (const j of jobs) {
    const q = j.quest;
    const req = j.requires ? (j.requires.name ? `需 ${j.requires.name} Lv${j.requires.level}` : `需 Lv${j.requires.level}`) : "無前置";
    console.log(`  ${j.name.padEnd(6)} ${j.kind === "job" ? "進階" : "基礎"} ${(j.role?.name || "—").padEnd(11)} ${req.padEnd(16)} 「${q.name}」${q.issuer ? ` ${q.issuer.name}` : ""}${q.at ? `＠${q.at.mapName}${q.at.x == null ? "" : ` (${q.at.x}, ${q.at.y})`}` : ""}`);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  const envelope = {
    schema: "system-unlocks",
    updated: new Date().toISOString().slice(0, 10),
    source: "XIVAPI v2 Quest/Level/ClassJob/ClassJobCategory + out_data/tw-quests.json + data/npcs.json + data/maps.json + data/equip.json + data/items.json + tw-locales；系統名為本站頁面名稱",
    note: "對照表在 scripts/lib/system-unlock-map.mjs（人工維護，每條附認定依據）；jobs 的進階職完全由 ClassJob.UnlockQuest 解出，只有 20 個基礎職的行會任務靠對照表",
    count: out.length,
    data: out,
    jobCount: jobs.length,
    jobs,
  };
  await writeFile(join(DATA, "system-unlocks.json"), JSON.stringify(envelope));
  console.log(`\n✓ data/system-unlocks.json（${out.length} 個系統、${jobs.length} 個職業）`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
