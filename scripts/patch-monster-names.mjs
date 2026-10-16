/**
 * patch-monster-names.mjs — data/monsters.json 的怪物名與座標地名換成台服官方字串
 *
 * 名稱優先序（2026-10-11 改寫，知識庫 §4.98）：
 *   ① 台服客戶端 BNpcName.Singular（scripts/lib/client-names.mjs）     nameSource: "client"
 *   ② Teamcraft tw/tw-mobs（out_data/tw-locales.msgpack 的 mobs）        nameSource: "tw-mobs"
 *   ③ 都沒有 → name: null                                                nameSource: "none"
 * 第 ③ 種以前留著中國服 BNpcName 的簡轉繁名（687 筆，含「ラベル削除予定」「？？？？」這種佔位列）。
 * 這份檔前端不載，但 build-blue-magic.mjs 會拿它的 name 當英文怪名的翻譯——簡轉繁名會從那裡漏出去（鐵則）。
 *
 * 座標地名（positions[].mapName）：
 *   data/maps.json 的 name（依 mapId）→ 台服客戶端 Map.PlaceName → PlaceName.Name → 都沒有就 null。
 *   以前是中國服 PlaceName 簡轉繁，有 5 張圖、2,490 個座標是舊譯名
 *   （龍堡參天高地→德拉瓦尼亞山麓地、翻雲霧海→德拉瓦尼亞雲海、活著的記憶→憶想之地…）。
 *
 * 其他欄位（positions 的座標、drops、huntRank、patch…）一律不動。
 * build-monsters.mjs 重建完會直接呼叫這支的 applyMonsterNames()，兩邊不會各寫一套。
 *
 * 執行（repo 根目錄，不連網）：
 *   node scripts/patch-monster-names.mjs            # dry-run：印會改什麼
 *   node scripts/patch-monster-names.mjs --apply    # 寫回 data/monsters.json
 */

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { loadTwLocales, twName } from "./lib/tw-locales.mjs";
import { preferClient, clientNameMap, cleanName, usable, logStats } from "./lib/client-names.mjs";
import { loadTcSheet } from "./lib/tc-datamining.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MONSTERS_PATH = join(ROOT, "data", "monsters.json");

/**
 * 就地改 db.data 的 name／nameSource／positions[].mapName，回傳統計。
 * @param db  monsters.json 的整份物件（{ data: [...] }）
 */
export async function applyMonsterNames(db, { offline = false, log = true } = {}) {
  const tw = await loadTwLocales();
  const mobs = await preferClient(tw.mobs, "mob", { offline });
  const client = await clientNameMap("mob", { offline });
  if (log) logStats("怪物名", mobs);

  // 地名：maps.json 優先，再來客戶端 Map → PlaceName
  const maps = JSON.parse(readFileSync(join(ROOT, "data", "maps.json"), "utf8")).data;
  const mapName = new Map(maps.filter((m) => m.name).map((m) => [m.id, m.name]));
  const place = new Map((await loadTcSheet("PlaceName", { offline })).map((r) => [r.id, cleanName(r.Name)]));
  const clientMapName = new Map();
  for (const r of await loadTcSheet("Map", { offline })) {
    const n = place.get(Number(r.PlaceName));
    if (usable(n)) clientMapName.set(r.id, n);
  }
  const nameOfMap = (id) => mapName.get(id) ?? clientMapName.get(id) ?? null;

  const st = { client: 0, twMobs: 0, none: 0, renamed: 0, nulled: 0, examples: [], nulledEx: [], mapFixed: new Map(), mapNull: 0 };
  for (const m of db.data) {
    const name = twName(mobs, m.baseId);
    const src = name == null ? "none" : client.has(m.baseId) ? "client" : "tw-mobs";
    st[src === "tw-mobs" ? "twMobs" : src]++;
    if (name == null) {
      if (m.name != null) { st.nulled++; if (st.nulledEx.length < 6) st.nulledEx.push(`${m.baseId}「${m.name}」`); }
      m.name = null;
    } else if (m.name !== name) {
      st.renamed++;
      if (st.examples.length < 8) st.examples.push(`${m.baseId}「${m.name}」→「${name}」`);
      m.name = name;
    }
    m.nameSource = src;
    for (const p of m.positions || []) {
      const n = nameOfMap(p.mapId);
      if (n == null) { if (p.mapName != null) st.mapNull++; p.mapName = null; continue; }
      if (p.mapName !== n) {
        const k = `${p.mapId} ${p.mapName ?? "（空）"}→${n}`;
        st.mapFixed.set(k, (st.mapFixed.get(k) || 0) + 1);
        p.mapName = n;
      }
    }
  }
  if (log) {
    console.log(`  名稱來源：客戶端 ${st.client}／tw-mobs ${st.twMobs}／無台服名 ${st.none}`);
    console.log(`  改名 ${st.renamed}${st.examples.length ? "　例：" + st.examples.slice(0, 4).join("　") : ""}`);
    console.log(`  原本是簡轉繁、查不到台服名而改成 null：${st.nulled}${st.nulledEx.length ? "　例：" + st.nulledEx.join("　") : ""}`);
    const fixed = [...st.mapFixed.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`  座標地名校正：${fixed.reduce((s, [, n]) => s + n, 0)} 個座標（${fixed.length} 組）；查不到地名而清空 ${st.mapNull}`);
    for (const [k, n] of fixed.slice(0, 10)) console.log(`    ${k}（${n}）`);
  }
  return st;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("=== patch-monster-names.mjs（怪物名與座標地名台服化）===");
  const db = JSON.parse(readFileSync(MONSTERS_PATH, "utf8"));
  console.log(`  monsters ${db.data.length} 筆`);
  await applyMonsterNames(db, { offline: process.argv.includes("--offline") });

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 寫回 data/monsters.json）"); return; }
  db.updated = new Date().toISOString().slice(0, 10);
  db.source = "BNpcName(台服客戶端)+tw-mobs+teamcraft+xivapi+items";
  // 先寫 temp、回讀驗證，再複製到目標（避免大檔寫入截斷）
  const tmp = join(tmpdir(), "monsters_patch.json");
  writeFileSync(tmp, JSON.stringify(db));
  JSON.parse(readFileSync(tmp, "utf8"));
  copyFileSync(tmp, MONSTERS_PATH);
  const check = JSON.parse(readFileSync(MONSTERS_PATH, "utf8"));
  if (check.data.length !== db.data.length) throw new Error("寫入後筆數不符！");
  console.log(`\n✓ data/monsters.json（${db.data.length} 筆）`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
