# 專案進度（單一進度來源）

> **給 Claude / 後續對話的指示**：開始任何工作前先讀本檔。完成任何功能或資料變更後，**必須更新本檔**（狀態表 + 更新紀錄），並同步 `data/_meta.json` 的 status。
> 規格細節見 `docs/feature-specs.md`，資料格式見 `data/SCHEMA.md`。

**最後更新**：2026-07-23（全站優化第二輪：四頁遷入共用引擎、引擎支援子項目／分頁、items-lite 瘦身、SW 快取版本自動化、刪除未使用資產，見更新紀錄）
**網站**：https://seagod99.github.io ｜ GitHub Pages 純靜態 ｜ 台服版本 **7.15**（＝`data/_meta.json` 的 `gamePatch`，全站版本閘門唯一真實來源；台服尚未開放到 7.2）

---

## 一、工具頁面狀態（完整清單，對應 feature-specs.md 編號）

狀態用語：**完成**｜**開發中**（已有頁面，待驗收）｜**規劃中**（未開始）｜**擱置**

### 日常工具

| # | 工具 | 路徑 | 狀態 |
|---|------|------|------|
| — | 入口頁面 | `/index.html` | 完成 |
| 1.1 | 天書奇談計算器 | `/tools/wondrous-tails/` | 完成（Monte Carlo） |
| 1.2 | 仙人微彩計算機 | `/tools/cactpot/` | 完成（期望值） |
| 1.3 | 限時採集節點查詢 | `/tools/gathering/` | 完成（改接 gathering.json/items.json/maps.json，limited 225 筆→213 筆顯示，篩選/排序/追蹤清單/Teamcraft flag 補齊，06-15重做；07-23 物品名改讀 `items-lite.json`，載入量 10MB→1.3MB） |
| — | 天氣預報 | `/tools/weather/` | 完成（改用共用模組 assets/js/eorzea-weather.js，天氣表接 maps.json weatherRates，mapId 統一，06-15重做） |
| 1.5 | 風脈泉追蹤器 | `/tools/aether-currents/` | 完成（31 地區 303 個風脈泉，任務型151筆/野外型152筆，06-16新增；07-23 遷入共用引擎的**子項目模式**——卡片＝地區、追蹤單位＝風脈泉，手風琴/地區地圖圖釘/🗺彈窗保留，新增可分享網址、批次標記、排序） |
| 1.6 | 時尚品鑑推薦 | `/tools/fashion-report/` | 完成（頁面 07-03 上線，每週依 [SOP](fashion-report-update-sop.md) 半自動更新；資料 `data/fashion-report.json`，前端自算週次、過期自動顯示存檔卡。**目前更新到 week 442「亞拉戈高位裝扮」verified**（443 提示尚未公布）；07-23 過期橫幅重做——顯示當前週次階段徽章與倒數、外部來源升為主要行動、存檔說明降為次要） |
| 1.7 | 幻化配裝圖鑑 | `/tools/glamour/` | 完成（07-15 由獨立 repo 併入：精選配裝＋Mirapri 社群＋官方套裝 1971 套三檢視，收藏星號、染色/交易徽章、wiki 示意照；07-16 上線資產進版控——縮圖/官方示意照/icons/精選原圖＋mirapri_outfits.js/official_sets.js 共約 850MB 已 push，線上完整可用；**僅 mirapri 原圖 669MB 留本機**（加入會破 Pages 發佈 1GB 上限，彈窗自動退回縮圖），重建後衍生 js 記得 commit；資料管線為 Python（py scripts\update_all.py），細節見 tools/glamour/CLAUDE.md；07-16 介面統整——改用站內共用色票/字體、加「← 水神的工具箱」導覽與頁尾，官方套裝卡不再顯示 alljob 原始 tag） |

### 收藏／成就追蹤（共通規格見 feature-specs 第二章）

| # | 工具 | 路徑 | 狀態 |
|---|------|------|------|
| 2.1 | 坐騎收藏追蹤 | `/collections/mounts/` | 完成（改接 data/mounts.json 385筆+圖片，篩選/追蹤重做，06-15重做） |
| 2.2 | 寵物收藏追蹤 | `/minions/` | 完成（整頁重做，改接 data/minions.json+本機圖示，source 欄位修正，06-15重做） |
| 2.3 | 樂譜收藏追蹤 | `/collections/orchestrion/` | 完成（接 data/orchestrion.json 724筆/618筆可顯示，版本篩選，06-16新增） |
| 2.4 | 表情收藏追蹤 | `/collections/emotes/` | 完成（接 data/emotes.json 292筆；scripts/build-emotes.mjs 重建：繁中名 260/292（Cafemaker 簡中→OpenCC，餘 32 筆為簡中服未開放之最新表情，前端隱藏）；**來源 292/292 全補齊**：預設94+動作指南書163+任務29+成就4+App2；前端加來源顯示+來源篩選（預設/動作指南書/任務/成就/App）；06-22 重建；07-16 加遊戲內分頁篩選（一般/特殊/情感表現，接 category 欄）與卡片分頁標籤） |
| 2.5 | 髮型收藏追蹤 | `/collections/hairstyles/` | 完成（39 筆台服已開放髮型，版本/來源篩選，06-16新增） |
| 2.6 | 鳥鞍收藏追蹤 | `/collections/barding/` | 完成（接 data/barding.json 106筆，部位/來源篩選，15筆無sources標待補充，06-15新增） |
| 2.9 | 探索筆記追蹤器 | `/collections/exploration-log/` | 完成（340筆，繁中景觀名已補齊：cafemaker Name_chs→手動繁化，座標因 XIVAPI SightseeingLog 不回傳而保持 null，06-17景觀名補完；07-23 遷入共用引擎，692→146 行） |
| 2.10 | 青魔法術收藏 | `/collections/blue-magic/` | 完成（改接 data/blue-magic.json 124筆，副本來源用 contentId 對 dungeons.json 取繁中名，野外/怪物來源並列，14筆無資料標待補充，06-15新增） |
| 2.11 | 幻卡追蹤 | `/collections/triple-triad/` | 完成（接 data/triple-triad.json 425筆，星級/類型/來源篩選，NPC對戰顯示地點，06-15新增） |

### 戰鬥／副本

| # | 工具 | 路徑 | 狀態 |
|---|------|------|------|
| 3.1 | 配裝規劃器 | 外連 gearing.ffsusu.com | 完成（維持外連） |
| 3.2 | 冒險者小隊計算機 | `/tools/squadron/` | 完成（squadron.json 103筆，34任務+成長表，成功率計算，06-17新增） |

### 生活職

