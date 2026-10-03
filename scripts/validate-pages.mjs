// validate-pages.mjs — 全站頁面體檢（真瀏覽器，非 jsdom）
//
// 什麼時候跑：**改了任何頁面的版面、共用 CSS／JS，或新增頁面之後。**
// jsdom 驗得了 DOM 結構，但量不了版面——水平溢出、字太小、點擊目標太小、
// 圖片沒有 alt、id 重複，這些只有真的排版引擎知道。
//
// 怎麼跑起來：Node 內建 http 伺服器 ＋ headless **Edge** ＋ CDP。
// 本機 headless Chromium 起不來（`chrome-headless-shell` 崩潰），Edge 可以，
// 而且 Node 24 有原生 WebSocket，所以不需要 puppeteer／playwright（專案也沒裝）。
// 兩個踩過的雷寫死在程式裡：`setDeviceMetricsOverride` 必須 `mobile:false`
// （設 true 會退回 980px 佈局寬，量到的不是你指定的寬度）、
// Git Bash 傳路徑參數要 `MSYS_NO_PATHCONV=1`。細節見知識庫 §3.5。
//
// ── 硬門檻只放「確定性指標」──────────────────────────────────────
// 會 fail 的只有客觀、可重現、與美感無關的東西：
//   · console error（含未捕捉的例外與資源 404）
//   · 水平溢出（documentElement.scrollWidth > clientWidth）
//   · 重複的 id
//   · <img> 沒有 alt 屬性
//   · 互動元素的點擊目標在觸控寬度下小於 44×44
// **刻意不放**載入時間與傳輸位元組：本機量出來的數字跟使用者端沒有關係，
// 放進硬門檻只會製造隨機失敗（路線圖原案也是這樣界定的）。
//
// 頁面清單**不是手寫的**，直接讀 assets/js/nav.js 的 TOOLS——
// 手寫的清單一定會跟新頁面脫節，而脫節時不會有人發現。
//
// 執行（repo 根目錄）：
//   node scripts/validate-pages.mjs                 # 全部頁面 × 三種寬度
//   node scripts/validate-pages.mjs --page market   # 只驗路徑含 market 的頁
//   node scripts/validate-pages.mjs --width 390     # 只驗某個寬度
//   node scripts/validate-pages.mjs --shot out/     # 順便存截圖（除錯用）
//   node scripts/validate-pages.mjs --serve _site   # 改從別的目錄供檔（驗 build-pages-artifact.mjs 組出來的發佈檔）

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const pageFilter = argOf("--page");
const widthFilter = argOf("--width") ? Number(argOf("--width")) : null;
const shotDir = argOf("--shot");
// 供檔的根目錄。頁面清單仍讀 repo 的 nav.js；**少了檔就會 404 → console error 或空白頁**，
// 所以拿它驗發佈檔是準的：被排除掉而頁面其實要用的檔，會在這裡現形。
const SERVE = argOf("--serve") ? resolve(ROOT, argOf("--serve")) : ROOT;

const EDGE_CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const PORT = 8931;
const CDP = 9351;
// 360 是最窄的常見手機、768 是平板直向、1280 是筆電——三個都是實際會遇到的斷點
const WIDTHS = [[360, 800], [768, 1024], [1280, 900]];

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".msgpack": "application/octet-stream", ".webmanifest": "application/manifest+json",
};

function pages() {
  const nav = existsSync(join(ROOT, "assets/js/nav.js"))
    ? null : null;
  return readFile(join(ROOT, "assets/js/nav.js"), "utf8").then((src) => {
    const m = src.match(/var TOOLS = \[[\s\S]*?\n {2}\];/);
    if (!m) throw new Error("抓不到 nav.js 的 TOOLS——頁面清單就是從那裡來的");
    const TOOLS = new Function(m[0] + "; return TOOLS;")();
    let list = TOOLS.filter((t) => t.p).map((t) => ({ name: t.n, path: "/" + t.p }));
    list.unshift({ name: "首頁", path: "/" });
    if (pageFilter) list = list.filter((p) => p.path.includes(pageFilter));
    void nav;
    return list;
  });
}

// ── 靜態伺服器 ────────────────────────────────────────────────────────
const missing = new Set();
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = join(SERVE, p);
  try {
    if ((await stat(f)).isDirectory()) throw new Error("dir");
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch {
    missing.add(p);
    res.writeHead(404).end("not found");
  }
});

