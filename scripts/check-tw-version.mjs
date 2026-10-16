// check-tw-version.mjs — 台服版本偵測：站上（data/_meta.json）落後台服了沒有
//
// 為什麼需要：2026-10 台服已上 7.25 三週，站上還停在 7.21 而沒人發現——當時的偵測法是「拿 Teamcraft 台服
// 語系檔反推」，它停在 7.2 時不報錯、只給舊答案（知識庫 §4.5）。這支看三個來源，任何一個比站上新就報：
//   ① 官方更新筆記索引 https://www.ffxiv.com.tw/web/special/patchnote_log/ 的最高版本（靜態 HTML，
//      連結形如 patch_7.25_notes.html）→ 對 _meta.json 的 gamePatch
//   ② 台服客戶端解包 thewakingsands/ffxiv-datamining-tc 的最新 commit（訊息即客戶端版本「ver 2026.09.14.0000.0000」）
//      → 對 _meta.json 的 twClient.version（站上資料取自哪一版客戶端）。客戶端比站上新＝有新資料可升（即使官方筆記還沒出）
//   ③ Teamcraft 台服語系檔（tw/）的最新 commit——只當參考：它落後時升版不能走它（§4.5）
// 版本一律用「次版號補滿兩位」的數值語意比（7.3 > 7.25），**不可用 sort -V**（它把 7.25 排在 7.3 後面）。
//
// 結束碼（給 .github/workflows/version-watch.yml 用）：
//   0  站上已追上（官方與客戶端都不比站上新）
//   10 落後：官方筆記比 gamePatch 新，或客戶端解包比 twClient 新
//   2  偵測失靈：官方索引抓得到但解析不到任何版本（頁面改版？）
//   3  偵測失靈：連不上來源（官方站擋雲端 IP、GitHub API 失敗…）——不可當成「沒落後」
// stdout 一律是 JSON（workflow 拿它寫 issue）。
//
// 執行：node scripts/check-tw-version.mjs   （唯讀，不改任何檔）

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "sgt-version-watch (+https://github.com/SeaGod99/SeaGod99.github.io)";
const GH = { accept: "application/vnd.github+json", "user-agent": UA, ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) };
// 與 assets/js/patch-gate.js 的 pnum 同一個語意
const pnum = (p) => { const m = String(p ?? "").match(/^(\d+)\.(\d+)/); return m ? parseFloat(`${m[1]}.${m[2].padEnd(2, "0")}`) : null; };
const get = async (url, headers = { "user-agent": UA }) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
};
const lastCommit = async (repo, q = "") => {
  const c = JSON.parse(await get(`https://api.github.com/repos/${repo}/commits?per_page=1${q}`, GH))[0];
  return { sha: c.sha.slice(0, 8), date: c.commit.committer.date.slice(0, 10), msg: c.commit.message.split("\n")[0] };
};

const meta = JSON.parse(readFileSync(join(ROOT, "data", "_meta.json"), "utf8"));
const site = meta.gamePatch;
const siteClient = meta.twClient?.version ?? null;

/* 三個來源各自抓、各自判斷：官方站可能擋雲端 IP（GitHub runner），那時客戶端解包照樣能說「有新版」——
   不能因為一個來源失敗就整支放棄，也不能把「抓不到」當成「沒落後」。 */
const [htmlR, clientR, tcR] = await Promise.allSettled([
  get("https://www.ffxiv.com.tw/web/special/patchnote_log/"),
  lastCommit("thewakingsands/ffxiv-datamining-tc"),
  lastCommit("ffxiv-teamcraft/ffxiv-teamcraft", "&sha=staging&path=libs/data/src/lib/json/tw"),
]);
const errors = [];
let versions = [], official = null;
if (htmlR.status === "fulfilled") {
  versions = [...new Set([...htmlR.value.matchAll(/patch_(\d+\.\d+)_notes\.html/g)].map((m) => m[1]))].sort((a, b) => pnum(a) - pnum(b));
  official = versions.at(-1) ?? null;
  if (!official) errors.push({ code: 2, msg: "官方更新筆記索引解析不到任何版本（頁面改版？）" });
} else errors.push({ code: 3, msg: `官方更新筆記索引連不上：${htmlR.reason?.message}` });
const client = clientR.status === "fulfilled" ? clientR.value : null;
if (!client) errors.push({ code: 3, msg: `台服客戶端解包的 commit 查不到：${clientR.reason?.message}` });
const tc = tcR.status === "fulfilled" ? tcR.value : null;   // 只當參考，失敗不算失靈

const clientVer = client ? (client.msg.match(/ver\s+([\d.]+)/) || [])[1] ?? null : null;
const tcVer = tc ? (tc.msg.match(/TW\s*(\d+\.\d+)/i) || [])[1] ?? null : null;
const officialAhead = !!official && pnum(official) > pnum(site);
// 客戶端版本字串是「年.月.日.…」，字典序就是時間序
const clientAhead = !!clientVer && !!siteClient && clientVer > siteClient;
const behind = officialAhead || clientAhead;
const out = {
  site, siteClient, official, versions,
  client: client ? { ...client, ver: clientVer, ahead: clientAhead } : null,
  teamcraft: tc ? { ...tc, ver: tcVer, behindOfficial: !official || tcVer == null || pnum(tcVer) < pnum(official) } : null,
  behind,
  reason: [officialAhead && `官方筆記 ${official} > 站上 ${site}`, clientAhead && `客戶端解包 ${clientVer} > 站上資料 ${siteClient}`].filter(Boolean),
  errors: errors.map((e) => e.msg),
};
console.log(JSON.stringify(out, null, 2));
// 落後優先（有一個來源說落後就是落後）；沒落後但有來源壞掉＝偵測失靈，不能報「已追上」
process.exit(behind ? 10 : errors.length ? Math.min(...errors.map((e) => e.code)) : 0);
