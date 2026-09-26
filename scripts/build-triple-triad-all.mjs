/**
 * build-triple-triad-all.mjs
 * 一鍵建立完整幻卡資料庫（卡牌資料 + 來源 + 中文化）
 *
 * 步驟：
 *   1. 基礎資料  — XIVAPI TripleTriadCard + TripleTriadCardResident + items.json 繁中名
 *   2. NPC 牌組  — Teamcraft tw-npcs + XIVAPI v2 ENpcBase 掃描（**是牌組不是獎勵**，見下）
 *   3. 其他來源  — Garland Tools（副本/任務/藏寶圖）
 *   4. Wiki 補齊 — FFXIV Wiki 補齊仍缺 sources 的卡
 *   5. 正規化    — 統一 type 中文名、清理 Wiki markup
 *
 * 執行：node scripts/build-triple-triad-all.mjs
 * 耗時約 60~90 分鐘（主要是步驟 2 掃描 28529 個 NPC）
 *
 * ⚠ **跑完必接** `node scripts/patch-triple-triad-sources.mjs --apply`
 *   本腳本的步驟 2 只產得出「NPC 的牌組」；真正的「打贏可得」來源、入場費與對局規則
 *   在 TripleTriad.ItemPossibleReward／Fee／TripleTriadRule，由那支 patch 負責。
 *   漏跑不會報錯，只會讓 258 筆真獎勵與 20 筆台服成就名安靜消失。
 *
 * ⚠ **張數不寫死**（2026-09-25 改）：以 v2 的 TripleTriadCard 全表為準。
 *   舊版寫死 TOTAL_CARDS = 425，而 v1 的同一張表也凍結在 425 筆、v2 有 475 筆——
 *   7.1 的 10 張新卡就是這樣安靜漏掉的。台服實際有幾張則看 items.json 的「九宮幻卡」道具數。
 *
 * ⚠ 卡片↔道具走 `Item.AdditionalData`（可證），對照抽在 lib/triple-triad-map.mjs，
 *   三支幻卡腳本共用。舊版用「第 n 個道具＝編號 n」的序位法，實測從編號 81 起整串偏移。
 *
 * ⚠ 全腳本已無 XIVAPI v1 呼叫（2026-09-25）。注意 `xivapi.com/i/...` 是圖示 CDN，不是 v1 API。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { xiv } from './lib/xivapi.mjs';
import { loadCardMap, describeCardMap } from './lib/triple-triad-map.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── 常數 ─────────────────────────────────────────────────────────────────

const XIVAPI_V2   = 'https://v2.xivapi.com/api/sheet';
const TC_BASE     = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json';
const GARLAND     = 'https://garlandtools.org/db/doc/item/en/3';
const WIKI        = 'https://ffxiv.consolegameswiki.com/mediawiki/api.php';
const CONCURRENCY = 30;
const DELAY_MS    = 50;

// 卡片類型（TripleTriadCardType）繁中名。來源：簡中官方（cafemaker）→ 繁中：
//   1 蛮神→蠻神、2 拂晓→拂曉(Scion 拂曉血盟)、3 兽人→獸人(Beastman)、4 帝国→帝國(Garlean)。
//   原值 {2:'光之戰士',3:'異族',4:'神羅'} 為誤填（神羅=FF7、光之戰士=玩家本人，皆非官方）。
const TYPE_TW = { 1: '蠻神', 2: '拂曉', 3: '獸人', 4: '帝國' };

// XIVAPI v1 nameEn → v2 正式名（Wiki 頁面使用 v2 名稱）
const NAME_OVERRIDE = {
  'Callmoi':                 'Kal Myhk',
  'The Manipulator':         'Magitek Colossus',
  'Flea':                    'Mossling',
  'The Greater Good':        'Gosetsu',
  'Alphinaud (Variant 2)':   'Ardbert',
  'Lisbeth':                 'Lizbeth',
  'Il Mheg Pixie':           'Ehll Tou',
  'Dueling Trio':            'Trinity Seeker',
  'Crystalline Mean Trio':   'Trinity Avowed',
  'Copy Cat Maggie':         'Gogo, Master of Mimicry',
  'Arsenal':                 'Keeper of the Keys',
  'Ultimate Warrior G-Type': 'G-Warrior',
  'Fridholda':               'Vrtra',
  'Zenos (Variant)':         'Zenos Galvus',
  'Onmitsugashira & Kaihi':  'Clockwork Onmyoji & Clockwork Yojimbo',
  'Uleguerand Yeti':         'Suprae-Lugae',
  'Enchiridion':             'Enenra',
  'Coyote':                  'PuPu',
  "Nald'thal (Variant)":     'Halone',
};

// source type 中文化
const TYPE_MAP = {
  'NPC對戰':                'NPC對戰',
  'NPC牌組':                'NPC牌組',
  'NPC對戰_wiki':           'NPC對戰',
  '任務':                   '任務',
  '副本':                   '副本',
  '藏寶圖':                 '藏寶圖',
  '成就':                   '成就',
  'MGP商店':                'MGP商店',
  'Shared FATEs':           '雙色寶石商店',
  'Custom Deliveries':      '雙色寶石商店',
  'Ishgardian Restoration': '蒼穹石板商店',
  'Trials':                 '討伐戰',
  'Bozja':                  '博茲雅',
  'Blue Mage':              '青魔法師商店',
  'Dungeons':               '副本',
  'V&C Dungeons':           '多人副本',
  'Allied Societies':       '部族商店',
  'PvP':                    'PvP商店',
  'Gold Saucer':            'MGP商店',
  'Island Sanctuary':       '無人島',
};

// ─── 工具 ─────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(200 * (i + 1));
    }
  }
}


async function batchRun(items, fn, concurrency = CONCURRENCY) {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(fn));
    if (i % 500 === 0 && i > 0)
      process.stdout.write(`  ${i}/${items.length} (${(i/items.length*100).toFixed(1)}%)\r`);
    await sleep(DELAY_MS);
  }
  console.log(`  ${items.length}/${items.length} (100%)`);
}

// ─── 步驟 1：基礎卡牌資料 ─────────────────────────────────────────────────

// 卡片↔道具、卡片→台服卡名，全部走 lib/triple-triad-map.mjs 的可證對照
// （Item.AdditionalData）。原本這裡是「九宮幻卡道具照 id 排序、第 n 個＝編號 n」的
// 序位推測，2026-09-25 實測從編號 81 起整串偏移、20 張卡掛了別張卡的名字。
let CARD_MAP = null;
async function cardMap() {
  if (!CARD_MAP) {
    CARD_MAP = await loadCardMap({ root: ROOT, cache: path.join(ROOT, 'out_data/cache/tt-card-items.json') });
    console.log('  ' + describeCardMap(CARD_MAP));
  }
  return CARD_MAP;
}

async function stepBaseData() {
  console.log('\n━━ 步驟 1：基礎卡牌資料 ━━');
  console.log('  [1a] 建立卡片↔道具對照（Item.AdditionalData）...');
  const m = await cardMap();

  // 張數**不寫死**：以 v2 的 TripleTriadCard 全表為準。
  // v1 的同一張表凍結在 425 筆而 v2 有 475 筆，寫死 425 就是 7.1 那 10 張新卡
  // 安靜消失的原因；這支腳本以前也是那樣寫的。
  console.log('  [1b] 抓取 TripleTriadCard（v2 全表）...');
  const cards = (await xiv.sheet('TripleTriadCard', 'Name', { limit: 500 })).filter((c) => c.id > 0);

  console.log('  [1c] 抓取 TripleTriadCardResident（v2 全表）...');
  const residents = await xiv.sheet(
    'TripleTriadCardResident',
    'Top,Right,Bottom,Left,TripleTriadCardRarity@as(raw),TripleTriadCardType@as(raw),Order,UIPriority',
    { limit: 500 }
  );
  const resMap = new Map(residents.map((r) => [r.id, r.f]));

  const data = cards.map((card) => {
    const id = card.id;
    const res = resMap.get(id);
    const typeId = res?.['TripleTriadCardType@as(raw)'] ?? 0;
    return {
      id,
      // 台服卡名與 patch 一律取自卡片道具（台服客戶端資料）；台服沒有這張卡就是 null，
      // 不拿英文名頂替——前端的版本閘門會擋掉，這是鐵則。
      name:    m.cardToTwName.get(id) ?? null,
      nameEn:  card.f.Name,
      stars:   res?.['TripleTriadCardRarity@as(raw)'] ?? null,   // rarity row id ＝星數
      type:    typeId ? (TYPE_TW[typeId] ?? null) : null,
      numbers: {
        top:    res?.Top    ?? null,
        right:  res?.Right  ?? null,
        bottom: res?.Bottom ?? null,
        left:   res?.Left   ?? null,
      },
      sources: [],
      patch:   m.cardToPatch.get(id) ?? null,
      order:      res?.Order ?? null,
      uiPriority: res?.UIPriority ?? null,
    };
  }).sort((a, b) => a.id - b.id);

  const withTw = data.filter((c) => c.name).length;
  console.log(`  ✓ ${data.length} 張（台服有繁中名 ${withTw} 張，其餘為台服未開放）`);
  return data;
}

// ─── 步驟 2：NPC 來源（ENpcBase 掃描） ────────────────────────────────────

async function stepNpcSources() {
  console.log('\n━━ 步驟 2：NPC 來源 ━━');

  // ⚠ id 空間：v1 的 TripleTriad row id 是 0 起算，**v2 是 2293760 起算**。
  //   2026-09-25 之前這裡抓的是 v1 的 row id，卻拿去對 v2 ENpcBase 回傳的 ENpcData row_id，
  //   兩邊永遠對不上 → 這一步實際上產不出任何 NPC 牌組，而且不會報錯。
  //   現在兩邊都走 v2，id 空間一致。
  console.log('  [2a] 抓取 TripleTriad 卡組清單（v2）...');
  const ttAll = await xiv.sheet(
    'TripleTriad',
    'TripleTriadCardFixed@as(raw),TripleTriadCardVariable@as(raw)',
    { limit: 500 }
  );
  const ttRows = ttAll.filter((r) =>
    (r.f['TripleTriadCardFixed@as(raw)'] || []).some(Boolean) ||
    (r.f['TripleTriadCardVariable@as(raw)'] || []).some(Boolean)
  );
  console.log(`  ${ttRows.length} 筆有卡組（共 ${ttAll.length} 場對局）`);

  console.log('  [2b] 抓取 tw-npcs 清單...');
  const [twNpcs, twTitles] = await Promise.all([
    fetchJson(`${TC_BASE}/tw/tw-npcs.json`),
    fetchJson(`${TC_BASE}/tw/tw-npc-titles.json`),
  ]);
  const npcIds = Object.keys(twNpcs).map(Number);
  console.log(`  ${npcIds.length} 個 NPC 待掃描`);

  console.log('  [2c] 掃描 ENpcBase...');
  const rowToNpc = {};
  await batchRun(npcIds, async (npcId) => {
    try {
      const d = await fetchJson(`${XIVAPI_V2}/ENpcBase/${npcId}?fields=ENpcData`);
      (d.fields?.ENpcData || [])
        .filter(e => e?.sheet === 'TripleTriad')
        .forEach(e => { rowToNpc[e.row_id] = npcId; });
    } catch (e) { /* skip */ }
  });
  console.log(`  找到 ${Object.keys(rowToNpc).length} 個幻卡 NPC`);

  const cardToNpcs = {};
  for (const row of ttRows) {
    const npcId = rowToNpc[row.id];
    if (!npcId) continue;
    const npcName  = twNpcs[String(npcId)]?.tw || null;
    const npcTitle = twTitles[String(npcId)]?.tw || null;
    const add = (cardId, dropType) => {
      if (!cardId) return;
      if (!cardToNpcs[cardId]) cardToNpcs[cardId] = [];
      cardToNpcs[cardId].push({ npcId, npcName, npcTitle, dropType });
    };
    (row.f['TripleTriadCardFixed@as(raw)'] || []).forEach((c) => add(c, '固定'));
    (row.f['TripleTriadCardVariable@as(raw)'] || []).forEach((c) => add(c, '隨機'));
  }
  console.log(`  ✓ ${Object.keys(cardToNpcs).length} 張卡有 NPC 來源`);
  if (!Object.keys(cardToNpcs).length) {
    // 這一步靜靜產出 0 筆過一次（v1/v2 的 id 空間不同），所以現在明講出來
    throw new Error('步驟 2 解出 0 張卡的 NPC 牌組 —— TripleTriad 與 ENpcData 的 id 空間可能又對不上了');
  }
  return cardToNpcs;
}

