// patch-collection-source-text.mjs — 收藏頁取得方式裡的英文字串清掉／改成中文格式
//
// 2026-10-02 第二輪盤點量到：收藏頁的 sources.detail 有一批英文直接印上畫面——
//   樂譜 724 首可見的有 124 首寫「製作：Craftable」「商店：Unknown Shop」「Subaquatic Voyages - S　翠浪海6」，
//   寵物「Master of the Rolls / 需 成就幣 x2 / NPC：喬納森」、幻卡「Sul Lad，40 個雙色寶石」，
//   以及 413 筆「喬納森: 成就幣 x6, at 格里達尼亞舊街」「蜥蜴人族雜用商人: Gil x120000, at 南薩納蘭」這種格式。
// 台服名守門（scripts/lib/tw-text.mjs）只擋日文假名，不擋英文，所以一直沒被抓到。
//
// 這些字串是好幾輪不同的 build／patch 腳本留下的，有些已經無法原樣重跑，所以不去追每個產生者，
// 改成這支**可重複執行**的正規化（冪等：跑第二次是 0 筆變動），再由 validate-data.mjs 的英文掃描擋回歸。
// 任何重建收藏資料的流程跑完後，validate-data 若報英文，就再跑一次這支。
//
// 規則（**查不到台服名的英文一律拿掉、只留類型，不憑印象翻**——鐵則）：
//   ① 只是佔位詞的整段清空：Craftable、Unknown Shop、Mog 工房商店、極神「邪神 Byakko」
//   ② 夾在中文前面的英文前綴拿掉：Subaquatic Voyages - X　／ Master of the Rolls / ／ Scrip Exchange /
//   ③ 幻卡商店前面的英文 NPC 名拿掉：「Sul Lad，40 個雙色寶石」→「40 個雙色寶石」、「Enie（築天之所）」→「築天之所」
//   ④ 「NPC: 幣 xN, at 地名」→「NPC：幣 ×N（地名）」；Gil 照 §4.67 寫成「N 金幣」
//   ⑤ 「Companion App」→「官方手機 App」（描述，不是宣稱官方名）
//   條目自己的台服名就含拉丁字母的（SDS芬里爾、加隆德GL-IS、莫古XII世…）不算英文。
//
// 執行（repo 根目錄）：
//   node scripts/patch-collection-source-text.mjs           # dry-run，印每條規則改了幾筆與範例
//   node scripts/patch-collection-source-text.mjs --apply   # 寫回（保留各檔原本的 minified／pretty 格式）

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const apply = process.argv.includes("--apply");

const FILES = ["mounts", "minions", "orchestrion", "barding", "emotes", "triple-triad", "hairstyles", "ornaments"];

// 畫面上可以出現的拉丁字串（遊戲內台服也這樣顯示，或是本站自己的 UI 標籤）
export const LATIN_OK = new Set(["Lv", "HQ", "NQ", "NPC", "PvP", "MGP", "FATE", "App", "UI"]);

const fmt = (n) => Number(n).toLocaleString("en-US");

/** 一段 detail 經過全部規則後的結果；回傳 [新值, 套到的規則代號] */
export function normalize(detail) {
  if (typeof detail !== "string") return [detail, null];
  let s = detail;
  // ①
  if (/^(Craftable|Unknown Shop|Mog 工房商店)$/.test(s) || /Byakko/.test(s)) return [null, "①"];
  // ②
  const s2 = s.replace(/^Subaquatic Voyages(?:\s*-\s*[A-Z]?)?\s*/, "").replace(/^(Master of the Rolls|Scrip Exchange) \/ /, "");
  if (s2 !== s) return [s2.trim() || null, "②"];
  // ③ 開頭是英文人名（可含型號，如 Clerk PX-0029），後面接「，」或「（地點）」
  const m3 = s.match(/^[A-Z][A-Za-z0-9' .-]*[A-Za-z0-9](?:，\s*(.+)|（(.+)）)$/);
  if (m3) return [(m3[1] || m3[2]).trim(), "③"];
  // ④ 「NPC: 幣 xN, at 地名」；NPC 是 Unknown Shop 的不寫 NPC，沒有地名的不寫括號
  const m4 = s.match(/^([^:：]+): (.+?) x(\d+),?\s*(?:at (.+))?$/);
  if (m4) {
    const [, npc, cur, n, place] = m4;
    const cost = cur === "Gil" ? `${fmt(n)} 金幣` : `${cur} ×${fmt(n)}`;
    return [`${npc === "Unknown Shop" ? "" : npc + "："}${cost}${place ? `（${place.trim()}）` : ""}`, "④"];
  }
  // ⑤
  if (/Companion App/.test(s)) return [s.replace(/Companion App/g, "官方手機 App"), "⑤"];
  return [s, null];
}

/** 字串裡不被允許的拉丁詞（條目自己的台服名含有的詞算允許） */
export function badLatin(text, ownName = "") {
  if (typeof text !== "string") return [];
  // 型號（PX-0027、GL-II 之類「大寫＋連字號＋數字」）是台服名的一部分，不算英文
  return (text.replace(/[A-Z]{1,4}-\d+/g, "").match(/[A-Za-z][A-Za-z-]{2,}/g) || []).filter((w) => !LATIN_OK.has(w) && !ownName.includes(w));
}

function main() {
  const stat = {};
  const leftovers = [];
  for (const f of FILES) {
    const path = join(DATA, f + ".json");
    const raw = readFileSync(path, "utf8");
    const minified = !raw.includes('\n  "');
    const db = JSON.parse(raw);
    let changed = 0;
    for (const e of db.data) {
      for (const s of e.sources || []) {
        const [v, rule] = normalize(s.detail);
        if (rule) {
          (stat[rule] ||= []).push(`${f}｜${s.detail} → ${v ?? "（清空）"}`);
          s.detail = v;
          changed++;
        }
        for (const k of ["detail", "where", "condition"]) {
          const bad = badLatin(s[k], e.name || "");
          if (bad.length) leftovers.push(`${f}｜${e.name}｜${k}：${s[k]}`);
        }
      }
    }
    if (apply && changed) writeFileSync(path, minified ? JSON.stringify(db) + (raw.endsWith("\n") ? "\n" : "") : JSON.stringify(db, null, 2) + "\n");
    console.log(`${f.padEnd(13)} 改 ${changed} 筆`);
  }
  console.log("");
  for (const [rule, list] of Object.entries(stat).sort()) {
    console.log(`規則 ${rule}：${list.length} 筆，例：${list.slice(0, 2).join("　／　")}`);
  }
  console.log(`\n套完規則後仍含英文詞：${leftovers.length} 筆${leftovers.length ? "：\n  " + leftovers.slice(0, 15).join("\n  ") : ""}`);
  if (!apply) console.log("\n（dry-run，未寫入；加 --apply 才寫）");
}

// 被 validate-data.mjs import（拿 normalize／badLatin）時不要執行 main
if (process.argv[1] && /patch-collection-source-text\.mjs$/.test(process.argv[1])) main();
