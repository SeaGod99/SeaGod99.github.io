// patch-fish-legendary.mjs
// 在 data/fishes.json 標記「釣場之皇」（legendary: true / false）。
//
// 為什麼要人工名單：
//   釣場之王（魚王，日文ヌシ／英文 Big Fish）遊戲資料裡有旗標，就是 fishes.json 的 bigFish。
//   釣場之皇（魚皇，日文オオヌシ／英文 Living Legend）**沒有任何資料旗標**——實測 XIVAPI
//   FishParameter 的 AchievementCredit／IsHidden／IsInLog 在魚王與魚皇之間完全相同
//   （海中老人 8753 與 波太郎 8775 都是 ach=267、hidden=true、inLog=true），
//   上游 fish tracker 的 data.js 也只有 bigFish 一個布林值。所以只能維護名單。
//
// 名單來源：最終幻想XIV中文維基「釣場之皇」條目（每個資料片版本末期追加 6 隻）
//   https://ff14.huijiwiki.com/wiki/%E9%92%93%E5%9C%BA%E4%B9%8B%E7%9A%87
//   下方 name 欄是**我們資料庫既有的繁中名**（用 itemId 對出來的，不是簡轉繁），
//   同時當作驗證用的期望值：對不上就中止，避免哪天上游改 id 靜默標錯。
//
// 交叉驗證：苍穹／红莲／暗影／晓月 四個資料片的 6 隻剛好各自是該資料片 itemId 最大的
//   連續 6 個（17588-17593、24990-24995、33239-33244、41407-41412），與名單完全吻合。
//   重生之境（2.4）的 6 隻則是散落的，只能照名單。
//
// 曉月之終途（7.x）的釣場之皇要到 7.55／7.56 才追加，本資料庫（至 7.5）尚無，
// 台服也還沒到，所以名單先到 6.55。之後補進 EMPERORS 即可。
//
// 執行（repo 根目錄）：
//   node scripts/patch-fish-legendary.mjs           # dry-run
//   node scripts/patch-fish-legendary.mjs --apply   # 實際寫入
//   node scripts/patch-fish-legendary.mjs --check   # 只驗證現有資料是否一致（CI 用）
// ⚠️ 跑完 build-fishing.mjs 重建後要重跑本腳本，否則 legendary 會整批消失。

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FISHES_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "fishes.json");

const APPLY = process.argv.includes("--apply");
const CHECK = process.argv.includes("--check");

// itemId → 期望的繁中名（資料庫既有值，用來擋 id 漂移）
const EMPERORS = {
  // 重生之境 2.4
  8754: "涅普特龍",
  8756: "內角石",
  8763: "殺手庫諾",
  8768: "旋齒鯊",
  8772: "秀尼魚龍",
  8775: "波太郎",
  // 蒼穹之禁城 3.5
  17588: "莫名熔岩魚",
  17589: "歐巴賓海蠍",
  17590: "鎧魚",
  17591: "雲海蝴蝶螺",
  17592: "沙里貝涅",
  17593: "蘭代勒翼龍",
  // 紅蓮之狂潮 4.55
  24990: "異刺鯊",
  24991: "鐮甲魚",
  24992: "胸脊鯊",
  24993: "紅龍",
  24994: "七彩天主",
  24995: "眾神之愛",
  // 暗影之逆焰 5.55
  33239: "利斯塔克鯊",
  33240: "自走魚偶",
  33241: "驚喜蛋",
  33242: "鏡中蝶",
  33243: "隆卡的大水蛇？",
  33244: "長吻帆蜥魚",
  // 曉月之終途 6.55
  41407: "潛龍",
  41408: "嘎兒魚",
  41409: "異形雪棘",
  41410: "餐叉尾",
  41411: "優雅兔耳",
  41412: "星鯨",
};

async function main() {
  const fishes = JSON.parse(await readFile(FISHES_FILE, "utf8"));
  const byId = new Map();
  for (const f of fishes.data) if (!byId.has(f.itemId)) byId.set(f.itemId, f);

  // ── 名單健檢：id 要存在、名字要對得上、而且必須本來就是魚王 ──
  const problems = [];
  for (const [idStr, expect] of Object.entries(EMPERORS)) {
    const id = Number(idStr);
    const f = byId.get(id);
    if (!f) { problems.push(`itemId ${id}（${expect}）在 fishes.json 找不到`); continue; }
    if (f.name !== expect) problems.push(`itemId ${id} 名稱不符：資料是「${f.name}」，名單是「${expect}」`);
    if (!f.bigFish) problems.push(`itemId ${id}（${expect}）不是 bigFish，釣場之皇必然是釣場之王`);
  }
  if (problems.length) {
    console.error("名單與資料對不上，已中止：\n" + problems.map((p) => "  ✗ " + p).join("\n"));
    process.exit(1);
  }

  let changed = 0;
  for (const f of fishes.data) {
    const want = Object.prototype.hasOwnProperty.call(EMPERORS, f.itemId);
    if (f.legendary !== want) { f.legendary = want; changed++; }
  }

  const total = fishes.data.filter((f) => f.legendary).length;
  const uniq = new Set(fishes.data.filter((f) => f.legendary).map((f) => f.itemId)).size;
  console.log(`名單 ${Object.keys(EMPERORS).length} 隻，資料中標記 ${uniq} 種（${total} 筆，同魚多釣場會重複）`);
  console.log(`需要異動的欄位：${changed} 筆`);

  if (CHECK) {
    if (changed) { console.error("✗ 現有資料與名單不一致，請跑 --apply"); process.exit(1); }
    console.log("✓ 現有資料與名單一致");
    return;
  }
  if (!changed) { console.log("沒有需要異動的資料（重跑安全）。"); return; }
  if (!APPLY) { console.log("\n這是 dry-run，未寫入。要實際套用請加 --apply"); return; }

  fishes.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FISHES_FILE, JSON.stringify(fishes, null, 2) + "\n", "utf8");
  console.log(`已寫入 ${FISHES_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
