// build-item-names.mjs — 產生 data/item-names/（物品四語對照的查詢分片）
//
// 解決的問題：攻略、社群貼文、國際服影片講的都是英文／日文／簡中的物品名，
// 而站內一切都用台服繁中名。使用者手上有一份「要買的東西」清單，
// 第一步就卡在「這個 Iron Ingot 台服叫什麼」。
//
// ── 為什麼要分片，而且是依「查詢鍵」分而不是依 id ────────────────────
// 完整四語表是 45,546 件、gzip 1.27MB，整份載不合理。
// 但這頁的操作是**用名字查**不是用 id 查，所以 `item-sources` 那種 `id >> 10` 的切法
// 在這裡沒用——查之前根本不知道 id。
// 改成：把每個外語名正規化後取雜湊，`hash % 64` 決定落在哪一片。
// 使用者貼一個名字 → 算得出片號 → 只抓那一片（約 20KB）。
// 貼一整份清單時會摸到多片，但那是使用者主動按下「翻譯」才發生的一次性成本。
//
// ── 正規化規則（前端必須用同一套，否則永遠查不到）──────────────────
//   · 轉小寫
//   · 去掉所有空白、`'`、`-`、`·`、全形空白
//   · 去掉 HQ 標記（` (HQ)`、`` 等）
// 規則寫在 `normalizeName()`，前端 `assets/js/item-names.js` 匯入同一份邏輯的複本，
// **改任一邊都要同步另一邊**——不同步的徵狀是「查得到的東西突然查不到」，不會報錯。
//
// ── 收錄範圍 ────────────────────────────────────────────────────────
// 只收**有台服繁中名**的 45,546 件（鐵則：查不到台服名就不該出現在結果裡）。
// 簡中名與繁中名相同的 3,498 件不另存簡中鍵（查繁中名本來就查得到）。
//
// 執行（repo 根目錄）：
//   node scripts/build-item-names.mjs            # dry-run，印報告
//   node scripts/build-item-names.mjs --apply    # 寫入 data/item-names/

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";
import { isTw } from "./lib/tw-text.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OUT = join(DATA, "item-names");
const apply = process.argv.includes("--apply");

const SHARDS = 256;

