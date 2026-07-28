/**
 * patch-triple-triad-source-names.mjs
 *
 * 把 data/triple-triad.json 裡「只有 id、沒有名稱」的取得方式補上台服繁中名。
 *
 * 背景：`build-triple-triad-all.mjs` 步驟 3 從 Garland Tools 抓副本／任務／藏寶圖三類
 * 來源時，只存了對方的 id 沒存名稱，於是前端 `srcLine()` 拿不到 `detail`，詳情欄只能
 * 印「副本 ×2」這種等於沒講的東西。本腳本補的就是那 281 筆：
 *
 *   副本   194 筆（182 個相異 instanceId）→ Garland 英文名 → dungeons.json 比對 → 繁中副本名
 *   藏寶圖  82 筆（10 個相異 treasureId）  → treasureId 其實是 itemId → items.json 台服物品名
 *   任務     5 筆（1 個相異 questId）      → Teamcraft tw/tw-quests.json 官方繁中任務名
 *
 * ── 三個踩過的雷，改這支之前務必讀 ──────────────────────────────────────────
 *
 * ① **`instanceId` 是 Garland 自家的 id，不是 ContentFinderCondition id。**
 *    182 個裡有 64 個「剛好」也是 dungeons.json 的有效 key，很容易誤以為可以直接對，
 *    但實測 **id 96 就對錯了**：Garland 96 = The Skydeep Cenote（7.0 副本），
 *    dungeons.json 96 = 巴哈姆特大迷宮 邂逅之章4。這正是 PROGRESS §二之一 說的
 *    「更危險的是對得到的」。**一律用英文名比對，絕不用 id 直接對。**
 *    Garland 的 id 分段：小 id＝Dungeons、20xxx＝Trials（討伐戰）、30xxx＝Raids（大型任務）。
 *
 * ② **`treasureId` 根本不是藏寶圖 id，是 itemId**，而且 10 個裡有 7 個是「九宮幻卡◯包」
 *    這種金碟幣卡包（obtainable-methods.json 佐證：specialshop「幻卡」、NPC 卡片兌換員、
 *    貨幣金碟幣 520～8000），只有白銀／黃金寶藏才真的跟寶物庫有關。型別「藏寶圖」是
 *    上游帶錯的，本腳本依 obtainable-methods 的實際取得方式改成「卡包」／「藏寶圖」。
 *
 * ③ **型別要以 dungeons.json 的 `type` 為準重新標**，不要沿用上游的「副本」。Garland 把
 *    討伐戰與大型任務也塞在同一批，照抄會讓「真·伊弗利特殲滅戰」被標成副本。
 *
 * 對不到的一律留空、不猜——維持前端「型別 ×n」的既有行為，這比填一個錯名字好。
 *
 * 執行：
 *   node scripts/patch-triple-triad-source-names.mjs           # dry-run，只印要改什麼
 *   node scripts/patch-triple-triad-source-names.mjs --apply   # 寫入 data/triple-triad.json
 *   node scripts/patch-triple-triad-source-names.mjs --offline # 只用 out_data/ 既有快取，不連外
 * 改完記得跑：node scripts/validate-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const OFFLINE = process.argv.includes('--offline');

const GARLAND_INSTANCE = 'https://garlandtools.org/db/doc/instance/en/2';
const TW_QUESTS = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-quests.json';

const CACHE_DIR = path.join(ROOT, 'out_data');
const CACHE_INSTANCES = path.join(CACHE_DIR, 'garland-instances.json');
const CACHE_QUESTS = path.join(CACHE_DIR, 'tw-quests.json');

// dungeons.json 的 type → triple-triad.json 的 sources[].type（沿用既有用語，
// 與 patch-triple-triad-new-cards.mjs 同一份對照）
const CONTENT_TYPE_TW = {
  dungeon: '副本', guildhest: '副本',
  alliance_raid: '多人副本',
  trial_hard: '討伐戰', trial_ex: '討伐戰',
  raid_normal: '大型任務', raid_savage: '大型任務', ultimate: '絕境戰',
  // 2026-07-28：dungeons.json 補收了深宮／優雷卡／多變迷宮後才有的型別
  variant_dungeon: '多變迷宮', deep_dungeon: '深宮', eureka: '優雷卡', bozja: '博茲雅',
};

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readData = (rel) => readJson(path.join(ROOT, rel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 英文副本名正規化：Garland 與 dungeons.json 的冠詞大小寫與標點不一致
 *  （"The Aurum Vale" vs "the Aurum Vale"），比對前一律拉平。 */