// ─── 步驟 3：Garland Tools 來源 ───────────────────────────────────────────

async function stepGarlandSources(cardIdToItemId) {
  console.log('\n━━ 步驟 3：Garland Tools 來源 ━━');
  const cardIds = Object.keys(cardIdToItemId).map(Number);
  const result = {};
  await batchRun(cardIds, async (cardId) => {
    try {
      const d = await fetchJson(`${GARLAND}/${cardIdToItemId[cardId]}.json`);
      result[cardId] = {
        instances: d.item?.instances || [],
        quests:    d.item?.quests    || [],
        treasure:  d.item?.treasure  || [],
      };
    } catch (e) {
      result[cardId] = { instances: [], quests: [], treasure: [] };
    }
  });
  console.log('  ✓ 完成');
  return result;
}

// ─── 步驟 4：Wiki 補齊 ────────────────────────────────────────────────────

function wikiCandidates(nameEn) {
  const toTitle = s => s.replace(/ /g, '_') + '_Card';
  const resolved = NAME_OVERRIDE[nameEn] || nameEn;
  const base = resolved.replace(/ \(Variant.*?\)/g, '').replace(/,.*$/, '').trim();
  const candidates = [toTitle(resolved), toTitle(base)];
  if (resolved !== nameEn) {
    candidates.push(toTitle(nameEn));
    candidates.push(toTitle(nameEn.replace(/ \(Variant.*?\)/g, '').trim()));
  }
  if (resolved.includes(' & '))
    candidates.push(toTitle(resolved.split(' & ')[0].trim()));
  return [...new Set(candidates)];
}

