# 專案進度（單一進度來源）

> **給 Claude / 後續對話的指示**：開始任何工作前先讀本檔。完成任何功能或資料變更後，**必須更新本檔**（狀態表 + 更新紀錄），並同步 `data/_meta.json` 的 status。
> 規格細節見 `docs/feature-specs.md`，資料格式見 `data/SCHEMA.md`。

**最後更新**：2026-06-16（移除肖像/時尚裝備/B怪/優雷卡/製作利潤計算機/無人島等6項功能；index.html section-count 更新；風脈泉追蹤器完成）
**網站**：https://seagod99.github.io ｜ GitHub Pages 純靜態 ｜ 遊戲版本 7.2

---

## 一、工具頁面狀態（完整清單，對應 feature-specs.md 編號）

狀態用語：**完成**｜**開發中**（已有頁面，待驗收）｜**規劃中**（未開始）｜**擱置**

### 日常工具

| # | 工具 | 路徑 | 狀態 |
|---|------|------|------|
| — | 入口頁面 | `/index.html` | 完成 |
| 1.1 | 天書奇談計算器 | `/tools/wondrous-tails/` | 完成（Monte Carlo） |
| 1.2 | 仙人微彩計算機 | `/tools/cactpot/` | 完成（期望值） |
| 1.3 | 限時採集節點查詢 | `/tools/gathering/` | 完成（改接 gathering.json/items.json/maps.json，limited 225 筆→213 筆顯示，篩選/排序/追蹤清單/Teamcraft flag 補齊，06-15重做） |
| — | 天氣預報 | `/tools/weather/` | 完成（改用共用模組 assets/js/eorzea-weather.js，天氣表接 maps.json weatherRates，mapId 統一，06-15重做） |
| 1.5 | 風脈泉追蹤器 | `/tools/aether-currents/` | 完成（31 地區 303 個風脈泉，任務型151筆/野外型152筆，座標暫無，06-16新增） |
| 1.6 | 時尚品鑑推薦 | `/tools/fashion-report/` | 規劃中（每週更新，需半自動） |

### 收藏／成就追蹤（共通規格見 feature-specs 第二章）

| # | 工具 | 路徑 | 狀態 |
|---|------|------|------|
| 2.1 | 坐騎收藏追蹤 | `/collections/mounts/` | 完成（改接 data/mounts.json 385筆+圖片，篩選/追蹤重做，06-15重做） |
| 2.2 | 寵物收藏追蹤 | `/minions/` | 完成（整頁重做，改接 data/minions.json+本機圖示，source 欄位修正，06-15重做） |
| 2.3 | 樂譜收藏追蹤 | `/collections/orchestrion/` | 完成（接 data/orchestrion.json 724筆/618筆可顯示，版本篩選，06-16新增） |
| 2.4 | 表情收藏追蹤 | `/collections/emotes/` | 開發中（接 data/emotes.json 292筆，頁面已建，繁中名待補：XIVAPI UnlockLink 對應錯誤，需從 tw-items 查表情動作書名稱，06-16新增） |
| 2.5 | 髮型收藏追蹤 | `/collections/hairstyles/` | 規劃中（無資料庫） |
| 2.6 | 鳥鞍收藏追蹤 | `/collections/barding/` | 完成（接 data/barding.json 106筆，部位/來源篩選，15筆無sources標待補充，06-15新增） |
| 2.9 | 探索筆記追蹤器 | `/collections/exploration-log/` | 開發中（接 data/exploration-log.json 340筆，頁面已建，繁中景觀名與座標待補：全英文名+無座標，需從 Teamcraft 或 XIVAPI 補充，06-16新增） |
| 2.10 | 青魔法術收藏 | `/collections/blue-magic/` | 完成（改接 data/blue-magic.json 124筆，副本來源用 contentId 對 dungeons.json 取繁中名，野外/怪物來源並列，14筆無資料標待補充，06-15新增） |
| 2.11 | 幻卡追蹤 | `/collections/triple-triad/` | 完成（接 data/triple-triad.json 425筆，星級/類型/來源篩選，NPC對戰顯示地點，06-15新增） |

### 戰鬥／副本