function normEn(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9'()]+/g, ' ')
    .trim();
}

async function fetchJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(700 * i);
    }
  }
}

// ── 取 Garland 副本資料（含本機快取）────────────────────────────────────────
async function loadInstances(ids) {
  let cache = {};
  if (fs.existsSync(CACHE_INSTANCES)) cache = readJson(CACHE_INSTANCES);
  const missing = ids.filter((id) => !cache[id]);

  if (missing.length && OFFLINE) {
    console.warn(`  ⚠ --offline：快取缺 ${missing.length} 筆副本，這些會補不到名稱`);
  } else if (missing.length) {
    console.log(`  從 Garland 抓 ${missing.length} 個副本（快取命中 ${ids.length - missing.length}）…`);
    let n = 0;
    for (const id of missing) {
      try {
        const j = await fetchJson(`${GARLAND_INSTANCE}/${id}.json`);
        const inst = j.instance || {};
        cache[id] = { name: inst.name ?? null, category: inst.category ?? null, patch: inst.patch ?? null };
      } catch (e) {
        cache[id] = { name: null, category: null, patch: null, error: String(e.message || e) };
        console.warn(`    ⚠ instance ${id} 抓取失敗：${e.message || e}`);
      }
      if (++n % 25 === 0) console.log(`    …${n}/${missing.length}`);
      await sleep(120);
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_INSTANCES, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    console.log(`  已快取到 ${path.relative(ROOT, CACHE_INSTANCES)}`);
  }
  return cache;
}

// ── 取 Teamcraft 官方繁中任務名（含本機快取）───────────────────────────────
async function loadTwQuests() {
  if (fs.existsSync(CACHE_QUESTS)) return readJson(CACHE_QUESTS);
  if (OFFLINE) { console.warn('  ⚠ --offline 且無 tw-quests 快取，任務名補不到'); return {}; }
  console.log('  下載 Teamcraft tw-quests.json…');
  const q = await fetchJson(TW_QUESTS);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_QUESTS, JSON.stringify(q), 'utf8');
  console.log(`  已快取到 ${path.relative(ROOT, CACHE_QUESTS)}（${Object.keys(q).length} 筆）`);
  return q;
}