| # | 工具 | 路徑 | 狀態 |
|---|------|------|------|
| 4.1 | 市場查價 + 比價 | `/tools/market/` | 完成（Universalis 即時價、跨服比價、製作原料樹、URL 深連結 `#item=`；收藏頁「💰 市場行情」連此） |
| 4.2 | 軍票變現排行 | `/tools/gc-exchange/` | 完成（軍票／雙色寶石兌換品即時市價，每單位變現 gil） |
| 4.3 | 物品／製作搜尋 | `/tools/item-search/` | 規劃中（items/recipes 已備） |
| 4.4 | 藏寶圖採集點查詢 | `/tools/treasure-maps/` | 完成（G1–G17 挖寶點，地圖標點＋座標） |
| 4.9 | 幻巧戰助手 | `/tools/faux-hollows/` | 完成（16 盤形×252 擺法，自動辨識、機率計算） |
| 4.5 | 園藝配種計算 | `/tools/gardening/` | 完成（107種植物，正查×反查，data/gardening.json，06-17新增） |
| 4.7 | 釣魚紀錄追蹤 | `/tools/fishing/` | 完成（fishes.json 1449筆，大魚/限時/天氣篩選，追蹤進度，06-17新增；07-16 參考魚糕重做卡片——固定欄位釣場/釣餌/時間/天氣、ET 24h 時間窗 bar、竿型 !/!!/!!! 與提鉤章、天氣鏈前→今、直感標籤，加「地區」篩選對應遊戲內釣魚手帳分頁；07-23 遷入共用引擎——分頁 60、預設依開窗時間排序、可分享網址、批次標記；ET 時鐘/目標魚面板+鬧鐘/地圖檢視/詳情彈窗皆保留） |
| 4.8 | 採集紀錄追蹤 | `/tools/gathering-log/` | 完成（gathering.json 670 可顯示節點/1243 件產物，採礦工/園藝工，物品勾選追蹤，06-17新增；07-23 遷入共用引擎的**子項目模式**＋分頁 40，地圖檢視保留；物品名改讀 `items-lite.json`） |
| 4.10 | 無人島素材／工坊查詢 | `/tools/island/` | 完成（07-23 新增，第一期）：三分頁——**工坊生產** 81 筆（時數／價值／每小時／主題／工房等級，可依時數・等級篩選與四種排序）／**素材反查** 109 素材依取得方式分組，顯示採集**區域**（中心＋半徑）、農場種植、牧場產出、製作，並反查用途／**採集地圖** 島嶼底圖＋48 個採集區域圓圈、地上洞窟分層。分頁與篩選同步網址可分享 |

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
| fishes / fishing-spots | 1449 / 307 | fish-tracker + items（spots 已補 coords.mapId） | 06-11 |
| items-lite | 43748 | items.json 精簡（只留 id→繁中名，1.3MB；`scripts/build-items-lite.mjs`） | 07-23 |
| island-* 九檔 | 見下 | datamining-cn `MJI*` CSV ＋ items.json（`scripts/build-island.mjs`） | 07-23 |

仍為空（0 bytes）：emotes、exploration-log、orchestrion、squadron、fishing（由 fishes.json 取代）。

aether-currents.json 已建立（06-16）：31 地區 303 筆，schema 版本 1，任務型含繁中任務名，野外型座標暫設 null。

hairstyles.json 已建立（06-16）：39 筆台服已開放髮型，來源 Teamcraft items.json + tw-items.msgpack + XIVAPI icon；10 筆台服未開放（隱藏）。

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
4. 無人島攻略工具：**資料層已建置完成（2026-07-23）**，見 `docs/無人島攻略工具規劃.md`。9 個 `data/island-*.json` 已產出、validate 全過；素材/製作/建築素材/收購/等級**台服繁中名 100% 覆蓋**（人工製作 28 筆已與 Teamcraft 逐筆對過素材，28/28 一致）。**第一期改為「素材／製作查詢」**（零卡點，可立即開工）；動物時鐘順延，卡在 43 筆動物名與出現條件 datamine 拿不到、需人工從台服抄錄（填 `data/island-names-tw.json`）
5. 其餘收藏追蹤頁（髮型）
6. 其他規劃：時尚品鑑、冒險者小隊計算機、藏寶圖、園藝配種、釣魚紀錄

## 五、更新紀錄

- **2026-07-23（無人島第一期修正：依使用者回饋改正四處錯誤）**：初版上線後使用者指出四個問題，全數修正並回頭補齊資料層。
  - **① 不再列出人工製作**：主清單改為只有**工坊生產**（人工製作仍保留在素材反查的「用在哪」反查，那是有用的）。
  - **② 經濟型製作的使用情境弄錯了，換了資料來源**：初版拿 Teamcraft `recipes.json` jobId −10 當「配方清單」呈現，看起來像玩家自己合成——**實際上工坊生產是「指派後等待時數產出、賣掉換貨幣」的排程機制**。正確來源是 **`MJICraftworksObject`**（初版根本沒用到這張表），它給的正是排程要看的東西：**製作時數、價值、主題（連續生產同主題有效率加成）、工房等級需求**。新增 `data/island-craftworks.json`（81 筆，台服名 81/81）與 `island-themes.json`（16 主題，簡中待補）。頁面加上使用情境說明、時數／等級篩選與「每小時價值」排序。
  - **③ 採集點不是單一地點**：`MJIGatheringItem` 帶 `Radius`（75~200 世界單位）——那是**一片區域**，區域內散佈著很多個可採集物件；初版畫成單一圖釘會讓人誤以為只有一處可採。資料層改存 `gathering.area = {mapId,x,y,radius}`（半徑換算成地圖座標單位，1.5~4），地圖改**畫圓形範圍**而非小點，文案也全部改成「區域中心」並明講區域內有多個物件。逐一物件的座標 datamine 拿不到（`MJIGathering` 的 484 列只有 GatheringObject 參照、無座標）。
  - **④ 收購貨幣名稱是我編的**：初版寫「貝幣」——`MJIDisposalShopItem.Currency` 只是個 byte，datamine 沒有給貨幣名，**這違反了「不憑印象」鐵則**。已把收購資訊從頁面全數移除；`island-shop.json` 保留數值但註明在拿到台服官方貨幣名前不顯示。
  - **順帶修正：種子／作物方向反了**。`MJIItemPouch.Crop` 不為 0 者**本身是種子／芽塊**（如「海島甘藍的種子」），它指向的 `MJICropSeed.Item` 才是收成的作物。欄位由 `seedItemId` 正名為 `growsIntoItemId`；素材分組拆出「農場種子」與「農場作物」（20 種種子中有 4 種本身也可採集，會歸到採集組，因為那才是取得方式）。
  - **無來源素材誠實標示**：7 種素材（香薺／石榴石原石／雲杉原木／錘頭鯊／銀礦／長臂蝦／貓耳小員票據）在 MJI 各表裡查不到取得方式，頁面顯示「本站資料尚未涵蓋」並說明原因，不臆測。
  - 驗收：jsdom 無人島頁 25/25、首頁 4/4；validate-data 0/0。

- **2026-07-23（無人島第一期上線：素材／製作查詢頁）**：`tools/island/` 新增，三分頁——製作清單（134 筆配方，人工 28＋經濟型 106；25 筆台服未開放依鐵則隱藏）、素材反查（109 素材，「怎麼拿」含採集座標／農場種子／牧場動物數／製作／收購價，「用在哪」反查配方與建築）、採集地圖（島嶼底圖＋48 點，地上／洞窟分層，點圓點看詳情）。分頁／篩選／選中素材／圖層皆同步網址可分享。
  - **不吃 collection-tracker 引擎**：這是查詢工具不是追蹤頁，沒有「已擁有」概念，硬套引擎會多出無意義的進度條與勾選。共用的是 common.css／tool-header／map-modal。
  - **素材分類不用 datamine 的分類名**（只有簡中，依鐵則不簡轉繁），改由資料本身推導取得方式（有 gathering→採集、有 seedItemId→作物、在動物 rewards→畜產、是配方產物→製作產物）。
  - **經濟型製作併進資料層**：原本頁面要顯示這 106 筆得載 4.3MB 的 `recipes.json`；改由 `build-island.mjs` 從 jobId −10 取出併入 `island-recipes.json`（134 筆），前端只載一份小檔。
  - 首頁卡片（生活職 7→8 項）、`assets/js/nav.js` 命令面板、README 工具表同步；SW 快取版本已 bump。
  - 驗收：jsdom 無人島頁 22/22、追蹤頁回歸 157/157、各頁特有功能 35/35、首頁 4/4；validate-data 0/0。

