// 建立 mounts.json 坐騎資料庫
//
// 資料來源：
//   collections/mounts/mounts.js   手動維護的 sources、patch（名稱僅當最後備援）
//   XIVAPI v2 Mount sheet          icon path_hr1、ExtraSeats（額外座位）
//   XIVAPI v2 search API           Item.ItemAction.Action=1322（坐騎笛）→ mountId→itemId
//   out_data/tw-items.msgpack      台服物品官方譯名（itemId → {tw}）→ 推坐騎繁中名
//   thewakingsands Mount.csv       中國服坐騎名 + OpenCC 簡轉繁（fallback）
//
// 繁中名解析優先序（nameSource 欄標記來源）：
//   1. "tw-items"  台服坐騎笛物品名去掉「笛/角笛/號角/金鑰…」後綴（官方譯名）
//   2. "cn-opencc" 中國服 Mount.csv Singular + OpenCC（物品名是縮寫或不可拆時）
//   3. （無 nameSource）保留 mounts.js 手動名稱或英文名（台服未開放）
//
// 注意：2026-06-11 發現 mounts.js 手動繁中名大量錯位（名稱配錯坐騎 id），
//   因此凡 tw-items / cn-opencc 可解析者一律覆蓋手動名稱。sources/patch
//   仍沿用手動資料，但同樣可能錯位，待人工校對（見 docs/PROGRESS.md）。
//
// 輸出欄位：
//   id          Mount sheet row_id
//   name        繁中名
//   nameSource  "tw-items" | "cn-opencc"（無此欄＝手動/英文名）
//   nameEn      英文名（XIVAPI Singular）
//   itemId      坐騎笛物品 id（無對應物品的坐騎為 null）
//   seats       可乘坐人數（1 + ExtraSeats）
//   icon        本地圖示路徑，如 /i/004000/004001_hr1.png
//   iconUrl     XIVAPI asset URL（本機跑腳本時可下載）
//   iconPath    原始 tex 路徑（供 download-mounts.mjs 使用）
//   description 坐騎描述（英文，量大不批量抓）
//   sources     取得方式陣列（保留現有手動資料）
//   patch       版本（保留現有手動資料）
//
// 為什麼本機跑：Cowork 沙箱擋外網（v2.xivapi.com 全回 403）。
// 需 Node 18+（內建 fetch）＋ npm i @msgpack/msgpack opencc-js。
//
// ⚠ name 與 sources 的權威來源已改為 scripts/patch-mounts-tc.mjs（繁中站 TC，
//   data/mounts-sources-tc.json）。本檔的 cn-opencc 名稱（簡轉繁，有誤）與手動 sources
//   會被該 patch 在 TC 有資料時覆寫；TC 未提供 sources 者保留本檔/手動值。
//   完整流程：build → 人工核對改名 data/mounts.json → download-mounts.mjs → patch-mounts-tc.mjs。
//
// 執行（repo 根目錄）：
//   node scripts/build-mounts.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decode } from "@msgpack/msgpack";
import * as OpenCC from "opencc-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT_DATA = join(__dirname, "..", "out_data");
const MOUNTS_JS = join(__dirname, "..", "collections", "mounts", "mounts.js");
const OUT = join(DATA, "mounts_new.json");

const MOUNT_API = "https://v2.xivapi.com/api/sheet/Mount";
const SEARCH_API = "https://v2.xivapi.com/api/search";
const CN_BASE =
  "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master";
const MOUNT_FIELDS = ["Singular", "Icon", "ExtraSeats"].join(",");

const converter = OpenCC.Converter({ from: "cn", to: "tw" });

// ---------- 繁中名解析 ----------

// 坐騎喚出道具的常見後綴（去掉後即坐騎名），長後綴優先
const SUFFIXES = [
  "認證金鑰", "啟動金鑰", "啟動鑰匙", "主金鑰", "取車證",
  "角笛", "魔笛", "號角", "鈴鐺", "齒輪", "金鑰", "鑰匙", "笛", "鈴",
];
// 道具限定後綴：物品名=坐騎相關物（非坐騎名本身），不可直接當坐騎名
const ITEMISH = ["水晶", "共鳴器", "之書", "種子", "核心", "音叉"];
// 已知去後綴結果不可靠、改用 CN+OpenCC 的坐騎 id
//   27 炸彈角笛→坐騎是爆彈吊椅；136 鬼蝠魟海螺號角→斑鰩；215 隆卡魔笛→水蛇大人的罐子
const PREFER_CN = new Set([27, 136, 215]);