| # | 工具 | 路徑 | 狀態 |
|---|------|------|------|
| 3.1 | 配裝規劃器 | 外連 gearing.ffsusu.com | 完成（維持外連） |
| 3.2 | 冒險者小隊計算機 | `/tools/squadron/` | 規劃中（squadron.json 空） |

### 生活職

| # | 工具 | 路徑 | 狀態 |
|---|------|------|------|
| 4.1 | 市場查價工具 | `/market/` | 規劃中 |
| 4.3 | 物品／製作搜尋 | `/tools/item-search/` | 規劃中（items/recipes 已備） |
| 4.4 | 藏寶圖採集點查詢 | `/tools/treasure-maps/` | 規劃中（G8–G18） |
| 4.5 | 園藝配種計算 | `/tools/gardening/` | 規劃中 |
| 4.7 | 釣魚紀錄追蹤 | `/tools/fishing/` | 規劃中（fishes/fishing-spots 已備） |
| 4.8 | 採集紀錄追蹤 | — | 規劃中 |

「開發中」頁面驗收後請改為「完成」並註記日期。

## 二、資料庫狀態（/data/）

已填充（count / 來源 / 最後更新）：

| 庫 | 筆數 | 來源 | 更新 |
|------|------|------|------|
| items | 43748 | tw-items.msgpack + XIVAPI | — |
| maps | 210 | XIVAPI + tw-places（id=Map sheet row id；底圖在 /assets/maps/，缺 8 張待本機補） | 06-11 |
| recipes | 14182 | Teamcraft | — |
| gathering | 733 | Teamcraft nodes（已濾 EventItem 偽 id；141 筆 mapMissing） | 06-11 |
| npcs | 22079 | Teamcraft tw-npcs + 位置 | 06-08 |
| minions | 581 | XIVAPI + items（圖在 /assets/minions/） | 06-05 |
| mounts | 385 | XIVAPI + manual（圖在 /assets/mounts/） | 06-04 |
| triple-triad | 425 | XIVAPI + items（圖在 /assets/triple-triad/） | 06-08 |
| dungeons | 386 | XIVAPI（圖在 /assets/dungeons/） | 06-05 |
| barding | 106 | XIVAPI + tw-items（圖在 /assets/barding/） | 06-04 |
| blue-magic | 124 | XIVAPI | 06-09 |
| monsters | 14361 | datamining-cn + Teamcraft + XIVAPI | 06-09 |
| obtainable-methods | 36336 | mixed | 06-08 |
| fishes / fishing-spots | 1104 / 307 | fish-tracker + items（spots 已補 coords.mapId） | 06-11 |

仍為空（0 bytes）：emotes、exploration-log、orchestrion、squadron、fishing（由 fishes.json 取代）。

aether-currents.json 已建立（06-16）：31 地區 303 筆，schema 版本 1，任務型含繁中任務名，野外型座標暫設 null。

注意：`data/_meta.json` 的 status 欄已過時（06-04 之後沒更新），待同步。

建置腳本在 `/scripts/`（build-*.mjs、download-*.mjs），本機跑，需 `npm i`（@msgpack/msgpack、sharp）。

## 二之一、資料庫連結對應驗證（2026-06-10 全量檢查）

### 【已修復 2026-06-11】mapId 兩套 ID 空間不一致

**已完成**：maps.json 重 key 成遊戲 Map sheet row id 並擴充至 210 張；fishing-spots 307 筆全補 coords.mapId；gathering 清除 EventItem 偽 id（965→733 節點）。mapId 類斷鏈 17444/17958/524 → 全部歸零。詳見 `docs/地圖ID統一修正計畫.md` 執行結果。底圖 8 張待本機補抓（`docs/待補底圖清單.md`）。以下保留原始問題紀錄：

`maps.json` 用的是**自編連號 id**（2–305，手動策展 67 張）；但 Teamcraft 來源的庫（npcs、monsters、gathering）用的是**遊戲 Map sheet row id**。例：紅玉海在 maps.json 是 83，monsters/npcs 引用的是 371；庫爾札斯西部高地 maps=60 vs 引用 211；雷克蘭德 maps=100 vs 引用 491。

