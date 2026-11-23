// patch-orchestrion-official.mjs — 樂譜的英文名與「只有類型」的取得方式，改以道具本身與官方說明為準
//
// 第四輪路線圖 §5-2（2026-11-23）。原本的題目是「約 20 首的取得類型與官方說明對不上」，量下去發現是整批錯位：
//
//   ① **英文名（nameEn）有 495／776 首接到別首去了**。拿每首的道具英文名（「曲名 Orchestrion Roll」）對：
//      No.17「揮汗如雨」的道具是 When a Tree Falls，nameEn 卻是下一首的 Tenacity；No.717「自然的禮物」
//      的 nameEn 是 No.712 的 Fighters of the Crystal。位移量分段不同——舊資料（06-11 基準快照，產它的腳本不在 repo 裡）
//      當初是用流水號去接社群站的資料，客戶端列號中間有缺號的地方就整段錯開。樂譜頁的「英文名：」一直顯示錯的。
//   ② **「只有類型、沒有細節」的取得方式也是跟著那批錯位資料進來的**。No.717 官方說明「潛水艇探索獲得」，站上是「副本掉落」；
//      No.226「勝利或是死亡」官方說明「多瑪飛地出售」，站上是「節慶活動／商城」（＝nameEn 那首的說明「季節活動報酬」）；
//      「透過道具序號獲得」的曲子被標成任務、製作、金碟、成就、危命任務、副本掉落都有。
//   ③ **帶細節的取得方式（商店 NPC、副本名、任務名）是後來依道具重建的，沒有錯位**：226 筆帶 NPC 的商店來源，182 筆經
//      NPC 商店目錄確認那位 NPC 真的賣這件；7 筆對不上的全是季節活動商人（目錄只收當期），37 筆 NPC 目錄沒收。這些不動。
//
// 做法：
//   nameEn   ← 道具英文名（out_data/en-items.msgpack，去掉「 Orchestrion Roll」或「Faded Copy of 」）
//   sources  「全部只有類型」的才改 → [{ type: 由官方說明推, detail: 官方說明原文 }]
//            官方說明＝台服客戶端 Orchestrion.Description（Item.AdditionalData → Orchestrion 列），遊戲內樂譜清單顯示的那一句。
//            說明裡有「？？」的不動（遊戲防雷遮掉的副本名，印出來像亂碼）；沒有說明的不動。
//            推不出類型的句式一律「其他」（細節就是官方原文，不會失真）；推出「副本掉落」而原本是更細的副本類（高難度副本、深層迷宮…）時留原本的。
//   帶細節的來源完全不動，只把「類型與官方說明推出的不同」的列成報表（多半是分類角度不同：雙色寶石商店的社群分類是「危命任務」）。
//
// 執行：node scripts/patch-orchestrion-official.mjs [--apply] [--offline]
// 跑完接：node scripts/patch-collection-duty-links.mjs --apply → node scripts/validate-orchestrion.mjs → validate-data／sync-meta。

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@msgpack/msgpack";
import { loadTcSheet } from "./lib/tc-datamining.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const FILE = join(DATA, "orchestrion.json");
const APPLY = process.argv.includes("--apply");
const OFFLINE = process.argv.includes("--offline");

// 副本類的類型（官方說明推出「副本掉落」時，原本若是這些更細的就留原本的）
export const DUTYLIKE = new Set(["副本掉落", "高難度副本", "深層迷宮", "討伐戰", "異聞副本", "尤雷卡", "博茲雅", "新月島"]);

/** 道具英文名 → 曲名；認不出格式回傳 null（不改） */
export function songOfItemEn(s) {
  s = String(s || "").trim();
  let m = s.match(/^(.+?) Orchestrion Roll$/);
  if (m) return m[1];
  m = s.match(/^Faded Copy of (.+)$/);
  return m ? m[1] : null;
}

/** 官方說明 → 類型（只收句式固定的；推不出回傳 null）。dutyNames＝dungeons.json 的副本名 */
export function typeOfDesc(d, dutyNames) {
  if (!d) return null;
  if (/^道具商城購買/.test(d)) return "商城";
  if (/^透過道具序號獲得$/.test(d)) return "其他";
  if (/^季節活動報酬$/.test(d)) return "節慶活動";
  if (/^道具製作/.test(d)) return "製作";
  if (/^潛水艇探索獲得$/.test(d)) return "探索航行";
  if (/^尋寶獲得$|埋藏的寶藏獲得$|^尋寶、/.test(d)) return "藏寶圖";
  if (/^(主線)?任務報酬$/.test(d)) return "任務";
  if (/^成就「[^」]+」報酬$/.test(d)) return "成就";
  if (/F\.A\.T\.E\.事件「[^」]+」獲得$/.test(d)) return "危命任務";
  if (/^金碟遊樂園交換$/.test(d)) return "金碟";
  if (/^宇宙探索的各個據點交換$/.test(d)) return "宇宙探索";
  if (/^用博茲雅晶簇交換$|^「(南方博茲雅戰線|扎杜諾爾高原|天佑女王)」的/.test(d)) return "博茲雅";
  if (/^「禁地優雷卡[^」]*」的/.test(d)) return "尤雷卡";
  if (/^蒼天街的「咕波好運道」獲得$/.test(d)) return "伊修加德重建";
  if (/^[^「」]+(交換|出售)$/.test(d)) return "商店";
  const m = d.match(/^「([^」]+)」獲得$/);
  if (m) {
    if (dutyNames.has(m[1])) return "副本掉落";
    // 「萬魔殿 煉淨之獄2～3」這種範圍寫法：起始那一層是副本名就算
    const r = m[1].match(/^(.+?)(\d+)～\d+$/);
    if (r && dutyNames.has(r[1] + r[2])) return "副本掉落";
  }
  return null;
}