function suffixCandidates(name) {
  const out = [];
  for (const s of SUFFIXES) {
    if (name.endsWith(s) && name.length > s.length) {
      const c = name.slice(0, -s.length);
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
}

// a 是否為 b 的子序列（物品名常是坐騎全名的縮寫，如 遺產鳥 ⊂ 遺產陸行鳥）
function isSubseq(a, b) {
  let i = 0;
  for (const ch of b) if (ch === a[i]) i++;
  return i === a.length;
}

// 回傳 { name, src } 或 null（無法解析，保留原狀）
function resolveTwName(mountId, itemTw, cnName) {
  const C = cnName ? converter(cnName) : null;
  if (itemTw) {
    const cands = suffixCandidates(itemTw);
    if (cands.length) {
      if (C && cands.includes(C)) return { name: C, src: "tw-items" }; // 兩邊一致
      if (C && PREFER_CN.has(mountId)) return { name: C, src: "cn-opencc" };
      // 物品名是縮寫（去後綴結果為 CN 全名的子序列）→ 用 CN 全名
      if (C && cands.some((b) => b.length < C.length && isSubseq(b, C)))
        return { name: C, src: "cn-opencc" };
      const B = cands[0];
      // 「~之」「~的~」「含-」形：物品名非「坐騎名+後綴」結構，不可信
      if (C && (B.endsWith("之") || B.includes("的") || B.includes("-")))
        return { name: C, src: "cn-opencc" };
      return { name: B, src: "tw-items" }; // 台服官方譯名
    }
    // 無後綴：物品名可能就是坐騎名（沙發/座椅/掃帚…），道具限定後綴除外
    if (ITEMISH.some((s) => itemTw.endsWith(s)))
      return C ? { name: C, src: "cn-opencc" } : null;
    return { name: itemTw, src: "tw-items" };
  }
  return C ? { name: C, src: "cn-opencc" } : null;
}

// ---------- 資料抓取 ----------

// ui/icon/004000/004001_hr1.tex → /i/004000/004001_hr1.png（本地路徑）
function iconLocalPath(path_hr1) {
  if (!path_hr1) return null;
  const m = path_hr1.match(/ui\/icon\/(\d+)\/(\d+_hr1)\.tex/);
  return m ? `/i/${m[1]}/${m[2]}.png` : null;
}

// ui/icon/004000/004001_hr1.tex → XIVAPI asset URL
function iconUrl(path_hr1) {
  if (!path_hr1) return null;
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(path_hr1)}&format=png`;
}

// 抓 Mount sheet 全部筆數，回傳 Map(row_id → mount data)
async function fetchMounts() {
  const mounts = new Map();
  let after = 0;

  while (true) {
    const url = `${MOUNT_API}?fields=${encodeURIComponent(MOUNT_FIELDS)}&limit=500&after=${after}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mount sheet HTTP ${res.status} @ after=${after}`);
    const json = await res.json();
    const rows = json.rows || [];
    if (!rows.length) break;

    for (const r of rows) {
      const f = r.fields || {};
      if (!f.Singular) continue; // 空列跳過

      const path_hr1 = f.Icon?.path_hr1 || null;
      mounts.set(r.row_id, {
        nameEn: f.Singular,
        seats: 1 + (f.ExtraSeats || 0),
        icon: iconLocalPath(path_hr1),
        iconUrl: iconUrl(path_hr1),
        iconPath: path_hr1,
      });
    }

    after = rows[rows.length - 1].row_id;
    process.stdout.write(`\r  Mount 已抓 ${mounts.size} 筆…`);
    if (rows.length < 500) break;
  }
  process.stdout.write("\n");
  return mounts;
}

// 坐騎笛：search API 查 Item.ItemAction.Action=1322，回傳 Map(mountId → itemId)
async function fetchMountItems() {
  const map = new Map();
  let cursor = null;
  while (true) {
    const url = cursor
      ? `${SEARCH_API}?cursor=${cursor}&fields=ItemAction.Data&limit=500`
      : `${SEARCH_API}?sheets=Item&query=${encodeURIComponent("ItemAction.Action=1322")}&fields=ItemAction.Data&limit=500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Item search HTTP ${res.status}`);
    const json = await res.json();
    for (const r of json.results || []) {
      const mountId = r.fields?.ItemAction?.fields?.Data?.[0];
      // 同一坐騎多個道具（復刻販售）時保留最小 itemId
      if (mountId && (!map.has(mountId) || r.row_id < map.get(mountId)))
        map.set(mountId, r.row_id);
    }
    process.stdout.write(`\r  坐騎笛已對應 ${map.size} 筆…`);
    if (!json.next) break;
    cursor = json.next;
  }
  process.stdout.write("\n");
  return map;
}

// 台服物品譯名：out_data/tw-items.msgpack（itemId → {tw}）
async function loadTwItems() {
  const buf = await readFile(join(OUT_DATA, "tw-items.msgpack"));
  const twItems = decode(buf);
  return (itemId) => twItems[String(itemId)]?.tw ?? null;
}

// 中國服 Mount.csv：row_id → 簡中名（前 3 行是 header，欄 0=row_id，欄 1=Singular）
async function fetchCnMountNames() {
  const res = await fetch(`${CN_BASE}/Mount.csv`);
  if (!res.ok) throw new Error(`Mount.csv HTTP ${res.status}`);
  const csv = await res.text();
  const map = new Map();
  for (const line of csv.split("\n").slice(3)) {
    const m = line.match(/^(\d+),"?([^",]*)/);
    if (!m || !m[2]) continue;
    map.set(Number(m[1]), m[2]);
  }
  return map;
}

// 從 collections/mounts/mounts.js 解析原始資料（sources/patch 來源）
async function loadExistingFromJs() {
  const content = await readFile(MOUNTS_JS, "utf8");
  const pattern = /\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)",\s*patch:\s*"([^"]+)",\s*sources:\s*(\[[^\]]+\])/gs;
  const map = new Map();
  for (const m of content.matchAll(pattern)) {
    const [, id, name, patch, srcRaw] = m;
    const types = [...srcRaw.matchAll(/type:\s*"([^"]+)"/g)].map(x => x[1]);
    const details = [...srcRaw.matchAll(/detail:\s*"([^"]+)"/g)].map(x => x[1]);
    map.set(Number(id), {
      name, patch,
      sources: types.map((t, i) => ({ type: t, detail: details[i] })),
    });
  }
  return map;
}

async function main() {
  // 1. 從 mounts.js 讀手動資料（sources/patch；名稱僅當備援）
  process.stderr.write("讀取 collections/mounts/mounts.js…\n");
  const existingMap = await loadExistingFromJs();
  process.stderr.write(`  原始資料 ${existingMap.size} 筆\n`);

  // 2. 抓 XIVAPI Mount sheet ＋ 坐騎笛對應 ＋ 譯名來源
  process.stderr.write("抓 XIVAPI Mount sheet…\n");
  const apiMounts = await fetchMounts();
  process.stderr.write(`  API 共 ${apiMounts.size} 筆\n`);
  process.stderr.write("抓坐騎笛 itemId 對應（search API）…\n");
  const mountItems = await fetchMountItems();
  process.stderr.write("載入 tw-items.msgpack…\n");
  const twName = await loadTwItems();
  process.stderr.write("抓中國服 Mount.csv…\n");
  const cnNames = await fetchCnMountNames();
  process.stderr.write(`  CN 名稱 ${cnNames.size} 筆\n`);

  // 3. 合併
  const data = [];
  let matched = 0;
  let apiOnly = 0;

  for (const [id, existing_m] of existingMap) {
    const api = apiMounts.get(id);
    if (api) {
      matched++;
      data.push({
        id,
        name: existing_m.name,
        nameEn: api.nameEn,
        seats: api.seats,
        icon: api.icon,
        iconUrl: api.iconUrl,
        iconPath: api.iconPath,
        description: null,          // 描述量大，不在此批量抓
        sources: existing_m.sources || [],
        patch: existing_m.patch || null,
      });
    } else {
      // API 沒有此 id（罕見），保留原資料
      data.push({ ...existing_m, nameEn: existing_m.nameEn || null, icon: existing_m.icon || null });
    }
  }

  // 再補 API 有但現有沒有的（新坐騎）
  for (const [id, api] of apiMounts) {
    if (!existingMap.has(id)) {
      apiOnly++;
      data.push({
        id,
        name: api.nameEn,     // 先用英文，下面解析繁中名
        nameEn: api.nameEn,
        seats: api.seats,
        icon: api.icon,
        iconUrl: api.iconUrl,
        iconPath: api.iconPath,
        description: null,
        sources: [],
        patch: null,
      });
    }
  }

  data.sort((a, b) => (a.id ?? 1e9) - (b.id ?? 1e9));

  // 4. 補 itemId ＋ 解析繁中名（tw-items > cn-opencc > 手動/英文）
  let stat = { item: 0, twi: 0, cno: 0, kept: 0 };
  for (const d of data) {
    const itemId = d.id != null ? (mountItems.get(d.id) ?? null) : null;
    d.itemId = itemId;
    if (itemId) stat.item++;
    if (d.id == null) { stat.kept++; continue; }
    const r = resolveTwName(d.id, itemId ? twName(itemId) : null, cnNames.get(d.id) || null);
    if (r) {
      d.name = r.name;
      d.nameSource = r.src;
      r.src === "tw-items" ? stat.twi++ : stat.cno++;
    } else {
      delete d.nameSource;
      stat.kept++;
    }
  }

  // 5. 輸出
  const out = {
    schema: "mounts",
    patch: "7.2",
    updated: new Date().toISOString().slice(0, 10),
    source: "xivapi+tw-items+cn-opencc+manual",
    count: data.length,
    data,
  };
  const jsonStr = JSON.stringify(out, null, 2);

  await writeFile(OUT, jsonStr, "utf8");
  const verify = JSON.parse(await readFile(OUT, "utf8"));
  if (verify.data.length !== out.count) {
    throw new Error(`寫入驗證失敗！預期 ${out.count} 筆，實際讀回 ${verify.data.length} 筆`);
  }

  process.stderr.write(`\n寫入 ${OUT}\n`);
  process.stderr.write(`  總計 ${data.length} 筆\n`);
  process.stderr.write(`    ├ 現有資料對應 API: ${matched} 筆；API 新增: ${apiOnly} 筆\n`);
  process.stderr.write(`    ├ itemId: ${stat.item} 筆\n`);
  process.stderr.write(`    └ 繁中名 tw-items: ${stat.twi}／cn-opencc: ${stat.cno}／保留原狀: ${stat.kept}\n`);
  process.stderr.write("\n下一步：人工核對後改名為 data/mounts.json，再跑 node scripts/download-mounts.mjs\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
