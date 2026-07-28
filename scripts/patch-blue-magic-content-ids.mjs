/**
 * patch-blue-magic-content-ids.mjs
 *
 * 替 data/blue-magic.json 的 `learnFrom[]` 補上兩個連結欄，讓前端能顯示**台服官方名**
 * 而不是上游帶來的簡轉繁字串：
 *
 *   type='副本' → `contentId`（對 data/dungeons.json 的 id）
 *   type='野外' → `mapId`（對 data/maps.json 的 id，供頁面開地圖）
 *
 * ── 為什麼需要 ────────────────────────────────────────────────────────────
 *
 * 青魔頁早就寫好了 `DUNGEON_NAMES[l.contentId] || l.detail` 這段（見
 * collections/blue-magic/index.html），但 **`contentId` 在資料裡是 0/142**——
 * 那段一直是死碼，實際顯示的一路都是 `detail`，也就是簡轉繁的名字：
 *
 *   「流沙迷宮樵明洞」  官方是「流沙迷宮樵鳴洞」（鳴 vs 明）
 *   「學識寶庫加巴勒…」 官方是「學識寶庫迦巴勒…」（迦 vs 加）
 *   「利維亞桑殲滅戰」  官方是「真 利維坦殲滅戰」
 *
 * ── 對應方式（五層，每層都要求「轉換後精確命中且唯一」）──────────────────
 *
 *   0. 名稱直接命中 dungeons.json
 *   A. 加「真 」前綴後命中（Hard 討伐戰）
 *   B. 「X殲殛戰」→「極 X殲滅戰」後命中（Extreme 討伐戰）
 *   C. 同字元重排後唯一命中（「天幕魔導城最終決戰」↔「最終決戰天幕魔導城」）
 *   D. **簡中 datamine 反查**：`ffxiv-datamining-cn` 的 `ContentFinderCondition.csv`
 *      每列的 key **就是** ContentFinderCondition id，把它的簡中官方名轉繁後比對，
 *      命中就直接得到 id。本站這些副本名本來就是簡中官方名轉繁來的，**這等於沿著
 *      同一條翻譯鏈往回走**，比任何字面相似度都可靠——A–C 拆不掉的譯名差異
 *      （利維亞桑→利維坦、索菲婭→索菲亞、薩菲洛特→賽菲羅特、莫古力賢王→
 *      善王莫古爾·莫古XII世）D 全部一次解掉。
 *
 * **刻意不用模糊比對**：實測相似度最高者常常是錯的——「拉姆殲殛戰」的最相似項是
 * 「恩歐殲殛戰」、「索菲婭殲殛戰」是「澤蓮尼婭殲殛戰」，配下去就是安靜地指到別的副本。
 *
 * **護欄**：A–C 與 D 是兩條完全獨立的路，腳本每次執行都會拿兩邊都解得出來的那批
 * 交叉比對，**有任何一筆矛盾就中止不寫入**。（首次導入 D 時：一致 68、矛盾 0。）
 *
 * 執行：
 *   node scripts/patch-blue-magic-content-ids.mjs           # dry-run
 *   node scripts/patch-blue-magic-content-ids.mjs --apply
 *   node scripts/patch-blue-magic-content-ids.mjs --offline # 只用 out_data/ 快取
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const OFFLINE = process.argv.includes('--offline');

// 本站資料的副本名 → 簡中官方名（用來走規則 D 反查 CFC id）。
// 這裡放的**不是譯名對照，是「我們的資料寫錯字」的修正**：規則 D 會拿簡中官方名
// 轉繁去比，比不到就是我方的字跟簡中官方對不起來。每筆都附證據，全部是
// 「差 1–2 字、且該關鍵詞在簡中表裡唯一」的情形，不是憑印象配的。
const DETAIL_TYPOS = {
  // 樵「明」洞 → 官方樵「鳴」洞（簡中 CFC 12 流沙迷宫樵鸣洞；全表只有這一個「樵*洞」）
  '流沙迷宮樵明洞': '流沙迷宮樵鳴洞',
  // 「加」巴勒 → 官方「迦」巴勒（簡中 CFC 31 学识宝库迦巴勒幻想图书馆）
  '學識寶庫加巴勒幻想圖書館': '學識寶庫迦巴勒幻想圖書館',
  // 「監牢鐵臂」→ 官方「堅牢鐵壁」（簡中 CFC 219 坚牢铁壁巴埃萨长城；「巴埃薩長城」唯一）
  '監牢鐵臂巴埃薩長城': '堅牢鐵壁巴埃薩長城',
  // 上游用的是俗稱，官方全名是「神兵要塞帝國南方堡」（簡中 CFC 15；「帝國南方堡」唯一）
  '帝國南方堡外圍激戰': '神兵要塞帝國南方堡',
  // 伊修加「爾」德 → 簡中官方是「皇都伊修加德保衛戰」（CFC 885）。
  // ※ 這個 CFC 解得出來，但 **dungeons.json 沒收**——The Steps of Faith 在 6.1 已從
  //   遊戲移除，所以最後仍會落在「對不到」那組，屬預期內。
  '皇都伊修加爾德保衛戰': '皇都伊修加德保衛戰',
};

// 真的只能人工指定的（規則 A–D 都解不掉時才動這裡）。**每筆都要回查 dungeons.json**。
const MANUAL_CONTENT_IDS = {
  // '某個副本名': 72,   // ← 範例格式；確認過才解除註解
};

// 地區名的簡轉繁用字變體 → maps.json 的官方用字。
// **不要改成「差一個字就配」的模糊規則**——「泰坦殲滅戰」與「泰坦殲殛戰」也只差一個字，
// 卻是兩個不同的副本。這裡一律逐筆具名列出，每筆都回查過 maps.json。
const ZONE_VARIANTS = {
  // OpenCC 把「札」過度轉成「扎」；官方是 庫爾札斯西部高地（maps.json id 211，唯一）。
  // 同一類過度轉換在 dungeons 也發生過（佈/布雷福洛克斯），見 PROGRESS §二之二。
  '庫爾扎斯西部高地': '庫爾札斯西部高地',
};

const CN_CSV_URL = 'https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/ContentFinderCondition.csv';
const CN_CACHE = path.join(ROOT, 'out_data', 'cfc-names-cn.json');

const readData = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const sortChars = (s) => [...String(s).replace(/\s/g, '')].sort().join('');

/** 解析 datamining-cn 的 CSV（第 0 行是欄位索引、第 1 行欄名、第 2 行型別，資料從第 3 行起）。 */
function parseCfcCsv(text) {
  const lines = text.split(/\r?\n/);
  const cells = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out;
  };
  const nameCol = cells(lines[1]).findIndex((n) => n === 'Name');
  if (nameCol < 0) throw new Error('ContentFinderCondition.csv 找不到 Name 欄');
  const rows = [];
  for (let i = 3; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = cells(lines[i]);
    const key = Number(c[0]);
    const nm = (c[nameCol] || '').trim();
    if (Number.isFinite(key) && nm) rows.push([key, nm]);
  }
  return rows;
}

