// report-vs-client.mjs — 站上資料對台服客戶端解包的單一報表（唯讀、預設離線、**永遠 exit 0**）
//
// 第三輪路線圖 §4 report-vs-client＋§6 name-join-report（2026-10-11）。這一輪的名稱債都是靠手寫的一次性腳本量出來的
// （73 筆錯名、18 首漏曲、59 筆漏成就、NPC 145／怪物 30／地名 5 筆改譯…）；這支把那些比對收成一份，
// 升版後跑一次就知道「站上落後客戶端多少」。
// ⚠ 刻意**不進 CI 當閘門**：客戶端一更新、站上一落後就會變紅，那是設計上的噪音——放行檢查由
//   check-gate-release.mjs 負責、名稱規則由 validate-official-terms.mjs 負責。
//
// 各節：
//   ① 版本：_meta.json gamePatch ／台服版本清單／客戶端快取版本
//   ② 物品名：items.json vs 客戶端 Item.Name（相同／只差中點／用字不同／站上缺）
//   ③ 收藏名：寵物、坐騎、表情、鳥鞍、青魔法 vs 客戶端（用字不同的列出來；社群名衝突已在 aliases 的不算）
//   ④ 收藏缺列：客戶端有台服名、站上沒收的寵物／坐騎／表情
//   ⑤ Teamcraft 名稱表落後客戶端多少（地名、怪物、NPC、任務、FATE、理符、技能、狀態）——client-names.mjs 的統計
//   ⑥ 以名稱接起來的欄位（name-join）：收藏頁取得方式裡還寫著 Teamcraft 舊 NPC 名的、資料裡還寫著舊地名的
//
// 執行：node scripts/report-vs-client.mjs [--online]   （預設只讀 out_data/cache 的快取；--online 缺快取時才連網）

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { loadTcSheet } from "./lib/tc-datamining.mjs";
import { cleanName, usable, preferClient, clientNameMap, statsOf } from "./lib/client-names.mjs";
import { loadTwLocales } from "./lib/tw-locales.mjs";
import { TW_RELEASES } from "./lib/tw-releases.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const offline = !process.argv.includes("--online");
const data = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
const fold = (s) => String(s || "").replace(/[·・‧•]/g, "・");
const h = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length * 2))}`);
const sheet = async (n) => { try { return await loadTcSheet(n, { offline }); } catch (e) { console.log(`  （略過：${e.message}）`); return null; } };

function compare(label, siteRows, clientMap, keyOf = (e) => e.id, nameOf = (e) => e.name) {
  let same = 0, dot = 0, alias = 0;
  const diff = [], missing = [];
  for (const e of siteRows) {
    const s = nameOf(e), c = clientMap.get(keyOf(e));
    if (!s) continue;
    if (!c) { missing.push(`${keyOf(e)} ${s}`); continue; }
    if (s === c) same++;
    else if (fold(s) === fold(c)) dot++;
    else if ((e.aliases || []).includes(s)) alias++;
    else diff.push(`${keyOf(e)}「${s}」≠ 客戶端「${c}」`);
  }
  console.log(`  ${label.padEnd(8)} 相同 ${same}／只差中點 ${dot}／用字不同 ${diff.length}／客戶端沒有 ${missing.length}`);
  for (const d of diff.slice(0, 5)) console.log(`      ${d}`);
  if (diff.length > 5) console.log(`      …另 ${diff.length - 5} 筆`);
  return { same, dot, diff, missing };
}

async function main() {
  console.log(`站上資料 vs 台服客戶端（${offline ? "只讀快取" : "缺快取時連網"}）`);

  h("① 版本");
  const meta = data("_meta.json");
  const rel = TW_RELEASES[TW_RELEASES.length - 1];
  console.log(`  _meta.json gamePatch ${meta.gamePatch}（客戶端 ${meta.twClient?.version ?? "?"}）／台服版本清單最後一筆 ${rel.version}（客戶端 ${rel.client.version}）`);
  if (meta.gamePatch !== rel.version) console.log("  ⚠ 兩者不同——升版只做了一半（validate-data 也會報）");

  h("② 物品名");
  const item = await sheet("Item");
  if (item) {
    /* 上游 CSV 有欄位錯位的列（12066：Name 欄裝著說明的後半句，知識庫 §4.98）——與 build-tw-items-msgpack.mjs 同規則：
       名字裡有換行、或以閉合標點開頭，就改取 Singular */
    const nm = (r) => { const n = String(r.Name || ""); return (n.indexOf(String.fromCharCode(10)) >= 0 || n.indexOf(String.fromCharCode(13)) >= 0) || /^[」』）】]/.test(n) ? cleanName(r.Singular) : cleanName(n); };
    const m = new Map(item.map((r) => [r.id, nm(r)]).filter(([, n]) => usable(n)));
    const r = compare("物品", data("items.json").data, m);
    const siteIds = new Set(data("items.json").data.map((i) => i.id));
    console.log(`  客戶端有台服名、items.json 沒收：${[...m.keys()].filter((id) => !siteIds.has(id)).length} 件（多半是未開放的預載列，看 check-gate-release）`);
    void r;
  }

  h("③ 收藏名（站上 vs 客戶端）");
  const col = async (label, file, sheetName, col, via) => {
    const rows = await sheet(sheetName);
    if (!rows) return;
    let m = new Map(rows.map((r) => [r.id, cleanName(r[col])]).filter(([, n]) => usable(n)));
    if (via) {
      const target = await sheet(via[0]);
      const tm = new Map((target || []).map((r) => [r.id, cleanName(r[via[1]])]));
      m = new Map(rows.map((r) => [r.id, tm.get(Number(r[col]))]).filter(([, n]) => usable(n)));
    }
    return compare(label, data(file).data, m);
  };
  const minions = await col("寵物", "minions.json", "Companion", "Singular");
  const mounts = await col("坐騎", "mounts.json", "Mount", "Singular");
  const emotes = await col("表情", "emotes.json", "Emote", "Name");
  await col("鳥鞍", "barding.json", "BuddyEquip", "Name");
  await col("青魔法", "blue-magic.json", "AozAction", "Action", ["Action", "Name"]);

  h("④ 收藏缺列（客戶端有台服名、站上沒收）");
  for (const [label, file, sheetName, c] of [["寵物", "minions.json", "Companion", "Singular"], ["坐騎", "mounts.json", "Mount", "Singular"], ["表情", "emotes.json", "Emote", "Name"]]) {
    const rows = await sheet(sheetName);
    if (!rows) continue;
    const have = new Set(data(file).data.map((e) => e.id));
    const miss = rows.filter((r) => usable(cleanName(r[c])) && !have.has(r.id));
    console.log(`  ${label.padEnd(8)} ${miss.length} 筆${miss.length ? "：" + miss.slice(0, 6).map((r) => `${r.id} ${cleanName(r[c])}`).join("、") + (miss.length > 6 ? "…" : "") : ""}`);
  }
  console.log("  （坐騎有內部列 Mount.Order = -1、表情有系統用列，缺列不一定是漏收——先查 §4.11）");
  void minions; void mounts; void emotes;

  h("⑤ Teamcraft 名稱表落後客戶端多少");
  const tw = await loadTwLocales();
  const R = createRequire(join(ROOT, "package.json"));
  const { decode } = R("@msgpack/msgpack");
  const places = existsSync(join(ROOT, "out_data", "places.msgpack")) ? decode(readFileSync(join(ROOT, "out_data", "places.msgpack"))).twPlaces : {};
  const tq = existsSync(join(ROOT, "out_data", "tw-quests.json")) ? JSON.parse(readFileSync(join(ROOT, "out_data", "tw-quests.json"), "utf8")) : {};
  const npcs = existsSync(join(ROOT, "out_data", "npcs.msgpack")) ? decode(readFileSync(join(ROOT, "out_data", "npcs.msgpack"))).twNpcs : {};
  for (const [label, table, kind] of [["地名", places, "place"], ["怪物", tw.mobs, "mob"], ["NPC", npcs, "npc"], ["任務", tq, "quest"],
    ["FATE", tw.fates, "fate"], ["理符", tw.leves, "leve"], ["技能", existsSync(join(ROOT, "out_data", "cache", "tc-tw-tw-actions.json")) ? JSON.parse(readFileSync(join(ROOT, "out_data", "cache", "tc-tw-tw-actions.json"), "utf8")) : {}, "action"], ["狀態", tw.statuses, "status"]]) {
    try {
      const t = await preferClient(table || {}, kind, { offline });
      const s = statsOf(t);
      console.log(`  ${label.padEnd(6)} 客戶端 ${s.client}：相同 ${s.same}／只差中點 ${s.dot}／用字不同 ${s.diff}／Teamcraft 沒有 ${s.added}`);
    } catch (e) { console.log(`  ${label.padEnd(6)} （略過：${e.message}）`); }
  }
  console.log("  （建置腳本已走 lib/client-names.mjs 的客戶端優先；這節只是告訴你 Teamcraft 的快照多舊）");

  h("⑥ 以名稱接起來的欄位（name-join）");
  try {
    const { npcRenameMap } = await import("./patch-npc-renames.mjs");
    const ren = await npcRenameMap({ offline });
    const olds = [...ren.keys()];
    let hits = 0;
    const ex = [];
    for (const f of ["mounts.json", "minions.json", "emotes.json", "ornaments.json", "barding.json", "orchestrion.json", "hairstyles.json", "triple-triad.json"]) {
      for (const e of data(f).data) for (const s of e.sources || []) {
        const cand = [s?.issuer?.name, s?.npcName, s?.npc, s?.detail].filter((x) => typeof x === "string");
        for (const v of cand) {
          const fv = fold(v);
          const o = olds.find((k) => fv === k || fv.startsWith(k + "：") || fv.startsWith(k + "（"));
          if (o) { hits++; if (ex.length < 5) ex.push(`${f} ${e.id}：${v}`); }
        }
      }
    }
    console.log(`  收藏頁取得方式裡的 NPC 舊名（Teamcraft → 客戶端改名 ${ren.size} 組）：${hits} 處${ex.length ? "　例：" + ex.join("；") : ""}`);
    if (hits) console.log("  → node scripts/patch-npc-renames.mjs --apply，再 patch-collection-shop-links.mjs --apply");
  } catch (e) { console.log(`  （NPC 名略過：${e.message}）`); }
  try {
    const pc = await preferClient(places, "place", { offline });
    const st = statsOf(pc);
    const renamed = st.examples.map((x) => x.match(/「(.+)」→「(.+)」/)).filter(Boolean).map((m) => [m[1], m[2]]);
    const maps = data("maps.json").data;
    const stale = maps.filter((m) => renamed.some(([o]) => m.name === o));
    console.log(`  maps.json 還寫著 Teamcraft 舊地名：${stale.length} 張${stale.length ? "（" + stale.map((m) => m.name).join("、") + "）" : ""}`);
  } catch (e) { console.log(`  （地名略過：${e.message}）`); }
  console.log("\n（報表結束；這支不會 exit 1）");
}

main().catch((e) => { console.error("報表中斷：", e.message); }).finally(() => process.exit(0));