- **2026-07-23（無人島資料層建置＋規劃重寫；每日待辦否決）**：
  - **否決「每日／每週待辦清單」**（README「規劃中」移入「已否決」）：遊戲內本來就能快速看到當前待辦，工具站再做一份是重複造輪子。
  - **無人島資料層完成**：新增 [`scripts/build-island.mjs`](../scripts/build-island.mjs)，由 `thewakingsands/ffxiv-datamining-cn` 的 `MJI*` CSV 產出 9 個 `data/island-*.json`（原始 CSV 快取於 `out_data/mji-csv/`，47KB，支援 `--offline`／`--refresh`）。**素材 109／人工製作 28／建築＋地標 25／收購 79／等級 20／動物 43／分類 10／地區 6。** validate-data 0 error 0 warning。
    - **走 CSV 不走 XIVAPI v2**：v2 雖有 40 個 `MJI*` sheet，但 schema 沒為它們命名欄位（`MJIAnimals` 只吐 Icon、`MJIRank`／`MJIItemPouch` 回空物件），拿不到資料。
    - **台服繁中名覆蓋**：所有物品類（素材／作物／畜產／成品／建築素材）走 itemId → `items.json`，**100% 有台服官方名**。原規劃最擔心的「參考站是簡中要人工對照素材名」問題**實際上不存在**。
    - **交叉驗證**：人工製作 28 筆與 Teamcraft `recipes.json` jobId −10 逐筆比對，**素材與數量 28/28 完全一致**。
    - **兩個踩過的雷（已寫進腳本註解與規劃文件）**：① `MJIItemPouch`／`MJIRecipe`／`MJIDisposalShopItem`／`MJIBuilding` 的 **row 0（子列 `0.0`）是真資料**，用 `key>0` 過濾會安靜少掉無人島棕櫚葉、開拓用石斧、小島木屋 I；② `Material[]` 指向的是 **`MJIItemPouch` 的 row 而非 itemId**（配方還要再經 `MJIRecipeMaterial` 一層），解錯會拿到不相干的物品。
    - **卡點（已記錄，別重走）**：43 種動物的名稱 datamine 拿不到——`MJIAnimals` 只給 `BNpcBase`，實測 `BNpcBase → 本站 monsters.json.baseId` 是 **7/43 且對到的是錯的**（撞號撈到「緊張的聲音」），`BNpcBase → Teamcraft monsters.json → tw-mobs` 是 **0/43**（Teamcraft 只收有狩獵座標的 2333 隻）。動物的出現時段／天氣同樣不在任何 sheet（屬社群觀測）。**只能從台服遊戲內人工抄 43 筆**，填進 `data/island-names-tw.json`（腳本自動產生樣板）後重跑即合併。建築名 25／分類 10／地區 6 同理（datamining-cn 只有簡中，依鐵則不簡轉繁，`nameCn` 僅供比對、`name` 留 null）。
  - **無人島底圖找到並驗證座標**：底圖其實一直在 `maps.json` 裡——**`id 772`「無名島」**（`nameEn: "Unnamed Island"`，region「？？？？」、type instance），先前沒被認出來是因為它不叫「無人島」。已用 `node scripts/download-maps.mjs --id 772` 下載 `assets/maps/h1m2_01.jpg`（608KB）；XIVAPI 另有 `h1m2/02`／`03`，實測是**未開拓地形**，`01` 才是含村莊建設的完整版。該地圖的 `weatherRates`（碧空25/晴朗45/陰天10/小雨10/薄霧5/暴雨5）**正好就是動物時鐘要用的天氣機率**。
    - **採集點座標換算已解並驗證**：`MJIGatheringItem` 的 X/Y 是世界座標（X −248~765、Y −694~246），走 FFXIV 標準式 `frac = ((world+offset)*c+1024)/2048`、`game = frac*41/c+1`（offset −175/138）。**驗證不是憑公式**：把 48 點畫上底圖，全部落在陸地、且 `mapLayer=1` 的 9 筆（石炭／燈火茸／幻影石／水晶層…全是洞窟產物）緊密聚在東北山區洞窟；對照組把 Y 反轉重畫則有點掉海裡、洞窟點散開 → 確認方向正確。`island-materials.json` 的 `gathering.coords` 已改存站內標準 `{mapId:772,x,y}` 遊戲內座標，可直接餵既有地圖元件。
    - **`mapLayer` 語意確認**：`MJIGatheringItem.Map` 只有 0/1（地區有 6 個故不是地區），1 的 9 筆全是洞窟產物 → **0＝地上、1＝洞窟**，已加 `layerName`。
  - **規劃文件重寫**：[docs/無人島攻略工具規劃.md](無人島攻略工具規劃.md) 依實查結果改版——**分期順序調整為「素材／製作查詢 → 動物時鐘 → 開拓進度表」**（原本動物時鐘排第一，但它是唯一卡人工資料的；素材／製作查詢零卡點可立即開工）。另記錄兩個資料層未解項：採集點座標是 datamine 原始值尚未校準成遊戲內座標、`MJIGatheringItem.Map` 實測只有 0/1 兩值故不是地區（已命名 `mapLayer`，未臆測語意）。

