// build-pages-artifact.mjs — 組出「要發佈到 GitHub Pages 的檔案」（Actions 部署用）
//
// 第二輪路線圖 `pages-deploy-via-actions`（§7-2，站主 10-03「都可以製作」）。
// 現在 Pages 是「從 main 分支整包發佈」，所以建置中間檔也佔了 1GB 發佈上限：
// out_data/ 63.6MB、tools/glamour/data/ 22.3MB、scripts/、docs/……前端一個都不讀。
// 改由 Actions 部署後，只上傳這支挑出來的檔。
//
// 規則：從 `git ls-files` 出發（**沒進 git 的不會上**，與現在的發佈範圍一致），扣掉 EXCLUDE。
// EXCLUDE 的每一條都要講得出「前端為什麼不需要它」；不確定的一律留著——多上傳只是佔空間，
// 漏上傳是線上 404。
//
// 閘門（任何一條不過就中止，不產出半套網站）：
//   ① 必備檔都在：index.html、sw.js、manifest.json、.nojekyll、data/_meta.json、
//      每個分片目錄的 _index.json（底線開頭，Jekyll 會吃掉的那批，§4.94）
//   ② nav.js 登記的每一頁都有 index.html
//   ③ 前端 HTML／JS 裡寫死的 `data/…json` 路徑全部都在發佈清單裡
//   ④ 被排除的路徑沒有任何一個被前端引用（grep 前端檔案的字串）
//
// 執行（repo 根目錄）：
//   node scripts/build-pages-artifact.mjs              # dry-run：印要發佈多少、省多少
//   node scripts/build-pages-artifact.mjs --out _site  # 複製到 _site/（Actions 用）

import { execFileSync } from "node:child_process";
import { readFileSync, statSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const outDir = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : null;
// --stamp <commit sha>：在產出裡放一個 build.json，部署後到線上比對——比 sw.js 的版本號準
// （只改資料的 commit 不會換 sw.js 版本號，拿它當指紋會把「沒部署」誤判成「已是這一版」）
const stamp = argv.includes("--stamp") ? argv[argv.indexOf("--stamp") + 1] : null;

/** [規則, 理由]。規則是「路徑開頭」或以 * 開頭的「副檔名」。 */
export const EXCLUDE = [
  ["out_data/", "建置中繼檔（msgpack、快取、對照表），前端從來不讀"],
  ["scripts/", "Node 建置／驗證腳本"],
  ["docs/", "開發文件"],
  [".github/", "Actions 設定"],
  ["tools/glamour/data/", "幻化圖鑑的 Python 管線資料；前端讀的是 build_site.py 產生的 *.js 與 site_meta.json"],
  ["tools/glamour/scripts/", "幻化圖鑑的 Python 管線"],
  ["data/scripts/", "舊的一次性腳本與建置報告（sync-meta 的 NOT_REGISTERED 也列了）"],
  ["package.json", "Node 依賴宣告"],
  ["package-lock.json", "Node 依賴鎖定"],
  ["*.md", "說明文件（README／CLAUDE.md／SCHEMA.md／幻化圖鑑報告）"],
  ["*.bat", "Windows 批次檔（幻化圖鑑的本機重建捷徑）"],
  ["*.py", "Python 腳本"],
  ["*/.gitignore", "git 設定"],
  [".gitignore", "git 設定"],
];
const excluded = (p) => EXCLUDE.find(([r]) =>
  r.startsWith("*/") ? p.endsWith(r.slice(1)) || p === r.slice(2)
    : r.startsWith("*") ? p.endsWith(r.slice(1)) : p === r || p.startsWith(r));

function listTracked() {
  const out = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: ROOT, maxBuffer: 1 << 28 });
  return out.toString("utf8").split("\0").filter(Boolean);
}