/** 正規化查詢鍵。**與 assets/js/item-names.js 的同名函式必須一致。** */
export function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[]/g, "")          // HQ／收藏品的私用區符號
    .replace(/\(hq\)/g, "")
    .replace(/[\s　'’\-–—·・]/g, "");
}

/** 字串 → 片號。**與前端必須一致**（FNV-1a 32 bit，選它是因為兩邊都好寫、分佈夠均勻）。 */
export function shardOf(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % SHARDS;
}

async function main() {
  const L = {};
  for (const [k, f] of [["tw", "tw-items"], ["ja", "ja-items"], ["en", "en-items"], ["cn", "cn-items"]]) {
    L[k] = decode(await readFile(join(ROOT, "out_data", `${f}.msgpack`)));
  }
  const val = (o, k) => (o && (o[k] ?? o.zh)) || null;

  /* 片的形狀：{ k: { en: {正規化鍵: 台服名}, ja: …, cn: …, tw: … } }
     語言分成四個子物件而不是每筆帶語言碼——177,593 個鍵各付一次欄位成本太貴。

     ⚠ 試過「片內共用台服名陣列」去重，**結果反而更大**（3.4MB → 3.76MB）：
     分片是依查詢鍵的雜湊切的，同一件物品的四個鍵會落在四個**不同**的片裡，
     片內根本沒有重複可去，只多付了陣列與索引的成本。
     真正有效的是把片切小（SHARDS 256 → 單片約 13KB），一次查詢只抓一片。 */
  const shards = new Map();
  const stat = { items: 0, keys: 0, noTw: 0, byLang: { en: 0, ja: 0, cn: 0, tw: 0 }, collide: 0 };
  const collisions = [];

  for (const id of Object.keys(L.en)) {
    const tw = val(L.tw[id], "tw");
    // 鐵則：沒有台服名的不收——查出來也不能顯示
    if (!tw || !isTw(tw)) { stat.noTw++; continue; }
    stat.items++;

    const entries = [
      ["en", val(L.en[id], "en")],
      ["ja", val(L.ja[id], "ja")],
      ["cn", val(L.cn[id], "cn")],
      ["tw", tw],                                  // 繁中自己也收：貼繁中名要能確認「就是它」
    ];
    for (const [lang, name] of entries) {
      if (!name) continue;
      const key = normalizeName(name);
      if (!key) continue;
      if (lang === "cn" && normalizeName(tw) === key) continue;   // 簡繁同字不另存
      const sh = shardOf(key);
      if (!shards.has(sh)) shards.set(sh, { en: {}, ja: {}, cn: {}, tw: {} });
      const bucket = shards.get(sh);
      // 同一個正規化鍵在同一個語言裡撞名＝兩件東西在該語言同名。
      // 保留先到的那筆並記下來——安靜覆蓋會讓其中一件永遠查不到。
      const existing = bucket[lang][key];
      if (existing !== undefined) {
        if (existing !== tw) {
          stat.collide++;
          if (collisions.length < 8) collisions.push(`${lang} 「${key}」：「${existing}」vs「${tw}」`);
        }
        continue;
      }
      bucket[lang][key] = tw;
      stat.keys++;
      stat.byLang[lang]++;
    }
  }

  const files = [];
  for (const [sh, b] of [...shards].sort((a, x) => a[0] - x[0])) {
    const count = Object.values(b).reduce((a2, o) => a2 + Object.keys(o).length, 0);
    const json = JSON.stringify({ schema: "item-names", shard: sh, count, k: b });
    files.push({ shard: sh, name: `${sh}.json`, bytes: json.length, gz: gzipSync(json).length, count, json });
  }
  const totalGz = files.reduce((a, f) => a + f.gz, 0);
  const biggest = files.slice().sort((a, b) => b.bytes - a.bytes)[0];

  console.log(`收錄 ${stat.items} 件物品／${stat.keys} 個查詢鍵，切成 ${files.length} 片`);
  console.log(`  各語言鍵數：英 ${stat.byLang.en}、日 ${stat.byLang.ja}、簡 ${stat.byLang.cn}、繁 ${stat.byLang.tw}`);
  console.log(`  略過無台服名 ${stat.noTw} 件；同名衝突 ${stat.collide} 個（保留先到的）`);
  if (collisions.length) console.log(`    ` + collisions.join("\n    "));
  console.log(`  合計 gzip ${(totalGz / 1024).toFixed(0)}KB；單片平均 ${(totalGz / files.length / 1024).toFixed(1)}KB、最大 ${(biggest.gz / 1024).toFixed(1)}KB（${biggest.count} 鍵）`);

  // 單片太大就失去分片的意義；256 片下每片應該都在 15KB 上下
  const over = files.filter((f) => f.gz > 30 * 1024);
  if (over.length) {
    console.error(`\n✗ 有 ${over.length} 片 gzip 超過 30KB——把 SHARDS 調大（前端的常數要一起改）`);
    process.exit(1);
  }

  if (!apply) { console.log("\n（dry-run，未寫入；加 --apply 才寫）"); return; }

  if (existsSync(OUT)) for (const f of await readdir(OUT)) if (f.endsWith(".json")) await rm(join(OUT, f));
  await mkdir(OUT, { recursive: true });
  for (const f of files) await writeFile(join(OUT, f.name), f.json);
  await writeFile(join(OUT, "_index.json"), JSON.stringify({
    schema: "item-names-index",
    updated: new Date().toISOString().slice(0, 10),
    source: "out_data/{tw,ja,en,cn}-items.msgpack（四語物品名快照）",
    note: `片號 = FNV-1a(正規化鍵) % ${SHARDS}。正規化與雜湊規則必須與 assets/js/item-names.js 一致。`,
    shards: SHARDS,
    items: stat.items,
    keys: stat.keys,
  }));
  console.log(`\n✓ data/item-names/（${files.length} 片＋_index.json）`);
  console.log("  這個目錄刻意不進 minify-data.mjs——它本來就是壓過的形狀");
}

// 被 import 時（validate-item-names.mjs 要共用 normalizeName／shardOf）不要順便跑建置
const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) main().catch((e) => { console.error(e); process.exit(1); });
