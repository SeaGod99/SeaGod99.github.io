// patch-triple-triad-sources.mjs
// 修正 data/triple-triad.json 的「NPC對戰」來源語意，並補上入場費與對局規則。
//
// ── 這在修什麼 ──────────────────────────────────────────────────────────
// `build-triple-triad-all.mjs` 步驟 2 把 `TripleTriadCardFixed/Variable`（＝**NPC 的牌組**）
// 當成「打這個 NPC 可以拿到這張卡」寫進 sources，標成 dropType 固定／隨機。
// 真正的獎勵欄位是 `ItemPossibleReward`（**道具 id**，與卡片 row id 是不同 id 空間），
// 那個欄位從來沒被抓過。
//
// 實測（2026-09-23）：現行 938 組「NPC對戰」裡 934 組（99.6%）其實是牌組，
// 只有 226 組碰巧也是真獎勵；另有 33 組真獎勵完全沒被列出。
// 最明顯的例子是卡 1「渡渡鳥」——現在列了 3 個 NPC，真獎勵 NPC 是 0 個。
//
// ── 修法 ─────────────────────────────────────────────────────────────
// 把原本一種 type 拆成兩種語意，兩種都保留（牌組資訊本身有用，只是不能叫「來源」）：
//   NPC對戰 ＝ ItemPossibleReward 解出的真獎勵（打贏可得），附 fee 與 rules
//   NPC牌組 ＝ Fixed/Variable 解出的牌組（這個 NPC 手上有這張卡）
//
// 卡片 ↔ 道具的對應走 `Item.AdditionalData → TripleTriadCard`（可證的對應關係），
// **不用** build 腳本那種「把九宮幻卡道具照 id 排序、取第 n 個當第 n 張卡」的位置推測
// （docs/專案慣例與記憶.md §4.10：外部 id 一律用可證關係比對，不要靠序位巧合）。
//
// 規則繁中名取自 out_data/tw-locales.msgpack 的 tripleTriadRules（台服官方名，15/15 齊）。
// 地點沿用 patch-triple-triad-locations.mjs 的規則（npcs.json → maps.json）。
//
// 執行（repo 根目錄）：
//   node scripts/patch-triple-triad-sources.mjs             # dry-run，印比對報告
//   node scripts/patch-triple-triad-sources.mjs --apply     # 實際寫入
//   node scripts/patch-triple-triad-sources.mjs --offline   # 用 out_data/cache 的快取

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const CACHE = join(ROOT, "out_data", "cache");
const CACHE_FILE = join(CACHE, "triple-triad-sheets.json");

const apply = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");

const V2 = "https://v2.xivapi.com/api/sheet";
const F = (s) => encodeURIComponent(s);

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

