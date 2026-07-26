// patch-fish-bait-alts.mjs
// 修正 data/fishes.json 的 bait[]：把「A 或 B 皆可」的餌從壞掉的形狀救回來。
//
// 背景：
//   上游 fish tracker 的 bestCatchPath 每一段可能是單一 id，也可能是 [idA, idB]＝兩種餌都行。
//   build-fishing.mjs 早期版本直接 `.map(id => ({ itemId: id, name: baitName(id) }))`，
//   陣列那一段就變成 { itemId: [43849,43852], name: "43849,43852" }——
//   itemId 型別錯了，name 還是一串 id，前端釣餌欄會直接印出數字。共 78 條魚中招。
//
// 修正後形狀（與 build-fishing.mjs 現在的輸出一致）：
//   { itemId: 43849, name: "黃金幼蟲／蜜蜂餌", alts: [{itemId:43849,name:"黃金幼蟲"}, ...] }
//   單一餌維持 { itemId, name }，不加 alts。
//
// 不需要外網：壞掉的 itemId 陣列本身就留著兩個 id，名稱回查 data/items.json 即可。
//
// 執行（repo 根目錄）：
//   node scripts/patch-fish-bait-alts.mjs           # dry-run，只印會改什麼
//   node scripts/patch-fish-bait-alts.mjs --apply   # 實際寫入
// 重跑安全（idempotent）：已修好的資料再跑一次不會有變更。

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const FISHES_FILE = join(DATA_DIR, "fishes.json");
const ITEMS_FILE = join(DATA_DIR, "items.json");

const APPLY = process.argv.includes("--apply");

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

// 壞掉的 name 長這樣："43849,43852"；正常的餌名不會是純數字加逗號
const isIdString = (s) => typeof s === "string" && /^\d+(,\d+)*$/.test(s);

async function main() {
  const fishes = await readJson(FISHES_FILE);
  const items = await readJson(ITEMS_FILE);
  const itemName = new Map(items.data.map((i) => [i.id, i.name]));

  const nameOf = (id) => itemName.get(id) || String(id);

  let fixed = 0;
  let steps = 0;
  const missing = new Set();
  const samples = [];

  for (const f of fishes.data) {
    if (!Array.isArray(f.bait) || !f.bait.length) continue;
    let touched = false;

    f.bait = f.bait.map((step) => {
      // 已經是修好的形狀就原樣放行
      if (typeof step.itemId === "number" && !isIdString(step.name)) return step;

      const ids = Array.isArray(step.itemId)
        ? step.itemId
        : isIdString(step.name)
          ? step.name.split(",").map(Number)
          : [step.itemId];

      const alts = ids.map((id) => {
        if (!itemName.has(id)) missing.add(id);
        return { itemId: id, name: nameOf(id) };
      });

      touched = true;
      steps++;
      const out = { itemId: alts[0].itemId, name: alts.map((a) => a.name).join("／") };
      if (alts.length > 1) out.alts = alts;
      return out;
    });

    if (touched) {
      fixed++;
      if (samples.length < 8) {
        samples.push(`  ${f.name || f.nameEn} → ${f.bait.map((b) => b.name).join(" → ")}`);
      }
    }
  }

  console.log(`修正 ${fixed} 條魚、共 ${steps} 段餌`);
  if (samples.length) console.log("範例：\n" + samples.join("\n"));
  if (missing.size) {
    console.log(`⚠️ ${missing.size} 個餌 id 在 items.json 查無繁中名（會退回數字）：${[...missing].join(", ")}`);
  }

  if (!fixed) {
    console.log("沒有需要修正的資料（重跑安全）。");
    return;
  }
  if (!APPLY) {
    console.log("\n這是 dry-run，未寫入。要實際套用請加 --apply");
    return;
  }

  fishes.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FISHES_FILE, JSON.stringify(fishes, null, 2) + "\n", "utf8");
  console.log(`已寫入 ${FISHES_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
