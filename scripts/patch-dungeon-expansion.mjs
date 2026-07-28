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
 * `PATCH_BANDS`）：2.x 原初之地／3.x 蒼天之禁地／4.x 紅蓮之狂潮／5.x 暗影之逆焰／
 * 6.x 曉月之終途／7.x 金曦之遺輝。**改任何一邊都要同步另一邊。**
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

// ExVersion row id → 站內統一的資料片繁中名（同 collection-tracker.js 的 PATCH_BANDS）
const EXVERSION_TW = {
  0: '原初之地',     // A Realm Reborn   2.x
  1: '蒼天之禁地',   // Heavensward      3.x
  2: '紅蓮之狂潮',   // Stormblood       4.x
  3: '暗影之逆焰',   // Shadowbringers   5.x
  4: '曉月之終途',   // Endwalker        6.x
  5: '金曦之遺輝',   // Dawntrail        7.x
};
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

  // ── 護欄②：既有 patch 與 ExVersion 的矛盾偵測 ────────────────────────────
  // 2026-07-28 首跑抓到 18 筆矛盾，逐筆確認**全部都是 dungeons.json 的 patch 錯**
  // （究極武器破壞作戰是 ARR 內容卻標 6.0、深空天坑是 7.0 卻標 6.0、亞歷山大機神城
  // 是 3.0 卻標 2.45…），成因是 build-dungeons.mjs 走 XIVAPI v1 的 GamePatch 而 v1
  // 已停更。ExVersion 才是客戶端自己的歸屬，所以**矛盾時信 ExVersion**。
  // 已證實為錯的 patch 直接清成 null（保留一個錯的值比留空更糟——版本篩選會把副本
  // 分到錯的資料片），但**不猜正確 patch**：沒有權威來源，null 就是誠實的答案。
  const bad = [];
  for (const d of dungeons) {
    const c = cfc[d.id];
    if (!c || c.exVersion == null || !d.patch) continue;
    const want = exFromPatch(d.patch);
    if (want != null && want !== c.exVersion) bad.push({ d, got: c.exVersion, want });
  }
  console.log(`護欄② patch 矛盾：${bad.length} 筆的 patch 與 ExVersion 對不起來`
    + (bad.length ? `（信 ExVersion，把這些 patch 清成 null）` : ''));
  bad.slice(0, 20).forEach((m) => console.log(
    `  · ${m.d.id} ${m.d.name}：patch ${m.d.patch}（推得 ${EXVERSION_TW[m.want] || m.want}）`
    + ` vs ExVersion ${EXVERSION_TW[m.got] || m.got} ← 採用`));
  if (bad.length > 40) {
    console.error(`\n✗ 矛盾筆數 ${bad.length} 過多，先確認 ExVersion 對照是否正確，中止不寫入。`);
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
  const byExp = {};
  let filled = 0, noEx = [];
  for (const d of dungeons) {
    const c = cfc[d.id];
    if (!c || c.exVersion == null) { noEx.push(d.id); continue; }
    const label = EXVERSION_TW[c.exVersion];
    if (!label) { console.warn(`  ⚠ ${d.id} ${d.name}：未知的 ExVersion ${c.exVersion}（新資料片？請補 EXVERSION_TW）`); noEx.push(d.id); continue; }
    byExp[label] = (byExp[label] || 0) + 1;
    if (d.expansion !== label || d.expansionId !== c.exVersion) filled++;
    if (APPLY) { d.expansion = label; d.expansionId = c.exVersion; }
  }
  console.log(`\n可填 expansion：${dungeons.length - noEx.length}/${dungeons.length}（要更新 ${filled} 筆）`);
  Object.entries(byExp).sort().forEach(([k, v]) => console.log(`  ${k.padEnd(6)} ${v} 座`));
  if (noEx.length) console.log(`  補不到的 ${noEx.length} 筆：${noEx.slice(0, 20).join(', ')}`);

  // 已證實為錯的 patch 清成 null（理由見護欄②）
  if (APPLY) bad.forEach(({ d }) => { d.patch = null; });
  console.log(`清掉已證實錯誤的 patch：${bad.length} 筆`
    + `（清完 patch 為 null 者 ${dungeons.filter((d) => !d.patch).length + (APPLY ? 0 : bad.length)}/${dungeons.length}）`);

  if (!APPLY) { console.log('\n（dry-run，未寫入。加 --apply 才會寫進 data/dungeons.json）'); return; }

  db.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(dPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log(`\n✓ 已寫入 data/dungeons.json`);
  console.log('  接著跑：node scripts/validate-data.mjs');
}

main().catch((e) => { console.error(e); process.exit(1); });