async function fetchSheets(cardItemIds) {
  // 0) TripleTriadCardResident：遊戲內幻卡手帳自己顯示的「取得方法」
  //    AcquisitionType 決定 Acquisition 指向哪個 id 空間（實測 2026-09-23）：
  //      6  → ENpcResident（打這個 NPC 可得）152 張——**152/152 全落在 ItemPossibleReward 解出的獎勵集合內**，
  //           等於遊戲自己的表獨立驗證了本腳本的修法
  //      10 → ENpcResident（兌換 NPC）62 張
  //      11 → Achievement（成就）20 張
  //      8  → Item（卡包）62 張／2,3,4,5,7,9,12 → 副本・藏寶圖等，既有 Garland 來源已涵蓋
  const resident = await getJson(
    `${V2}/TripleTriadCardResident?limit=500&fields=${F("AcquisitionType@as(raw),Acquisition@as(raw)")}`
  );

  // 1) 幻卡道具 → TripleTriadCard row（Item.AdditionalData）
  const itemToCard = {};
  for (let i = 0; i < cardItemIds.length; i += 100) {
    const ids = cardItemIds.slice(i, i + 100);
    const d = await getJson(`${V2}/Item?rows=${ids.join(",")}&fields=${F("AdditionalData@as(raw)")}`);
    for (const r of d.rows) {
      const c = r.fields["AdditionalData@as(raw)"];
      if (c > 0) itemToCard[r.row_id] = c;
    }
  }

  // 2) TripleTriad（對局）：146 列，一次拿完
  const tt = await getJson(
    `${V2}/TripleTriad?limit=500&fields=${F(
      "Fee,TripleTriadRule@as(raw),ItemPossibleReward@as(raw),TripleTriadCardFixed@as(raw),TripleTriadCardVariable@as(raw),UsesRegionalRules"
    )}`
  );

  // 3) ENpcBase 全量掃描：哪個 NPC 主持哪一場對局
  //    （原腳本是拿 22k 個 npc id 逐一打 API；改成整表分頁掃描，約 120 次請求）
  const ttRows = new Set(tt.rows.map((r) => r.row_id));
  const rowToNpc = {};
  let after = null, scanned = 0;
  for (;;) {
    const d = await getJson(`${V2}/ENpcBase?limit=500&fields=${F("ENpcData@as(raw)")}` + (after ? `&after=${after}` : ""));
    if (!d.rows.length) break;
    for (const r of d.rows) {
      for (const v of r.fields["ENpcData@as(raw)"] || []) if (ttRows.has(v)) rowToNpc[v] = r.row_id;
    }
    scanned += d.rows.length;
    after = d.rows[d.rows.length - 1].row_id;
    process.stdout.write(`\r  ENpcBase 掃描 ${scanned}`);
    if (d.rows.length < 500) break;
  }
  process.stdout.write("\n");

  return {
    fetched: new Date().toISOString().slice(0, 10),
    itemToCard, tt: tt.rows, rowToNpc, enpcScanned: scanned,
    resident: resident.rows,
  };
}