async function main() {
  const triadPath = path.join(ROOT, 'data/triple-triad.json');
  const triad = readData('data/triple-triad.json');
  const cards = triad.data;
  const dungeons = (readData('data/dungeons.json').data || []);
  const items = (readData('data/items.json').data || []);
  const om = readData('data/obtainable-methods.json');
  const omData = om.data || om;

  const itemById = new Map(items.map((i) => [i.id, i]));

  // 英文副本名 → dungeons.json 那一列（同名多列時保留第一筆，並記錄衝突）
  const dunByEn = new Map();
  const dupEn = [];
  for (const d of dungeons) {
    const k = normEn(d.nameEn);
    if (!k) continue;
    if (dunByEn.has(k)) { dupEn.push(d.nameEn); continue; }
    dunByEn.set(k, d);
  }

  // ── 盤點要補的 id ────────────────────────────────────────────────────────
  const instIds = new Set(), treIds = new Set(), questIds = new Set();
  for (const c of cards) {
    for (const s of c.sources || []) {
      if (s.detail) continue;                       // 已經有名稱的不動
      if (s.instanceId != null) instIds.add(s.instanceId);
      if (s.treasureId != null) treIds.add(s.treasureId);
      if (s.questId != null) questIds.add(s.questId);
    }
  }
  console.log(`要補名的相異 id：副本 ${instIds.size}、卡包/藏寶圖 ${treIds.size}、任務 ${questIds.size}`);
  if (dupEn.length) console.log(`（dungeons.json 有 ${dupEn.length} 個英文同名列，比對時取第一筆）`);

  // ── 解析副本 ─────────────────────────────────────────────────────────────
  console.log('\n━━ 副本 ━━');
  const instCache = await loadInstances([...instIds].sort((a, b) => a - b));
  const instResolved = new Map();   // garlandId → { contentId, name, type }
  const instUnmatched = [];
  let idCollision = 0;
  for (const id of instIds) {
    const g = instCache[id];
    if (!g || !g.name) { instUnmatched.push({ id, why: 'Garland 無資料' }); continue; }
    const d = dunByEn.get(normEn(g.name));
    if (!d) { instUnmatched.push({ id, why: `dungeons.json 查無「${g.name}」` }); continue; }
    if (!d.name) { instUnmatched.push({ id, why: `「${g.name}」無台服繁中名` }); continue; }
    const type = CONTENT_TYPE_TW[d.type];
    if (!type) console.warn(`  ⚠ instance ${id}「${d.name}」未對應的副本類型 ${d.type}，暫記為「副本」`);
    instResolved.set(id, { contentId: d.id, name: d.name, type: type || '副本' });
    if (d.id !== id) idCollision++;
  }
  console.log(`  解出 ${instResolved.size}/${instIds.size} 個副本的台服繁中名`);
  console.log(`  其中 ${idCollision} 個的 Garland id ≠ ContentFinderCondition id`
    + `（若直接拿 instanceId 當 contentId 用，這些全會對到錯的副本）`);
  if (instUnmatched.length) {
    console.log(`  對不到 ${instUnmatched.length} 個（留空不猜）：`);
    instUnmatched.slice(0, 10).forEach((u) => console.log(`    ${u.id}：${u.why}`));
    if (instUnmatched.length > 10) console.log(`    …其餘 ${instUnmatched.length - 10} 筆`);
  }

  // ── 解析卡包／藏寶圖（treasureId 其實是 itemId）──────────────────────────
  console.log('\n━━ 卡包／藏寶圖 ━━');
  const treResolved = new Map();
  for (const id of treIds) {
    const it = itemById.get(id);
    if (!it || !it.name) { console.log(`  ${id}：items.json 查無此物品，留空`); continue; }
    // 取得方式以 obtainable-methods 為準決定型別，不看名字猜
    const methods = omData[id] || omData[String(id)] || [];
    const shop = methods.find((m) => m.type === 'specialshop');
    let type, detail;
    if (shop) {
      type = '卡包';
      const npc = (shop.npcs || [])[0];
      const cur = shop.currency;
      detail = it.name
        + (npc || cur ? '（' + [npc && npc.name, cur && `${cur.amount} ${cur.name}`].filter(Boolean).join('・') + '）' : '');
    } else if (methods.some((m) => m.type === 'instance')) {
      type = '藏寶圖';
      detail = it.name;
    } else {
      type = null;              // 無佐證 → 型別維持原樣，只補名稱
      detail = it.name;
    }
    treResolved.set(id, { type, detail, itemId: id });
    console.log(`  ${id} → ${type || '(型別不動)'}：${detail}`);
  }

  // ── 解析任務 ─────────────────────────────────────────────────────────────
  console.log('\n━━ 任務 ━━');
  const twQuests = await loadTwQuests();
  const questResolved = new Map();
  for (const id of questIds) {
    const q = twQuests[id] || twQuests[String(id)];
    const nm = q && (q.tw || q.zh || q.name);
    if (!nm) { console.log(`  ${id}：tw-quests 查無，留空`); continue; }
    questResolved.set(id, nm);
    console.log(`  ${id} → ${nm}`);
  }

  // ── 已有 contentId 的來源：每次都重新對 dungeons.json 同步型別與名稱 ─────
  // 這樣 dungeons.json 一有變動（補收新副本、校正繁中名）再跑一次就會自我修正。
  // 2026-07-28 就靠這段把 10 張多變迷宮的卡從「副本」改標成「多變迷宮」。
  const dunById = new Map(dungeons.map((d) => [d.id, d]));
  let resynced = 0;
  for (const c of cards) {
    for (const s of c.sources || []) {
      if (s.contentId == null) continue;
      const d = dunById.get(s.contentId);
      if (!d || !d.name) continue;
      const want = CONTENT_TYPE_TW[d.type] || '副本';
      if (s.type === want && s.detail === d.name) continue;
      if (APPLY) { s.type = want; s.detail = d.name; }
      resynced++;
    }
  }
  console.log(`\n已有 contentId 的來源重新同步：${resynced} 筆`);

  // ── 套用 ─────────────────────────────────────────────────────────────────
  let filled = 0, retyped = 0;
  const typeChanges = {};
  for (const c of cards) {
    for (const s of c.sources || []) {
      if (s.detail) continue;
      if (s.instanceId != null && instResolved.has(s.instanceId)) {
        const r = instResolved.get(s.instanceId);
        if (s.type !== r.type) { typeChanges[`${s.type}→${r.type}`] = (typeChanges[`${s.type}→${r.type}`] || 0) + 1; retyped++; }
        if (APPLY) {
          s.type = r.type;
          s.contentId = r.contentId;
          s.detail = r.name;
          // Garland 內部 id 解完就丟：它跟 ContentFinderCondition id 只有 31/182 相同，
          // 留著只會讓下一個人以為可以拿去對 dungeons.json（雷 ① 就是這樣踩的）。
          delete s.instanceId;
        }
        filled++;
      } else if (s.treasureId != null && treResolved.has(s.treasureId)) {
        const r = treResolved.get(s.treasureId);
        if (r.type && s.type !== r.type) { typeChanges[`${s.type}→${r.type}`] = (typeChanges[`${s.type}→${r.type}`] || 0) + 1; retyped++; }
        if (APPLY) {
          if (r.type) s.type = r.type;
          s.itemId = r.itemId;              // 正名：這個欄位一直都是 itemId
          s.detail = r.detail;
          delete s.treasureId;
        }
        filled++;
      } else if (s.questId != null && questResolved.has(s.questId)) {
        if (APPLY) s.detail = questResolved.get(s.questId);
        filled++;
      }
    }
  }

  // ── 第二階段：純英文的 NPC 名 detail → 台服官方繁中名 ──────────────────
  // 上游 wiki 抓來的 detail 有一批是**整串就是一個英文 NPC 名**（Triple Triad Trader、
  // Elaisse…），前端會原封不動印出來，違反繁中鐵則。用 out_data/npcs.msgpack
  // （Teamcraft `npcs` 英文 + `twNpcs` 官方繁中，本機既有、不連外）反查。
  // **只處理「整串＝一個英文 NPC 名」**：夾在句子裡的（如「Purchased from C'intana
  // in Mor Dhona…」）不動，改寫整句話等於重編內容，寧可留著也不猜。
  console.log('\n━━ 英文 NPC 名 → 繁中名 ━━');
  const enFixes = await englishNpcNames(cards);
  let enFilled = 0;
  for (const c of cards) {
    for (const s of c.sources || []) {
      if (!s.detail) continue;
      const tw = enFixes.get(s.detail.trim().toLowerCase());
      if (!tw) continue;
      if (APPLY) s.detail = tw;
      enFilled++;
    }
  }
  console.log(`  可換的筆數：${enFilled}`);

  // ── 結算 ─────────────────────────────────────────────────────────────────
  const stillEmpty = cards.reduce((n, c) =>
    n + (c.sources || []).filter((s) => !s.detail && s.type !== 'NPC對戰').length, 0);
  const stillEn = cards.reduce((n, c) =>
    n + (c.sources || []).filter((s) => s.detail && !/[一-鿿]/.test(s.detail)).length, 0);
  console.log('\n━━ 結算 ━━');
  console.log(`  補上名稱的來源筆數：${filled}`);
  console.log(`  英文 NPC 名換成繁中：${enFilled}`);
  console.log(`  仍為純英文的 detail：${APPLY ? stillEn : stillEn - enFilled} 筆`
    + `（成就名無台服來源／wiki 英文句子，依鐵則不猜）`);
  console.log(`  型別修正：${retyped} 筆` + (Object.keys(typeChanges).length
    ? '（' + Object.entries(typeChanges).map(([k, v]) => `${k} ×${v}`).join('、') + '）' : ''));
  console.log(`  仍無名稱（NPC對戰除外，它靠 npcName 顯示）：${APPLY ? stillEmpty : stillEmpty - filled} 筆`);

  if (!APPLY) {
    console.log('\n（dry-run，未寫入。加 --apply 才會寫進 data/triple-triad.json）');
    return;
  }

  triad.updated = new Date().toISOString().slice(0, 10);
  triad.source = 'xivapi+items+npcs+maps+dungeons+garland+tw-quests';
  fs.writeFileSync(triadPath, JSON.stringify(triad, null, 2) + '\n', 'utf8');
  console.log(`\n✓ 已寫入 data/triple-triad.json`);
  console.log('  接著跑：node scripts/validate-data.mjs');
}