// ── CDP ───────────────────────────────────────────────────────────────
function edgePath() {
  const hit = EDGE_CANDIDATES.find((p) => existsSync(p));
  if (!hit) {
    console.error("找不到 Edge。本機 headless Chromium 起不來，這支只能用 Edge（知識庫 §3.5）。");
    console.error("找過：\n  " + EDGE_CANDIDATES.join("\n  "));
    process.exit(2);
  }
  return hit;
}

async function cdpTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      const t = l.find((x) => x.type === "page");
      if (t?.webSocketDebuggerUrl) return t;
    } catch { /* 還沒起來 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Edge 的 CDP 連不上");
}

// 頁面裡跑的檢查。回傳純資料，不做判斷——判斷在 Node 這邊，才好改門檻。
const PROBE = `(() => {
  const de = document.documentElement;
  const over = [...document.querySelectorAll('body *')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > de.clientWidth + 1;
    })
    .slice(0, 5)
    .map(el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) +
      ' → ' + Math.round(el.getBoundingClientRect().right));

  const ids = {}, dupIds = [];
  for (const el of document.querySelectorAll('[id]')) {
    if (ids[el.id]) { if (dupIds.indexOf(el.id) < 0) dupIds.push(el.id); } else ids[el.id] = 1;
  }

  const noAlt = [...document.querySelectorAll('img:not([alt])')]
    .slice(0, 5).map(el => el.getAttribute('src') || '(無 src)');

  // 點擊目標：量的是**實際命中區**，不是 getBoundingClientRect。
  // 站內好幾處用 ::after 透明擴張層把小圖示的命中區推到 44px（頂列站名就是），
  // 那種偽元素 rect 看不到，只量盒子會誤報一整排。所以改用 elementFromPoint 探點：
  // 以元素中心為準，上下左右各 20px 取四點，四點都還命中自己（或自己的子孫）才算過。
  function hitOk(el, r, size) {
    const d = size / 2 - 2;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const pts = [[cx, cy - d], [cx, cy + d], [cx - d, cy], [cx + d, cy]];
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return false;
    }
    return true;
  }

  // 先分「被遮住」與「太小」——兩者的成因完全不同：
  //   被遮住＝量測當下被 sticky 頁首之類的東西蓋著（多半只是捲動位置，不是缺陷）
  //   太小＝中心點打得到自己，但擴不出 24／44 的命中區（這才是真的點不到）
  const covered = [], tiny = [], small = [];
  for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button], [role=checkbox]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    if (r.width >= 44 && r.height >= 44) continue;
    const lab = el.closest('label');
    if (lab && lab !== el) {
      const lr = lab.getBoundingClientRect();
      if (lr.width >= 44 && lr.height >= 44) continue;
    }
    const label = (() => {
      const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/s+/)[0] : '';
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls + ' ' +
        Math.round(r.width) + '×' + Math.round(r.height);
    })();
    const isSelf = (h) => h && (h === el || el.contains(h) || h.contains(el));
    let rr = r;
    let self = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    /* 中心點被別的東西蓋住時，先把它捲到畫面正中央再量一次（2026-10-03）。
       被 sticky 頁首蓋住只是「量測當下的捲動位置」，不是缺陷——捲過去之後還被蓋住的才報。
       instant：頁面若設了 scroll-behavior: smooth，量的時候還沒捲到。量完捲回原位，不影響後面的元素。 */
    if (!isSelf(self)) {
      const y0 = scrollY, x0 = scrollX;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      rr = el.getBoundingClientRect();
      self = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
      const ok = isSelf(self);
      const t24 = ok && !hitOk(el, rr, 24), s44 = ok && !t24 && !hitOk(el, rr, 44);
      window.scrollTo({ left: x0, top: y0, behavior: 'instant' });
      if (!ok) { covered.push(label); continue; }
      if (t24) tiny.push(label); else if (s44) small.push(label);
      continue;
    }
    if (!hitOk(el, rr, 24)) tiny.push(label);
    else if (!hitOk(el, rr, 44)) small.push(label);
  }

  return {
    scrollW: de.scrollWidth, clientW: de.clientWidth,
    over, dupIds, noAlt, small, tiny, covered,
    coarse: window.matchMedia('(pointer: coarse)').matches,
    title: document.title,
    bodyLen: (document.body.textContent || '').trim().length,
  };
})()`;

async function main() {
  const list = await pages();
  if (!list.length) { console.error("沒有符合的頁面"); process.exit(2); }
  const widths = widthFilter ? WIDTHS.filter((w) => w[0] === widthFilter) : WIDTHS;
  if (!widths.length) { console.error(`--width 只接受 ${WIDTHS.map((w) => w[0]).join("／")}`); process.exit(2); }

  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const edge = spawn(edgePath(), [
    "--headless=new", `--remote-debugging-port=${CDP}`, "--disable-gpu", "--no-first-run",
    "--user-data-dir=" + join(process.env.TEMP || ".", "edge-validate-pages"), "about:blank",
  ], { stdio: "ignore" });

  const t = await cdpTarget();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pend = new Map();
  let logs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      logs.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    }
    if (m.method === "Runtime.exceptionThrown") {
      logs.push("例外：" + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
    }
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
      logs.push(m.params.entry.text.slice(0, 160));
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  if (shotDir) await mkdir(join(ROOT, shotDir), { recursive: true });

  const problems = [];
  let checks = 0, warned = 0;
  console.log(`體檢 ${list.length} 個頁面 × ${widths.length} 種寬度（真瀏覽器）\n`);

  for (const page of list) {
    const rowIssues = [];
    const rowWarns = [];
    for (const [w, h] of widths) {
      logs = [];
      // mobile 必須是 false（true 會退回 980px 佈局寬，§3.5），但觸控要另外開：
      // 全站的點擊目標尺寸寫在 `@media (pointer: coarse)` 裡，不開觸控的話那條規則不會套用，
      // 量到的就是桌機尺寸——會誤報一整排「點擊目標太小」。
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await send("Emulation.setTouchEmulationEnabled", { enabled: w <= 768, maxTouchPoints: w <= 768 ? 5 : 0 });
      await send("Page.navigate", { url: `http://127.0.0.1:${PORT}${page.path}` });
      // 資料頁多半要抓好幾份 json 才畫得出來；2.5 秒是實測夠用的下限
      await new Promise((r) => setTimeout(r, 2500));
      const { result } = await send("Runtime.evaluate", { returnByValue: true, expression: PROBE });
      const v = result.value;
      checks++;

      if (shotDir) {
        const { data } = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(join(ROOT, shotDir, page.path.replace(/[/]/g, "_") + w + ".png"), Buffer.from(data, "base64"));
      }

      if (v.scrollW > v.clientW + 1) rowIssues.push(`${w}px 水平溢出 ${v.scrollW}>${v.clientW}：${v.over.join(" | ")}`);
      if (v.dupIds.length) rowIssues.push(`${w}px 重複 id：${v.dupIds.slice(0, 4).join("、")}`);
      if (v.noAlt.length) rowIssues.push(`${w}px 圖片缺 alt ${v.noAlt.length} 個：${v.noAlt.slice(0, 2).join("、")}`);
      if (w === 360) {
        // 觸控模擬沒生效的話這條檢查是在驗桌機尺寸，等於沒驗——要當成失敗而不是通過
        if (!v.coarse) rowIssues.push("360px 觸控模擬沒生效（pointer: coarse 不成立），點擊目標檢查不可信");
        else {
          // 低於 24×24 違反 WCAG 2.5.8（AA）→ 擋；
          // 24–44 只是沒達到 2.5.5（AAA 建議值），那是設計取捨不是缺陷 → 警告；
          // 被遮住多半只是量測當下的捲動位置 → 警告。
          if (v.tiny.length) rowIssues.push(`360px 點擊目標 < 24px（違反 WCAG AA）：${v.tiny.slice(0, 3).join("、")}`);
          if (v.small.length) rowWarns.push(`360px 點擊目標 24–44px（未達 AAA 建議）：${v.small.slice(0, 3).join("、")}`);
          if (v.covered.length) rowWarns.push(`360px 量測當下被蓋住：${v.covered.slice(0, 3).join("、")}`);
        }
      }
      if (logs.length) rowIssues.push(`${w}px console error：${[...new Set(logs)].slice(0, 2).join(" | ")}`);
      if (v.bodyLen < 50) rowIssues.push(`${w}px 頁面幾乎沒有內容（${v.bodyLen} 字）`);
    }
    const ok = rowIssues.length === 0;
    console.log(`${ok ? (rowWarns.length ? "⚠" : "✓") : "✗"} ${page.name.padEnd(16)} ${page.path}`);
    for (const p of rowIssues) console.log(`    ${p}`);
    for (const p of rowWarns) console.log(`    （警告）${p}`);
    if (!ok) problems.push([page, rowIssues]);
    if (rowWarns.length) warned++;
  }

  if (missing.size) {
    console.log(`\n⚠ 有 ${missing.size} 個檔案被要求但不存在（404）：`);
    for (const m of [...missing].slice(0, 10)) console.log(`    ${m}`);
  }

  console.log(`\n${checks} 次檢查、${list.length} 個頁面：` +
    (problems.length ? `${problems.length} 頁有問題` : "全部通過"));

  ws.close(); edge.kill(); server.close();
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