async function fetchWikitext(candidates) {
  for (const title of candidates) {
    try {
      const url = `${WIKI}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`;
      const d = await fetchJson(url);
      if (d.parse?.wikitext?.['*']) return { title, wikitext: d.parse.wikitext['*'] };
    } catch (e) { /* skip */ }
    await sleep(200);
  }
  return null;
}

function parseAcquisition(wikitext) {
  const sources = [];
  const stMatch = wikitext.match(/\|\s*source-type\s*=\s*([^\n|]+)/);
  const sourceType = stMatch ? stMatch[1].trim() : null;
  const obMatch = wikitext.match(/\|\s*obtain-by\s*=\s*([\s\S]*?)(?=\n\||\n}})/);
  const obtainBy = obMatch ? obMatch[1].trim() : null;

  if (sourceType) {
    const st = sourceType.toLowerCase();
    if (st.includes('achievement')) {
      const names = [];
      if (obtainBy) for (const m of obtainBy.matchAll(/\{\{i\|([^}]+)\}\}/g)) names.push(m[1].trim());
      for (const m of wikitext.matchAll(/\{\{achievement table row\|([^}]+)\}\}/g)) {
        const n = m[1].trim();
        if (!names.includes(n)) names.push(n);
      }
      (names.length ? names : [obtainBy]).forEach(n => sources.push({ type: '成就', detail: n }));
    } else if (st.includes('gold saucer') || st.includes('mgp')) {
      sources.push({ type: 'MGP商店', detail: obtainBy });
    } else if (st.includes('triple triad') || st.includes('npc')) {
      sources.push({ type: 'NPC對戰_wiki', detail: obtainBy });
    } else if (st.includes('seasonal') || st.includes('event') || st.includes('login')) {
      sources.push({ type: '活動', detail: obtainBy });
    } else if (st.includes('mog station')) {
      sources.push({ type: '摩格站', detail: obtainBy });
    } else {
      sources.push({ type: sourceType, detail: obtainBy });
    }
  }
  if (sources.length === 0) {
    const achRows = [...wikitext.matchAll(/\{\{achievement table row\|([^}]+)\}\}/g)].map(m => m[1].trim());
    achRows.forEach(n => sources.push({ type: '成就', detail: n }));
    if (sources.length === 0 && /Triple Triad Trader|MGP/i.test(wikitext))
      sources.push({ type: 'MGP商店', detail: null });
  }
  return sources;
}

