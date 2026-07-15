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
| **Teamcraft treasures** | `raw.githubusercontent.com/…/libs/data/src/lib/json/treasures.json` | 藏寶圖（陳舊的地圖）挖寶座標：`{ item, map(Map row id), coords{x,y}, partySize }` | 建 `treasure-maps.json`；名稱/圖示反查 items.json、地區/資料片反查 maps.json。腳本 [`scripts/build-treasure-maps.mjs`](../scripts/build-treasure-maps.mjs) |
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

### gc-shop.json（軍票變現排行 `/tools/gc-exchange/`）

| 欄位 | 來源 | 腳本 |
|------|------|------|
| `data.seals[]`（軍票商店品項＋軍票價＋軍階） | XIVAPI v2 `GCScripShopItem`（`Item@as(raw), CostGCSeals, RequiredGrandCompanyRank@as(raw)`；子列表、同物品取最低價） | [`scripts/build-gc-shop.mjs`](../scripts/build-gc-shop.mjs) |
| `data.bicolor[]`（雙色寶石兌換品＋寶石價＋數量） | XIVAPI v2 `SpecialShop` 全表掃描，取成本含雙色寶石（item 26807）的兌換項 | 同上 |
| 名稱／可上市過濾 | `data/items.json`（無繁中名或 `marketable:false` 剔除；前端另套 patch-gate） | 同上 |

市價不入庫：前端以共用 [`assets/js/universalis.js`](../assets/js/universalis.js) 即時查 Universalis aggregated（近期成交均價→最低在架）。

---

## 4. 更新流程速查

1. 升台服版本 → 改 `data/_meta.json` `gamePatch`。
2. 新增收藏品/內容 → 重跑 `patch-backfill.mjs` → `patch-backfill-all.mjs` → `patch-backfill-proxy.mjs`（dry-run 看數字，`--apply` 寫入）。
3. 補取得來源 → 重跑 `backfill-sources.mjs`（只補新空缺）。青魔特殊來源 → 改 `patch-blue-magic-totems.mjs` 的 `FIX` 表。
4. 跑 `node scripts/validate-data.mjs` 驗證（count 一致、無粗略 patch、覆蓋率），commit。

---

## 5. 已知殘留與待手動（無自動來源，留待人工）

這些不是 bug，是無乾淨程式化來源、需人工補的項目。記於此免遺漏。

| 項目 | 數量 | 為何卡 | 影響 |
|------|------|--------|------|
| mounts 缺 `id` 的舊條目 | 22（+1 同名 `黑陸行鳥`） | 只有繁中名，無 `id`/`nameEn`/`itemId` → 無 join key 對 ffxivcollect/XIVAPI（build-mounts 當初即未匹配） | 不影響顯示與追蹤（前端 `keyOf` 以 `name:` 退化）；屬 SCHEMA 1.3 純度缺口。補法：人工以繁中名對 Mount sheet row id |
| sources 仍空 | orchestrion 4、mounts 14、minions 9 | ffxivcollect 無對應（多為台服特殊/舊條目） | 該筆無取得方式；前端顯示「待補充」 |
| 來源列 `detail` 空 | minions ~289、mounts ~222、barding ~94 | ffxivcollect 來源文字為英文且多為 NPC 兌換，無簡中可 OpenCC；可推的（副本名）實測僅 ~1 筆 | type 已足以篩選；detail 空屬可接受（前端 `filter(Boolean)` 略過） |
| monsters patch | 約 90% 無 | 無逐隻雜魚 patch datamining（Teamcraft 僅追 9% 具名怪） | monsters 非收藏隱藏用，影響小 |
| maps patch | 18 筆（特殊區 `？？？？`） | region 表無對應 | 邊緣 |
| barding 英文名 | 6（ARR GC/職業鞍） | 無 `itemId`、tw-items 查無 → 無台服官方譯名來源 | 已被前端繁中漢字 filter 隱藏（符合嚴格政策） |

> 工程取捨：上述多為「一次性、邊際」項目。把一次性維護腳本再抽共用 lib（DRY）目前刻意不做——重構已驗證可用的腳本只省約數十行、卻有破壞風險，違反「engineered enough」。日後若這類腳本增多再抽。