- **2026-07-23（全站優化第二輪：引擎擴充＋四頁遷入＋瘦身）**：接續 07-22 的共用引擎，把剩下四個「各寫各的」追蹤頁也收進來，並修掉一批體檢發現的問題。全部以 jsdom 驗證（本機 headless Chromium 在此環境無法啟動）：**追蹤頁回歸 157/157、各頁特有功能 35/35、時尚品鑑 27/27、限時採集 4/4**。
  - **版本標示對齊**：本檔頁首原寫「遊戲版本 7.2」，但版本閘門的唯一真實來源 `data/_meta.json` 的 `gamePatch` 是 **7.15**（台服尚未開放到 7.2）。文件改為以 `_meta.json` 為準並註明，避免日後照文件誤把 gamePatch 調成 7.2 而放行未開放內容。
  - **`orchestrion` 4 筆粗略 `N.x` patch 修完**（validate-data 由 1 warning → **0 error 0 warning**）。`scripts/fix-orchestrion-patch.mjs` 加**後備來源**：ffxivcollect 對不到時，退回本站 `items.json`（同一顆 itemId，tw-items 來源，精確到 x.y）。白帝竹林 4.x→4.2、月下芳華 4.x→4.3、究極武器（蠻荒神影）5.x→5.2、高貝扎四天王之戰 6.x→6.28；其餘 720 筆不動。
  - **`data/items-lite.json`（新）**：`items.json` 是 10MB，但限時採集查詢與採集紀錄兩頁只用到 `id→繁中名`，卻要整包載完才能畫第一格。新增 `scripts/build-items-lite.mjs` 產出精簡版（`data` 為 `[[id,name],…]` 配對陣列，**1.3MB，省 87%**），兩頁改讀。id 集合與 items.json 完全一致，故「查不到＝台服未開放」規則等價——已用兩頁的實際過濾邏輯比對，節點數／產物名輸出完全相同。市場查價仍讀完整版（需要 marketable／ilvl／icon／category）。
  - **刪除未使用資產**：`jquery-4.0.0.min.js`、`jquery-ui.min.js`、三支 `jquery-ui*.css`、六張 jQuery UI `ui-icons` 圖（合計 448KB）全站 **0 頁引用**；`assets/css/style.css`（524 行舊靛藍亮色調色盤，與現行金/暗色設計系統無關）同樣 0 頁引用——一併移除。另清掉根目錄空的 `market/`（真正的頁在 `tools/market/`）、空的 `assets/js/api/` 與 `data/_test_sync.txt`。
  - **SW 快取版本自動化＋程式碼改 network-first**：`sw.js` 的 `CACHE_VERSION` 原是手寫 `'sgt-v1'`，改了共用 css/js 忘了 bump 就會被舊快取黏住 → 新增 `scripts/bump-sw-version.mjs`，依 `assets/css/*.css`＋`assets/js/*.js`＋`manifest.json`＋`sw.js`（排除版本行）的內容雜湊產生版本（`--check` 可驗證是否過期，idempotent）。另把**同源 .css/.js/.mjs 由 stale-while-revalidate 改為 network-first**——這類檔案「改了就該立刻生效」，SWR 會讓使用者第一次重整仍吃到舊版；資料庫 json／圖示維持 SWR。
  - **時尚品鑑過期橫幅重做**：資料落後當前週次時（如現在資料 442、實際 443），原橫幅只是一段說明文字。改為「本週狀態 → 去哪查 → 存檔說明」的順序：加上**當前週次的階段徽章與倒數**（準備期／評分期，原本過期時完全看不到）、外部來源升為**主要行動**（第一個連結做成實心按鈕），存檔說明降為底部次要資訊。倒數在正常與過期兩種情境共用同一支 ticker。
  - **`minions` 補市場連結**：小方格版型放不下，依 07-22 的建議收進 ⓘ 提示框（提示框釘住後可點）。521/533 隻可上市寵物可直接跳 `tools/market/#item=<id>`。
  - **共用引擎擴充（`assets/js/collection-tracker.js`，四項皆選用、不影響既有 8 頁）**：
    - **`subsOf(entry)` 子項目模式**——有些頁的追蹤單位不是卡片而是卡片裡的東西（風脈泉頁一張卡＝地區、要打勾的是 303 個風脈泉；採集紀錄頁一張卡＝採集點、要打勾的是產物）。設定後 keyOf 收到子項目、進度分母＝子項目總數、卡片 `.owned` 代表「該卡全數完成」、批次標記作用於篩選結果的所有子項目。**單位依 keyOf 去重**（同一件產物出現在多個採集點只能算一件）。
    - **`pageSize` 分頁**——頁碼列（首末頁＋當前頁 ±2，中間省略）、同步到網址 `?p=`（可分享）、任何篩選／搜尋／排序變動回第 1 頁、頁碼超出範圍自動夾回。樣式為 common.css 的 `.ct-pagination`。
    - **`onRender(list, pageSlice, tracker)`**——讓各頁同步自己的附加檢視（地圖標點、目標魚面板）。
    - **`rowsOf(json)`**（風脈泉庫用 `zones[]` 而非 `data[]`）、**`defaultSort`**（釣魚頁預設依開窗時間）、**`exportExtra`／`onImport`**（釣魚頁的目標魚清單跟著匯出匯入走）；匯入改為同時接受 `owned`／`unlocked`／`done` 三種舊鍵名，避免舊備份檔匯不回來。
  - **四頁遷入共用引擎**（各頁只留 header＋一份設定，全部沿用既有 localStorage key 與 keyOf 格式，**進度不會遺失**）：
    - `collections/exploration-log/`（340 筆，692→146 行）：本庫 patch 只到資料片下界（`2.0`…），故用固定對照表而非引擎的 patch 區間；include 不套「name!==nameEn」規則（景觀名有音譯同名者）。
    - `tools/aether-currents/`（31 地區／303 風脈泉，997→約 400 行）：子項目模式。手風琴展開狀態存在 `OPEN` Set，勾選後重畫仍保持展開；地區小進度條、地圖圖釘（294 個）、🗺 地圖彈窗、圖釘↔清單列 hover 連動全部保留。
    - `tools/gathering-log/`（670 節點／1243 件產物，644→約 390 行）：子項目模式＋分頁 40。地圖檢視、底圖缺漏提示、點採集點看詳情卡全部保留；狀態篩選（全採完／部分未採／全未採）改為引擎的篩選標籤。
    - `tools/fishing/`（1449 種，1392→約 1130 行）：分頁 60、預設排序＝開窗時間（可釣中優先）。ET 時鐘、目標魚面板＋開窗鬧鐘、地圖檢視、魚詳情彈窗（竿型／提鉤／餌鏈／直感／未來窗口）、多釣場切換全部保留；「🎯 只看目標」改為引擎篩選標籤，卡片點擊分流（🎯目標／📍地圖／點圓圈勾已釣／點其他開詳情）改由 `onCardClick` 處理。
    - 四頁一併改吃 `common.css`（原本各自複製一份設計 token 與工具列樣式），淨減約 1300 行。
  - **這四頁因此新獲得**：可分享網址（搜尋／篩選／排序／頁碼進 query string，支援上一頁）、批次標記全部／取消全部、排序下拉、搜尋涵蓋來源文字、統一的鍵盤與 ARIA、與其餘 8 頁一致的工具列。
  - **未做**：SEO／og:／sitemap（依使用者指示本站目前不完全公開，暫不處理）。

- **2026-07-22（全站功能面優化 #1–#7）**：一次做完 7 項跨站優化，全部以 jsdom 驗證（本機 headless Chromium 在此環境無法啟動，改用 jsdom 做 DOM 層驗證）。
  - **#1 收藏頁共用引擎**：新增 `assets/js/collection-tracker.js`，把 8 個經典追蹤頁共通的「狀態／進度條＋首頁快照／工具列（搜尋・擁有切換・排序・批次標記・匯入匯出・清除）／標籤篩選／格線渲染／鍵盤與 ARIA」全部收進單一引擎，各頁只留 header＋一份設定（資料位置、卡片樣板、篩選規則）。已遷移 **mounts／minions／barding／orchestrion／emotes／hairstyles／blue-magic／triple-triad** 共 8 頁，每頁 body 由 ~480–690 行縮為 header＋設定。引擎 hook：`include／keyOf／alwaysOwned／searchText／prepare／filters／sorts／card／onCardClick／onCardCreate`＋`gridClass／cardClass／fileBase／schema` 覆寫。特例都保留：emotes 預設表情恆擁有且不可點掉、minions 小方格＋hover 提示框＋數字 id 進度格式（相容既有存檔）、hairstyles 橫向 hs-card、blue-magic 先載 dungeons.json 建 contentId→繁中副本名、triple-triad 的 📍 開地圖不切換擁有。驗收：全 8 頁以真實資料 jsdom 整合測試 48/48、特例 12/12、mounts 互動 18/18。
  - **#2 搜尋涵蓋來源文字**：引擎預設 `searchText` 納入 `sources[].detail`，各頁搜尋框可搜到取得方式（如搜「金碟」「副本名」）。
  - **#3 全站發現性**：(a) 首頁 `index.html` 加關鍵字搜尋框即時過濾工具卡片（Esc 清除、動態更新分類計數、無結果提示）；(b) 新增 `assets/js/nav.js` 跨工具快速切換器（命令面板，`/` 或 Ctrl/⌘K 開啟、方向鍵選擇、含中英關鍵字），由 `theme.js` 以相對站根路徑全站注入（相容 file://）。
  - **#3 後續調整（同日，依使用者回饋）**：(i) 命令面板原本 26 個工具攤平成一長串難用 → 改為**依 4 分類分組**（日常／收藏／戰鬥／生活職，對應首頁分區），搜尋時只留有命中的分類；(ii) 入口原為左下角小圓鈕「很不顯眼」→ 改為**全站固定頂部工具列 `#sgt-topbar`**（sticky top:0、注入為 body 第一個子節點、內層對齊站內 1500px 容器、左＝⚓站名連首頁、右＝加長搜尋欄，點擊開面板）；(iii) 頂列 46px 會蓋住其他頁自身的 sticky 元素 → gc-exchange thead 改 `top:46px`、aether-currents `.zc-map` 與 treasure-maps `.map-side` 改 `top:58px`；(iv) 頂列站名已是全站回首頁入口 → **移除全站 23 頁頁內重複的「← 水神的工具箱」返回鍵**（三種寫法＋麵包屑分隔符一併清掉，保留頁面標題與頁尾連結）；`tools/glamour/` 因未載入 theme.js 無頂列，其返回鍵保留。
  - **#4 收藏連市場**：`mounts／barding／orchestrion` 卡片有 `itemId` 時顯示「💰 市場行情」連結，連到市場查價工具的深連結 `tools/market/#item=<id>`；`tools/market/index.html` 新增初次載入讀 hash（`#item=`／`#node=`／`#craft`／`#lists`）的支援（原本 init 的 replaceState 會洗掉 hash）。點連結不切換擁有（`onCardClick`）。
  - **#5 可分享網址**：引擎把搜尋／擁有切換／排序／各篩選同步到 query string（`?q=&own=&sort=&f_<id>=`），打字用 replaceState、離散操作用 pushState，`popstate` 還原，收藏頁篩選狀態可分享／加書籤／上一頁。（market 與 glamour 先前已各自具備 URL 狀態。）
  - **#6 PWA**：新增 `manifest.json`＋`sw.js`（保守策略：導覽 network-first、同源靜態 stale-while-revalidate、跨源 API 不介入、>5MB 不快取避免撐爆配額）＋錨形 `assets/icons/icon.svg`；由 `theme.js` 全站注入 manifest／圖示／theme-color 並在 https 註冊 SW（file:// 與本機不註冊）。可加到主畫面、離線可查。
  - **#7 API 韌性**：`assets/js/universalis.js` 的 `getJSON` 加指數退避重試（網路錯誤與 429/5xx，4xx 不重試）；新增 `fmtAge()` 與回傳 `fetched` 時間戳；`gc-exchange` 狀態列顯示「市價查詢於 X 前」、失敗訊息標明已自動重試；market 自動受惠於重試（本就有 relTime 新鮮度顯示）。
  - **#3 後續調整（同日，續）**：(v) 全站 top 樣式統一——原本並存三種寫法（`nav 列＋hero`、`nav 列＋自有 header`、`.page-header`／`.site-header`／`.page-head`），其中「nav＋hero」那組還把標題印兩次。依使用者指定，**全部改為藏寶圖頁的 `.tool-header` 樣式**（置中大標＋副標＋金色分隔線），新增共用 `assets/css/tool-header.css`，23 頁全數轉換（首頁與 glamour 除外）。原 hero 內的功能元件（幻巧戰剩餘次數、釣魚 ET 時鐘＋進度條、採集紀錄進度條）保留於標題區下方。標題改用 `<h1 class="tool-title">` 保語意；cactpot／wondrous-tails 的大 emoji 圖示併入標題。驗收：23 頁結構檢查全過（各一個 tool-header＋h1＋divider）、追蹤頁功能回歸 48＋12＋12 全過。
  - **文件飄移修正**：README 釣魚筆數 1104→1449（實際 `fishes.json` count=1449，頁面本就顯示 1449）；本檔工具表 market／treasure-maps 由「規劃中」更正為「完成」（早已上線）。~~**尚待**：gc-exchange／faux-hollows 仍未列入本檔工具表；#4 的市場連結可再擴及 minions~~ → **均已處理（2026-07-23）**：實查工具表已含 gc-exchange(4.2)／faux-hollows(4.9)（此條當時即誤記）；minions 市場連結已補（放進 ⓘ 提示框）。