async function stepWikiPatch(data) {
  console.log('\n━━ 步驟 4：Wiki 補齊 ━━');
  const missing = data.filter(c => c.sources.length === 0);
  console.log(`  缺 sources：${missing.length} 張`);
  let patched = 0;
  for (const card of missing) {
    const result = await fetchWikitext(wikiCandidates(card.nameEn));
    if (!result) { console.log(`  [${card.id}] ${card.nameEn} → ❌`); continue; }
    const sources = parseAcquisition(result.wikitext);
    if (sources.length > 0) {
      card.sources = sources;
      patched++;
      console.log(`  [${card.id}] ${card.nameEn} → ✓ ${sources.map(s=>s.type).join('/')}`);
    } else {
      console.log(`  [${card.id}] ${card.nameEn} → ⚠ 頁面存在但無 Acquisition`);
    }
    await sleep(300);
  }
  console.log(`  ✓ 補齊 ${patched} 張，仍缺 ${missing.length - patched} 張`);
}

// ─── 步驟 5：正規化 ───────────────────────────────────────────────────────

function cleanWiki(text) {
  if (!text) return null;
  return text
    .replace(/\{\{i\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{item icon\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{MGP\|[\d,]+\}\}/g, '')
    .replace(/\{\{bicolor gemstone\|(\d+)\}\}/g, '$1 個雙色寶石')
    .replace(/\{\{[Ss]kybuilders scrip\|(\d+)\}\}/g, '$1 石板')
    .replace(/\{\{Bozjan cluster\|(\d+)\}\}/g, '$1 個博茲雅水晶')
    .replace(/\{\{tribe token\|[^|]+\|(\d+)\}\}/g, '$1 個部族代幣')
    .replace(/\{\{wolf mark\|(\d+)\}\}/g, '$1 狼印')
    .replace(/\{\{allied seal\|(\d+)\}\}/g, '$1 個傭兵印章')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/\*\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeDetail(type, detail) {
  if (!detail) return null;
  const clean = cleanWiki(detail);
  switch (type) {
    case 'NPC對戰':
      return clean?.replace(/\s*-\s*.*/,'').trim() || clean;
    case '成就':
      return clean;
    case 'MGP商店': {
      const m = detail.match(/\{\{MGP\|([\d,]+)\}\}|([\d,]+)\s*MGP/i);
      const mgp = m ? (m[1] || m[2]) : null;
      return mgp ? `Triple Triad Trader，MGP ${mgp}` : 'Triple Triad Trader';
    }
    case '雙色寶石商店': {
      const gem = detail.match(/\{\{bicolor gemstone\|(\d+)\}\}/i);
      const npc = clean?.match(/Purchased from ([^\s]+(?:\s+[^\s]+){0,3}?) in/)?.[1];
      return [npc, gem ? gem[1] + ' 個雙色寶石' : null].filter(Boolean).join('，') || clean;
    }
    case '蒼穹石板商店': {
      const scrip = detail.match(/\|(\d+)\}\}\s*\[\[Skybuilders/i);
      return scrip ? `Enie（築天之所），${scrip[1]} 石板` : 'Enie（築天之所）';
    }
    case '討伐戰':
    case '副本':
    case '多人副本': {
      const items = [...detail.matchAll(/\{\{i\|([^}]+)\}\}/g)].map(m => m[1]);
      return items.join('、') || clean;
    }
    case '博茲雅': {
      const c = detail.match(/\{\{Bozjan cluster\|(\d+)\}\}/i);
      return c ? `博茲雅南方前線，${c[1]} 個博茲雅水晶` : clean;
    }
    case '青魔法師商店': {
      const s = detail.match(/\{\{allied seal\|(\d+)\}\}/i);
      return s ? `Maudlin Latool Ja，${s[1]} 個傭兵印章` : clean;
    }
    case '部族商店': {
      const t = detail.match(/\{\{tribe token\|[^|]+\|(\d+)\}\}/i);
      const npc = clean?.match(/Purchased from ([^\s]+(?:\s+[^\s]+){0,2}?) in/)?.[1];
      return [npc, t ? t[1] + ' 個部族代幣' : null].filter(Boolean).join('，') || clean;
    }
    case 'PvP商店': {
      const w = detail.match(/\{\{wolf mark\|(\d+)\}\}/i);
      return w ? `狼窟碼頭，${w[1]} 狼印` : clean;
    }
    default:
      return clean;
  }
}

function normalizeSource(src) {
  const newType = TYPE_MAP[src.type] || src.type;
  if (src.instanceId != null || src.questId != null || src.treasureId != null)
    return { ...src, type: newType };
  if (src.npcId != null)
    // 同上：由步驟 2 來的 NPC 列一律是牌組，不是獎勵（見合併段的註解）
    return { type: src.type === 'NPC牌組' ? 'NPC牌組' : src.type, npcId: src.npcId, npcName: src.npcName, npcTitle: src.npcTitle, ...(src.slot ? { slot: src.slot } : {}) };
  const detail = summarizeDetail(newType, src.detail);
  return detail ? { type: newType, detail } : { type: newType };
}

function dedupSources(sources) {
  const seen = new Set();
  return sources.filter(s => {
    const key = s.type + '|' + (s.npcId || s.instanceId || s.questId || s.detail || '');
    return seen.has(key) ? false : seen.add(key);
  });
}

function stepNormalize(data) {
  console.log('\n━━ 步驟 5：正規化 ━━');
  const counts = {};
  const result = data.map(card => {
    const sources = dedupSources(card.sources.map(normalizeSource));
    sources.forEach(s => { counts[s.type] = (counts[s.type] || 0) + 1; });
    return { ...card, sources };
  });
  console.log('  來源類型：');
  Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([t,c])=>console.log(`    ${t}: ${c}`));
  return result;
}

// ─── 主流程 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== build-triple-triad-all.mjs ===');
  const ttPath = path.join(ROOT, 'data/triple-triad.json');

  // 1. 基礎資料
  const data = await stepBaseData();

  // `--check-base`：只跑步驟 1 並與現有資料對照後結束（約 10 秒）。
  // 整支跑完要 60–90 分鐘（步驟 2 要掃 28,529 個 NPC），沒有這個開關的話
  // 「步驟 1 有沒有壞」得等一個半小時才知道——2026-09-25 就是這樣才發現
  // 它整整兩年都在產 425 張而不是 439 張。
  if (process.argv.includes('--check-base')) {
    const cur = JSON.parse(fs.readFileSync(ttPath, 'utf-8')).data;
    const curById = new Map(cur.map((c) => [c.id, c]));
    const tw = data.filter((c) => c.name);
    const diffName = tw.filter((c) => curById.has(c.id) && curById.get(c.id).name !== c.name);
    const diffNum = tw.filter((c) => {
      const o = curById.get(c.id); if (!o) return false;
      return ['top', 'right', 'bottom', 'left'].some((k) => o.numbers?.[k] !== c.numbers[k]);
    });
    const missing = tw.filter((c) => !curById.has(c.id));
    console.log('\n━━ --check-base：只驗步驟 1 ━━');
    console.log(`  v2 全表 ${data.length} 張，其中台服有繁中名 ${tw.length} 張；現有資料 ${cur.length} 張`);
    console.log(`  繁中名不符 ${diffName.length}｜四向數值不符 ${diffNum.length}｜現有資料缺的 ${missing.length}`);
    for (const c of [...diffName, ...diffNum, ...missing].slice(0, 10)) {
      console.log(`    ${c.id} ${c.nameEn}：本次「${c.name}」${JSON.stringify(c.numbers)}` +
        ` vs 現有「${curById.get(c.id)?.name ?? '（缺）'}」${JSON.stringify(curById.get(c.id)?.numbers ?? null)}`);
    }
    const ok = !diffName.length && !diffNum.length && !missing.length;
    console.log(ok ? '  ✓ 步驟 1 與現有資料一致' : '  ✗ 有差異（上面列出前 10 筆）');
    process.exit(ok ? 0 : 1);
  }

  // 2. NPC 來源
  const cardIdToItemId = Object.fromEntries((await cardMap()).cardToItem);
  const npcSources = await stepNpcSources();

  // 3. Garland 來源
  const garlandData = await stepGarlandSources(cardIdToItemId);

  // 合併 2+3
  console.log('\n  合併 NPC + Garland 來源...');
  for (const card of data) {
    // ⚠ 步驟 2 抓的是 TripleTriadCardFixed/Variable ＝ **NPC 的牌組**，不是獎勵。
    //   真正的獎勵欄位是 TripleTriad.ItemPossibleReward（道具 id），本腳本沒有抓。
    //   2026-09-23 之前這裡寫成 type:'NPC對戰'，等於把「對手手上有這張卡」講成
    //   「打贏可以拿到這張卡」——938 筆裡 934 筆是錯的（見 docs/專案慣例與記憶.md §4.45）。
    //   所以這裡只寫 NPC牌組；**重跑本腳本後必須接**
    //   `node scripts/patch-triple-triad-sources.mjs --apply` 才會有真獎勵、入場費與規則。
    const npcs = npcSources[card.id] || [];
    npcs.forEach(({ npcId, npcName, npcTitle, dropType }) =>
      card.sources.push({ type: 'NPC牌組', npcId, npcName, npcTitle, slot: dropType })
    );
    const g = garlandData[card.id] || {};
    (g.instances || []).forEach(instanceId => card.sources.push({ type: '副本', instanceId }));
    (g.quests    || []).forEach(questId    => card.sources.push({ type: '任務', questId }));
    (g.treasure  || []).forEach(treasureId => card.sources.push({ type: '藏寶圖', treasureId }));
  }

  // 4. Wiki 補齊
  await stepWikiPatch(data);

  // 5. 正規化
  const normalized = stepNormalize(data);

  // 寫檔
  const output = {
    schema:  'triple-triad',
    patch:   '7.2',
    updated: new Date().toISOString().slice(0, 10),
    source:  'xivapi+items+teamcraft+garland+wiki',
    count:   normalized.length,
    data:    normalized,
  };
  fs.writeFileSync(ttPath, JSON.stringify(output));
  const size = fs.statSync(ttPath).size;

  const withSrc = normalized.filter(c => c.sources.length > 0).length;
  console.log(`\n✓ 完成：${normalized.length} 筆，${withSrc} 筆有 sources，${(size/1024).toFixed(0)} KB`);
  console.log(`  輸出：${ttPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
