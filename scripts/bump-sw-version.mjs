// 依共用資產內容雜湊產生 sw.js 的 CACHE_VERSION。
//
// 問題：CACHE_VERSION 原本是手寫字串（'sgt-v1'），改了共用 css/js 卻忘了 bump，
// 使用者就會被舊快取黏住。改成「內容變 → 版本自動變」，忘記 bump 這件事不再可能。
//
// 雜湊範圍＝會被 SW 快取、且改動需要立刻生效的東西：
//   assets/css/*.css、assets/js/*.js、manifest.json、sw.js 本身（排除版本行）
// 資料庫 json 不納入：它們走 stale-while-revalidate，且每次重建都會變，
// 納入會讓每次資料更新都清掉全站快取，得不償失。
//
// 執行：
//   node scripts/bump-sw-version.mjs           寫入（idempotent，內容沒變就不動檔案）
//   node scripts/bump-sw-version.mjs --check   只檢查，過期則 exit 1（不寫檔）

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SW = join(ROOT, "sw.js");
const CHECK = process.argv.includes("--check");

// CACHE_VERSION 那一行（以尾註 /* AUTO-BUMP */ 標記，避免誤改其他字串）
const LINE_RE = /^(const CACHE_VERSION = ')([^']*)('; \/\* AUTO-BUMP \*\/)$/m;

function filesIn(rel, ext) {
  const dir = join(ROOT, rel);
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => `${rel}/${f}`);
}

const swRaw = readFileSync(SW, "utf8");
const m = swRaw.match(LINE_RE);
if (!m) {
  console.error("✗ sw.js 找不到帶 /* AUTO-BUMP */ 標記的 CACHE_VERSION 行，請確認格式未被改動。");
  process.exit(1);
}

const targets = [
  ...filesIn("assets/css", ".css"),
  ...filesIn("assets/js", ".js"),
  "manifest.json"
];

const h = createHash("sha256");
for (const rel of targets) {
  h.update(rel);
  h.update(readFileSync(join(ROOT, rel)));
}
// sw.js 自身也納入，但排除版本行本身（否則永遠算不出穩定值）
h.update(swRaw.replace(LINE_RE, "$1$3"));

const next = "sgt-" + h.digest("hex").slice(0, 10);
const cur = m[2];

console.log(`納入雜湊 ${targets.length + 1} 個檔案：${targets.join(", ")}, sw.js`);
console.log(`目前 CACHE_VERSION：${cur}`);
console.log(`應為 CACHE_VERSION：${next}`);

if (cur === next) {
  console.log("✓ 已是最新，無需變更");
  process.exit(0);
}

if (CHECK) {
  console.error("✗ CACHE_VERSION 已過期，請跑 `node scripts/bump-sw-version.mjs`");
  process.exit(1);
}

writeFileSync(SW, swRaw.replace(LINE_RE, `$1${next}$3`));
console.log(`✅ 已寫入 sw.js：${cur} → ${next}`);