async function main() {
  const db = JSON.parse(await readFile(join(DATA, "triple-triad.json"), "utf8"));
  const items = JSON.parse(await readFile(join(DATA, "items.json"), "utf8")).data;
  const npcs = JSON.parse(await readFile(join(DATA, "npcs.json"), "utf8")).data;
  const maps = JSON.parse(await readFile(join(DATA, "maps.json"), "utf8")).data;
  const tw = await loadTwLocales();
  const tw2 = decode(await readFile(join(ROOT, "out_data", "npcs.msgpack")));

  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const mapName = new Map(maps.map((m) => [m.id, m.name]));
  const cardItemIds = items.filter((i) => i.category === "九宮幻卡").map((i) => i.id);
  console.log(`卡片 ${db.data.length} 張、幻卡道具 ${cardItemIds.length} 件`);

  let sheets;
  if (offline) {
    if (!existsSync(CACHE_FILE)) throw new Error(`--offline 但找不到快取 ${CACHE_FILE}`);
    sheets = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    console.log(`用快取（抓取日 ${sheets.fetched}）`);
  } else {
    sheets = await fetchSheets(cardItemIds);
    await mkdir(CACHE, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(sheets));
    console.log(`快取寫入 ${CACHE_FILE}`);
  }

  const itemToCard = new Map(Object.entries(sheets.itemToCard).map(([k, v]) => [Number(k), v]));
  const rowToNpc = new Map(Object.entries(sheets.rowToNpc).map(([k, v]) => [Number(k), v]));
  console.log(`對局 ${sheets.tt.length} 場，其中 ${rowToNpc.size} 場對得到 NPC`);

  // NPC 名的查找鏈：
  //   ① data/npcs.json —— build-npcs 產，**只收「有繁中名且有座標」者**（22,079 筆），有名有地點
  //   ② out_data/npcs.msgpack 的 twNpcs —— Teamcraft tw-npcs 原始表（28,529 筆），有名無座標
  //   ③ 兩邊都查不到 ＝ 台服真的沒有這個 NPC 的譯名 → 整場跳過（鐵則：不用英文／日文補）
  // 沒有 ② 會誤殺：幻卡對局的 16 個 NPC 不在 npcs.json（無座標而被濾掉），
  // 其中 14 個 twNpcs 有台服名（如「梅花天王歐里福」），漏掉會讓卡 #181 吉吉變成零來源。
  // validate-links 的「triple-triad.sources[].npcId → npcs」本來就有這個已知缺口。
  function npcInfo(npcId) {
    const n = npcById.get(npcId);
    const name = n?.name || twName(tw2.twNpcs, npcId);
    if (!name) return null;
    const out = { npcId, npcName: name, npcTitle: n?.title || twName(tw.npcTitles, npcId) };
    if (n?.coords && mapName.has(n.coords.mapId)) {
      out.location = { mapId: n.coords.mapId, mapName: mapName.get(n.coords.mapId), x: n.coords.x, y: n.coords.y };
    }
    return out;
  }

  // 規則名（台服官方，15/15）
  function ruleNames(ids) {
    return (ids || []).filter(Boolean).map((id) => twName(tw.tripleTriadRules, id)).filter(Boolean);
  }

  // ── 由 sheet 建兩張表 ───────────────────────────────────────────────
  const rewardByCard = new Map();   // cardId -> [source]
  const deckByCard = new Map();     // cardId -> [source]
  const stats = { matches: 0, noNpcName: new Set(), noReward: 0 };

  for (const row of sheets.tt) {
    const npcId = rowToNpc.get(row.row_id);
    if (!npcId) continue;
    const info = npcInfo(npcId);
    if (!info) { stats.noNpcName.add(npcId); continue; }
    stats.matches++;

    const f = row.fields;
    const rules = ruleNames(f["TripleTriadRule@as(raw)"]);
    const fee = f.Fee || 0;

    const rewards = (f["ItemPossibleReward@as(raw)"] || []).filter(Boolean);
    if (!rewards.length) stats.noReward++;
    for (const itemId of rewards) {
      const cardId = itemToCard.get(itemId);
      if (!cardId) continue;
      if (!rewardByCard.has(cardId)) rewardByCard.set(cardId, []);
      rewardByCard.get(cardId).push({
        type: "NPC對戰", ...info,
        ...(fee ? { fee } : {}),
        ...(rules.length ? { rules } : {}),
        ...(f.UsesRegionalRules ? { regionalRules: true } : {}),
      });
    }

    const deck = [
      ...(f["TripleTriadCardFixed@as(raw)"] || []).map((c) => [c, "固定"]),
      ...(f["TripleTriadCardVariable@as(raw)"] || []).map((c) => [c, "隨機"]),
    ].filter(([c]) => c);
    for (const [cardId, slot] of deck) {
      if (!deckByCard.has(cardId)) deckByCard.set(cardId, []);
      deckByCard.get(cardId).push({ type: "NPC牌組", ...info, slot });
    }
  }

  // ── 由遊戲自己的「取得方法」表補兩類 ────────────────────────────────
  // 這兩類是純補強，與上面的獎勵／牌組拆分互不覆蓋。
  const resById = new Map((sheets.resident || []).map((r) => [r.row_id, r.fields]));
  const SHOPISH = new Set(["MGP商店", "雙色寶石商店", "蒼穹石板商店", "青魔法師商店", "商店", "部族商店", "PvP商店", "博茲雅", "無人島"]);
  const MGP_EXCHANGER = 1010478;   // 卡片兌換員；既有資料已把他標成「MGP商店」，沿用以免同頁兩種說法

  // 副本類：type 2／3 的 Acquisition 是 ContentFinderCondition id（實測對 dungeons.json 91/91、15/15 全中）。
  // 來源型別名沿用既有資料的說法（由 dungeons.type 決定），不要另創詞彙。
  const DUNGEON_LABEL = {
    dungeon: "副本", quest_battle: "副本",
    trial_hard: "討伐戰", trial_ex: "討伐戰",
    alliance_raid: "多人副本",
    raid_normal: "大型任務", raid_savage: "大型任務",
    variant_dungeon: "多變迷宮",
  };
  const INSTANCE_TYPES = new Set(Object.values(DUNGEON_LABEL));
  const dungeons = JSON.parse(await readFile(join(DATA, "dungeons.json"), "utf8")).data;
  const dungeonById = new Map(dungeons.map((d) => [d.id, d]));

  const extraByCard = new Map();
  const acqStats = { shop: 0, achNew: 0, achUpgraded: 0, achNoTw: [], instance: 0 };
  for (const card of db.data) {
    const f = resById.get(card.id);
    if (!f) continue;
    const type = f["AcquisitionType@as(raw)"], acq = f["Acquisition@as(raw)"];
    const add = (s) => { if (!extraByCard.has(card.id)) extraByCard.set(card.id, []); extraByCard.get(card.id).push(s); };

    if (type === 10 && acq) {
      // 兌換 NPC：只在該卡「完全沒有商店類來源」時才補，避免與既有策展來源重複
      if (!(card.sources || []).some((s) => SHOPISH.has(s.type))) {
        const info = npcInfo(acq);
        if (info) {
          const where = info.location ? `（${info.location.mapName}）` : "";
          add({
            type: acq === MGP_EXCHANGER ? "MGP商店" : "商店",
            ...info,
            detail: `${info.npcName}${where}`,
          });
          acqStats.shop++;
        }
      }
    }

    if (type === 11 && acq) {
      // 成就：遊戲表給的是成就 id，tw-locales 有台服官方名與達成條件
      const name = twName(tw.achievements, acq);
      const cond = twName(tw.achievementDescriptions, acq);
      if (!name) { acqStats.achNoTw.push(card.id); continue; }
      const cur = (card.sources || []).find((s) => s.type === "成就");
      if (cur) { acqStats.achUpgraded++; } else { acqStats.achNew++; }
      // 既有的成就來源 detail 是英文（如 "Triple Team II"），就地換成台服官方名
      card.sources = (card.sources || []).filter((s) => s.type !== "成就");
      add({ type: "成就", achievementId: acq, detail: name, ...(cond ? { condition: cond } : {}) });
    }

    if ((type === 2 || type === 3) && acq) {
      // 副本／討伐戰：同樣只在該卡完全沒有副本類來源時才補
      if (!(card.sources || []).some((s) => INSTANCE_TYPES.has(s.type))) {
        const dg = dungeonById.get(acq);
        const label = dg && DUNGEON_LABEL[dg.type];
        if (dg && dg.name && label) {
          add({ type: label, contentId: acq, detail: dg.name });
          acqStats.instance++;
        }
      }
    }
  }
  console.log(`\n── 由遊戲「取得方法」表補強 ──`);
  console.log(`  兌換 NPC 補上商店來源：${acqStats.shop} 張`);
  console.log(`  成就：英文名換成台服官方名 ${acqStats.achUpgraded} 張、新增 ${acqStats.achNew} 張${acqStats.achNoTw.length ? `、無台服名 ${acqStats.achNoTw.length} 張` : ""}`);
  console.log(`  副本／討伐戰補上來源：${acqStats.instance} 張`);

  // ── 與現行資料比對 ─────────────────────────────────────────────────
  const curPairs = new Set();
  for (const c of db.data) for (const s of c.sources || []) if (s.type === "NPC對戰") curPairs.add(`${c.id}:${s.npcId}`);
  const rewardPairs = new Set();
  for (const [cid, list] of rewardByCard) for (const s of list) rewardPairs.add(`${cid}:${s.npcId}`);
  const deckPairs = new Set();
  for (const [cid, list] of deckByCard) for (const s of list) deckPairs.add(`${cid}:${s.npcId}`);

  const curInDeck = [...curPairs].filter((k) => deckPairs.has(k)).length;
  const curInReward = [...curPairs].filter((k) => rewardPairs.has(k)).length;
  const missedReward = [...rewardPairs].filter((k) => !curPairs.has(k)).length;

  console.log(`\n── 語意比對 ──`);
  console.log(`  現行「NPC對戰」            ${curPairs.size} 組`);
  console.log(`    其實是牌組               ${curInDeck}（${((curInDeck / curPairs.size) * 100).toFixed(1)}%）`);
  console.log(`    確實是獎勵               ${curInReward}（${((curInReward / curPairs.size) * 100).toFixed(1)}%）`);
  console.log(`  修正後「NPC對戰」(真獎勵)  ${rewardPairs.size} 組，涵蓋 ${rewardByCard.size} 張卡`);
  console.log(`    其中現行完全沒列到       ${missedReward} 組`);
  console.log(`  修正後「NPC牌組」          ${deckPairs.size} 組，涵蓋 ${deckByCard.size} 張卡`);
  if (stats.noNpcName.size) console.log(`  NPC 無台服名而整場跳過：${stats.noNpcName.size} 個`);
  console.log(`  有牌組但沒有任何獎勵的對局：${stats.noReward} 場`);

  // 抽樣：渡渡鳥
  const dodo = db.data.find((c) => c.id === 1);
  console.log(`\n  抽樣 卡1 ${dodo.name}：現行 ${dodo.sources.filter((s) => s.type === "NPC對戰").length} 個 NPC → 修正後獎勵 ${(rewardByCard.get(1) || []).length}、牌組 ${(deckByCard.get(1) || []).length}`);

  // ── 套用 ───────────────────────────────────────────────────────────
  let cardsChanged = 0;
  for (const card of db.data) {
    const keep = (card.sources || []).filter((s) => s.type !== "NPC對戰" && s.type !== "NPC牌組");
    const next = [
      ...(rewardByCard.get(card.id) || []),
      ...keep,
      ...(extraByCard.get(card.id) || []),
      ...(deckByCard.get(card.id) || []),
    ];
    if (JSON.stringify(next) !== JSON.stringify(card.sources || [])) cardsChanged++;
    card.__next = next;
  }
  const noSourceAfter = db.data.filter((c) => !c.__next.length);
  // 「只有牌組、沒有任何取得管道」＝畫面上等於答不出「這張卡怎麼拿」，要盯著
  const deckOnly = db.data.filter((c) => c.__next.length && c.__next.every((s) => s.type === "NPC牌組"));
  console.log(`\n  會變動的卡片：${cardsChanged}/${db.data.length}`);
  console.log(`  修正後無任何來源：${noSourceAfter.length}${noSourceAfter.length ? "　" + noSourceAfter.slice(0, 10).map((c) => `#${c.id} ${c.name}`).join("、") : ""}`);
  console.log(`  修正後只有牌組、無取得管道：${deckOnly.length}${deckOnly.length ? "　" + deckOnly.slice(0, 10).map((c) => `#${c.id} ${c.name}`).join("、") : ""}`);

  if (!apply) {
    for (const c of db.data) delete c.__next;
    console.log("\n（dry-run，未寫入；加 --apply 才寫）");
    return;
  }

  for (const c of db.data) { c.sources = c.__next; delete c.__next; }
  db.updated = new Date().toISOString().slice(0, 10);
  db.source = "xivapi-v2+items+npcs+maps+dungeons+garland+tw-quests+tw-locales";

  const raw = await readFile(join(DATA, "triple-triad.json"), "utf8");
  const pretty = raw.includes("\n  ");
  await writeFile(join(DATA, "triple-triad.json"), pretty ? JSON.stringify(db, null, 2) : JSON.stringify(db));
  console.log(`\n✓ data/triple-triad.json 已更新`);
  console.log("  接著跑：node scripts/validate-data.mjs && node scripts/sync-meta.mjs --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
