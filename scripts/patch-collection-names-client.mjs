// 收藏頁的名稱：把「違反鐵則」的那幾類換成台服客戶端的官方名（只動這幾類，其餘不碰）
//
// 鐵則：繁中名不簡轉繁、不用英文補（CLAUDE.md、知識庫 §4.1）。逐 id 對台服客戶端解包後量到的違規：
//   寵物  顯示英文的 6 隻（wind-up Merlwyb／Kan-E／Raubahn、Minion of Light ×3）——客戶端有台服名
//         （袖珍梅爾維布、袖珍嘉恩・艾、袖珍勞班、光之戰偶）。客戶端本身就是英文的（528 Nano Lord）不動。
//   坐騎  nameSource＝cn-opencc 的 20 筆：4 筆與官方不同（暗黑羽衣→黑暗羽衣、強力機兵→動力裝甲…），
//         16 筆剛好相同（矇對的）——一律改取客戶端並把來源標成 tw-client。
//   表情  build-emotes.mjs 全部走 Cafemaker 簡中→OpenCC，18 筆與官方不同（恆輝隊軍禮→不滅隊軍禮、
//         百萬核爆→百萬火光、調飲→搖雪克杯…）。站上 id 與客戶端 Emote 的 id 對得上（同 id 有 242/260 字串完全相同）。
//
//   只差中點的（2026-10-10 起）：寵物 8、坐騎 4、鳥鞍 1 是「·」、客戶端是「・」——物品名升 7.25 時已全面
//         改成客戶端的「・」（第三輪路線圖 §7-5 採建議：資料照客戶端、搜尋把 ·・‧• 摺成一種），收藏名
//         不跟的話同一件東西在市場頁與收藏頁長得不一樣。**只認「摺疊中點後完全相同」**，用字不同的不算。
//   台服改版的官方改譯（2026-10-10 起）：站上名＝**上一版**客戶端的名字、這一版改了——那是官方改名，
//         不是社群名衝突（寵物 斯卡米留尼之形→迷你斯卡米留尼、凱納槽之形→迷你凱納槽；坐騎 拘束型魔導死亡爪
//         →拘束型魔導死亡厲爪）。上一版＝scripts/lib/tw-releases.mjs 最後一筆的 prev.sha。
//
//   社群名衝突（2026-10-11 站主決定，第三輪路線圖 §7-4）：社群站 ffxiv-collection-tc 的譯名與客戶端**用字**不同的
//         （寵物 14：幼小仙人掌→幼小仙人掌怪、魔像丙→巨像乒…；坐騎 6：雷迦利亞G型→雷格里亞 TYPE-G…；
//         青魔法 4：白風→純白微風、強力守護→非凡防禦…）**以台服客戶端為準**，社群名收進 `aliases`
//         ——收藏頁的搜尋（collection-tracker.js 的 searchText）與命令面板都吃 aliases，搜舊名照樣找得到。
//
// 欄位：Mount.Singular、Companion.Singular、Emote.Name、BuddyEquip.Name、AozAction.Action → Action.Name
// （台服客戶端解包，過 isTw 守門）。
// 冪等。執行：node scripts/patch-collection-names-client.mjs [--apply] [--offline]

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { TW_RELEASES } from "./lib/tw-releases.mjs";
import { isTw } from "./lib/tw-text.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");
const today = new Date().toISOString().slice(0, 10);
const hasCJK = (s) => /[㐀-鿿]/.test(s || "");
const fold = (s) => String(s || "").replace(/[・·•‧]/g, "・");
const PREV_SHA = TW_RELEASES[TW_RELEASES.length - 1].prev.sha;   // 上一版台服客戶端（判斷官方改譯用）

const JOBS = [
  {
    file: "minions.json", sheet: "Companion", col: "Singular",
    // 只換「站上是純英文、客戶端有中文」的
    pick: (e, c) => !hasCJK(e.name) && hasCJK(c),
  },
  {
    file: "mounts.json", sheet: "Mount", col: "Singular",
    pick: (e) => e.nameSource === "cn-opencc",
    mark: (e) => { e.nameSource = "tw-client"; },
  },
  {
    file: "emotes.json", sheet: "Emote", col: "Name",
    // 全部都是 OpenCC 來的；只換真的不同的（相同的不必動）
    pick: (e, c) => e.name !== c,
  },
  {
    // 鳥鞍：站上 id＝BuddyEquip 列號，106 筆裡 100 筆與客戶端逐字相同；這裡只會走到「只差中點」那條
    file: "barding.json", sheet: "BuddyEquip", col: "Name",
    pick: () => false,
  },
  {
    // 青魔法：站上 id＝AozAction 列號（124 筆裡 120 筆與客戶端逐字相同），名字在 AozAction.Action 指到的 Action.Name
    file: "blue-magic.json", sheet: "AozAction", col: "Action", via: ["Action", "Name"],
    pick: () => false,
  },
];