- 受影響：npcs 17444 筆、monsters 17958 筆位置、gathering 897 筆對不到 maps
- **更危險的是「對得到的」**：ARR 低編號兩套剛好重疊（如 mapId 2=格里達尼亞新街兩邊一致），其餘可能默默對到錯的地圖
- 另 fishing-spots 用 `territoryId`（TerritoryType id，又是第三套），gathering 的 `coords.zoneId` 同為 territory 系
- **修法**：將 maps.json 重新 key 成遊戲 Map sheet row id（fix-mapkeys.mjs 已會打 XIVAPI Map sheet，可取 row_id 回填重 key），並補齊缺的野外/副本地圖；fishing-spots 補 TerritoryType→Map 對應。修完所有庫的 `coords.mapId` 即自動對齊
- gathering 另有 373 筆 mapId=0（無地圖資訊）

### 【預期內，不用修資料】台服未開放造成的斷鏈（前端須過濾隱藏）

| 連結 | 斷鏈數 | 說明 |
|------|--------|------|
| recipes.itemId → items | 2308 | 其中 284 筆 itemId=0（jobId 10/12/13/0）；其餘為台服未開放成品 |
| recipes.ingredients → items | 2528 | 同上（如 7.x 素材） |
| gathering.items → items | 468 | 其中 352 個為 2000000+ 的 EventItem 偽 id，建議 build 時過濾 |
| triple-triad.sources.npcId → npcs | 66 | npcs.json 只收有繁中名+座標者 |
| fishes.itemId → items | 35 | 台服未開放魚 |
| fishes.bait → items | 81 | 同上 |
| fishes.spotId → fishing-spots | 203 | spots 只收 307 個有繁中資料者；另 31 筆魚 spotId=null |
| obtainable-methods 內 currency/npc | 233 / 699 | 同上 |

### 【已驗證通過】ID 空間總檢查（06-10 全部做完名稱交叉比對，mapId 是唯一的空間不一致）

用「引用端自存名稱 vs 目標庫同 id 名稱」比對，排除默默對錯的可能：

- triple-triad.npcId ↔ npcs：864 筆全部同名，通過（同一套 ENpc id）
- minions.itemId ↔ items：521 筆名稱相容，通過；fishes 1069 筆通過；om.currency 15726 筆通過
- om.npcs ↔ npcs：38062 同名，僅 40 筆譯名不一致（如 茲姆特/茲姆圖，同 id 非錯對）→ 前端以 npcs.json 名稱為準
- obtainable-methods 36336 個 key 全對 items，通過；fishing-spots.fishes ↔ fishes 通過
- blue-magic.learnFrom.contentId → dungeons：**id 空間相同**（抽查同內容，如 contentId 17=天狼星燈塔），但 detail 字串是簡轉繁、與 dungeons 台服名不同 → 前端顯示時應用 contentId 查 dungeons 名稱，不要直接顯示 detail

### 【資料缺口】順帶發現（非 ID 問題）

- **dungeons.rewards 與 unlock.questId 完全沒填**（0/386）——先前判定「無斷鏈」是因為陣列全空，屬未填充而非已驗證
- blue-magic.learnFromMob 74 筆是純文字怪物名（含英文括註），無 id，無法連 monsters.json → 日後做青魔收藏頁時需轉 id
- mounts.json 沒有 itemId 欄位（minions/barding 都有）→ 可上市坐騎無法連 items/市場查價，建議補

## 二之二、資料內容／繁中化／腳本改進清單（2026-06-10 體檢）

### 重要發現：Teamcraft 有完整 `tw/` 繁中資料夾（官方台服譯名）

`https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/tw/`
已確認存在：`tw-items`、`tw-npcs`、`tw-npc-titles`、`tw-item-ui-categories`、**`tw-places`（PlaceName id 為 key，連副本內部地名都有）**、**`tw-mobs`（BNpcName id 為 key，怪物台服名）**。其他 tw-* 檔（如 tw-mounts）待逐一確認。
**原則升級：凡 Teamcraft tw/ 有官方譯名一律優先；中國服+OpenCC 只當 fallback。** OpenCC 有過度轉換問題（例：dungeons 的「佈雷福洛克斯」，台服官方是「布雷福洛克斯」，見 tw-places id 1067）。

