// 台服名判定 —— 全站唯一一份。
//
// 為什麼要有這支：站內曾有 **19 份**各自手寫的 `/[一-鿿]/` 守門，語意都是
// 「有中日韓漢字就當台服名」。那個判斷有個洞：**只要字串裡任何一處有漢字就整串放行**，
// 所以混了假名的日文原文會大搖大擺走到畫面上——
//   「シーズナルイベント報酬の交換」（有 報酬／交換）→ 放行
//   「コメンデーションクリスタルの取引」（有 取引）→ 放行
//   「キキルン商人」（有 商人）→ 放行
// 實測這個洞讓 7 個日文店名上了 NPC 商店目錄、25 條日文取得方式上了市場頁。
//
// 另外 Teamcraft 的台服語系檔本身有未翻譯殘留：`shops` 10 筆、`mobs` 89 筆、
// `statuses` 77 筆是日文原文，還有一批是遊戲內部的佔位列
// （`_rsv_4389_…`、`（仮）空島中ボス1名稱`、「ラベル削除予定」、`●未使用アクション`）。
// **`twName()` 回傳有值不等於那是台服名**，所以這支也要擋這些標記。
//
// 刻意**不擋**的兩個片假名區字元：`・`（U+30FB）與 `ー`（U+30FC）。
// 台服名大量用到中黑點（「利姆薩·羅敏薩」「特殊（金屬・柔彩・純色）」），
// 第一版把整個片假名區當假名，誤判了 `market-sources`／`triple-triad`／`dyes` 三份檔。

import { fileURLToPath } from "node:url";

/** 真正的假名（排除 ・ ー）。 */
const KANA = /[\u3041-\u3096\u309D-\u309F\u30A1-\u30FA]/;
/** 中日韓漢字。 */
const HAN = /[一-鿿]/;
/** 遊戲內部佔位／未使用標記。實測 items.json 沒有任何台服名用這些前綴，擋掉零誤傷。 */
const JUNK = /^_rsv_|^[※●×]|\(仮\)|（仮）|ラベル削除予定/;

/**
 * 這個字串是**未翻譯的日文原文或內部佔位列**嗎？——不是就放行。
 *
 * 給 `twName()` 用。**刻意不要求有漢字**：台服語系表裡有一小批本來就是拉丁字母，
 * 那是台服客端真的這樣顯示的（`baseParams` 的 HP／MP／GP／CP、
 * `contentTypes` 的 PvP／F.A.T.E.、`mobs` 的 2P／2B）。要求漢字會把它們一起擋掉。
 */
export function isTranslated(s) {
  const v = typeof s === "string" ? s.trim() : "";
  return !!v && !KANA.test(v) && !JUNK.test(v);
}

/**
 * 這個字串可以直接印在畫面上嗎？（有漢字、沒有假名、不是內部佔位列）
 *
 * 給**物品名／NPC 名／地名**用——那些欄位的上游缺口是英文原文
 * （Immortal Flames、Gemstone Trader…），所以這裡要求必須有漢字。
 * 唯一的例外是金幣（`items.json` 裡叫 `"Gil"`），呼叫端自己豁免（知識庫 §4.67）。
 */
export function isTw(s) {
  const v = typeof s === "string" ? s.trim() : "";
  return !!v && HAN.test(v) && isTranslated(v);
}

/** 是台服名就回 trim 過的字串，否則 null——讓呼叫端整筆跳過或留白。 */
export function twOnly(s) {
  return isTw(s) ? String(s).trim() : null;
}

/**
 * 便宜的前置篩：**整份檔案的原始文字**裡有沒有可能藏著日文殘留。
 * 給 validate-data 掃幾萬個檔案時先過一遍用的，不要拿來判斷單一字串。
 */
export function mayContainUntranslated(blob) {
  const t = String(blob || "");
  return KANA.test(t) || t.includes("_rsv_");
}

/** 診斷用：說明為什麼被擋。回 null 表示沒問題。 */
export function whyNotTw(s) {
  const v = typeof s === "string" ? s.trim() : "";
  if (!v) return "空字串";
  if (JUNK.test(v)) return "遊戲內部佔位／未使用標記";
  if (KANA.test(v)) return "含假名（日文原文未翻譯）";
  if (!HAN.test(v)) return "沒有漢字（英文／簡碼）";
  return null;
}

/* ── 自我測試 ──────────────────────────────────────────────────────────
   `node scripts/lib/tw-text.mjs` 直接跑。這支被 20 個腳本吃，
   而且它擋錯了**不會有人發現**——誤擋是條目安靜消失、誤放是日文上畫面。
   第一版就誤把整個片假名區當假名，一次誤判了 market-sources／triple-triad／dyes 三份檔。 */
const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  const CASES = [
    // [輸入, isTw, isTranslated, 為什麼要測這條]
    ["利姆薩·羅敏薩上層甲板", true, true, "台服地名大量用中黑點 ·"],
    ["特殊（金屬・柔彩・純色）", true, true, "染劑分類用全角中黑點 ・（U+30FB，在片假名區）"],
    ["採礦工 Lv.60（岩脈） [限時・傳說]", true, true, "採集來源字串混拉丁數字與 ・"],
    ["九宮幻卡銅包（卡片兌換員・520 金碟幣）", true, true, "幻卡來源"],
    ["シーズナルイベント報酬の交換", false, false, "有「報酬」「交換」兩個漢字——舊守門會放行"],
    ["コメンデーションクリスタルの取引", false, false, "有「取引」——舊守門會放行"],
    ["キキルン商人", false, false, "有「商人」——舊守門會放行"],
    ["ラベル削除予定", false, false, "遊戲內部：待刪除的佔位列"],
    ["（仮）空島中ボス1名稱", false, false, "遊戲內部：暫定名"],
    ["_rsv_4389_-1_7_0_0_S74CFC3B0", false, false, "遊戲內部：未開放內容佔位"],
    ["×泥まりも", false, false, "遊戲內部：× 前綴＝已移除"],
    ["●サボテンダーくん", false, false, "遊戲內部：● 前綴＝未使用"],
    ["Immortal Flames", false, true, "英文原文：isTw 擋、isTranslated 放（它不是日文殘留）"],
    ["Gil", false, true, "金幣：呼叫端自己豁免，守門本身照擋"],
    ["HP", false, true, "台服客端真的顯示 HP——isTranslated 不可以擋"],
    ["PvP", false, true, "同上"],
    ["F.A.T.E.", false, true, "同上"],
    ["2P", false, true, "尼爾聯動怪名，台服也是 2P"],
    ["", false, false, "空字串"],
    [null, false, false, "null"],
    ["  黑鐵錠  ", true, true, "前後空白要 trim 掉"],
  ];
  let fail = 0;
  for (const [input, wantTw, wantTr, why] of CASES) {
    const gotTw = isTw(input), gotTr = isTranslated(input);
    const ok = gotTw === wantTw && gotTr === wantTr;
    if (!ok) fail++;
    console.log(
      `${ok ? "✓" : "✗"} isTw=${String(gotTw).padEnd(5)} isTranslated=${String(gotTr).padEnd(5)} ` +
      `${JSON.stringify(input)}  — ${why}` + (ok ? "" : `（期望 ${wantTw} / ${wantTr}）`)
    );
  }
  console.log(fail ? `\n${fail} 項失敗（共 ${CASES.length}）` : `\n全部通過（${CASES.length} 項）`);
  process.exit(fail ? 1 : 0);
}
