/**
 * patch-dungeon-expansion.mjs
 *
 * 補 data/dungeons.json 的 `expansion`（386 筆全是空字串）與 `expansionId`，
 * 順便用 XIVAPI 回頭校驗既有的等級欄位。
 *
 * 來源＝XIVAPI v2 `ContentFinderCondition.RequiredExVersion`（指向 ExVersion sheet
 * 的 row id），是遊戲客戶端自己的資料片歸屬，不是從 patch 號推的。
 *
 * 繁中資料片名沿用全站唯一的那份對照（`assets/js/collection-tracker.js` 的
 * `PATCH_BANDS`）：2.x 新生艾奧傑亞／3.x 蒼天伊修加爾德／4.x 紅蓮解放者／5.x 漆黑反叛者／
 * 6.x 曉月之終途／7.x 黃金遺產（台服官方，兩邊都讀 data/official-terms.json，2026-10-11 起不再各自手寫）。
 *
 * ── 為什麼不順手補 patch／unlock／bosses／rewards（別再重試這幾條路）──────
 *
 * · **patch（50 筆 null）查不到權威來源**。那 50 筆全是 Lv.100 的 7.x 內容，成因是
 *   `build-dungeons.mjs` 走 XIVAPI **v1** 的 GamePatch，而 v1 已停在舊版本。
 *   試過 Teamcraft `patch-content.json`：它按 patch 分組列各 sheet 的 row id，但
 *   **裡面沒有 ContentFinderCondition 這個類別**；拿 CFC id 去比對 achievement／
 *   action／item 會得到 385/386、386/386 這種「幾乎全中」的假象——那是不同 id 空間
 *   撞號，不是真的對上（同 PROGRESS §二之一「更危險的是對得到的」）。唯一語意相符的
 *   `instancecontent` 只命中 95/386，因為那是 InstanceContent id 不是 CFC id。
 * · **unlock 解不出來**：`ContentFinderCondition` 的 `UnlockType`／`UnlockCriteria`
 *   實測 386 筆全是 0（抽驗 4／6／829／996／985 皆然），這張表不帶解鎖任務。
 * · **bosses／rewards 沒有 datamine 來源**，屬社群整理範圍。
 *
 * 執行：
 *   node scripts/patch-dungeon-expansion.mjs            # dry-run
 *   node scripts/patch-dungeon-expansion.mjs --apply     # 寫入 data/dungeons.json
 *   node scripts/patch-dungeon-expansion.mjs --offline   # 只用 out_data/ 快取
 * 改完記得跑：node scripts/validate-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const OFFLINE = process.argv.includes('--offline');

const V2 = 'https://v2.xivapi.com/api/sheet';
const CACHE = path.join(ROOT, 'out_data', 'cfc-expansion.json');

// ExVersion row id → 台服官方資料片名（data/official-terms.json＝台服客戶端 ExVersion，與 collection-tracker.js 的
// PATCH_BANDS 同一份來源；2026-10-11 起不再手寫：0 新生艾奧傑亞 2.x … 5 黃金遺產 7.x）
const EXVERSION_TW = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'official-terms.json'), 'utf8')).expansions.map((e) => [e.ex, e.name]));
// ExVersion row id ＝ patch 主版本 − 2（ARR 2.x 對 0），交叉驗證用
const exFromPatch = (p) => {
  const m = String(p || '').match(/^(\d+)\./);
    return m ? Number(m[1]) - 2 : null;
};

const readData = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function v2(q, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(`${V2}/${q}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(700 * i);
    }
  }
}

async function loadCfc(ids) {
  let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const missing = ids.filter((id) => cache[id] === undefined);
  if (missing.length && OFFLINE) {
    console.warn(`  ⚠ --offline：快取缺 ${missing.length} 筆，這些補不到`);
    return cache;
  }
  if (!missing.length) return cache;

  console.log(`  從 XIVAPI 抓 ${missing.length} 列 ContentFinderCondition（快取命中 ${ids.length - missing.length}）…`);
  for (let s = 0; s < missing.length; s += 100) {
    const batch = missing.slice(s, s + 100);
    const r = await v2(`ContentFinderCondition?rows=${batch.join(',')}`
      + `&fields=Name,RequiredExVersion,ClassJobLevelRequired,ClassJobLevelSync,HighEndDuty`);
    for (const row of r.rows || []) {
      const f = row.fields || {};
      cache[row.row_id] = {
        name: f.Name ?? null,
        exVersion: f.RequiredExVersion?.row_id ?? null,
        levelReq: f.ClassJobLevelRequired ?? null,
        levelSync: f.ClassJobLevelSync ?? null,
        highEnd: f.HighEndDuty ?? null,
      };
    }
    // 沒回傳的 row 記成 null，下次才不會重抓
    for (const id of batch) if (cache[id] === undefined) cache[id] = null;
    console.log(`    …${Math.min(s + 100, missing.length)}/${missing.length}`);
    await sleep(150);
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  console.log(`  已快取到 ${path.relative(ROOT, CACHE)}`);
  return cache;
}

async function main() {
  const dPath = path.join(ROOT, 'data/dungeons.json');
  const db = readData('data/dungeons.json');
  const dungeons = db.data;
  console.log(`dungeons.json：${dungeons.length} 筆`);
  console.log(`  expansion 為空：${dungeons.filter((d) => !d.expansion).length}`);
  console.log(`  patch 為 null：${dungeons.filter((d) => !d.patch).length}`);

  const cfc = await loadCfc(dungeons.map((d) => d.id));

  // ── 護欄①：名稱對位（這才是「id 有沒有對到同一個副本」的檢驗）────────────
  // 用 patch 當護欄是不行的——dungeons.json 的 patch 本身就是壞的（見護欄②）。
  const normEn = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  let nameChecked = 0, nameBad = [];
  for (const d of dungeons) {
    const c = cfc[d.id];
    if (!c || !c.name || !d.nameEn) continue;
    nameChecked++;
    if (normEn(c.name) !== normEn(d.nameEn)) nameBad.push({ d, got: c.name });
  }
  console.log(`\n護欄① 名稱對位：比對 ${nameChecked} 筆，不符 ${nameBad.length} 筆`);
  nameBad.slice(0, 5).forEach((m) => console.log(`  ✗ ${m.d.id}：本地「${m.d.nameEn}」vs XIVAPI「${m.got}」`));
  if (nameChecked && nameBad.length / nameChecked > 0.02) {
    console.error(`\n✗ 名稱不符比例 ${(nameBad.length / nameChecked * 100).toFixed(1)}% 超過 2%，`
      + `代表 CFC id 對應有問題，中止不寫入。`);
    process.exit(1);
  }

  // ── 護欄②：既有 patch 與 ExVersion 的矛盾偵測（2026-11-24 改成不對稱）─────────
  // **RequiredExVersion 是「進這個副本要哪個資料片」，不是「哪一版加的」**。所以兩個方向的意義不同：
  //   · patch 推得的資料片 **早於** ExVersion → **不可能**（內容不會比它要求的資料片更早推出）
  //     ＝patch 一定錯：正統優雷卡標 5.2 卻要曉月、一位國王，一位父親標 6.5 卻要黃金（多半是「首次出現在資料裡」的預載版號）。
  //     這種清成 null（錯的值比留空更糟），但**不猜正確 patch**：沒有權威來源，null 就是誠實的答案。
  //   · patch 推得的資料片 **晚於** ExVersion → **合理**：後來才加、門檻卻低的內容——死者宮殿 3.35 只要新生、
  //     6.x 改版的新生主線副本（里塔提恩強攻戰 6.0、皇都伊修加爾德保衛戰 6.28）。**保留現值、只列出來**。
  // 舊版「矛盾時一律信 ExVersion、清成 null」會把這 10 筆正確的版號清掉（11-17 起列在待辦、沒敢跑）。
  // 它當年（07-28）清掉的 18 筆（究極武器破壞作戰標 6.0…）也屬於「晚於」這一側、這條規則分不出來——
  // 但那 18 筆早已是 null，這支只清不補，不會翻回去；補版號的 patch-dungeon-names 另有自己的護欄。
  const bad = [], later = [];
  for (const d of dungeons) {
    const c = cfc[d.id];
    if (!c || c.exVersion == null || !d.patch) continue;
    const want = exFromPatch(d.patch);
    if (want == null || want === c.exVersion) continue;
    (want < c.exVersion ? bad : later).push({ d, got: c.exVersion, want });
  }
  console.log(`護欄② patch 與 ExVersion 不一致：${bad.length + later.length} 筆`);
  console.log(`  不可能（版號早於它要的資料片）→ 清成 null：${bad.length} 筆`);
  bad.forEach((m) => console.log(
    `    ✗ ${m.d.id} ${m.d.name}：patch ${m.d.patch}（${EXVERSION_TW[m.want] || m.want}）卻要 ${EXVERSION_TW[m.got] || m.got}`));
  console.log(`  合理（後來才加、門檻較低）→ 保留：${later.length} 筆`);
  later.forEach((m) => console.log(
    `    · ${m.d.id} ${m.d.name}：patch ${m.d.patch}（${EXVERSION_TW[m.want] || m.want}），只要 ${EXVERSION_TW[m.got] || m.got}`));
  if (bad.length > 40) {
    console.error(`\n✗ 「不可能」的筆數 ${bad.length} 過多，先確認 ExVersion 對照是否正確，中止不寫入。`);
    process.exit(1);
  }

  // ── 等級欄位順帶校驗（只報告，不自動改）─────────────────────────────────
  const lvlDiff = dungeons.filter((d) => {
    const c = cfc[d.id];
    return c && c.levelReq != null && d.levelReq != null && c.levelReq !== d.levelReq;
  });
  console.log(`等級校驗：levelReq 與 XIVAPI 不符 ${lvlDiff.length} 筆`
    + (lvlDiff.length ? `（${lvlDiff.slice(0, 5).map((d) => d.id).join(',')}…，只報告不自動改）` : ''));

  // ── 套用 ─────────────────────────────────────────────────────────────────
  // **只填空的 expansion，不覆蓋既有值**（2026-11-24）。這支當年的任務是補「386 筆全是空字串」；現在都填滿了，
  // 而另一支 patch-dungeon-add-missing.mjs 補新副本時用的是 **TerritoryType.ExVersion**（地圖屬於哪個資料片），
  // 這裡用的是 **CFC.RequiredExVersion**（要擁有哪個資料片）——兩個定義對多數副本一樣，但不一樣的會被「最後跑的那支」翻掉：
  // 7.3 的「幻 青龍征魂戰」地圖屬黃金遺產、所需資料片卻是 0（新生），跑這支就會從副本圖鑑的黃金遺產掉到新生。
  // 哪個定義才是副本圖鑑要的分組，是另一題（第四輪路線圖 §5）；在定案前兩邊都不覆蓋對方，不一致的列出來。
  const byExp = {};
  let filled = 0, noEx = [];
  const differ = [];
  for (const d of dungeons) {
    const c = cfc[d.id];
    if (!c || c.exVersion == null) { noEx.push(d.id); continue; }
    const label = EXVERSION_TW[c.exVersion];
    if (!label) { console.warn(`  ⚠ ${d.id} ${d.name}：未知的 ExVersion ${c.exVersion}（新資料片？請補 EXVERSION_TW）`); noEx.push(d.id); continue; }
    byExp[label] = (byExp[label] || 0) + 1;
    if (d.expansion && (d.expansion !== label || d.expansionId !== c.exVersion)) { differ.push({ d, label }); continue; }
    if (!d.expansion) { filled++; if (APPLY) { d.expansion = label; d.expansionId = c.exVersion; } }
  }
  console.log(`\n可填 expansion：${dungeons.length - noEx.length}/${dungeons.length}（空的要補 ${filled} 筆）`);
  Object.entries(byExp).sort().forEach(([k, v]) => console.log(`  ${k.padEnd(6)} ${v} 座`));
  if (noEx.length) console.log(`  補不到的 ${noEx.length} 筆：${noEx.slice(0, 20).join(', ')}`);
  if (differ.length) {
    console.log(`  現值與所需資料片不同而保留現值：${differ.length} 筆`);
    differ.forEach(({ d, label }) => console.log(`    · ${d.id} ${d.name || '（無名）'}：現值 ${d.expansion}，所需資料片 ${label}`));
  }

  // 已證實為錯的 patch 清成 null（只有「不可能」那一側，理由見護欄②）
  if (APPLY) bad.forEach(({ d }) => { d.patch = null; });
  console.log(`清掉不可能的 patch：${bad.length} 筆`
    + `（清完 patch 為 null 者 ${dungeons.filter((d) => !d.patch).length + (APPLY ? 0 : bad.length)}/${dungeons.length}）`);

  if (!APPLY) { console.log('\n（dry-run，未寫入。加 --apply 才會寫進 data/dungeons.json）'); return; }

  db.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(dPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log(`\n✓ 已寫入 data/dungeons.json`);
  console.log('  接著跑：node scripts/validate-data.mjs');
}

main().catch((e) => { console.error(e); process.exit(1); });