### A. 繁中化缺口（依嚴重度）

| 庫 | 問題 | 修法 |
|----|------|------|
| mounts | ~~282/385 無繁中名、無 itemId~~ **已修（06-11）**：itemId 348/385、繁中名 337/385（缺 48 筆=台服未開放）。tw-mounts.json 不存在，走 itemId→tw-items（259）＋CN+OpenCC（56），nameSource 欄區分。**遺留：原 103 筆手動名大量錯位（78/100 配錯坐騎），sources/patch 可能同樣錯位，需人工校對** | 完成 |
| monsters | ~~14361 筆名稱全是簡轉繁~~ **已修（06-11 本機跑 patch-monster-names.mjs）**：改名 2381、官方同名 11040（皆標 nameSource:"tw-mobs"）、tw-mobs 無資料保留簡轉繁 793（另佔位 147） | 完成 |
| dungeons | ~~OpenCC 過度轉換~~ **已修（06-11）**：校正 108/386（含 託託/托托、利維亞桑→真 利維坦殲滅戰 等官方譯名差異），35 筆台服未開放保留。注意 tw-places 沒有副本任務全名，實際用 **tw-instances.json + CFC raw 對應**（patch-dungeon-names.mjs，含離線快取） | 完成，報告見 docs/dungeons-名稱校正報告.md |
| blue-magic | learnFrom.detail 是簡轉繁 | 前端用 contentId 查 dungeons 名（已記於二之一） |
| barding | ~~itemId 全 null~~ **已修（06-11）**：itemId 100/106（6 筆遊戲內無道具屬正常）；12 筆無繁中名全屬台服未開放，依原則不補 | 完成 |
| minions 61／npcs 59／monsters 75／triple-triad 4 | 無繁中名 | 台服未開放，預期內，前端隱藏即可 |

### B. 內容缺口

- **dungeons**：patch、expansion、unlock、bosses、rewards 386 筆全空——只有基本欄位，副本相關功能做之前要補（expansion/patch 可由 ContentFinderCondition 推）
- **sources 欄（收藏頁核心）**：minions 563/581 空、mounts 282/385 空、barding 106/106 空；triple-triad 已填完。這是最耗工的手動部分，建議按「做哪個收藏頁就先補哪庫」
- monsters patch 全空（可由地圖所屬資料片推導）；blue-magic 有 14 筆完全沒有習得來源
- maps weatherRates 已有（天氣演算法工具可直接用）

### C. 取資料腳本（.mjs）改進

1. **抽共用函式庫 `scripts/lib/common.mjs`**：fetchXivapiAll 重複出現在 6+ 支腳本、OpenCC 設定 3 支、tw-items 載入 4 支。統一：XIVAPI 分頁、OpenCC converter、tw-* 載入、信封格式輸出、寫檔
2. **build 完自動化**：每支 build 腳本結尾自動更新 `_meta.json` 的 status/updated（現在手動，已過時一週）＋ 自動跑 validate-links.mjs（待建，見地圖計畫第 1 步）
3. **譯名來源優先序固定為**：Teamcraft tw/ → 經 itemId 連 tw-items → CN datamining+OpenCC → nameEn+nameMissing 標記。寫進 SCHEMA.md
4. OpenCC 轉換結果若有官方對照來源，build 時做 diff 報告（抓「佈/布」這類過度轉換）

## 三、固定原則（不可違反）

- 物品繁中名以 `tw-items.msgpack` 為準；對不到 = 台服未開放 → 前端直接不顯示，**不可用 XIVAPI 補名**。
- 職業名用台服官方譯名（SCHEMA.md 1.8 JOBS 字典）。
- 資料信封格式 `{schema,patch,updated,source,count,data[]}`；座標 `{mapId,x,y}` 用遊戲內座標；`sources:[{type,detail,patch}]` 用 _meta.json 的 SOURCE_TYPES。
- 優先做不需維護的純計算功能；不重複造輪子（製作/採集參考 Frozen Rabbit 系列工具）。

## 四、待辦（依優先序）

