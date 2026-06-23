# 資料來源與回填紀錄

本文件記錄各資料欄位的**來源**與**重建/更新腳本**，供日後改版補資料時查閱。
通則見 [`/data/SCHEMA.md`](../data/SCHEMA.md)；本檔聚焦「patch / 取得來源 / 隱藏」這幾次回填的來源與管線。

> 沙箱備註：本專案多數 build 腳本原註解寫「Cowork 沙箱擋外網」。實測 **ffxivcollect.com、raw.githubusercontent.com（Teamcraft）、v2.xivapi.com 皆可連**（2026-06 起 XIVAPI 已可連，舊註解過時）。

---

## 1. 外部資料來源一覽

| 來源 | 端點 | 提供 | 備註 |
|------|------|------|------|
| **ffxivcollect** | `https://ffxivcollect.com/api/{mounts,minions,emotes,bardings,orchestrions}` | 收藏品的 `patch`（跨區版本號）、`item_id`、`sources`（type+text，**英文**） | **無 cards（幻卡）端點**；**無簡中 locale**（`?language=` 僅 en/de/fr/ja）。id 對齊：mounts/minions/emotes = 遊戲 row id；orchestrion 用 `item_id` 對 |
| **Teamcraft patch 資料** | `raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/patch-content.json` 與 `patch-names.json` | `patch-content` = `{patchId:{contentType:[ids]}}`；`patch-names` = `{patchId:{version:"7.15",...}}` | contentType 含 `item / recipe(無，用 item) / enpcresident / bnpcname / instancecontent / fate / placename …`。反查 id→patchId→version |
| **ffxiv.consolegameswiki.com** | `/wiki/Blue_Magic_Spellbook` | 青魔法習得來源（圖騰兌換條件、副本） | 人工查證，非 API |
| **XIVAPI v2** | `https://v2.xivapi.com` | 物品/NPC/副本等 sheet（**row 不含 patch 欄**） | patch 一律走 Teamcraft，不靠 XIVAPI |
| out_data/cfc-content.json | 本機 | ContentFinderCondition id → InstanceContent id | dungeons patch 橋接（dungeons.id 是 CFC，Teamcraft instancecontent 是 InstanceContent） |

README 的「資料來源」表為總覽；本表為這幾次回填實際用到的細節。

---

## 2. patch（版本）欄位

台服當前版本門檻寫在 [`data/_meta.json`](../data/_meta.json) 的 `gamePatch`（目前 **7.15**）。
前端 [`assets/js/patch-gate.js`](../assets/js/patch-gate.js)：`條目 patch > gamePatch → 台服未開放 → 隱藏`；patch 未知者不隱藏。

| 範圍 | 來源 | 腳本 |
|------|------|------|
| 收藏檔 mounts/minions/emotes/barding | ffxivcollect `patch`（權威；既有手動 patch 多錯位） | [`scripts/patch-backfill.mjs`](../scripts/patch-backfill.mjs) |
| 結構表 items/recipes/npcs/dungeons/gardening/triple-triad | Teamcraft patch-content（反查）；dungeons 經 cfc 橋；recipes 用產物 itemId；triple-triad 用 sources[].instanceId | [`scripts/patch-backfill-all.mjs`](../scripts/patch-backfill-all.mjs) |
| 無來源表 gathering/maps/fishing-spots/monsters/squadron | 站內 patch 反推（代理）：gathering←物品最早、fishing-spots←魚最早、maps←副本名/region、monsters←出沒地圖/掉落、squadron←3.4 系統開放 | [`scripts/patch-backfill-proxy.mjs`](../scripts/patch-backfill-proxy.mjs) |

更新做法：升台服版本時改 `_meta.json` gamePatch；補新內容 patch 重跑上述三支（皆 dry-run 預設、`--apply` 寫入、fill-only 不覆蓋既有、保留檔案 minified/pretty 格式）。

**已知殘留（無對應，正常）**：monsters 僅約 10%（雜魚無逐隻 patch datamining）、maps 18（特殊區）、recipes/dungeons/mounts/minions 少量（台服未開放或特殊條目）。

---

## 3. 取得來源 sources

| 檔案 | 來源 | 腳本 |
|------|------|------|
| orchestrion / mounts / minions / barding | ffxivcollect `sources`（type→繁中 SOURCE_TYPES 對照；detail 繁中 where 可推：Premium→商城購買、副本類比對 dungeons.json nameEn，其餘留空） | [`scripts/backfill-sources.mjs`](../scripts/backfill-sources.mjs) |
| blue-magic（14 筆特殊習得） | consolegameswiki 人工查證：瓦哈拉吉圖騰向異男子嘎希加（烏爾達哈）兌換／水炮為職業初始／力場另由無瑕靈君殲滅戰 | [`scripts/patch-blue-magic-totems.mjs`](../scripts/patch-blue-magic-totems.mjs) |

`backfill-sources.mjs` 為 **fill-empty-only**（只填 sources 為空者，不覆蓋既有策展來源）。
ffxivcollect 的 source `text` 是英文，無簡中可 OpenCC，故 detail 採「繁中 where 可推、查不到留空」。

英文 type → 繁中對照表維護在 `backfill-sources.mjs` 的 `TYPE_TW`。新 type 出現時補這張表即可。

**已知殘留**：orchestrion 4、mounts 14、minions 9 筆 sources 仍空（ffxivcollect 無對應，多為舊手動條目或台服特殊內容）。

---

## 4. 更新流程速查

1. 升台服版本 → 改 `data/_meta.json` `gamePatch`。
2. 新增收藏品/內容 → 重跑 `patch-backfill.mjs` → `patch-backfill-all.mjs` → `patch-backfill-proxy.mjs`（dry-run 看數字，`--apply` 寫入）。
3. 補取得來源 → 重跑 `backfill-sources.mjs`（只補新空缺）。青魔特殊來源 → 改 `patch-blue-magic-totems.mjs` 的 `FIX` 表。
4. 跑 `jq`/Node 驗證 `count === data.length`，commit。
