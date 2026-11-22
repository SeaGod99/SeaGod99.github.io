// 重建 out_data/tw-items.msgpack（台服物品繁中名快照）
//
// 為什麼需要這支：`tw-items.msgpack` 原本是「使用者提供的一次性快照」，沒有腳本產它，
// 於是台服升版後整條繁中名權威鏈（items.json → items-lite／items-market／barding／
// emotes／equip／island／幻化配裝圖鑑）就全部卡在舊版本，新物品只能顯示英文或 #id。
//
// 來源（--source，預設 client）：
//   client     台服客戶端解包 thewakingsands/ffxiv-datamining-tc 的 Item.csv「Name」欄（**升版的權威來源**）。
//              注意是 Name 不是 Singular：Singular 與遊戲內顯示的物品名有 42 筆不同。
//   teamcraft  Teamcraft 台服語系檔 tw/tw-items.json。它也是從台服客戶端抽的，但**更新時間不一定**：
//              2026-07-30 停在 TW 7.2、台服 7.25 九月中旬就上線了（落後時不報錯、只是什麼都不變）；
//              反過來 TW 7.3 它 11-17 當天就推了、客戶端解包反而還停在 7.25（知識庫 §4.5）。
//              **哪一邊比較新就用哪一邊**：先跑 check-tw-version.mjs 看兩邊各在哪一版。
//
// 護欄：上游必須是既有快照的**超集**（id 一個都不能少），否則中止不寫入——
//   避免上游某次抽取不完整就把台服已開放的物品名洗掉。內容沒變就不寫檔（repo 很大，別白增歷史）。
//
// 執行：
//   node scripts/build-tw-items-msgpack.mjs                     # dry-run，只報告（客戶端，會重抓 Item.csv）
//   node scripts/build-tw-items-msgpack.mjs --apply             # 寫回 out_data/tw-items.msgpack，並把客戶端版本記進 _meta.json
//   node scripts/build-tw-items-msgpack.mjs --offline           # 用 out_data/cache/tc-datamining/Item.csv 快取，不連網
//   node scripts/build-tw-items-msgpack.mjs --source=teamcraft  # 改用 Teamcraft（後備）
//
// 跑完必接：node scripts/build-items.mjs（讓 items.json 收下新物品），
//   再 node scripts/patch-backfill-all.mjs --apply（補新物品的 patch）、
//   node scripts/patch-tw-release.mjs --apply（把台服已開放、但全球標籤較晚的條目重標回台服版本）。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode, encode } from "@msgpack/msgpack";
import { isTw, isTranslated } from "./lib/tw-text.mjs";
import { loadTcSheet, latestTcClientVersion } from "./lib/tc-datamining.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "out_data", "tw-items.msgpack");
const META = join(ROOT, "data", "_meta.json");
const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");
const SOURCE = (process.argv.find((a) => a.startsWith("--source=")) || "--source=client").split("=")[1];

const URL_TW_ITEMS =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/tw-items.json";

const hasCJK = (s) => isTw(s || "");
// 只差在中點（· U+00B7、・ U+30FB、‧ U+2027、• U+2022）時算「中點差異」：台服 7.25 把 1,126 個 · 改成了 ・
const foldDots = (s) => String(s).replace(/[·・‧•]/g, "・");

/** 客戶端解包 → {id: {tw}} */
async function fromClient() {
  const rows = await loadTcSheet("Item", { offline: OFFLINE, refresh: !OFFLINE });
  if (!rows.length || !("Name" in rows[1])) throw new Error("客戶端 Item.csv 找不到「Name」欄，欄名可能改了，中止");
  const remote = {};
  const skipped = [], repaired = [];
  for (const r of rows) {
    let n = (r.Name || "").trim();
    if (!n) continue;
    /* 欄位錯位的列：12066（寵物「卡邦庫爾-橄欖石」）的說明在上游 CSV 被拆成兩欄，Name 欄裝的是說明的後半句
       「」。\r\n人工製作的卡邦庫爾，內部裝有橄欖石。」——Teamcraft 的 tw-items 也是同一段（同一份上游），
       站上因此一直顯示這串殘句。認法：名字裡有換行、或以閉合標點開頭（正常物品名不會）。排在說明之前的
       Singular 沒受影響，就用它；它也不像樣的話照樣收（護欄要 id 是超集），但印出來讓人看見。 */
    if (/[\r\n]/.test(n) || /^[」』）】〕。，、；：]/.test(n)) {
      const s = (r.Singular || "").trim();
      if (s && !/[\r\n]/.test(s) && isTw(s)) { repaired.push(`${r.id}：${JSON.stringify(n).slice(0, 30)} → ${s}`); n = s; }
      else console.log(`⚠ ${r.id} 的名稱像是欄位錯位、Singular 也不能用，照收：${JSON.stringify(n).slice(0, 40)}`);
    }
    // 佔位列（日文假名、`_rsv_`…）不收；2026-10 實測物品表 0 筆，留著防未來
    if (!isTranslated(n)) { skipped.push(`${r.id}=${n}`); continue; }
    remote[r.id] = { tw: n };
  }
  if (repaired.length) console.log(`⚠ 客戶端 Name 欄錯位、改取 Singular ${repaired.length} 筆：${repaired.join("；")}`);
  if (skipped.length) console.log(`⚠ 客戶端有 ${skipped.length} 筆像佔位或未翻譯的名稱，略過：${skipped.slice(0, 5).join(", ")}`);
  return remote;
}