0. ~~修 mapId ID 空間不一致~~ — **完成（2026-06-11）**，見 `docs/地圖ID統一修正計畫.md` 執行結果。遺留：底圖 8 張待本機跑 `node scripts/download-maps.mjs` 補抓（`docs/待補底圖清單.md`）；新擴充地圖無 weatherRates/patch，需要時再補
1. ~~06-15 驗收結論：四個「開發中」頁面皆未對接已備資料庫，需重新開發前端資料層~~ — **完成（2026-06-15）**：weather（共用模組+maps.json）、gathering（gathering.json/items.json/maps.json+篩選/追蹤）、mounts（mounts.json+圖片）、minions（整頁重做）皆已重做完成。
2. ~~同步 `data/_meta.json` status；更新 README.md 的工具清單（已過時）~~ — **完成（2026-06-15）**：_meta.json 各庫 status 已對應目前完工狀態（mounts/barding/triple-triad/blue-magic/minions），README.md 重寫工具清單與專案結構，並修正 index.html「市場查價＋比價」誤標為可用（market/ 為空目錄）改回即將推出
2-1. 資料品質小修：~~mounts 補 itemId~~（06-11 完成）；mounts sources/patch 人工校對（併入 1c）；om 40 筆 npc 譯名以 npcs.json 為準；blue-magic learnFromMob 轉怪物 id（做青魔頁前）；dungeons rewards/unlock 待填充（量大，做副本相關功能時再填）
2-2. **繁中化升級（見二之二）**：~~mounts 補繁中名~~、~~dungeons 校正~~（06-11 完成）；~~monsters 台服化~~（06-11 完成）；抽 scripts/lib/common.mjs 共用函式庫（未做）
3. ~~幻卡追蹤頁面 sources 待補~~ — **資料已補齊（2026-06-15）**：sources 425/425、NPC對戰地點 864/934 已補（npcs.json+maps.json），待做頁面
4. 無人島攻略工具第一期：動物時鐘（見 `docs/無人島攻略工具規劃.md`，待建 4 個 island-* 庫）
5. 其餘收藏追蹤頁（髮型）
6. 其他規劃：時尚品鑑、冒險者小隊計算機、藏寶圖、園藝配種、釣魚紀錄

## 五、更新紀錄