/** 掃出「detail 整串就是一個英文 NPC 名」的那些，回傳 小寫英文名 → 台服繁中名。
 *  資料來自 out_data/npcs.msgpack（Teamcraft）：`npcs` 有 en、`twNpcs` 有官方 tw。
 *  同一個英文名常對到多個 ENpc row（團長莫古京有 19 個），**繁中名不唯一就跳過**，
 *  避免在有歧義時挑錯。 */
async function englishNpcNames(cards) {
  const out = new Map();
  const pack = path.join(CACHE_DIR, 'npcs.msgpack');
  if (!fs.existsSync(pack)) {
    console.warn(`  ⚠ 找不到 ${path.relative(ROOT, pack)}，略過這一階段`);
    return out;
  }
  const { decode } = await import('@msgpack/msgpack');
  const { npcs, twNpcs } = decode(fs.readFileSync(pack));

  // 英文名（小寫）→ 該名字底下所有 row 的繁中名集合
  const enToTw = new Map();
  for (const [id, v] of Object.entries(npcs)) {
    const en = (v && v.en || '').trim().toLowerCase();
    if (!en) continue;
    const tw = twNpcs[id] && twNpcs[id].tw;
    if (!tw) continue;
    if (!enToTw.has(en)) enToTw.set(en, new Set());
    enToTw.get(en).add(tw);
  }

  // 只看實際出現在資料裡、且整串無中文的 detail
  const wanted = new Set();
  for (const c of cards) {
    for (const s of c.sources || []) {
      if (s.detail && !/[一-鿿]/.test(s.detail)) wanted.add(s.detail.trim());
    }
  }
  for (const d of wanted) {
    const set = enToTw.get(d.toLowerCase());
    if (!set) { console.log(`  ✗ ${d}（不是單一 NPC 名，或 Teamcraft 查無）`); continue; }
    if (set.size > 1) { console.log(`  ✗ ${d}（繁中名不唯一：${[...set].join('／')}）`); continue; }
    const tw = [...set][0];
    out.set(d.toLowerCase(), tw);
    console.log(`  ✓ ${d} → ${tw}`);
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
