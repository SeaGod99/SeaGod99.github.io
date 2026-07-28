// 壓縮前端會載入的 data/*.json（去掉排版空白，不動任何欄位或順序）
//
// 為什麼：前端 fetch 這些檔時，`JSON.stringify(obj, null, 2)` 的縮排是純浪費——
// 使用者要多下載 30~50%。站上大檔（items / items-lite / items-market / monsters /
// npcs）本來就是壓縮的，這支把其餘的補齊，慣例一致。
//
// 安全性：只做 parse → stringify(separators 無空白)，**不碰資料本身**；
// 跑完會逐檔驗證「重新 parse 後與原物件深度相等」，不相等就不寫入。
// 各 patch 腳本原本就會偵測並沿用檔案既有的 minified/pretty 格式，不受影響。
//
// 執行：
//   node scripts/minify-data.mjs            # dry-run，只列出可省多少
//   node scripts/minify-data.mjs --apply    # 實際寫入

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const apply = process.argv.includes("--apply");

// 這些是「人會手動編輯」或「刻意保持可讀」的，不壓
const KEEP_PRETTY = new Set([
  "_meta.json",       // 手改 gamePatch／databases，要能 review diff
  "SCHEMA.md",
]);

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

const files = (await readdir(DATA)).filter(
  (f) => f.endsWith(".json") && !KEEP_PRETTY.has(f)
);

let before = 0, after = 0, changed = 0;
const rows = [];

for (const f of files) {
  const p = join(DATA, f);
  const raw = await readFile(p, "utf8");
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    console.error(`  ✗ ${f} 不是合法 JSON，跳過`);
    continue;
  }
  const mini = JSON.stringify(obj);
  const a = Buffer.byteLength(raw), b = Buffer.byteLength(mini);
  before += a;
  after += b;
  if (b >= a) continue;                       // 已經是壓縮的

  // 驗證：壓縮後 parse 回來必須與原物件完全相同
  if (!deepEqual(JSON.parse(mini), obj)) {
    console.error(`  ✗ ${f} 壓縮後內容不一致，跳過（不應發生，請回報）`);
    continue;
  }
  changed++;
  rows.push([f, a, b]);
  if (apply) await writeFile(p, mini, "utf8");
}

rows.sort((x, y) => (y[1] - y[2]) - (x[1] - x[2]));
console.log(`data/*.json 共 ${files.length} 個，可壓縮 ${changed} 個\n`);
for (const [f, a, b] of rows) {
  console.log(
    `  ${f.padEnd(30)}${(a / 1024).toFixed(0).padStart(7)}K → ${(b / 1024).toFixed(0).padStart(6)}K` +
    `  省 ${(((a - b) / a) * 100).toFixed(0).padStart(2)}%`
  );
}
const saved = rows.reduce((s, [, a, b]) => s + a - b, 0);
console.log(`\n合計省 ${(saved / 1048576).toFixed(2)} MB`);
console.log(apply ? "✅ 已寫入" : "（dry-run，加 --apply 才寫入）");