/** 取「簡中官方名（轉繁）→ CFC id」對照。同名多列視為不唯一，一律不採用。 */
async function loadCnNameMap() {
  let rows;
  if (fs.existsSync(CN_CACHE)) {
    rows = readData('out_data/cfc-names-cn.json');
  } else if (OFFLINE) {
    console.warn('  ⚠ --offline 且無 out_data/cfc-names-cn.json 快取，規則 D 停用');
    return new Map();
  } else {
    console.log('  下載 ffxiv-datamining-cn 的 ContentFinderCondition.csv…');
    const res = await fetch(CN_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = parseCfcCsv(await res.text());
    fs.mkdirSync(path.dirname(CN_CACHE), { recursive: true });
    fs.writeFileSync(CN_CACHE, JSON.stringify(rows) + '\n', 'utf8');
    console.log(`  已快取到 ${path.relative(ROOT, CN_CACHE)}（${rows.length} 列有名稱）`);
  }

  const { default: OpenCC } = await import('opencc-js').then((m) => ({ default: m.default || m }));
  // 兩套轉法都收：twp 會連詞彙一起在地化，tw 只轉字，上游用哪套不一定
  const convs = [OpenCC.Converter({ from: 'cn', to: 'twp' }), OpenCC.Converter({ from: 'cn', to: 'tw' })];
  const map = new Map();
  for (const [id, cn] of rows) {
    for (const conv of convs) {
      const tw = conv(cn);
      if (!map.has(tw)) map.set(tw, new Set());
      map.get(tw).add(id);
    }
  }
  return map;
}

async function main() {
  const bmPath = path.join(ROOT, 'data/blue-magic.json');
  const db = readData('data/blue-magic.json');
  const spells = db.data;
  const dungeons = readData('data/dungeons.json').data.filter((d) => d.name);
  const maps = readData('data/maps.json').data.filter((m) => m.name);

  // 名稱 → 列（同名多列時視為不唯一，一律不採用）
  const dunByName = new Map();
  for (const d of dungeons) {
    if (!dunByName.has(d.name)) dunByName.set(d.name, []);
    dunByName.get(d.name).push(d);
  }
  const uniqDun = (n) => { const a = dunByName.get(n); return a && a.length === 1 ? a[0] : null; };

  const anagram = new Map();
  for (const d of dungeons) {
    const k = sortChars(d.name);
    if (!anagram.has(k)) anagram.set(k, []);
    anagram.get(k).push(d);
  }

  const mapByName = new Map();
  for (const m of maps) {
    if (!mapByName.has(m.name)) mapByName.set(m.name, []);
    mapByName.get(m.name).push(m);
  }
  /** 地區名 → maps.json 那一列。同名多列時**只取野外類**（type field/city/housing）——
   *  來源型別是「野外」，照定義就不會是副本裡那張同名圖（黑衣森林東部林區有
   *  id 5 野外與 id 180 副本兩列）。野外類仍不唯一才放棄。 */
  const uniqMap = (n) => {
    const a = mapByName.get(ZONE_VARIANTS[n] || n);
    if (!a) return null;
    if (a.length === 1) return a[0];
    const field = a.filter((m) => ['field', 'city', 'housing'].includes(m.type));
    return field.length === 1 ? field[0] : null;
  };

  const dunById = new Map(dungeons.map((d) => [d.id, d]));
  const cnMap = await loadCnNameMap();
  /** 規則 D：簡中官方名轉繁後唯一命中 → 那一列的 key 就是 ContentFinderCondition id。
   *  本站資料的副本名本來就是簡中官方名轉繁來的，所以這是**同一條翻譯鏈往回走**，
   *  比任何字面相似度都可靠。解出 id 後仍要求 dungeons.json 收得到才採用。 */
  function byCn(name) {
    const key = DETAIL_TYPOS[name] || name;
    const s = cnMap.get(key);
    if (!s || s.size !== 1) return null;
    return dunById.get([...s][0]) || null;
  }

  /** 副本名 → { id, name, rule }，對不到回 null */
  function resolveDungeon(name) {
    let hit = uniqDun(name);
    if (hit) return { d: hit, rule: '直接' };
    if (MANUAL_CONTENT_IDS[name] != null) {
      const d = dunById.get(MANUAL_CONTENT_IDS[name]);
      if (d) return { d, rule: '人工' };
    }
    if ((hit = uniqDun('真 ' + name))) return { d: hit, rule: 'A真' };
    if (name.includes('殲殛戰') && (hit = uniqDun('極 ' + name.replace('殲殛戰', '殲滅戰')))) return { d: hit, rule: 'B極' };
    const c = anagram.get(sortChars(name));
    if (c && c.length === 1 && c[0].name !== name) return { d: c[0], rule: 'C重排' };
    if ((hit = byCn(name))) return { d: hit, rule: 'D簡中' };
    return null;
  }

  // ── 護欄：規則 D 必須與 A–C 解出來的結果完全一致 ──────────────────────────
  // A–C 是字面規則、D 走的是另一條完全獨立的路（簡中 datamine），兩者對同一批名字
  // 應該給出同一個 id。有任何一筆矛盾就代表其中一條壞了，**中止不寫入**。
  {
    let agree = 0; const clash = [];
    const seen = new Set();
    for (const sp of spells) for (const l of sp.learnFrom || []) {
      if (l.type !== '副本' || !l.detail || seen.has(l.detail)) continue;
      seen.add(l.detail);
      let ab = uniqDun(l.detail) || uniqDun('真 ' + l.detail)
        || (l.detail.includes('殲殛戰') ? uniqDun('極 ' + l.detail.replace('殲殛戰', '殲滅戰')) : null);
      if (!ab) { const c = anagram.get(sortChars(l.detail)); if (c && c.length === 1 && c[0].name !== l.detail) ab = c[0]; }
      const d = byCn(l.detail);
      if (!ab || !d) continue;
      if (ab.id === d.id) agree++;
      else clash.push({ nm: l.detail, ab: `${ab.id} ${ab.name}`, d: `${d.id} ${d.name}` });
    }
    console.log(`護欄 規則 A–C ↔ D 交叉驗證：一致 ${agree} 筆、矛盾 ${clash.length} 筆`);
    clash.slice(0, 8).forEach((c) => console.log(`  ✗「${c.nm}」A–C→${c.ab} vs D→${c.d}`));
    if (clash.length) { console.error('\n✗ 兩條獨立路徑對不起來，中止不寫入。'); process.exit(1); }
  }

  const ruleCount = {};
  const unresolvedDun = new Set(), unresolvedZone = new Set(), renamedZones = new Set();
  let dunFilled = 0, zoneFilled = 0, dunTotal = 0, zoneTotal = 0;

  for (const sp of spells) {
    for (const l of sp.learnFrom || []) {
      if (l.type === '副本' && l.detail) {
        dunTotal++;
        const r = resolveDungeon(l.detail);
        if (!r) { unresolvedDun.add(l.detail); continue; }
        ruleCount[r.rule] = (ruleCount[r.rule] || 0) + 1;
        dunFilled++;
        if (APPLY) l.contentId = r.d.id;
      } else if (l.type === '野外' && l.detail) {
        zoneTotal++;
        const m = uniqMap(l.detail);
        if (!m) { unresolvedZone.add(l.detail); continue; }
        zoneFilled++;
        // detail 一併正規化成 maps.json 的官方地名（庫爾扎斯 → 庫爾札斯）。
        // 副本那邊不需要這樣做——頁面本來就是用 contentId 去 dungeons.json 取名。
        if (m.name !== l.detail) renamedZones.add(`${l.detail} → ${m.name}`);
        if (APPLY) { l.mapId = m.id; l.detail = m.name; }
      }
    }
  }

  console.log('━━ 副本 → contentId ━━');
  console.log(`  ${dunFilled}/${dunTotal} 筆可填（規則分佈：`
    + Object.entries(ruleCount).map(([k, v]) => `${k} ${v}`).join('、') + '）');
  console.log(`  對不到的相異副本名 ${unresolvedDun.size} 個（維持顯示原 detail，不猜）：`);
  [...unresolvedDun].forEach((n) => console.log(`     ${n}`));

  console.log('\n━━ 野外 → mapId ━━');
  console.log(`  ${zoneFilled}/${zoneTotal} 筆可填`);
  if (renamedZones.size) {
    console.log(`  detail 正規化成官方地名 ${renamedZones.size} 種：`);
    [...renamedZones].forEach((r) => console.log(`     ${r}`));
  }
  if (unresolvedZone.size) {
    console.log(`  對不到的地區 ${unresolvedZone.size} 個：${[...unresolvedZone].join('、')}`);
    console.log('  （多半是簡轉繁用字差異，例：庫爾扎斯 vs 官方 庫爾札斯）');
  }

  if (!APPLY) { console.log('\n（dry-run，未寫入。加 --apply 才會寫進 data/blue-magic.json）'); return; }

  db.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(bmPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log('\n✓ 已寫入 data/blue-magic.json');
  console.log('  接著跑：node scripts/validate-data.mjs');
}

main().catch((e) => { console.error(e); process.exit(1); });