function main() {
  const all = listTracked();
  const keep = [], drop = new Map();
  for (const p of all) {
    const ex = excluded(p);
    if (ex) { const d = drop.get(ex[0]) || { n: 0, bytes: 0 }; d.n++; d.bytes += sizeOf(p); drop.set(ex[0], d); }
    else keep.push(p);
  }
  const keepSet = new Set(keep);
  const fatal = [];

  // ① 必備檔
  const must = ["index.html", "sw.js", "manifest.json", ".nojekyll", "data/_meta.json"];
  for (const p of all) if (/^data\/[^/]+\/_index\.json$/.test(p)) must.push(p);
  for (const p of must) if (!keepSet.has(p)) fatal.push(`必備檔沒有在發佈清單裡：${p}`);

  // ② nav.js 的每一頁
  const nav = readFileSync(join(ROOT, "assets/js/nav.js"), "utf8");
  const m = nav.match(/var TOOLS = \[[\s\S]*?\n {2}\];/);
  const TOOLS = m ? new Function(m[0] + "; return TOOLS;")() : [];
  if (!TOOLS.length) fatal.push("抓不到 nav.js 的 TOOLS");
  for (const t of TOOLS) if (t.p && !keepSet.has(t.p + "index.html")) fatal.push(`頁面沒有在發佈清單裡：${t.p}index.html`);

  // ③④ 前端檔案裡寫死的路徑
  const fe = keep.filter((p) => /\.(html|js|mjs|css|webmanifest|json)$/.test(p) && !p.startsWith("data/") && !/配裝圖片/.test(p)
    && !/(outfits|item_db|official_sets|item_sources)\.js$/.test(p));
  const text = fe.map((p) => readFileSync(join(ROOT, p), "utf8")).join("\n");
  const dataRefs = new Set([...text.matchAll(/data\/([a-z0-9][a-z0-9_\-/]*\.json)/g)].map((x) => "data/" + x[1]));
  for (const r of dataRefs) {
    if (r.includes("/_index.json") || all.includes(r)) { if (!keepSet.has(r) && all.includes(r)) fatal.push(`前端引用的 ${r} 被排除了`); }
  }
  for (const [rule] of EXCLUDE) {
    if (rule.startsWith("*") || !rule.endsWith("/")) continue;
    const needle = rule === "data/scripts/" ? "data/scripts/" : rule;
    if (new RegExp(`["'\`](?:\\.\\./)*${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)) {
      fatal.push(`前端檔案裡有指向被排除路徑的字串：${rule}`);
    }
  }

  const keepBytes = keep.reduce((s, p) => s + sizeOf(p), 0);
  const MB = (b) => (b / 1048576).toFixed(1) + "MB";
  console.log(`git 追蹤 ${all.length} 檔；發佈 ${keep.length} 檔、${MB(keepBytes)}`);
  let saved = 0;
  for (const [rule, why] of EXCLUDE) {
    const d = drop.get(rule);
    if (!d) continue;
    saved += d.bytes;
    console.log(`  － ${rule.padEnd(24)} ${String(d.n).padStart(5)} 檔 ${MB(d.bytes).padStart(8)}　${why}`);
  }
  console.log(`  合計省下 ${MB(saved)}（GitHub Pages 發佈上限 1GB）`);
  console.log(`  前端寫死的 data/ 路徑 ${dataRefs.size} 條，必備檔 ${must.length} 個，頁面 ${TOOLS.filter((t) => t.p).length} 頁`);

  if (fatal.length) { console.error("\n✗ 中止：\n   " + fatal.join("\n   ")); process.exit(1); }
  if (!outDir) { console.log("\n（dry-run；加 --out _site 才複製）"); return; }

  for (const p of keep) {
    const dst = join(resolve(ROOT, outDir), p);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(ROOT, p), dst);
  }
  if (stamp) writeFileSync(join(resolve(ROOT, outDir), "build.json"), JSON.stringify({ sha: stamp, built: new Date().toISOString() }) + "\n");
  console.log(`\n✓ 已複製到 ${outDir}/（${keep.length} 檔${stamp ? "＋build.json" : ""}）`);
}

function sizeOf(p) {
  try { return statSync(join(ROOT, p)).size; } catch { return 0; }   // sparse checkout 時檔不在，只算得到 0
}

if ((process.argv[1] || "").endsWith("build-pages-artifact.mjs")) main();