- **2026-06-16（樂譜/表情/探索筆記三頁新增）**：新增 `/collections/orchestrion/`（data/orchestrion.json 724筆，618筆有繁中名，版本篩選，來源待手動補充）、`/collections/emotes/`（data/emotes.json 292筆，全暫無繁中名待補：XIVAPI UnlockLink 對應到非表情道具，需另查 tw-items；頁面以 nameEn + command 顯示）、`/collections/exploration-log/`（data/exploration-log.json 340筆，全英文景觀名+無座標待補：XIVAPI SightseeingLog 未回傳繁中名與座標，需另查 Teamcraft 資料；頁面以英文名+繁中地區顯示）。三頁入口卡片改為可用，_meta.json 同步 used。
- **2026-06-15（待辦#2：狀態同步與 README 更新）**：README.md 重寫工具清單（對齊 index.html 實際 available/wip 卡片）與專案結構（補上 collections/mounts、barding、blue-magic、triple-triad、minions、tools/weather、gathering）；發現 index.html「市場查價＋比價」卡片標示「可用」但 `market/` 為空目錄（git 從未追蹤過任何檔案），改回「即將推出」避免死連結；確認 data/_meta.json 各庫 status 已對應目前完工狀態。另依使用者指示，待辦#3（製作利潤計算機）順延至優先序最後。
- **2026-06-15（鳥鞍/幻卡收藏頁新增）**：新增 `/collections/barding/`（106筆，部位slot＋取得方式篩選，15筆無sources標待補充）與 `/collections/triple-triad/`（425筆，星級/類型/來源篩選，NPC對戰來源顯示地點，卡牌數值十字排版）。皆套用收藏共通規格。入口頁卡片由「即將推出」改為可用連結。
- **2026-06-15（鳥鞍/幻卡資料補齊）**：新增 `scripts/patch-barding-sources.mjs`，比對 obtainable-methods.json 補上 barding.json sources 91/106 筆（itemId=null 6筆、無對應資料 9筆未補）；新增 `scripts/patch-triple-triad-locations.mjs`，用 npcs.json（npcId→coords）+ maps.json（mapId→繁中地名）補上 triple-triad.json 中 NPC對戰 sources 的地點資訊 864/934 筆（70筆找不到對應NPC）。兩者皆為「待做頁面」前置資料準備，_meta.json 同步更新。
- **2026-06-15（青魔法術收藏新增）**：新增 `/collections/blue-magic/`，套用收藏共通規格（進度條/已習得勾選/篩選/搜尋/匯出匯入）。資料接 data/blue-magic.json 124筆，副本來源（learnFrom.type=副本）改用 contentId 查 data/dungeons.json 取得正確繁中名（detail 簡轉繁字串不可直接用）；野外來源用 detail；learnFromMob 一併顯示。圖示用 XIVAPI v1 網址。14 筆無習得資料標示「待補充」。入口頁卡片由「即將推出」改為可用連結。
- **2026-06-15（重做完成）**：四頁面資料對接重做全部完成。新增共用模組 `assets/js/eorzea-weather.js`（calcSeed/getWeatherAt/initWeatherTables 等，weather 與 gathering 共用 ET 換算）；weather 改用 mapId 統一、天氣表接 maps.json weatherRates；gathering 改接 gathering.json(733筆，limited 225→213筆顯示)/items.json/maps.json，補篩選（職業/版本/地圖/類型）、排序、追蹤清單（localStorage）、Teamcraft flag複製；mounts 改接 mounts.json 385筆+圖片；minions 整頁重做改接 minions.json+本機圖示。四頁面狀態由「開發中」改為「完成」。
- **2026-06-15**：四頁面驗收（weather/gathering/mounts/minions）——發現皆為草稿/示範資料，未對接已備資料庫，狀態改標註具體缺陷；待辦#1重寫為「四頁面資料對接重做」，順序：weather共用模組 → gathering → mounts → minions；製作利潤計算機（原#4）順延至此之後。
- **2026-06-11（第二輪）**：mounts 補 itemId 348/385、繁中名 337/385（nameSource：tw-items 259／cn-opencc 56；發現原 103 筆手動名大量錯位已覆蓋，sources/patch 待人工校對）；barding 補 itemId 100/106；dungeons 名稱台服化校正 108/386（tw-instances + CFC 對應，報告 docs/dungeons-名稱校正報告.md）；monsters 本機跑 patch-monster-names.mjs 完成台服化（改名 2381／同名 11040／無資料 793）；build-mounts/build-barding/build-monsters/patch-dungeon-names 同步更新。

- **2026-06-11**：地圖 ID 統一修正完成（待辦 #0）。maps.json 重 key 成遊戲 Map sheet row id 並擴充 67→210 張（地名 tw-places 優先）；fishing-spots 307 筆補 coords.mapId（territory→map 對應）；gathering 濾除 EventItem 偽 id 356 次、剔除 232 個純偽 id 節點（965→733）、141 筆 mapId=0 加 mapMissing 標記。新增 scripts/validate-links.mjs（全庫連結驗證）、rekey-maps.mjs；改 build-fishing / build-gathering / download-maps。mapId 類斷鏈 17444＋17958＋524 → 全部歸零。SCHEMA.md 明文 mapId=Map sheet row id；_meta.json 同步 maps/gathering/fishes/fishing-spots。底圖 8 張待本機補（docs/待補底圖清單.md）。
- **2026-06-10**：建立本進度文件；盤點 repo 實際狀態（比先前紀錄多了 weather/gathering 工具頁、mounts/minions 收藏頁、dungeons/barding/blue-magic/monsters/obtainable-methods/fishes 等資料庫）。
- 2026-06-09：blue-magic、monsters 資料更新。
- 2026-06-08：npcs（22079）、triple-triad（425）、obtainable-methods、fishes/fishing-spots 完成。
- 2026-06-05：minions（581）、dungeons（386）完成。
- 2026-06-04：mounts、barding 完成；_meta.json 最後更新。
- 2026-06-02：風脈泉 aether-currents 決定擱置。
- 2026-05-31：無人島攻略工具規劃完成。
- 2026-05-29：統一資料庫架構建立（SCHEMA.md）。
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        