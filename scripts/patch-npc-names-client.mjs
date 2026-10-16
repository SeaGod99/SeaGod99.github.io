// patch-npc-names-client.mjs — data/npcs.json 的 NPC 名換成台服客戶端（ENpcResident.Singular）
//
// 為什麼需要（2026-10-11）：npcs.json 是 build-npcs.mjs 從 Teamcraft tw-npcs 建的。量過與台服客戶端的差異：
//   相同 19,122／只差中點 2,788（Teamcraft「·」、客戶端「・」）／用字不同 145（船頭→船夫、粗暴的男子→肌肉男子、
//   阿達耶→雜貨商阿達耶…）／客戶端沒有台服名 24（Teamcraft 那邊是日文：「キキルン商人」「呪術士の亡骸」）。
// 站內慣例是台服客戶端優先（知識庫 §4.98），而 NPC 名會被複製進 NPC 商店目錄、收藏頁兌換處、
// 取得方式分片層——源頭不改，下游每次重建都會帶回舊名。
//
// 規則：客戶端有可用的台服名就用（nameSource: "tw-client"）；**用字不同時把 Teamcraft 舊名留在 nameTc**
//   （patch-npc-renames.mjs 靠它把收藏頁文字裡的舊名換掉——Teamcraft 的表會更新，事後就推不回舊名了）。
//   沒有的保留原名但原名也要過守門，
// 過不了（日文、佔位）就把 name 設成 null（nameSource: "none"）——座標照留，給「只要位置」的建置用。
// 其他欄位不動。冪等。
//
// 執行：node scripts/patch-npc-names-client.mjs [--apply] [--offline]
// 跑完：node scripts/build-npc-shops.mjs --apply --offline → build-vendor-prices.mjs --apply --offline
//       → build-item-sources.mjs --apply → build-market-sources.mjs（各自重建時就會帶上新名字）

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clientNameMap, cleanName, usable } from "./lib/client-names.mjs";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "npcs.json");
const APPLY = process.argv.includes("--apply");
const offline = process.argv.includes("--offline");
const fold = (s) => String(s || "").replace(/[·・‧•]/g, "・");

const raw = readFileSync(FILE, "utf8");
const db = JSON.parse(raw);
const client = await clientNameMap("npc", { offline });
const st = { same: 0, dot: 0, diff: 0, kept: 0, nulled: 0, ex: [], nullEx: [] };
for (const n of db.data) {
  const c = client.get(n.id);
  if (c) {
    if (n.name === c) st.same++;
    else if (n.name && fold(n.name) === fold(c)) st.dot++;
    else { st.diff++; if (st.ex.length < 8) st.ex.push(`${n.id}「${n.name}」→「${c}」`); if (n.name && !n.nameTc) n.nameTc = n.name; }
    n.name = c;
    n.nameSource = "tw-client";
    continue;
  }
  const own = n.name == null ? "" : cleanName(n.name);
  if (usable(own)) { st.kept++; continue; }
  if (n.name != null) { st.nulled++; if (st.nullEx.length < 6) st.nullEx.push(`${n.id}「${n.name}」`); }
  n.name = null;
  n.nameSource = "none";
}
console.log(`npcs.json ${db.data.length} 筆：客戶端相同 ${st.same}、只差中點 ${st.dot}、用字不同 ${st.diff}；客戶端沒有而保留 ${st.kept}、原名不能用而清成 null ${st.nulled}`);
if (st.ex.length) console.log(`  用字不同例：${st.ex.join("　")}`);
if (st.nullEx.length) console.log(`  清成 null 例：${st.nullEx.join("　")}`);
if (!APPLY) { console.log("（dry-run，未寫入；加 --apply 寫回）"); process.exit(0); }
db.updated = new Date().toISOString().slice(0, 10);
await writeFile(FILE, raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
console.log("✓ data/npcs.json");