- **2026-07-20（幻化配裝圖鑑：`job` 職業限制也改由 cjc 推導）**：使用者問「#17 上身的偵察職業是什麼」——那不是 FF14 正式職能名，是投稿者自譯 `スカウト`(Scout)。cjc 103＝ROG NIN VPR＝斥候系防具，只有忍者/劍蛇師能穿。查下去發現 `job` 跟其他欄位一樣是手填的，錯誤同樣多：自創「偵察職業」、把整職能寫成單一職業、只列部分職業（「忍者、劍蛇師」vs「偵察職業」同一 cjc 兩種寫法）、專武填錯職能（月讀太刀填「盾衛職業」，實為暗黑騎士專武）。修法：`build_site.py` 加 `job_from_cjc()`（整職能→群組名／真子集→列具體職業／全戰鬥→全職業／Disciple of Hand-Land→製作-採集），以 `data/xivapi_sets_cache.json` 的 `cjc_names` 為權威，併入 `apply_db_fields()` 建置時重算，`normalize_curated_from_db.py` 同步寫回來源檔（共用同一函式）。實測 47 種 cjc 全部推導正確、精選 104 處 job 校正（#17 上身「偵察職業」→「忍者、劍蛇師」）。前端 `jobCodes()` 用 `、` 拆多職業字串，顯示換法不影響「繁中版可幻化」判定。

- **2026-07-20（幻化配裝圖鑑：精選資料全面稽核，修掉 212 處人工輸入誤差）**：使用者從 #17 上身的版本欄看出資料有誤，回頭用剛回填的 `iid` 逐件比對 DB（500 件），抓出六類錯誤：(1) **版本一律填 7.0** 11 件（實際 7.3/7.4/7.5，#17 上身即是）；(2) **等級不符 152 件**（多數留在預設 Lv.1）；(3) **日文名抄錯 18 件**（濁點／長音／拗音，如 `バルチザン`→`パルチザン`、`ハイアラバン`→`ハイアラガン`）；(4) **英文名由另一語言回譯 19 件**；(5) **台服未實裝卻填自編繁中名 11 件**——違反「繁中名絕不自己翻」鐵則，還害 #10 #12 #13 #14 #15 五套被誤標「🇹🇼 繁中版可幻化」（台服根本穿不出來）；(6) **部位放錯 1 件**。**對照組**：社群配裝 33705 件同樣稽核只有 patch 22／部位 38／繁中名 22 不符（0.1%）、日文名 0 不符——問題全在人工輸入環節，不在資料來源。**修法**：新增 `scripts/normalize_curated_from_db.py`（dry-run 預設，`--apply` 寫入）以 iid 從 DB 重寫 `zh/ja/en/patch/lv`，並在 `build_site.py` 加 `apply_db_fields()`，**每次建置都重算**，來源檔被手改也不會飄（`上身①/②` 標記保留；主觀欄位 source／dye1／dye2／job 不動）。**#01 腳部**是唯一要人工判斷的：原填腿部道具「寄葉五五式禦敵軍褲」，看圖判讀後確認腿部已被「男爵及膝褲」佔用（其染色標籤煤玉黑／羅蘭莓與圖上紅裙黑腰帶吻合），圖上那雙過膝長靴是同系列的「寄葉五五式禦敵軍靴」（33566，官方英文名 YoRHa Type-55 **Thighboots** of Fending），投稿者標成了同系列的「脚衣」；已改正。`health_check.py` 新增**部位對應檢查**（比對 DB 部位）擋這類錯誤，現況 500/500 ✓。缺繁中件數由 106 增為 117（＝清掉自編中文後的真實數字）。

- **2026-07-20（幻化配裝圖鑑：瀏覽器上一頁／下一頁＋可分享網址）**：使用者回報「點選服裝、換頁都沒辦法回到上個動作」——原本整頁狀態都只在 JS 變數裡，網址從不改變，瀏覽器的上一頁等於直接離站。改成把**檢視／篩選／細項／搜尋／排序／頁碼／開啟中的套裝／語言**全部同步到 query string（`?v=sets&p=3&src=raid&d=…&id=…`）：使用者動作用 `pushState`（可回上一步），**打字搜尋、彈窗內上下套、關彈窗用 `replaceState`**（否則每按一鍵就多一筆歷史，要按 20 次上一頁才回得去；關彈窗用 replace 才不會「關掉後按上一頁又開回來」）。`popstate` → `applyURLState()` 還原狀態並把篩選列按鈕／輸入框一起同步回去。副產物是**網址可分享／加書籤**，直接開 `?v=sets&p=3&id=mirage:52660` 會落在該頁並自動開啟該套裝（社群與官方套裝是延遲載入的，載完由 `restorePage()`／`retryPendingModal()` 補上）。過程中修掉兩個 bug：(1) **Bootstrap 在開啟動畫進行中會忽略 `hide()`**，「點開套裝後馬上按上一頁」會關不掉彈窗 → 加 `modalShowing`／`closeAfterShown` 旗標，等 `shown` 事件再關；(2) `populateSrcDetail()` 原本會把「不在選項清單裡」的細項清空，分享連結進站時資料還沒載完就會被清掉 → 改成補一個臨時選項撐著，不再清空。瀏覽器實測（桌機 1440／手機 375）：換頁→開套裝→上一頁（關彈窗、留在原頁）、切檢視／分類→上一頁（按鈕狀態一起還原）、下一頁重做、打字 3 次歷史 +0 筆、彈窗內「所屬套裝」跨檢視跳轉後上一頁回原狀、深連結直開第 3 頁的套裝，全部正常且無 console error。

