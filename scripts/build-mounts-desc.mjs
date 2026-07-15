// 補充坐騎描述（description 欄位）
//
// build-mounts.mjs 跑完後，mounts.json 的 description 都是 null。
// 此腳本逐筆打 XIVAPI Mount/{id} 取 transient.Description，回填 mounts.json。
//
// 已有描述的不會重複抓。
// 需 Node 18+（內建 fetch）。無需額外套件。
//
// 執行（repo 根目錄）：
//   node scripts/build-mounts-desc.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "mounts.json");

const DELAY_MS = 150;    // 每筆間隔，避免 rate limit
const CONCURRENCY = 3;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchDesc(id) {
  const url = `https://v2.xivapi.com/api/sheet/Mount/${id}?fields=Singular`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return json.transient?.Description || null;
}

async function main() {
  const db = JSON.parse(await readFile(DATA_FILE, "utf8"));
  const todo = db.data.filter((m) => !m.description && m.nameEn);
  console.log(`待補描述：${todo.length} 筆（共 ${db.data.length} 筆）`);

  let done = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (m) => {
      const desc = await fetchDesc(m.id);
      if (desc) m.description = desc;
    }));
    done += batch.length;
    process.stdout.write(`\r  進度 ${done}/${todo.length}`);
    if (i + CONCURRENCY < todo.length) await sleep(DELAY_MS);
  }

  db.updated = new Date().toISOString().slice(0, 10);
  await writeFile(DATA_FILE, JSON.stringify(db, null, 2));
  console.log("\n完成，已回填 mounts.json。");
}

main().catch((e) => { console.error(e); process.exit(1); });
