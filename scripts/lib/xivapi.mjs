// xivapi.mjs — XIVAPI v2 的共用客戶端
//
// 為什麼要這支：站內 40 支腳本在打 XIVAPI v2，其中 13 支各自手寫了一份
// `getJson`／`fetchJson`／分頁迴圈。那些副本已經長出不同的重試次數、不同的
// 分頁終止條件，而**踩過的雷沒有一份是共享的**：
//
//   ① `?rows=` 不指名 `fields` 時只回預設欄位（§4.51）。ClassJobCategory 的成員
//      布林欄位整批消失，不報錯，職能欄安靜是 null。→ 這裡強制要求 fields。
//   ② `?rows=` 只要有一個 id 不存在就**整批 404**。→ 這裡自動退回逐筆。
//   ③ v1（`https://xivapi.com/<Sheet>`）已停更但**仍回 200**。TripleTriadCard 在
//      v1 是 425 筆、v2 是 475 筆，7.1 的新卡就是這樣安靜漏掉的（§4.x）。
//      → 這裡只講 v2，並提供 `sheetCount()` 讓腳本別再寫死總數。
//
// 注意 `https://xivapi.com/i/...`（圖示 CDN）**不是** v1 API，那是靜態資源，
// 全站前端的 `ICON_CDN` 都指它，不在遷移範圍內。
//
// 用法：
//   import { xiv } from "./lib/xivapi.mjs";
//   const rows = await xiv.sheet("ClassJob", "Abbreviation,UnlockQuest@as(raw)");     // 全表
//   const one  = await xiv.row("ClassJobCategory", 186);                              // 單筆（全欄位）
//   const many = await xiv.rows("Level", ids, "X,Z,Map@as(raw)");                     // 批次 → Map
//   const n    = await xiv.sheetCount("TripleTriadCard");                             // 總筆數
//
// 全部支援 `{ cache: "out_data/cache/xxx.json" }`：檔在就讀檔（可離線重跑），
// 不在就抓完寫檔。`{ offline: true }` 則檔不在直接拋錯，不會偷偷連網。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const BASE = "https://v2.xivapi.com/api/sheet";
const enc = (s) => encodeURIComponent(s);

async function getJson(url, { retries = 3, retryMs = 250 } = {}) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, retryMs * (i + 1)));
    }
  }
  throw new Error(`${url} — ${last.message}`);
}

async function cached(opts, produce) {
  const { cache, offline, label } = opts || {};
  if (cache && existsSync(cache)) {
    const v = JSON.parse(await readFile(cache, "utf8"));
    if (label) console.log(`${label}用快取：${Array.isArray(v) ? v.length : Object.keys(v).length} 筆`);
    return v;
  }
  if (offline) throw new Error(`--offline 但找不到快取 ${cache || "(未指定 cache)"}`);
  const v = await produce();
  if (cache) {
    await mkdir(dirname(cache), { recursive: true });
    await writeFile(cache, JSON.stringify(v));
  }
  return v;
}

export const xiv = {
  /**
   * 整張 sheet。回傳 `[{ id, f }]`（`f` 是 fields 物件）。
   * @param name   sheet 名，如 "ClassJob"
   * @param fields 逗號分隔欄位字串。**必填**——不給的話 API 只回預設欄位（§4.51）。
   * @param opts   { limit=500, cache, offline, label, max }
   */
  async sheet(name, fields, opts = {}) {
    if (!fields) throw new Error(`xiv.sheet("${name}") 沒有指定 fields——不指名只會拿到預設欄位（§4.51）`);
    const { limit = 500, max = Infinity, label } = opts;
    return cached(opts, async () => {
      const out = [];
      let after = null;
      for (;;) {
        const url = `${BASE}/${name}?limit=${limit}&fields=${enc(fields)}` + (after != null ? `&after=${after}` : "");
        const d = await getJson(url);
        if (!d.rows?.length) break;
        for (const r of d.rows) out.push({ id: r.row_id, f: r.fields });
        if (label) process.stdout.write(`\r${label}${out.length}`);
        if (out.length >= max || d.rows.length < limit) break;
        after = d.rows[d.rows.length - 1].row_id;
      }
      if (label) process.stdout.write("\n");
      return out;
    });
  },

  /** 單筆，回傳 fields 物件。不給 fields 就拿全欄位——動態欄位的 sheet 只能這樣取（§4.51）。 */
  async row(name, id, fields) {
    const d = await getJson(`${BASE}/${name}/${id}` + (fields ? `?fields=${enc(fields)}` : ""));
    return d.fields;
  },

  /**
   * 批次取指定 id，回傳 `Map<id, fields>`。
   * `?rows=` 只要有一個 id 不存在就整批 404，所以這裡自動退回逐筆——
   * 缺的那幾筆就是取不到，不會讓整批一起消失。
   */
  async rows(name, ids, fields, opts = {}) {
    if (!fields) throw new Error(`xiv.rows("${name}") 沒有指定 fields（§4.51）`);
    const { chunk = 50, label } = opts;
    const uniq = [...new Set(ids)].filter((x) => x != null);
    const got = await cached(opts, async () => {
      const out = {};
      for (let i = 0; i < uniq.length; i += chunk) {
        const part = uniq.slice(i, i + chunk);
        try {
          const d = await getJson(`${BASE}/${name}?rows=${part.join(",")}&fields=${enc(fields)}`);
          for (const r of d.rows) out[r.row_id] = r.fields;
        } catch {
          for (const id of part) {
            try { out[id] = await this.row(name, id, fields); } catch { /* 這筆真的沒有 */ }
          }
        }
        if (label) process.stdout.write(`\r${label}${Object.keys(out).length}/${uniq.length}`);
      }
      if (label) process.stdout.write("\n");
      return out;
    });
    return new Map(Object.entries(got).map(([k, v]) => [Number(k), v]));
  },

  /**
   * sheet 的筆數與最大 row_id。
   * **不要在腳本裡寫死總數**——v1 的 TripleTriadCard 凍結在 425 筆而 v2 有 475 筆，
   * 寫死 425 就是 7.1 那 10 張新卡安靜消失的原因。
   */
  async sheetCount(name) {
    const d = await getJson(`${BASE}/${name}?limit=1&fields=${enc("")}`).catch(() => null);
    // limit=1 拿不到總數，改用大 limit 取最後一筆的 row_id（v2 沒有 count 端點）
    const all = [];
    let after = null;
    for (;;) {
      const r = await getJson(`${BASE}/${name}?limit=500&fields=` + (after != null ? `&after=${after}` : ""));
      if (!r.rows?.length) break;
      all.push(...r.rows.map((x) => x.row_id));
      if (r.rows.length < 500) break;
      after = r.rows[r.rows.length - 1].row_id;
    }
    void d;
    return { count: all.length, maxId: all.length ? Math.max(...all) : 0, ids: all };
  },
};

export default xiv;