- **2026-07-20（幻化配裝圖鑑：精選套裝改以道具 ID 紀錄裝備＋卡片一列 6 張）**：(1) **精選裝備 ID 化**——`data/curated_outfits.json` 原本每件只記名稱（zh/en/ja），道具 ID 是 `build_site.py` 每次建置用「名稱精確且唯一」現猜的；**猜不到不會報錯**，該件靜默掉 `iid`，連帶失去徽章（可染／可交易）與 `item_sources.js` 的完整取得方式，改版撞同名或官方改譯名就會踩到。新增 `scripts/backfill_curated_iid.py`（dry-run 預設，`--apply` 寫入；名稱撞名或反查繁中名不符一律拒填並列報告，不亂猜），**500/500 件全數回填、0 對不到、0 名稱不符**；`build_site.py` 的 `build_badge_index()` 加開 id 索引、`stamp_badges()` 改為「有 iid 就以 iid 為準，只有沒 id 的新件才退回名稱比對」；`health_check.py` 新增缺 id 警告（現況 500/500 ✓）。重建後 `curated_outfits.js` 內容不變（原本就 500/500 對得到，這次是把猜的結果固化成紀錄）。(2) **卡片網格加寬**——`row-cols-xl-5` → `row-cols-xl-6` 並補 `lg-5`，級距 2→3→4→5→6；實測 1920/1440/1280 為 6 張、768 為 4 張、375 為 2 張，`PAGE_SIZE` 60 整除 6。

- **2026-07-19（幻化配裝圖鑑：修分類按鈕與細項下拉互斥）**：使用者回報同時選「🪙代幣兌換」＋細項「🪙夢幻帽布料」會篩出 0 筆。原因是兩者**吃不同資料源**——細項已改吃 `item_sources.js` 的完整來源鍵，分類按鈕卻還在看「整套只有一種」的 `e.st`／`e.tags`。「夢幻套裝」整套來源是 `🗓️Starlight Celebration (2010)`（st=`event`），但它的件是用 🪙夢幻帽布料 兌換，於是被分類擋掉。改法：新增 `entryStSet()`，分類也取完整來源鍵的 st 聯集（`stOfKey()` 並補上 build_site.py `ST_KEYWORDS` 的關鍵字覆寫——寶圖→other、各色票→scrip、伊修加德重建／無人島／宇宙探索／友好部族→special，否則 🗺️寶圖 會被 emoji 誤判成 raid、🪙巧手橙票 誤判成 token），讓「細項 ⊆ 分類」恆成立。已用全部來源鍵稽核：官方套裝與配裝兩檢視皆 **0 個細項不被自己的分類涵蓋**。副作用是分類變成「有任一取法屬於這類」而放寬（配裝檢視 📋任務 81→2037、🛒商店 3737→5019、🏝️特殊玩法 0→31），這是正確語意；卡片上的 tag 徽章仍只顯示主要來源，不跟著放寬。

- **2026-07-19（幻化配裝圖鑑：取得方式改吃「完整來源」，修掉四成裝備篩不到的問題）**：**根因**——每件裝備在三份前端資料檔裡都只留一種來源：`pipeline.py` 的 `_best()` 只取優先度最高那個、`build_sets.py` 的 `fmt_piece_source()` 取前兩條、且一件掉多個副本時只寫 `names[0]`＋「等N處」。`資料來源/sources.json` 裡 29645 件中有 **7611 件有多個來源條目**，1324 個副本條目涵蓋 2 個以上副本，等於約四成裝備的其他取法根本沒進前端，用取得方式篩選會「拿得到卻找不到」。**修法**：不把字串複製進三份檔（mirapri_outfits.js 已 10MB），改**以裝備 ID 外連**一份共用表——新增 `tools/glamour/scripts/build_item_sources.py`，掃三份前端 js 用到的裝備 ID（curated/mirapri 的 `iid`、官方套裝的 `id`）產生 `item_sources.js`（`{k:[來源字串],i:{id:[索引]}}`，792 種來源／11721 件／**191KB**，其中 4345 件有多種取法）。來源字串是「正規化來源鍵」（只有 emoji＋來源名，不含價格／NPC 地點／副本類型），讓同一來源在官方套裝（「🗡️副本掉落：X」）與配裝（「🗡️X（迷宮挑戰）」）兩種寫法收斂成同一個選項；副本名再過一次 `build_site.duty_zh()` 補繁中。前端 `pieceSrcKeys()` 優先查表、查不到才用 `srcKeyOf()` 正規化既有顯示字串當退路，篩選／搜尋／彈窗全部改吃這份。**效果**：可篩的來源由 502 種增為 871 種（**398 種來源原本完全篩不到**），命中總數多出 11411 筆；光副本類就有 43 個副本的可見套數增加，其中「地脈靈燈天狼星燈塔」「黑渦傳說破艦島」等多個副本原本是 0 筆。另在三種彈窗（官方套裝／社群／精選）底部新增 **📍取得方式總覽**：以「來源 → 這套哪幾件」反向分組，點來源即以該來源篩選。`update_all.py` 的 full／local 兩條流程都已加入這支（必須排在 `build_site.py` 之後，它吃三份 js 的產出）。瀏覽器實測（桌機 1440／手機 375）：來源表載入 11721 件、細項下拉 681 項、點總覽的來源可正確套用篩選、三種彈窗總覽皆正常，無 console error。

- **2026-07-19（幻化配裝圖鑑：取得方式細項篩選＋官方套裝副本名繁中化）**：(1) **副本名繁中化**——官方套裝（mirage 層）的取得方式來自 consolegameswiki 的 `obtain` 欄，副本名是英文（「🗡️副本掉落：Dohn Mheg」）。`tools/glamour/scripts/build_site.py` 新增 `duty_zh()`／`zh_duty_source()`，以主庫 `data/dungeons.json` 的 `nameEn → name`（已由 `scripts/patch-dungeon-names.mjs` 用 Teamcraft tw-instances 校正成台服官方名）對照，正規化時去掉 wiki 的「 (Duty)」後綴與冠詞 the。57 種英文副本來源全部對到，只剩「🗡️Occult Crescent」（台服未開放，照慣例保留英文，不自行翻譯）。重跑 `py scripts\build_site.py` 產出新的 `official_sets.js`（已 commit）。(2) **取得方式細項篩選**——`tools/glamour/index.html` 在「取得方式」按鈕列後加下拉選單 `#src-detail-select`，可篩到單一來源字串（副本名、商人名、兌換貨幣…）；官方套裝檢視用整套 `source`、配裝檢視用逐件 `source`（878 個細項），選項依 st 分 optgroup、組內按套數排序，並隨上方分類按鈕與檢視切換即時重建（切檢視後失效的選擇自動清空）。配裝檢視的搜尋框也一併納入逐件取得方式（原本只搜名稱/裝備/使用者），與官方套裝檢視一致。瀏覽器實測：官方套裝選「🗡️副本掉落：水妖幻園多恩美格禁園」得 7 套、配裝檢視同副本得 16 套、只選「🎲金碟」時細項收斂為 16 項，無 console error。