/* 社群名衝突：站上名與客戶端「用字」不同（不是中點、不是上一版的官方名）→ 換成客戶端名、舊名進 aliases。
   只對這幾份做（表情、鳥鞍的站上名不是社群站來的，走上面的規則就好）。 */
const COMMUNITY = new Set(["minions.json", "mounts.json", "blue-magic.json"]);

/** 舊名加進 e.aliases（摺疊中點後去重；與現名相同的不加）。有加回 true。 */
function addAlias(e, old, current) {
  if (!old || fold(old) === fold(current)) return false;
  const aliases = Array.isArray(e.aliases) ? e.aliases : [];
  if (aliases.some((a) => fold(a) === fold(old))) return false;
  aliases.push(old);
  e.aliases = aliases;
  return true;
}

async function sheetNames(job, opts) {
  const rows = await loadTcSheet(job.sheet, opts);
  if (!job.via) return new Map(rows.map((r) => [r.id, (r[job.col] || "").trim()]));
  const [sheet, col] = job.via;
  const target = new Map((await loadTcSheet(sheet, opts)).map((r) => [r.id, (r[col] || "").trim()]));
  return new Map(rows.map((r) => [r.id, target.get(Number(r[job.col])) || ""]));
}

let touched = 0;
for (const job of JOBS) {
  const client = await sheetNames(job, { offline: OFFLINE });
  const prev = await sheetNames(job, { offline: OFFLINE, sha: PREV_SHA });
  const raw = readFileSync(join(DATA, job.file), "utf8");
  const db = JSON.parse(raw);
  const changes = [], dots = [], renames = [], community = [], aliasAdded = [];
  let marked = 0;
  for (const e of db.data) {
    const c = client.get(e.id);
    if (!c || !isTw(c) || !e.name) continue;
    const picked = job.pick(e, c);
    const dotOnly = !picked && e.name !== c && fold(e.name) === fold(c);
    // 站上是上一版的官方名、這一版改了＝官方改譯（不是社群名，§7-4 那題管不到它）
    const p = prev.get(e.id);
    const renamed = !picked && !dotOnly && e.name !== c && !!p && fold(p) === fold(e.name);
    const conflict = !picked && !dotOnly && !renamed && e.name !== c && COMMUNITY.has(job.file);
    /* 上一版的官方名與這一版不同（官方改譯）：舊官方名也進 aliases——玩家記得的是舊名。
       這條與「這次有沒有改名」無關，所以 10-10 已經改過名的（斯卡米留尼之形→迷你斯卡米留尼…）也會補上。 */
    if (p && isTw(p) && fold(p) !== fold(c) && (e.name === c || renamed)) {
      if (addAlias(e, p, c)) aliasAdded.push(`${e.id}：${c}（別名「${p}」，上一版官方名）`);
    }
    if (!picked && !dotOnly && !renamed && !conflict) continue;
    if (conflict) {
      addAlias(e, e.name, c);
      community.push(`${e.id}：${e.name} → ${c}（舊名進 aliases）`);
      e.name = c;
      continue;
    }
    if (e.name !== c) { (dotOnly ? dots : renamed ? renames : changes).push(`${e.id}：${e.name} → ${c}`); e.name = c; }
    // 來源標記只跟著「換來源」的那幾類走；只換中點的、跟官方改譯的不算換來源
    if (picked && job.mark && e.nameSource !== "tw-client") { job.mark(e); marked++; }
  }
  console.log(`${job.file.padEnd(14)} 改名 ${changes.length}、官方改譯 ${renames.length}、只差中點 ${dots.length}、社群名改官方 ${community.length}` +
    (job.mark ? `、來源標記改 tw-client ${marked}` : ""));
  if (aliasAdded.length) console.log(`    （另補上一版官方名當別名 ${aliasAdded.length} 筆）`);
  for (const c of [...changes, ...renames, ...dots, ...community, ...aliasAdded]) console.log(`    ${c}`);
  if (APPLY && (changes.length || dots.length || renames.length || community.length || aliasAdded.length || marked)) {
    db.updated = today;
    await writeFile(join(DATA, job.file), raw.includes('\n  "') ? JSON.stringify(db, null, 2) + "\n" : JSON.stringify(db) + "\n");
    touched++;
  }
}
console.log(APPLY ? `\n✅ 已寫入 ${touched} 個檔` : "\n（dry-run，未寫入；加 --apply 套用）");
