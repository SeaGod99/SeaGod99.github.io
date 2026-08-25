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
| **Teamcraft 台服物品名** | `raw.githubusercontent.com/…/libs/data/src/lib/json/tw/tw-items.json` | `{itemId:{tw:"繁中名"}}`，由台服客戶端抽出＝台服官方譯名 | **`out_data/tw-items.msgpack` 的來源**（腳本 [`scripts/build-tw-items-msgpack.mjs`](../scripts/build-tw-items-msgpack.mjs)，護欄：必須是既有快照的超集）。同時是**判斷台服在哪一版**的依據（見 §2）。2026-08-11：45,548 筆 |
| **ffxiv.consolegameswiki.com** | `/wiki/Blue_Magic_Spellbook` | 青魔法習得來源（圖騰兌換條件、副本） | 人工查證，非 API |
| **Teamcraft treasures** | `raw.githubusercontent.com/…/libs/data/src/lib/json/treasures.json` | 藏寶圖（陳舊的地圖）挖寶座標：`{ item, map(Map row id), coords{x,y}, partySize }` | 建 `treasure-maps.json`；名稱/圖示反查 items.json、地區/資料片反查 maps.json。腳本 [`scripts/build-treasure-maps.mjs`](../scripts/build-treasure-maps.mjs) |
| **Teamcraft seeds** | `raw.githubusercontent.com/…/libs/data/src/lib/json/seeds.json` | 園藝：`{productId:{seedItemId, duration, crossBreeds[{baseSeed, adjacentSeed}]}}` | 建 `gardening.json`。腳本 [`scripts/build-gardening.mjs`](../scripts/build-gardening.mjs)（`--offline` 用 `out_data/cache/tc-seeds.json`）。**上游有一處錯**：紅色向日葵的種子指到 `4817 葵花籽`（食材、2.0），正解 `43962 向日葵種子`（英文同名 Sunflower Seeds）→ 腳本內 `SEED_OVERRIDE` 修正。**遊戲機制（配種判定、土壤、油粕花色）不在任何 datamine 裡**，出處見 [`docs/gardening-rules.md`](gardening-rules.md) |
| **XIVAPI v2** | `https://v2.xivapi.com` | 物品/NPC/副本等 sheet（**row 不含 patch 欄**） | patch 一律走 Teamcraft，不靠 XIVAPI |
| **Teamcraft 台服技能名** | `raw.githubusercontent.com/…/libs/data/src/lib/json/tw/tw-craft-actions.json`（433 筆）與 `tw/tw-actions.json` | 製作技能的台服官方名（製作、加工、比爾格的祝福、崇敬、闊步、改革、掌握…） | 建 [`data/craft-actions.json`](../data/craft-actions.json)。**id 要照 Teamcraft 模擬器的技能 id 取**——同一份表裡混著 7.0 已移除的舊技能（注視製作／專精絕技…），照名稱猜會取到廢技能。腳本 [`scripts/build-craft-sim.mjs`](../scripts/build-craft-sim.mjs) |
| **Teamcraft 台服說明文** | `…/tw/tw-craft-descriptions.json`、`…/tw/tw-action-descriptions.json`、`…/tw/tw-item-descriptions.json` | 技能／道具的台服說明全文 | **挖官方術語的地方**：作業狀態「高品質／最高品質」在秘訣與集中加工的說明裡，「結實／安定／高效／長持續／大進展」在素材奇跡的道具說明裡，「內靜」「工匠的良機」「高難度配方」也是這樣確認的。查不到的詞就是台服沒有對應字串，**不要自己翻** |
| **XIVAPI CraftAction／Action** | `v2.xivapi.com/api/sheet/CraftAction`、`/sheet/Action` | 製作技能的 `Cost`（CP）、`ClassJobLevel`、英文名 | 校驗用：`build-craft-sim.mjs` 逐項比對硬寫的 CP／等級，不符會印警告（目前 36/36 相符）。**效率不在 sheet 裡**，只能用社群常數 |
| out_data/cfc-content.json | 本機 | ContentFinderCondition id → InstanceContent id | dungeons patch 橋接（dungeons.id 是 CFC，Teamcraft instancecontent 是 InstanceContent）。**幻化配裝圖鑑也靠它**把取得方式裡的副本 id 解成台服官方名（裝備類 99.95% 解得出來） |
| **Teamcraft 台服分類名** | `raw.githubusercontent.com/…/libs/data/src/lib/json/tw/tw-item-ui-categories.json` | ItemUICategory id → 台服繁中分類名 | 建 [`data/item-categories.json`](../data/item-categories.json)（112 筆）。與 `build-items.mjs` 寫進 `items.json` 的 `category` 同源，所以「分類名 → id」保證對得起來。腳本 [`scripts/build-item-categories.mjs`](../scripts/build-item-categories.mjs) |
| **ffxiv.consolegameswiki.com** | `/wiki/Contemporary_Warfare:_{Defense,Offense,Magicks}` | 小隊隊員轉職：哪本教材能換成哪些職業、售價與軍銜門檻 | 人工查證，非 API。三本各 3000 軍票、需一等軍銜；守勢→劍術師/斧術師、攻勢→格鬥家/槍術師/弓箭手/雙劍師、魔法→幻術師/咒術師/秘術師。**道具繁中名一律查 `data/items.json`（15772–15774），不要簡轉繁**。寫進 `squadron.json` 的 `kind:"classChangeBook"` |

README 的「資料來源」表為總覽；本表為這幾次回填實際用到的細節。

---