- **2026-07-18（時尚品鑑 week 442 更新＋兩項管線發現）**：依 [SOP](fashion-report-update-sop.md) 更新 `data/fashion-report.json` 到 **week 442「亞拉戈高位裝扮」（Allagan on High）verified 版**。本週 4 個提示同為 `High Allagan`（categoryId 256）分佈在身/手/腿/腳，接受清單 **76 件（每部位 19 件）**，映射驗收 76/76、同名歧義 0、無台服名 0。結構單純：每部位＝原版 6 件（巴哈姆特大迷宮掉落）＋威望版 7 件（戰利水晶 ×1500）＋複製品 6 件（可製作・可交易）。染色 6 部位：武器/腳＝果酒紅、頭＝柔彩綠、身/腿＝盜龍藍、手＝葉岩棕。推薦採複製品（可製作／市場板）而非社群驗證版的原版掉落件——兩者同屬本週接受清單、計分相同，複製品可交易故更好取得（已於 easy80 note 說明）。瀏覽器實測（桌機 1440／手機 375）：週次 442 未過期、100/80 分卡與染色標籤、6 格染色表、76 件完整清單皆正確，無 console error。
  **本次兩項新發現（已寫入 SOP）**：(1) **`out_data/tw-items.msgpack` 已損毀**——第 11854 筆附近有字串長度前綴與實際位元組不符，`@msgpack/msgpack` v3 解碼中途失步報錯（`en-items.msgpack` 正常）。本次改以 `data/items.json`（本身即由 tw-items 產出，43748 筆含 `name`＋`marketable`）取代，效果相同。**⚠️ 所有 `scripts/build-*.mjs` 都直接 decode 這個檔，重建任何資料庫前需先修復或改道**。(2) **染劑映射新增「通用版優先」規則**——本週 Pastel Green 對到 8737「EX柔彩綠染劑」（商城限定），同色的遊戲內可取得版本是 13711「柔彩綠染劑」（General-purpose）；已改為優先取 `General-purpose <色> Dye`，顯示名去掉 EX。

- **2026-07-16（介面統整＋遊戲內分頁對齊＋釣魚頁魚糕式重做）**：(1) **幻化配裝圖鑑介面統整**——`tools/glamour/index.html` 由舊獨立站 GitHub 深色系（#0d1117）改為站內共用色票（--bg-base #0a0c10、金 #c8a96e、藍 #4fc3f7）、共用字體堆疊與背景光暈，navbar 加「← 水神的工具箱」返回鍵、標題改實色金並更名「幻化配裝圖鑑」、`<title>` 對齊站內格式、補共用頁尾；官方套裝卡片 tag 改套 CARD_TAGS 過濾（不再露出未翻譯的 `alljob`）。(2) **收藏頁 vs 遊戲內圖鑑分頁稽核**——樂譜（gameCategory 分類＋No. 排序）、青魔（No.）、幻卡（編號＋星級）原本已符合；**表情頁補上遊戲內分頁**（一般/特殊/情感表現，data/emotes.json 的 category 欄 General/Special/Expressions），卡片加分頁標籤；坐騎/寵物在遊戲內為無分類平鋪圖鑑，維持現狀。(3) **釣魚頁參考魚糕重做**——卡片改固定四欄資訊列（釣場/釣餌/時間/天氣，無限制時明示「全天/不限」）、ET 24 小時時間窗 bar（金色＝可釣時段、綠線＝現在 ET，跨午夜自動切兩段）、釣餌鏈以金色箭頭串接＋竿型（! 輕杆/!! 中杆/!!! 重杆）與提鉤（精準/強力）小章、天氣鏈「前一時段 → 當前」、直感標籤；新增「地區」下拉篩選（釣場→地圖→region，對應遊戲內釣魚手帳的地區分頁，選項依 maps.json 資料片順序）。瀏覽器實測（桌機 1440/手機 375）：三頁皆無 console error，地區篩選（庫爾札斯 78 筆）、表情分頁（情感表現 29 筆）、時間窗 bar 與倒數皆正常。

- **2026-07-16（幻化配裝圖鑑上線資產進版控）**：`tools/glamour/.gitignore` 改為只排除 mirapri 原圖（669MB）與東方時尚切割圖；縮圖（697MB，含 mirapri/官方套裝/icons 子目錄）、官方示意照（63MB）、icons（37MB）、精選原圖（37MB）與前端動態載入的 `mirapri_outfits.js`／`official_sets.js` 共約 850MB、1.75 萬檔分四個 commit push 上 main，線上版三檢視（精選/社群/官方套裝）完整可用。mirapri 原圖不上的原因：加入後整站約 1.5GB，超過 **GitHub Pages 發佈 1GB 上限**；前端彈窗載不到原圖會自動退回縮圖（index.html onerror fallback），僅犧牲點圖放大的解析度。**維運注意**：(1) repo 已約 860MB，距 Pages 上限僅剩約 140MB 餘裕，日後新增 mirapri 批次前先估縮圖增量；(2) 跑完 `update_all` 重建後，衍生 js 與新縮圖**記得 commit**（.gitignore 已不擋）；(3) mirapri 原圖／資料來源 DB 仍只在本機，需自行備份。

- **2026-07-15（幻化配裝圖鑑併入 tools/glamour/）**：原獨立 repo「FF14時尚配裝」以 `--allow-unrelated-histories` 併入本站，完整 git 歷史保留，專案整棵移至 `tools/glamour/`（腳本以 `__file__` 定位專案根、bat 用 `%~dp0`，搬移後照常運作）。功能：精選配裝／Mirapri 社群投稿／官方套裝圖鑑（1971 套）三檢視、裝備來源與染色查詢、可染/可交易徽章、收藏星號、consolegameswiki 官方示意照。首頁「日常工具」區已掛卡片、README 已登記。**注意**：該工具有自己的 `tools/glamour/.gitignore`——配裝圖片（1.5GB）、資料來源 DB（105MB）、mirapri_outfits.js／official_sets.js 等衍生檔皆不進版控，因此 **GitHub Pages 線上版目前只有精選配裝資料可看（且無圖）**，完整體驗僅限本機；部署方案（衍生檔進版控？圖床外掛？）待定。資料管線為 Python（Windows 用 `py scripts\update_all.py`），文件見 `tools/glamour/CLAUDE.md`。

- **2026-06-24（採集紀錄頁新增地圖檢視）**：tools/gathering-log/index.html 加「清單／地圖」檢視切換。地圖檢視用 maps.json 的 `sizeFactor` 以 FFXIV 標準式 `frac=(coord-1)*(sizeFactor/100)/41` 把遊戲座標換成底圖 0..1 比例定位採集點（底圖走 image.local，相對路徑 `../..`）。採集點以圓點標示（採礦工橘／園藝工綠／已全採金），點圈顯示該點物品卡並可勾選追蹤（dot 狀態即時同步）；地圖下拉依當前篩選（職業/版本/種類/狀態/搜尋）動態列出有節點的地圖、依節點數排序。47 張地圖、580 點可定位（另 113 個 mapId=0 特殊採集點無座標，不在地圖顯示）。底圖缺 1 張（mapId 584 雲冠群島／Diadem，屬待補 8 張之一）→ onerror 顯示「底圖尚未下載、可跑 download-maps.mjs」提示，不影響其餘 46 張。瀏覽器實測：座標分佈正確、點選/勾選/清單回切皆正常、無新增 console error。

