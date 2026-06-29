/**
 * build-triple-triad-all.mjs
 * 一鍵建立完整幻卡資料庫（卡牌資料 + 來源 + 中文化）
 *
 * 步驟：
 *   1. 基礎資料  — XIVAPI TripleTriadCard + TripleTriadCardResident + items.json 繁中名
 *   2. NPC 來源  — Teamcraft tw-npcs + XIVAPI v2 ENpcBase 掃描
 *   3. 其他來源  — Garland Tools（副本/任務/藏寶圖）
 *   4. Wiki 補齊 — FFXIV Wiki 補齊仍缺 sources 的卡
 *   5. 正規化    — 統一 type 中文名、清理 Wiki markup
 *
 * 執行：node scripts/build-triple-triad-all.mjs
 * 耗時約 60~90 分鐘（主要是步驟 2 掃描 28529 個 NPC）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── 常數 ─────────────────────────────────────────────────────────────────

const XIVAPI_V1   = 'https://xivapi.com';
const XIVAPI_V2   = 'https://v2.xivapi.com/api/sheet';
const TC_BASE     = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json';
const GARLAND     = 'https://garlandtools.org/db/doc/item/en/3';
const WIKI        = 'https://ffxiv.consolegameswiki.com/mediawiki/api.php';
const TOTAL_CARDS = 425;
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

async function fetchAllPages(endpoint, columns, total = TOTAL_CARDS) {
  const results = [];
  const perPage = 100;
  for (let page = 1; page <= Math.ceil(total / perPage); page++) {
    const url = `${XIVAPI_V1}/${endpoint}?limit=${perPage}&page=${page}&columns=${columns}`;
    const json = await fetchJson(url);
    results.push(...json.Results);
    if (page < Math.ceil(total / perPage)) await sleep(300);
  }
  return results;
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

function buildCardIdToItemId() {
  const itemsRaw = fs.readFileSync(path.join(ROOT, 'data/items.json'), 'utf-8');
  const re = /\{"id":(\d+),"name":"[^"]+","icon":"[^"]+","category":"九宮幻卡"[^}]*\}/g;
  const ids = [];
  let m;
  while ((m = re.exec(itemsRaw)) !== null) ids.push(parseInt(m[1]));
  ids.sort((a, b) => a - b);
  const map = {};
  ids.slice(0, TOTAL_CARDS).forEach((itemId, idx) => { map[idx + 1] = itemId; });
  return map;
}

function buildCardIdToTwName() {
  const itemsRaw = fs.readFileSync(path.join(ROOT, 'data/items.json'), 'utf-8');
  const re = /\{"id":(\d+),"name":"([^"]+)","icon":"[^"]+","category":"九宮幻卡"[^}]*\}/g;
  const pairs = [];
  let m;
  while ((m = re.exec(itemsRaw)) !== null)
    pairs.push([parseInt(m[1]), m[2].replace('九宮幻卡：', '')]);
  pairs.sort((a, b) => a[0] - b[0]);
  const map = new Map();
  pairs.forEach(([, name], idx) => map.set(idx + 1, name));
  return map;
}

async function stepBaseData() {
  console.log('\n━━ 步驟 1：基礎卡牌資料 ━━');
  console.log('  [1a] 讀取 items.json...');
  const twNameMap = buildCardIdToTwName();

  console.log('  [1b] 抓取 TripleTriadCard...');
  const cards = await fetchAllPages('TripleTriadCard', 'ID,Name,GamePatch', TOTAL_CARDS);

  console.log('  [1c] 抓取 TripleTriadCardResident...');
  const residents = await fetchAllPages(
    'TripleTriadCardResident',
    'ID,Top,Right,Bottom,Left,TripleTriadCardRarity,TripleTriadCardType',
    TOTAL_CARDS
  );
  const resMap = new Map(residents.map(r => [r.ID, r]));

  const data = cards.map(card => {
    const id  = card.ID;
    const res = resMap.get(id);
    const typeId = res?.TripleTriadCardType?.ID ?? null;
    return {
      id,
      name:    twNameMap.get(id) ?? null,
      nameEn:  card.Name,
      stars:   res?.TripleTriadCardRarity?.Stars ?? null,
      type:    typeId ? (TYPE_TW[typeId] ?? null) : null,
      numbers: {
        top:    res?.Top    ?? null,
        right:  res?.Right  ?? null,
        bottom: res?.Bottom ?? null,
        left:   res?.Left   ?? null,
      },
      sources: [],
      patch:   card.GamePatch?.Version ?? null,
    };
  }).sort((a, b) => a.id - b.id);

  console.log(`  ✓ ${data.length} 筆`);
  return data;
}

// ─── 步驟 2：NPC 來源（ENpcBase 掃描） ────────────────────────────────────

async function stepNpcSources() {
  console.log('\n━━ 步驟 2：NPC 來源 ━━');

  console.log('  [2a] 抓取 TripleTriad 卡組清單...');
  const cols = ['ID',
    'TripleTriadCardFixed0TargetID','TripleTriadCardFixed1TargetID',
    'TripleTriadCardFixed2TargetID','TripleTriadCardFixed3TargetID',
    'TripleTriadCardFixed4TargetID',
    'TripleTriadCardVariable0TargetID','TripleTriadCardVariable1TargetID',
    'TripleTriadCardVariable2TargetID','TripleTriadCardVariable3TargetID',
    'TripleTriadCardVariable4TargetID',
  ].join(',');
  const [p1, p2] = await Promise.all([
    fetchJson(`${XIVAPI_V1}/TripleTriad?columns=${cols}&limit=100&page=1`),
    fetchJson(`${XIVAPI_V1}/TripleTriad?columns=${cols}&limit=100&page=2`),
  ]);
  const ttRows = [...p1.Results, ...p2.Results].filter(r =>
    r.TripleTriadCardVariable0TargetID > 0 || r.TripleTriadCardFixed0TargetID > 0
  );
  console.log(`  ${ttRows.length} 筆有卡組`);

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
    const npcId = rowToNpc[row.ID];
    if (!npcId) continue;
    const npcName  = twNpcs[String(npcId)]?.tw || null;
    const npcTitle = twTitles[String(npcId)]?.tw || null;
    const add = (cardId, dropType) => {
      if (!cardId) return;
      if (!cardToNpcs[cardId]) cardToNpcs[cardId] = [];
      cardToNpcs[cardId].push({ npcId, npcName, npcTitle, dropType });
    };
    [0,1,2,3,4].forEach(i => add(row[`TripleTriadCardFixed${i}TargetID`], '固定'));
    [0,1,2,3,4].forEach(i => add(row[`TripleTriadCardVariable${i}TargetID`], '隨機'));
  }
  console.log(`  ✓ ${Object.keys(cardToNpcs).length} 張卡有 NPC 來源`);
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
    return { type: 'NPC對戰', npcId: src.npcId, npcName: src.npcName, npcTitle: src.npcTitle, dropType: src.dropType };
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

  // 2. NPC 來源
  const cardIdToItemId = buildCardIdToItemId();
  const npcSources = await stepNpcSources();

  // 3. Garland 來源
  const garlandData = await stepGarlandSources(cardIdToItemId);

  // 合併 2+3
  console.log('\n  合併 NPC + Garland 來源...');
  for (const card of data) {
    const npcs = npcSources[card.id] || [];
    npcs.forEach(({ npcId, npcName, npcTitle, dropType }) =>
      card.sources.push({ type: 'NPC對戰', npcId, npcName, npcTitle, dropType })
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