/** Teamcraft 台服語系檔最後一次提交（commit 訊息形如「feat(db): TW 7.3 data」）→ {version, sha, date} */
async function latestTeamcraftTw() {
  const r = await fetch(
    "https://api.github.com/repos/ffxiv-teamcraft/ffxiv-teamcraft/commits?per_page=1&sha=staging&path=libs/data/src/lib/json/tw/tw-items.json",
    { headers: { accept: "application/vnd.github+json", "user-agent": "sgt-build-tw-items" } }
  );
  if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`);
  const c = (await r.json())[0];
  const msg = c.commit.message.split("\n")[0];
  return { version: (msg.match(/TW\s*(\d+\.\d+)/i) || [])[1] ?? null, sha: c.sha.slice(0, 8), date: c.commit.committer.date.slice(0, 10) };
}

/** Teamcraft 台服語系檔 → {id: {tw}}
 *  2026-11-17 升 7.3 時客戶端解包還停在 7.25、Teamcraft 當天就推了 TW 7.3，於是第一次拿它當主來源。
 *  它與客戶端 Name 欄同源，所以同樣帶著 12066 那種欄位錯位的殘句——錯位的列沿用既有快照的名字
 *  （快照是客戶端版時已經修好），不讓殘句蓋回去。 */
async function fromTeamcraft(old) {
  if (OFFLINE) throw new Error("--offline 只支援 --source=client");
  const res = await fetch(URL_TW_ITEMS);
  if (!res.ok) throw new Error(`tw-items.json HTTP ${res.status}`);
  const remote = await res.json();
  const kept = [];
  for (const [id, v] of Object.entries(remote)) {
    const n = (v?.tw || "").trim();
    if (!/[\r\n]/.test(n) && !/^[」』）】〕。，、；：]/.test(n)) continue;
    if (old[id]?.tw) { kept.push(`${id}：${JSON.stringify(n).slice(0, 30)} → 沿用 ${old[id].tw}`); remote[id] = { tw: old[id].tw }; }
    else console.log(`⚠ ${id} 的名稱像是欄位錯位、快照也沒有可沿用的名字，照收：${JSON.stringify(n).slice(0, 40)}`);
  }
  if (kept.length) console.log(`⚠ Teamcraft 名稱欄錯位、沿用既有快照 ${kept.length} 筆：${kept.join("；")}`);
  return remote;
}

async function main() {
  let old = {};
  try {
    old = decode(await readFile(OUT));
  } catch {
    console.log("（沒有既有快照，將建立新檔）");
  }
  const oldKeys = Object.keys(old);
  console.log(`既有快照：${oldKeys.length} 筆`);

  console.log(`抓台服物品名（來源：${SOURCE === "client" ? "台服客戶端解包 Item.csv" : "Teamcraft tw-items.json"}）…`);
  const client = SOURCE === "client" ? (OFFLINE ? null : await latestTcClientVersion()) : null;
  if (client) console.log(`  客戶端版本 ${client.version}（解包 ${client.date} 提交）`);
  const tcCommit = SOURCE === "teamcraft" ? await latestTeamcraftTw() : null;
  if (tcCommit) console.log(`  Teamcraft 台服資料 ${tcCommit.version ?? "?"}（${tcCommit.sha}，${tcCommit.date} 提交）`);
  const remote = SOURCE === "client" ? await fromClient() : await fromTeamcraft(old);
  const remoteKeys = Object.keys(remote);
  console.log(`上游：${remoteKeys.length} 筆`);

  // 護欄 1：必須是超集
  const missing = oldKeys.filter((k) => remote[k]?.tw == null);
  if (missing.length) {
    throw new Error(
      `上游少了 ${missing.length} 筆既有物品（如 ${missing.slice(0, 5).join(", ")}），` +
        `疑似抽取不完整，中止不寫入`
    );
  }

  // 護欄 2：空名稱不收（寧可維持舊值）
  const blank = remoteKeys.filter((k) => !remote[k]?.tw);
  if (blank.length) console.log(`⚠ 上游有 ${blank.length} 筆空名稱，略過不收`);

  const next = {};
  const added = [];
  const dotOnly = [];
  const spaceOnly = [];
  const renamed = [];
  const englishish = [];
  for (const k of remoteKeys.sort((a, b) => Number(a) - Number(b))) {
    const tw = remote[k]?.tw;
    if (!tw) continue;
    next[k] = { tw };
    const before = old[k]?.tw;
    if (before == null) {
      added.push(`${k}=${tw}`);
      if (!hasCJK(tw)) englishish.push(`${k}=${tw}`);
    } else if (before !== tw) {
      if (before.replace(/\s+/g, "") === tw.replace(/\s+/g, "")) spaceOnly.push(`${k}: "${before}" → "${tw}"`);
      else if (foldDots(before) === foldDots(tw)) dotOnly.push(`${k}: "${before}" → "${tw}"`);
      else renamed.push(`${k}: "${before}" → "${tw}"`);
    }
  }

  console.log(
    `\n新增 ${added.length}、真的改名 ${renamed.length}、只差中點 ${dotOnly.length}、只差空白 ${spaceOnly.length}；` +
      `總計 ${Object.keys(next).length} 筆`
  );
  if (renamed.length) console.log("改名（全列）：\n  " + renamed.join("\n  "));
  if (spaceOnly.length) console.log("只差空白：\n  " + spaceOnly.join("\n  "));
  if (dotOnly.length) console.log(`只差中點（前 5）：\n  ${dotOnly.slice(0, 5).join("\n  ")}`);
  if (added.length) console.log(`新增（前 10）：${added.slice(0, 10).join("、")}`);
  if (englishish.length)
    console.log(`\n⚠ 新增中有 ${englishish.length} 筆不含中文字（可能為官方原文名）：` + englishish.slice(0, 10).join(", "));

  const changed = added.length + renamed.length + dotOnly.length + spaceOnly.length > 0;
  if (!APPLY) {
    console.log("\n（dry-run，未寫入；加 --apply 套用）");
    return;
  }
  if (changed) {
    await writeFile(OUT, encode(next));
    console.log(`\n✅ 已寫入 ${OUT}`);
  } else {
    console.log("\n內容沒有變動，不寫檔");
  }
  if (client) {
    // 記下資料取自哪一版客戶端：版本偵測與升版 SOP 拿它當比較基準
    const meta = JSON.parse(await readFile(META, "utf8"));
    let dirty = false;
    if (meta.twClient?.version !== client.version) {
      meta.twClient = { version: client.version, date: client.date };
      dirty = true;
      console.log(`✅ _meta.json twClient ← ${client.version}`);
    }
    // 解包追上了：名稱已全部取自客戶端，「這一版新內容取自 Teamcraft」的紀錄不再成立（頁尾靠它顯示那一行）
    if (meta.twTeamcraft && meta.twTeamcraft.date <= client.date) {
      delete meta.twTeamcraft;
      dirty = true;
      console.log("✅ _meta.json 移除 twTeamcraft（客戶端解包已追上 Teamcraft）");
    }
    if (dirty) await writeFile(META, JSON.stringify(meta, null, 2) + "\n");
  }
  if (tcCommit) {
    // 名稱有一部分取自 Teamcraft 的哪一版台服資料：頁尾與 report-vs-client 拿它說明「客戶端解包之後的新東西從哪來」
    const meta = JSON.parse(await readFile(META, "utf8"));
    if (meta.twTeamcraft?.sha !== tcCommit.sha) {
      meta.twTeamcraft = tcCommit;
      await writeFile(META, JSON.stringify(meta, null, 2) + "\n");
      console.log(`✅ _meta.json twTeamcraft ← TW ${tcCommit.version}（${tcCommit.sha}）`);
    }
  }
  console.log("接著跑：node scripts/build-items.mjs → node scripts/patch-backfill-all.mjs --apply → node scripts/patch-tw-release.mjs --apply");
}

main().catch((e) => {
  console.error("錯誤：", e.message);
  process.exit(1);
});