async function main() {
  const db = JSON.parse(readFileSync(FILE, "utf8"));
  const rows = db.data;
  const en = decode(readFileSync(join(ROOT, "out_data", "en-items.msgpack")));
  const enOf = (id) => { const v = en[id] ?? en[String(id)]; return typeof v === "string" ? v : (v && (v.en || v.name)) || ""; };
  const duties = new Set(JSON.parse(readFileSync(join(DATA, "dungeons.json"), "utf8")).data.map((d) => d.name).filter(Boolean));
  const clientItem = new Map((await loadTcSheet("Item", { offline: OFFLINE })).map((r) => [r.id, r]));
  const orch = new Map((await loadTcSheet("Orchestrion", { offline: OFFLINE })).map((r) => [r.id, r]));
  const descOf = (itemId) => (orch.get(Number(clientItem.get(itemId)?.AdditionalData || 0))?.Description || "").replace(/\s*\n\s*/g, " ").trim();

  const st = { en: 0, enKeep: [], src: 0, srcSameType: 0, srcTypeChanged: {}, other: 0, keepMasked: [], noDesc: [], detailedDiff: [] };
  for (const e of rows) {
    // ① 英文名
    const song = songOfItemEn(enOf(e.itemId));
    if (song == null) st.enKeep.push(`No.${e.number} ${e.name}（道具英文名「${enOf(e.itemId)}」認不出格式）`);
    else if (song !== e.nameEn) { e.nameEn = song; st.en++; }

    // ⓪ 任何細節裡的「？？」（遊戲防雷遮掉的副本名）都拿掉：No.724 是 11-17 補新曲時直接把遮名的說明放進細節，畫面上像亂碼。
    //    類型保留、細節留空（與下面「說明遮名」同一條規則）
    for (const s of e.sources || []) if (s.detail && /？？/.test(s.detail)) { s.detail = null; st.unmask = (st.unmask || 0) + 1; }

    // ② 取得方式
    const d = descOf(e.itemId);
    const src = e.sources || [];
    const typeOnly = src.length > 0 && src.every((s) => s.detail == null);
    if (!d) { if (typeOnly) st.noDesc.push(`No.${e.number} ${e.name}`); continue; }
    let t = typeOfDesc(d, duties);
    if (!typeOnly) {
      if (t && !src.some((s) => s.type === t || (t === "副本掉落" && DUTYLIKE.has(s.type))))
        st.detailedDiff.push(`No.${e.number} ${e.name}〔${src.map((s) => s.type).join("+")}〕官方：${d}`);
      continue;
    }
    /* 說明裡有「？？」（遊戲防雷遮掉的副本名）：文字不放（印出來像亂碼），但類型照樣推——
       這 22 首全是「道具製作 主要素材：…「極？？？？殲滅戰」獲得」，不必看副本名就知道是製作；
       而它們原本的類型有好幾首也是錯位的（No.479／480「副本掉落＋深層迷宮」、No.698／699「危命任務」）。
       推不出類型的（No.746 只寫「高難度討伐戰」）才不動。 */
    // 只有真的有變的才計數（重跑時已經處理好的不算，報表才不會誤導）
    const apply = (next, tag) => {
      if (JSON.stringify(next) === JSON.stringify(src)) return;
      const before = src.map((s) => s.type).join("+");
      if (before === next[0].type) st.srcSameType++;
      else { const k = `${before}→${next[0].type}${tag}`; st.srcTypeChanged[k] = (st.srcTypeChanged[k] || 0) + 1; }
      e.sources = next;
      st.src++;
    };
    if (/？？/.test(d)) {
      if (!t) { st.keepMasked.push(`No.${e.number} ${e.name}`); continue; }
      apply([{ type: t, detail: null }], "（說明遮名）");
      continue;
    }
    if (t == null) { t = "其他"; st.other++; }
    if (t === "副本掉落" && src.length === 1 && DUTYLIKE.has(src[0].type)) t = src[0].type;   // 留原本更細的副本類
    apply([{ type: t, detail: d }], "");
  }

  const changedN = Object.values(st.srcTypeChanged).reduce((a, b) => a + b, 0);
  console.log(`樂譜 ${rows.length} 首` + (st.unmask ? `；細節含「？？」而拿掉 ${st.unmask} 筆` : ""));
  console.log(`① 英文名改成道具英文名：${st.en} 首` + (st.enKeep.length ? `（認不出格式而不改 ${st.enKeep.length}：${st.enKeep.join("、")}）` : ""));
  console.log(`② 只有類型的取得方式改成官方說明：${st.src} 首（類型不變只補說明 ${st.srcSameType}、類型改掉 ${changedN}；推不出類型記「其他」${st.other}）`);
  console.log("   類型變化：" + Object.entries(st.srcTypeChanged).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("、"));
  if (st.keepMasked.length) console.log(`   說明有「？？」而不動：${st.keepMasked.join("、")}`);
  if (st.noDesc.length) console.log(`   客戶端沒有說明而不動：${st.noDesc.join("、")}`);
  console.log(`③ 帶細節的來源不動；類型與官方說明推出的不同的 ${st.detailedDiff.length} 首（多半是分類角度不同，列給人看）：`);
  for (const x of st.detailedDiff.slice(0, 12)) console.log("   " + x);
  if (st.detailedDiff.length > 12) console.log(`   …另 ${st.detailedDiff.length - 12} 首`);

  if (!APPLY) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }
  db.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FILE, JSON.stringify(db) + "\n");
  console.log("\n✓ data/orchestrion.json");
  console.log("  接著跑：node scripts/patch-collection-duty-links.mjs --apply → node scripts/validate-orchestrion.mjs → validate-data／sync-meta");
}

// 被 import（回歸測試）時不執行
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