## 2. patch（版本）欄位

台服當前版本門檻寫在 [`data/_meta.json`](../data/_meta.json) 的 `gamePatch`（目前 **7.21**）。
判定台服在哪一版的方法：拿 Teamcraft 台服語系檔 `tw/tw-items.json` 的 id 去對 `patch-content.json`→`patch-names.json`，取最高版本（2026-08-11 實測 7.2／7.21 皆滿、7.25 起 0 件）。
前端 [`assets/js/patch-gate.js`](../assets/js/patch-gate.js)：`條目 patch > gamePatch → 台服未開放 → 隱藏`；patch 未知者不隱藏。

| 範圍 | 來源 | 腳本 |
|------|------|------|
| 收藏檔 mounts/minions/emotes/barding | ffxivcollect `patch`（權威；既有手動 patch 多錯位） | [`scripts/patch-backfill.mjs`](../scripts/patch-backfill.mjs) |
| 結構表 items/recipes/npcs/dungeons/gardening/triple-triad | Teamcraft patch-content（反查）；dungeons 經 cfc 橋；recipes 用產物 itemId；triple-triad 用 sources[].instanceId | [`scripts/patch-backfill-all.mjs`](../scripts/patch-backfill-all.mjs) |
| 無來源表 gathering/maps/fishing-spots/monsters/squadron | 站內 patch 反推（代理）：gathering←物品最早、fishing-spots←魚最早、maps←副本名/region、monsters←出沒地圖/掉落、squadron←3.4 系統開放 | [`scripts/patch-backfill-proxy.mjs`](../scripts/patch-backfill-proxy.mjs) |

更新做法：升台服版本時改 `patch-backfill.mjs` 的 `TW_PATCH`（它會把 `_meta.json` 的 gamePatch 一起寫掉）；補新內容 patch 重跑上述三支（皆 dry-run 預設、`--apply` 寫入、fill-only 不覆蓋既有、保留檔案 minified/pretty 格式）。**跑這三支之前要先刷新繁中名快照**（見 §4 流程），否則新開放的條目會缺繁中名。

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

1. 升台服版本 → **先** `node scripts/build-tw-items-msgpack.mjs --apply`（刷新繁中名快照）→ `node scripts/build-items.mjs`（items.json 收下新物品）。
2. 改 `patch-backfill.mjs` 的 `TW_PATCH` → 重跑 `patch-backfill.mjs` → `patch-backfill-all.mjs` → `patch-backfill-proxy.mjs`（dry-run 看數字，`--apply` 寫入）。
3. 補取得來源 → 重跑 `backfill-sources.mjs`（只補新空缺）。青魔特殊來源 → 改 `patch-blue-magic-totems.mjs` 的 `FIX` 表。
4. 補新開放條目的繁中名 → `node scripts/patch-tw-names.mjs --apply`（魚／園藝／鳥鞍／隨從，來源＝items.json）。
5. 重建衍生檔（`build-items-lite`／`build-items-market`／`build-item-categories`／`build-market-sources`）→ `minify-data --apply` → `sync-meta --apply`。
6. 製作模擬器的兩份表跟著 `recipes.json` 走 → `node scripts/build-craft-sim.mjs` → **`node scripts/validate-craft-sim.mjs`**（它會順便用 XIVAPI 校驗技能 CP／等級，官方調過技能就會在這裡報出來）。
7. 跑 `node scripts/validate-data.mjs` 驗證（count 一致、無粗略 patch、覆蓋率），改過 `assets/` 再跑 `bump-sw-version.mjs`，commit。

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

---

## 6. 幻化配裝圖鑑（tools/glamour/）如何消費主庫

2026-07-28 起本站**只有一份物品資料庫**。幻化配裝圖鑑原本自帶的 `資料來源/`（104MB，
cycleapple/ffxiv-item-search-tc 快照）已移除，改由 [`tools/glamour/scripts/maindb.py`](../tools/glamour/scripts/maindb.py)
把主庫轉成該子專案原本的欄位形狀。移除理由與稽核數字見[專案慣例與記憶 §4.14](專案慣例與記憶.md#414-子專案自帶一份資料庫遲早脫鉤2026-07-28幻化配裝圖鑑的教訓)。

| 圖鑑要的東西 | 來自主庫 | 轉換重點 |
|---|---|---|
| 繁中名／分類／等級／職業／patch | `data/items.json` | `icon` 路徑 → 數字 id；`equip.jobs` 陣列 → `classJobCategoryName` 空白字串；有 `equip` 才給 `equipStats`（＝可裝備判定） |
| `categoryId`（1–49＝裝備） | `data/item-categories.json` | 用分類**名稱**反查 id（主庫 items 只存名稱） |
| 取得方式 | `out_data/obtainable-methods.msgpack`（**原始版**，不是 `data/obtainable-methods.json` 摘要版） | 副本 id→`cfc-content.json`→`dungeons.json` 名；NPC/地名→`npcs`/`places.msgpack`；任務→`tw-quests.json`；怪物→`monsters.json` 的 **`baseId`**；軍票兌換（貨幣 20/21/22）另補一條 `gcshop` |
| 製作 | `data/recipes.json` | `jobId` → `craftType`／`craftTypeName` |
| 日／英／簡中名 | `out_data/{ja,en,cn}-items.msgpack` | 改版新增的裝備由 `build_item_fallback.py` 就地向 XIVAPI 抓，不必手動補 |

驗收：`py tools\glamour\scripts\check_maindb.py`（檢查齊全度、msgpack 是否解得開、副本名解析率）。