- **2026-06-24（採集紀錄頁顯示異常修正 + 採集點版本重算）**：使用者回報 `/tools/gathering-log/` 出現「地圖0」與「#48015」原始 id。查出兩個資料殘留：(1) 141 個節點 Teamcraft 來源即 `map:0/zoneid:0`（無人島開拓、Diadem 空島等特殊採集，含 160 個唯一已開放物品，不可整筆隱藏）；(2) 103 個 ≥44850 的 7.x 物品台服未開放、不在 items.json。**前端修正**（tools/gathering-log/index.html，純顯示層）：載入時依 items.json 濾除查無名稱的產物、產物全未開放的節點整筆不顯示（733→693）、`totalItems` 改算可解析物品（進度分母 1261，原本含隱藏物品永遠到不了 100%）、地圖 fallback `地圖0`→`未知地區`。**採集點 patch 重算**：採集點無 datamined patch 來源（Teamcraft patch-content 不含 GatheringPointBase），舊 patch-backfill-proxy.mjs「節點 = 產物最早 patch」法被每個節點必掉的基礎水晶/碎晶/晶簇（id 2–19，皆 2.0）拉低，418/733 卡 2.0、其中 297 筆比採集等級下界還早＝標錯。新增 `scripts/patch-gathering-version.mjs`（純讀本機檔、idempotent）三層推導：採集等級→資料片下界（硬下界）→ 排除基礎水晶後的最早物品 patch 細化 x.y → 全未開放物品節點提到 7.0。重算 345 筆、2.0 418→113（全 Lv≤50）、undefined 40→0（全 7.0）、一致性檢查 0 筆早於等級下界。proxy 的 gathering 段改為導向新腳本避免重跑覆蓋。前端加版本標籤（v{patch}）與版本篩選（依資料片）。瀏覽器實測：無 console error、`#id`/`地圖0` 各 0 筆、版本篩選正確。**殘留**：x.y 小版本對「只有水晶+未開放物品」的節點僅到資料片下界；141 個 mapId=0 仍顯示「未知地區」（可後續建特殊區域地名對照）。

- **2026-06-22（表情來源重建，推翻舊「UnlockLink 不可修」結論）**：重新驗證 06-17 的結論——當時誤判 `Emote.UnlockLink` 為物品 id、直接查 Item 得到神典石/過期裝備，故放棄 198 筆。實測證實正確反查路徑是反向走 `Item.ItemAction`：表情書物品的 `ItemAction.Data = [UnlockLink, 5211, EmoteRowId, …]`，以 XIVAPI search `query=ItemAction.Data[1]=5211` 過濾、`Data[2]` 對回 emote。新增 `scripts/build-emotes.mjs` 重建 data/emotes.json：(1) 繁中名全 292 走 Cafemaker 簡中 Emote 名→OpenCC s2twp，補到 260/292（餘 32 為簡中服未開放之最新表情如 Breaking/各城啜飲/茶，前端隱藏）；(2) 來源分桶 240/292＝預設94（UnlockLink=0）＋動作指南書132（反查書物品，itemId 改填真實書物品 id 連市場、detail 帶 tw-items 台服書名如「演技教材·沉思」）＋任務14（UnlockLink≥65536＝Quest row id，繁中任務名走 Cafemaker→OpenCC）；(3) 餘 52 筆小值 UnlockLink、無書物品（金碟 MGP／成就／活動／聯動）後續全數補齊（見下）。schema 新增 `unlockLink`、`category` 欄位，`itemId` 正名為真實書物品 id。前端 emotes/index.html 加入來源標籤、取得方式說明、來源篩選（比照 mounts 頁）。**來源補完（同日）**：發現書物品偵測漏掉「新版書」（Data 結構改變，Data[1] 不再固定 5211、emote id 不在 Data[2]）與「Battlefield Etiquette」軍事系列書（名稱非 Ballroom）。改用唯一穩定關係 `ItemAction.Data[0] == Emote.UnlockLink`、以 `Name~"Etiquette"` ∪ `Data[1]=5211` 聯集列舉（143 本書），多救回 31 筆書物品表情（ranger/simulation/paint/jump/sip/gulp/tea/taco 等）。剩 21 筆任務/成就/App 以 build-emotes.mjs 內 MANUAL_SOURCES 補（key=unlockLink；14 任務+1 任務(水中翻+開放潛水「遨遊大海！」)+4 健身成就「可靠的隊長1」+2 Companion App「神典石」表情），繁中任務/成就名由英文名→XIVAPI row→Cafemaker→OpenCC，來源逐筆查 consolegameswiki + ffxivcollect API 佐證。**最終 292/292 全有來源**（預設94/動作指南書163/任務29/成就4/App2），未補 0。

- **2026-06-22（exploration-log name 全量修正）**：修正 data/exploration-log.json 全 340 筆中 228 筆 name 欄位，改為台服官方譯名。資料來源：thewakingsands/ffxiv-datamining-tc Adventure.csv（adventureId 2162688+序號-1 映射到繁中名稱）。方法：逐一比對 adventureId→TW 景觀名，涵蓋 ARR 部分筆、HW（081-142）、SB（143-204）、ShB（205-244）、EW（245-300）、DT（301-340）全數修正。修正後無殘差（0 differences），同時修正了 ARR 中 26 筆先前 tw-places 策略未能覆蓋的景觀名（如「航海女神」→「小麥酒港的利姆萊茵像」，「潮汐之門」→「南北防波堤」等）。

- **2026-06-17（exploration-log tw-places 官方台服名修正）**：重新以 Teamcraft tw-places.json 官方台服譯名修正 data/exploration-log.json 的 name 欄位。作法：從 places.json（PlaceName sheet）建立 en 名→id 對照表，再對照 tw-places 字典更新每筆景觀點的 name。共更新 49 筆（其中代表性修正：Seasong Grotto 海之歌岩洞→海詞石窟、Red Rooster Stead 赤雞莊園→赤血雄雞農場、The Invisible City 隱形之城→消逝王都、Little Solace 小慰藉→風精靈暫留地）；3 筆已正確無需改；286 筆為 HW 以後版本地名（tw-places 子集未覆蓋）、2 筆無台服譯名（Haukke Manor id=59、The Sunken Temple of Qarn id=50 在子集內但無 tw 對應）。

- **2026-06-17（探索筆記繁中景觀名補完）**：補齊 data/exploration-log.json 全 340 筆景觀名（name 欄位）。資料來源：cafemaker.wakingsands.com PlaceName pages 1-11（簡中 Name_chs）→ 人工繁化（簡→繁體字形）。tw-places.json 因 Teamcraft CDN 在沙箱環境無法取得，採 CN+OpenCC fallback 策略（符合記憶規則）。XIVAPI v2 SightseeingLog 確認回傳空陣列，座標維持 null。新增 data/scripts/patch-exploration-log.mjs（340 筆對映表，可日後升級為 tw-places 來源）。前端頁面無需修改（已接 b.name 欄位）。頁面狀態由「開發中」改為「完成」。

- **2026-06-17（表情收藏繁中名補完）**：補齊 data/emotes.json 繁中名（name 欄位）。itemId=null 的 94 筆預設表情（/surprised、/bow 等）從 Cafemaker 簡中 API 取得 Name_chs，再用 OpenCC s2twp 轉繁中，全 94 筆補齊。有 itemId 的 198 筆：XIVAPI UnlockLink 已知錯誤（itemId 對到神典石/過期裝備而非表情書），故 name=null，前端隱藏（符合「台服未開放隱藏」原則，待未來找到正確表情書 itemId 時再補）。前端 emotes/index.html 加入 name=null 過濾邏輯，最終顯示 94/292 筆。搜尋含繁中名，卡片優先顯示繁中名。

- **2026-06-17（小隊/配種/釣魚/採集 四頁新增）**：新增 `/tools/squadron/`（冒險者小隊任務派遣模擬器，squadron.json 34任務，9職業成長表，成功率計算，各配置自動找最高成功率 variant）；新增 `/tools/gardening/`（園藝配種計算，正查兩株→結果/反查目標→路徑，data/gardening.json 107種植物 50種有配方，來源 Teamcraft seeds.json+tw-items）；新增 `/tools/fishing/`（釣魚紀錄追蹤，fishes.json 1104筆，大魚/限時/天氣/傳承錄篩選，版本篩選，勾選追蹤）；新增 `/tools/gathering-log/`（採集紀錄追蹤，gathering.json 733節點，採礦工/園藝工，傳說/短暫/限時篩選，物品勾選追蹤）。四頁 index.html 入口卡片改為可用連結。
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
