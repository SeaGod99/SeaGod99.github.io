# 專案進度（單一進度來源）

> **給 Claude / 後續對話的指示**：開始任何工作前先讀本檔。完成任何功能或資料變更後，**必須更新本檔**（狀態表 + 更新紀錄），並同步 `data/_meta.json` 的 status。
> 規格細節見 `docs/feature-specs.md`，資料格式見 `data/SCHEMA.md`。

**最後更新**：2026-07-29（職業名三份表統一、精選取得方式補 224 處、主庫 equip 缺口修補；07-28 幻化配裝圖鑑資料併回主庫：刪 105MB 重複、修 570 筆錯名、加 .gitattributes 修 msgpack 損壞；另有資料缺口／UX 一致性／效能 三章＋副本庫 386→520 座等，見更新紀錄）
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
| 1.3 | 限時採集節點查詢 | `/tools/gathering/` | 完成（改接 gathering.json/items.json/maps.json，limited 225 筆→213 筆顯示，篩選/排序/追蹤清單/Teamcraft flag 補齊，06-15重做；07-23 物品名改讀 `items-lite.json`，載入量 10MB→1.3MB；07-25 地圖一覽改用共用元件 `map-explorer.js`——左底圖標點、右跨地圖搜尋＋節點清單，兩邊連動） |
| — | 天氣預報 | `/tools/weather/` | 完成（改用共用模組 assets/js/eorzea-weather.js，天氣表接 maps.json weatherRates，mapId 統一，06-15重做） |
| 1.5 | 風脈泉追蹤器 | `/tools/aether-currents/` | 完成（31 地區 303 個風脈泉，任務型151筆/野外型152筆，06-16新增；07-23 遷入共用引擎的**子項目模式**——卡片＝地區、追蹤單位＝風脈泉，手風琴/地區地圖圖釘/🗺彈窗保留，新增可分享網址、批次標記、排序） |
| 1.6 | 時尚品鑑推薦 | `/tools/fashion-report/` | 完成（**07-25 全面改版**：推薦標準改為「門檻→金幣（含染劑）→件數」三層成本模型並以列舉求最佳解，答案改為每週結構相同的「涵蓋所有計分部位配裝表」，換週狀態機把遊戲階段與資料新鮮度拆成兩軸、過渡期顯示當前週主題，完整清單加上等級／職業／可否染色／性別種族限制／販賣地圖／市場連結。管線全程式化＝`build-fashion-report.mjs` 一支到底。**規格見 [fashion-report-spec.md](fashion-report-spec.md)**；目前 week 443「真麻正式裝」verified） |
| 1.7 | 幻化配裝圖鑑 | `/tools/glamour/` | 完成（07-15 由獨立 repo 併入：精選配裝＋Mirapri 社群＋官方套裝 1971 套三檢視，收藏星號、染色/交易徽章、wiki 示意照；07-16 上線資產進版控——縮圖/官方示意照/icons/精選原圖＋mirapri_outfits.js/official_sets.js 共約 850MB 已 push，線上完整可用；**僅 mirapri 原圖 669MB 留本機**（加入會破 Pages 發佈 1GB 上限，彈窗自動退回縮圖），重建後衍生 js 記得 commit；資料管線為 Python（py scripts\update_all.py），細節見 tools/glamour/CLAUDE.md；**07-28 資料層併回主庫**——移除自帶的 105MB `資料來源/`，改由 `scripts/maindb.py` 讀 `data/`＋`out_data/`，修掉 570 筆錯譯名並補進 7.1/7.2 新套裝箱；07-16 介面統整——改用站內共用色票/字體、加「← 水神的工具箱」導覽與頁尾，官方套裝卡不再顯示 alljob 原始 tag） |

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
| 2.10 | 青魔法術收藏 | `/collections/blue-magic/` | 完成（改接 data/blue-magic.json 124筆，副本來源用 contentId 對 dungeons.json 取繁中名，野外/怪物來源並列，14筆無資料標待補充，06-15新增；**07-26 改為仿遊戲內〈青魔法之書〉版型**：8 頁籤×4×4 格＋右側詳情欄，另留卡片檢視） |
| 2.11 | 幻卡追蹤 | `/collections/triple-triad/` | 完成（**07-26 大改**：整頁改成仿遊戲內幻卡手帳的單一版型——一頁 5×6＝30 格＋頁籤一次 5 頁＋右側詳情＋底部「總計 n/m」，未取得＝灰階卡面，不再有清單檢視；排列改照遊戲的 `(uiPriority, order)`（15 張 FF 主角卡在最後一頁，非編號位置）；資料補齊 **435 張**（原 425，7.1 的編號 426–435 因 build 腳本寫死張數而漏抓）並修掉「名稱含中文字」誤擋 9S／2P／2B／N-7000 的問題，26 張 patch 一併校正，頁面顯示 421 → 435 與遊戲一致；星級/類型/來源/版本篩選、NPC對戰地點與 📍 地圖照舊，06-15新增）|

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
| 4.7 | 釣魚紀錄追蹤 | `/tools/fishing/` | 完成（fishes.json 1449 筆 → **頁面顯示 1414**（07-26 補上版本閘門，擋掉 35 筆 7.2–7.5），大魚/限時/天氣篩選，追蹤進度，06-17新增；07-16 參考魚糕重做卡片——固定欄位釣場/釣餌/時間/天氣、ET 24h 時間窗 bar、竿型 !/!!/!!! 與提鉤章、天氣鏈前→今、魚識標籤，加「地區」篩選對應遊戲內釣魚手帳分頁；07-23 遷入共用引擎——分頁 60、預設依開窗時間排序、可分享網址、批次標記；ET 時鐘/目標魚面板+鬧鐘/地圖檢視/詳情彈窗皆保留；**07-25 地圖檢視重做**——原本切過去魚卡清單不會收起、地圖被推到頁尾看不到（引擎重畫會洗掉 inline display），改用共用元件 `map-explorer.js` 並以 body class 收合清單；**07-26 篩選擴充**——新增「稀有度」三選一（一般魚 1117／魚王 267／👑魚皇 30，互斥）與「魚餌（起始餌）」下拉（85 種，引擎新增 `render:'select'`），原「種類」組移除重複的「大魚」、補上「🧠魚識」） |
| 4.8 | 採集紀錄追蹤 | `/tools/gathering-log/` | 完成（gathering.json 670 可顯示節點/1243 件產物，採礦工/園藝工，物品勾選追蹤，06-17新增；07-23 遷入共用引擎的**子項目模式**＋分頁 40，地圖檢視保留；物品名改讀 `items-lite.json`；07-25 地圖檢視改用共用元件 `map-explorer.js`，並修掉「在地圖檢視下改篩選會讓卡片清單跑回來」的同源潛在雷） |
| 4.10 | 無人島開拓查詢 | `/tools/island/` | 完成（07-23 第一期／07-24 第二＋三期）：四分頁——**工坊生產** 81 筆（時數／價值／每小時／製作類型／工房等級，可依時數與製作類型篩選、四種排序；卡片上的**類型標籤可點直接篩選**）／**採集地圖／素材**（合併頁）左邊島嶼底圖＋**26 個採集區域**圓圈、右邊 109 素材依取得方式分組，兩邊連動：點素材在地圖標出採集區域、點圓圈列出該區素材，每種素材標**所需採集工具**（可依工具篩選）、列出**重疊區域**與「站這裡實際可採幾種」（最多 17 種）／**動物時鐘** 43 種動物的出現 ET 時段與天氣，放大的 ET 時鐘（時:分:秒即時走動）＋島上天氣／下次天氣倒數；每隻標**體型與捕捉道具**（小＝捕獸網／中＝捕獸繩／大＝捕獸用睡眠球）、可依體型／產出素材／狀態篩選；天氣為純計算不連 API／**開拓等級** 1–20 級的經驗門檻與解鎖內容。全站圖示改用本機 `assets/island/icons/`（271 張）。分頁與篩選同步網址可分享 |

「開發中」頁面驗收後請改為「完成」並註記日期。

## 二、資料庫狀態（/data/）

已填充（count / 來源 / 最後更新）：

| 庫 | 筆數 | 來源 | 更新 |
|------|------|------|------|
| items | 43748 | tw-items.msgpack + XIVAPI | — |
| dyes | 114 | XIVAPI Stain（顏色／色群）+ shops/obtainable-methods/npcs/maps（取得與門檻）；台服未實裝 11 支未收 | 07-25 |
| fashion-themes | 86 | ffxiv-datamining-cn FashionCheckWeeklyTheme（row = 週次+9），week 440–525，簡轉繁非官方譯名 | 07-25 |
| fashion-fillers | 5 | equipment/shops/items + XIVAPI DyeCount，每部位最便宜可染的全職業 NPC 裝 | 07-25 |
| maps | 210 | XIVAPI + tw-places（id=Map sheet row id；底圖在 /assets/maps/，缺 8 張待本機補） | 06-11 |
| recipes | 14182 | Teamcraft | — |
| gathering | 733 | Teamcraft nodes（已濾 EventItem 偽 id；141 筆 mapMissing） | 06-11 |
| npcs | 22079 | Teamcraft tw-npcs + 位置 | 06-08 |
| minions | 581 | XIVAPI + items（圖在 /assets/minions/） | 06-05 |
| mounts | 362 | XIVAPI + manual（圖在 /assets/mounts/）；**07-28 補 `order`**（`Mount.Order`），13 筆 -1＝不在遊戲坐騎手冊的內部列，前端已擋 → 頁面 301→**297 隻** | 07-28 |
| triple-triad | 435 | XIVAPI v2 + items（張數以 items.json 的「九宮幻卡」道具數為準）+ npcs/maps/dungeons（取得方式）；圖在 /assets/triple-triad/ 共 435 張。**07-28 取得方式補繁中名**：副本走 Garland 英文名→dungeons.json（`contentId`），卡包走 itemId→items.json，任務走 Teamcraft tw-quests；**無名稱 0 筆**，純英文僅剩 14 個成就名 | 07-28 |
| dungeons | **520** | XIVAPI＋tw-instances（圖在 /assets/dungeons/）；07-28 補 `expansion`／`expansionId` **520/520**、清掉 18 筆已證實錯誤的 `patch`；**同日補收 134 座**（深宮 40／優雷卡 4／多變迷宮 9／單人任務戰鬥 81）——它們先前被 `IsInDutyFinder` 過濾整批擋掉。繁中名 520/520 | 07-28 |
| barding | 106 | XIVAPI + tw-items（圖在 /assets/barding/） | 06-04 |
| blue-magic | 124 | XIVAPI | 06-09 |
| monsters | 14361 | datamining-cn + Teamcraft + XIVAPI | 06-09 |
| obtainable-methods | 36336 | mixed | 06-08 |
| fishes / fishing-spots | 1449 / 307 | fish-tracker + items（spots 已補 coords.mapId） | 06-11 |
| items-lite | 43748 | items.json 精簡（只留 id→繁中名，1.3MB；`scripts/build-items-lite.mjs`） | 07-23 |
| items-market | 43748 | items.json 精簡（市場頁用的六欄，2.0MB；`scripts/build-items-market.mjs`）。**改完 items.json 這支與 items-lite 都要重跑** | 07-28 |
| island-* 十一檔 | 見下 | datamining-cn `MJI*` CSV ＋ items.json（`scripts/build-island.mjs`）；動物出現條件與台服名走人工表 `island-names-tw.json` | 07-24 |

仍為空（0 bytes）：emotes、exploration-log、orchestrion、squadron、fishing（由 fishes.json 取代）。

aether-currents.json 已建立（06-16）：31 地區 303 筆，schema 版本 1，任務型含繁中任務名，野外型座標暫設 null。

hairstyles.json 已建立（06-16）：39 筆台服已開放髮型，來源 Teamcraft items.json + tw-items.msgpack + XIVAPI icon；10 筆台服未開放（隱藏）。

注意：`data/_meta.json` 的 status 欄已過時（06-04 之後沒更新），待同步。

建置腳本在 `/scripts/`（build-*.mjs、download-*.mjs），本機跑，需 `npm i`（@msgpack/msgpack、sharp）。

## 二之一、資料庫連結對應驗證（2026-06-10 全量檢查）

### 【已修復 2026-06-11】mapId 兩套 ID 空間不一致

**已完成**：maps.json 重 key 成遊戲 Map sheet row id 並擴充至 210 張；fishing-spots 307 筆全補 coords.mapId；gathering 清除 EventItem 偽 id（965→733 節點）。mapId 類斷鏈 17444/17958/524 → 全部歸零。詳見 `docs/地圖ID統一修正計畫.md` 執行結果。底圖 8 張已於本機補齊（2026-07-28 複查：9 張全在、`image.key` 為 `default/00` 的佔位圖 0 筆、野外／主城類 0 缺圖，原「待補底圖清單.md」已刪）。以下保留原始問題紀錄：

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
| minions 61／npcs 59／monsters 75 | 無繁中名 | 台服未開放，預期內，前端隱藏即可 |
| triple-triad 11 | 名稱是拉丁字母 | **不是未開放**：9S／2P／2B／N-7000／Ark Angel MR–EV／Prishe／Shadow Lord 台服官方就是這樣命名，前端不可用「名稱含中文字」去擋（07-26 修） |

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

0. ~~修 mapId ID 空間不一致~~ — **完成（2026-06-11）**，見 `docs/地圖ID統一修正計畫.md` 執行結果。遺留：~~底圖 8 張待補~~ **已補齊（2026-07-28 複查通過，清單文件已刪）**；新擴充地圖無 weatherRates/patch，需要時再補
1. ~~06-15 驗收結論：四個「開發中」頁面皆未對接已備資料庫，需重新開發前端資料層~~ — **完成（2026-06-15）**：weather（共用模組+maps.json）、gathering（gathering.json/items.json/maps.json+篩選/追蹤）、mounts（mounts.json+圖片）、minions（整頁重做）皆已重做完成。
2. ~~同步 `data/_meta.json` status；更新 README.md 的工具清單（已過時）~~ — **完成（2026-06-15）**：_meta.json 各庫 status 已對應目前完工狀態（mounts/barding/triple-triad/blue-magic/minions），README.md 重寫工具清單與專案結構，並修正 index.html「市場查價＋比價」誤標為可用（market/ 為空目錄）改回即將推出
2-1. 資料品質小修：~~mounts 補 itemId~~（06-11 完成）；mounts sources/patch 人工校對（併入 1c）；om 40 筆 npc 譯名以 npcs.json 為準；blue-magic learnFromMob 轉怪物 id（做青魔頁前）；dungeons rewards/unlock 待填充（量大，做副本相關功能時再填）
2-2. **繁中化升級（見二之二）**：~~mounts 補繁中名~~、~~dungeons 校正~~（06-11 完成）；~~monsters 台服化~~（06-11 完成）；抽 scripts/lib/common.mjs 共用函式庫（未做）
3. ~~幻卡追蹤頁面 sources 待補~~ — **資料已補齊（2026-06-15）**：sources 425/425、NPC對戰地點 864/934 已補（npcs.json+maps.json），待做頁面
4. 無人島攻略工具：**三期全部上線**（素材／工坊查詢、動物時鐘、開拓等級表），見 `docs/無人島攻略工具規劃.md`。11 個 `data/island-*.json` 已產出、validate 全過；素材/工坊生產/建築素材/收購/等級**台服繁中名 100% 覆蓋**。動物 **43/43** 全部具名並帶出現條件（id 1–29 來自 steamxo、id 30–43 來自素素無人島，皆以 icon 對回 MJIAnimals、逐筆比對素材驗證，見 `island-names-tw.json` 的 `_animalSource`／`_animalSource2`）；建築 25/25、主題 16/16、地區 6/6、分類 9/10 已補繁中名（`cn-hant`）。**資料層無卡點**
5. 其餘收藏追蹤頁（髮型）
6. 其他規劃：時尚品鑑、冒險者小隊計算機、藏寶圖、園藝配種、釣魚紀錄

## 五、更新紀錄

- **2026-07-29（四項判斷定案＋收藏 id 一次性遷移）**：使用者逐項裁示，全部落地。
  - **多來源不改呈現**：查證後確認多來源的呈現「早就有了」——每件裝備下方那行是人工整理的一句話摘要，完整清單走 `item_sources.js` 呈現在彈窗底部的「📍取得方式總覽」，篩選與搜尋也吃那份。所以 18 件「JSON vs DB」衝突使用者兩邊都看得到，維持現狀；而且人工那行常帶著表裡沒有的資訊（🗺️優雷卡常風之地比🛒裝備升級兌換有用、天文護臂的皮革 Lv.90 配方表裡根本沒有），照 DB 覆蓋是退步。
  - **28 筆譯名以主庫為準**：Teamcraft 的 tw 表自己也混雜（`寬松`／`錦磚咖啡`／`紅色山棱` 都是陸服用詞，主庫的 `寬鬆`／`馬賽克咖啡`／`紅色山稜` 才對），只有 `巨像乒` 這類明顯錯字是 Teamcraft 對。**權威維持 `tw-items.msgpack`，Teamcraft 只當交叉檢查**，不整批對齊。
  - **106 件缺繁中名確認全部合理**：104 件 patch ≥ 7.2（超過 gamePatch 7.15）；剩 2 件雖標 7.15，但整個 クラウドダーク 系列 35 件在 `tw-items` 一個都沒有、而鄰近 id 區間（44500–45000）有 380 筆，證明不是快照截斷而是台服真的還沒這批譯名。依規則留空。
  - **收藏影響救回來了**：147 套啟發式套裝換 id 會讓使用者的星號消失。拿改版前後的 `official_sets.js` 比「裝備 id 集合」，**145/147 對得到**（133 靠全部裝備、12 靠可見部位），已在 `index.html` 內建一次性遷移（`FAV_ID_MIGRATION` ＋ `ff14_favs_migrated` 旗標，只跑一次、認不得的 id 原樣保留、`mirage:` 不動）。瀏覽器實測：植入舊 id → 重新載入 → 自動換成新 id、「只看收藏」正確顯示、無 console error。
  - 順手把過期的 `sw.js` `CACHE_VERSION` 補上（`sgt-d99ca5124e` → `sgt-f691f7e329`，既有漂移，非本次造成）。
  - 詳見知識庫 §4.17（三個「看起來像缺口、其實是已定案」的判斷）與 §4.18（改到會進 id 的欄位就要準備收藏遷移）。

- **2026-07-29（收尾：職業名三份表統一、精選取得方式補 224 處、修主庫 equip 缺口）**：接續 07-28 的資料併庫，把留下的清單處理完。

  **① 職業繁中名也是「一份資料抄三份」**
  - 稽核發現 `build_site.py`、`verify_data.py`、`index.html` 各有一張職業名表，**33 個職業裡 16 個與主庫 `data/equip.json` 不符**（白魔法師應為白魔道士、召喚師應為召喚士、鐮刀師/收割者應為奪魂者、劍蛇師應為毒蛇劍士、製作職一律「匠」不是「師」…），而知識庫 §4.2 早就點名那組是錯的。
  - 全部改讀 `maindb.job_names()`；`JOB_TAGS` 改由 `_ROLE_SETS`＋職業名推導（不再硬寫）；前端 `JOB_TAG_MAP` 由後端表產生、`JOB_CODES` 補正式名（舊名留作別名）。精選 107 處 job 值同步校正。
  - **副作用**：`verify_data` 長年報的「職業限制不符 43 件」**全是它自己那份錯表造成的假警報**（它用 `_job_label`、建置期用 `job_from_cjc`），改成同一支函式後歸零。

  **② 主庫 `items.json` 的 `equip` 有缺口，害 glamour 1,388 件裝備掉職業限制**
  - `equip` 只來自 `out_data/equipment.msgpack`（使用者提供的快照，22,416 件），比實際可裝備數少約 4,000。舊 cycleapple 那份有，所以 07-28 換庫後這批**退化成「全職業」、等級掉回 1**。
  - `build-items.mjs` 加 XIVAPI fallback（`EquipSlotCategory`／`LevelEquip`／`ClassJobCategory`）→ **22,416 → 26,294 件**，退化歸零。剩下沒補的 1,824 件經查是腰帶（6.0 已移除該部位）、幻化套裝箱、釣餌等**本來就不可裝備**的。
  - **順手擋掉一個大坑**：`build-items.mjs` 重建會把 `patch` 欄整份洗掉（那是 `patch-backfill-all.mjs` 事後疊上去的，而 `patch` 是前端版本閘門的依據，洗掉等於台服未開放的道具全部放行）。已改為重建時沿用既有值。

  **③ 精選套裝取得方式**
  - 07-28 換庫後取得方式表多了 9,612 筆，`verify_data` 報出 210 件「待確認／空白」其實查得到。新增 `patch_curated_sources.py`（dry-run 預設）補上 **224 處**，「待確認／空白」由 255 → 17。
  - 刻意不動的四類：JSON 與 DB 各說各話 18 件（多半兩邊都對，人工寫的更有用）、多來源寫法 15 件、帶 NPC 附註的 Gil 2 件、DB 查不到 3 件。
  - 另修 2 處把藏寶圖標成 🗡️（應為 🗺️）——`st` 因 `ST_KEYWORDS` 的寶圖規則本來就對，純顯示不一致。

  **④ 又一個簡體字**：`pipeline._INST_TYPE` 把「討伐**殲**滅戰」寫成「討伐**歼**滅戰」，已漏進 `mirapri_outfits.js` 90 處、curated 1 處，且與 `build_sets.py`／`maindb.py` 的同名表不一致。已修並重建，全站歸零。

  驗收：`verify_data` 可自動修正項全部歸零（lv/補來源/Gil/en/ja/slot/zh）、職業 0；`validate-data.mjs` 0 error 0 warning；`health_check` 全過（icon 8753/8753、示意照 1968/1969）。詳見知識庫 §4.16。

- **2026-07-28（幻化配裝圖鑑的資料併回主庫：刪 105MB 重複、修 570 筆錯名）**：使用者問「幻化配裝圖鑑的物品內容跟主目錄的資料來源有沒有脫鉤、資料有沒有重複」。查下去兩個都中。

  **① 稽核結果**
  - **重複 104MB**：`tools/glamour/資料來源/` 裡 6 個 msgpack（`en-items`／`npcs`／`obtainable-methods`／`recipes`／`fates`／`loot-sources`，共 45.6MB）與 `out_data/` **MD5 完全相同**；另外 58.6MB 是同領域各存一份（items／sources／recipes／items-index…）。其中 `fates`／`loot-sources`／`ui_categories` 連 glamour 自己都沒引用。
  - **脫鉤且名字是錯的**：那份快照（2026-05-26，來自 cycleapple/ffxiv-item-search-tc）比主庫舊一個月、少 590 筆 7.1/7.2 道具（**含 6 個幻化套裝箱**，官方套裝圖鑑因此收不到血盟公爵／零風／雷歐尼斯國王／霍倫女王等套）。**588 筆同 id 名稱不同**，抓 Teamcraft 台服 `tw-items` 當第三方裁判：**主庫對 570、它只對 18**；錯的那批 342 筆恰好等於簡中名的簡轉繁（打底褲←打底裤、莽漢面具、把台服保留英文的曲名硬翻），違反知識庫 §4.2／§4.5。
  - **使用者看得到**：glamour 前端 js 有 995 個「打底褲」、271 個「上裝」，主站 `items.json` 是 0（用「下身」「上衣」）——同一件褲子在站內兩頁不同名。

  **② 改法：子專案不再自帶資料庫**
  - 新增 [`tools/glamour/scripts/maindb.py`](../tools/glamour/scripts/maindb.py) 當唯一資料入口，把主庫 `data/`＋`out_data/` 轉成該子專案原本的欄位形狀，**20 幾支既有腳本只改載入那一行**。`itemdb`／`build_sets`／`build_item_sources`／`build_item_fallback`／`pipeline`／`verify_data` 全部改接。
  - 取得方式改吃 **`out_data/obtainable-methods.msgpack`（原始版，39,257 筆）**——不是 `data/obtainable-methods.json`，後者是為前端篩選做的摘要版，`instanceNames`／`vendors`／`price` 都被拿掉了。副本 id 經 `cfc-content.json` → `dungeons.json` 解成台服官方名（裝備類 99.95% 解得出來）、NPC／地名／任務／怪物分別走 `npcs`／`places`／`tw-quests`／`monsters`。
  - 新增 [`data/item-categories.json`](../data/item-categories.json)（112 筆，`scripts/build-item-categories.mjs`）補主庫沒有的 `categoryId`（1–49＝裝備，官方套裝的「貨幣其實是裝備＝升級兌換」判定靠它）。
  - `update_db.py`（下載 cycleapple）→ 改寫成 [`check_maindb.py`](../tools/glamour/scripts/check_maindb.py) 主庫健檢；`資料來源/` 整個移除。

  **③ 成果**（`update_all.py local` 全綠、`validate-data.mjs` 0 error/0 warning）
  - 三份前端 js 的「打底褲／上裝」歸零；官方套裝 428 件裝備改成台服官方名、177 件原本沒繁中名的補上，套裝名有繁中的 1225→1243。
  - 官方套裝收進 7.1/7.2 的新幻化套裝箱。取得方式來源鍵與舊資料 **94% 相同**，差異裡 322 個是「日文/英文未翻譯 → 繁中」的改善，347 件裝備新增取得方式、只有 4 件全失（上游本來就沒有）。
  - 磁碟少 105MB。**mirage 層套裝 id（`mirage:{row_id}`，遊戲原生）1078 套零漂移**；啟發式 `src:` 層因來源名變準有 147 套換 id，已重跑 `fetch_set_photos.py` 補回照片（1968/1969）並清掉孤兒條目與 147 張孤兒圖檔。

  **④ 順手修掉的兩個真 bug**
  - **`out_data/tw-items.msgpack`／`places.msgpack` 被 git autocrlf 弄壞**：repo 沒有 `.gitattributes`＋`core.autocrlf=true`，msgpack 開頭沒有 NUL 就被當文字，checkout 時 LF→CRLF（+1／+33 bytes），Python/Node 都解不開，**而 `git status` 一直顯示 clean**。已加 `.gitattributes` 標 binary 並從 blob 寫回。全 repo 掃過，只有這 2 個檔中招。
  - **`pipeline._resolve_from_sources` 的 `s.get("mapNames", ["寶圖"])[0]`**：key 存在但值是空 list 時預設值不會生效，直接 IndexError。已改成先取再判空。

  詳見知識庫 §4.14（子專案自帶資料庫的教訓）與 §4.15（`.gitattributes`）。

- **2026-07-28（收尾：副本庫補收 134 座、取得方式缺口歸零、_meta 自動抑漂）**：接續同日的三章工作，把留下的尾巴收乾淨。

  **① `build-dungeons.mjs` 有一道過濾把整批副本吃掉了**
  - 根因是 `if (!IsInDutyFinder && !HighEndDuty) continue;`。**深宮（ContentType 21）／禁地優雷卡（26）／多變迷宮（30）／單人任務戰鬥（7）都有自己的進入介面**，不掛在一般隨機任務裡，`IsInDutyFinder` 一律 false，於是整批被擋——即使 21/26/30 明明就在 `VALID_CONTENT_TYPES` 白名單裡（白名單形同虛設）。已加 `DUTY_FINDER_EXEMPT_TYPES` 豁免。
  - 順手修掉兩個錯誤：**`ContentType 30` 註解成「Bozja」是錯的**（實查 XIVAPI ＝ `V&C Dungeon Finder`），`resolveType()` 也跟著回傳 `'bozja'`；現已改為 `variant_dungeon`，並補上 `quest_battle`。
  - **6.1 把「里塔提恩強攻戰」「皇都伊修加爾德保衛戰」從 8 人討伐戰改成單人任務戰鬥**（ContentType 7），它們**沒有下架**、只是換了型別——我先前判斷成「已移除內容」是錯的。
  - 新增 [`patch-dungeon-add-missing.mjs`](../scripts/patch-dungeon-add-missing.mjs)（增量、dry-run 預設、`--offline`）。**刻意不整包重建**：`dungeons.json` 疊了 `patch-dungeon-names` 的 108 筆繁中名校正與 `patch-dungeon-expansion` 的 386 筆資料片，重建會全洗掉。
  - 台服名走既有對應鏈（`CFC id → Content(InstanceContent id) → tw-instances[].tw`），**不自己翻譯**。台服叫「**多變迷宮**」不是「異聞迷宮」（36001 多變迷宮 希拉狄哈水道／36002 六根山／36003 阿羅阿羅島），Another 版才叫異聞迷宮——又一個不能憑印象寫名字的例子。
  - **386 → 520 座**（deep_dungeon 40／eureka 4／variant_dungeon 9／quest_battle 81）；**15 筆無台服名者依鐵則不加**（Pilgrim's Traverse、The Merchant's Tale 等台服未開放內容）。

  **② 取得方式缺口歸零**
  - **幻卡「無名稱的來源」11 → 0 筆**。`patch-triple-triad-source-names.mjs` 另加一段「**已有 `contentId` 的來源每次都重新對 `dungeons.json` 同步型別與名稱**」，所以 `dungeons.json` 一變動再跑就會自我修正——這次就靠它把 10 張卡從「副本」改標成新的「多變迷宮」型別。
  - **青魔 118 → 142/142 全解**（皇都伊修加爾德保衛戰隨副本庫補收而解掉）。護欄「規則 A–C ↔ D 交叉驗證」維持 67 一致、0 矛盾。
  - **幻卡剩的 2 句 wiki 英文散文改寫成結構化來源**（新增 [`patch-triple-triad-prose-sources.mjs`](../scripts/patch-triple-triad-prose-sources.mjs)）。每個名字都是查來的：C'intana → `npcs.json` **卡·因塔娜**（座標吻合）；Horrendous Hoarder → `out_data/npcs.msgpack` **貿易小員**；三種圖騰與 Seafarer's Cowrie → `out_data/en-items.msgpack` 反查 itemId → `items.json` **紅／綠／白色未知蠻神圖騰**、**謝爾達萊青船幣**。卡 323 型別由「討伐戰」改為「商店」（取得動作就是找 NPC 兌換）。
  - **純英文 detail 17 → 14 筆**，剩的 14 筆全是成就名（Title/Achievement 非物品、`tw-items` 不涵蓋，全站對成就譯名的立場是擱置）。
  - 🔎 **附帶收穫**：`Seafarer's Cowrie ＝ 謝爾達萊青船幣（itemId 37549）`。無人島頁先前因為「`MJIDisposalShopItem.Currency` 只是個 byte、datamine 沒給貨幣名」而把收購資訊整個藏起來（見 2026-07-23 條目），**現在有官方名了，那塊可以解封**。

  **③ `_meta.json` 過期問題根治**
  - 新增 [`sync-meta.mjs`](../scripts/sync-meta.mjs)：從各資料檔自己的信封欄位（`updated`／`count`）回抄進 `_meta.databases[]`，**不自己算日期**。
  - 真正的根治不是「記得跑它」，而是 **`validate-data.mjs`（改完資料必跑的那支）會自動報不同步**。流程變成：改資料 → validate 報 drift → 跑 sync → 再 validate，忘不掉。
  - 同步 31 筆，並補登記 8 個前端會讀但沒登記的庫（items-market／items-lite／equip／gc-shop／fashion-report／treasure-fragments／monsters／obtainable-methods）。頂層 `updated` 2026-06-23 → 2026-07-28。

  **④ 過時文件清除**：`docs/待補底圖清單.md` 刪除。刪前複查：那 8 張 field/city 底圖＋雲冠群島共 9 張全部在位、`image.key` 為 `default/00` 的佔位圖 **0 筆**、野外／主城類 **0 缺圖**。PROGRESS／地圖ID計畫／知識庫的三處引用一併更新。

  **⑤ 三條死路寫進[知識庫 §4.13](專案慣例與記憶.md)**（dungeons 的 bosses/rewards、dungeons 的 68 筆 null patch、無人島 56 筆非官方譯名），附「試過什麼、為什麼不行」，避免下次重走。

  **驗收**：`validate-data.mjs` **54 檔 0 error 0 warning**（含新的 _meta 抑漂檢查）；`validate-links.mjs` mapId 類全數歸零；jsdom 回歸 **34/34**（新增幻卡無名稱＝0、純英文＝14、青魔 contentId 全滿、dungeons 520 座繁中名 520/520 四項斷言）；blue-magic／triple-triad／首頁 **0 console error**；SW 版本無需再 bump（未動 `assets/`）。

- **2026-07-28（資料缺口／UX 一致性／效能 三章一次做完）**：使用者指定處理盤點出來的三個章節。

  **① 資料缺口——「查了但查不到」全部收斂**
  - **幻卡取得方式 281 筆只有 id 沒有名稱 → 補到剩 11 筆**（新腳本 [`patch-triple-triad-source-names.mjs`](../scripts/patch-triple-triad-source-names.mjs)，dry-run 預設／`--offline` 可離線／冪等）。三個踩到的雷：
    - **舊資料的 `instanceId` 是 Garland Tools 自家 id，不是 ContentFinderCondition id。** 182 個裡有 64 個「剛好」也是 `dungeons.json` 的有效 key，實測**其中 151 個對到的是錯的副本**（Garland 96＝深空天坑，dungeons.json 96＝巴哈姆特大迷宮邂逅之章4）。改用**英文名比對**解出 178/182；已解出者刪掉 `instanceId`、改存 `contentId`，免得下次又有人拿去直接對。Garland id 分段：小 id＝Dungeons、20xxx＝Trials、30xxx＝Raids、36xxx＝異聞迷宮（dungeons.json 未收）。
    - **`treasureId` 根本是 `itemId`**，10 個裡有 7 個是金碟幣買的「九宮幻卡◯包」（`obtainable-methods` 佐證：幻卡商店・卡片兌換員・520～8000 金碟幣），型別「藏寶圖」是上游標錯 → 拆成 `卡包`／`藏寶圖`。
    - **型別要以 `dungeons.json` 的 type 重標**，照抄上游會把「真 伊弗利特殲滅戰」標成副本。共修正 185 筆（副本→討伐戰 84／多人副本 17／大型任務 15、藏寶圖→卡包 69）。
    - 另把 **21 筆純英文的 NPC 名 detail 換成台服官方名**（Triple Triad Trader→卡片兌換員、Hall Overseer→對局室管理員…），走 `out_data/npcs.msgpack` 的 Teamcraft `npcs`(en)＋`twNpcs`(tw)，**繁中名不唯一就跳過**。仍留 17 筆純英文＝14 個成就名（無台服來源，全站對成就譯名的立場是擱置）＋2 句 wiki 英文＋Mount Rokkon。
  - **dungeons `expansion` 0/386 → 386/386**（新腳本 [`patch-dungeon-expansion.mjs`](../scripts/patch-dungeon-expansion.mjs)），來源＝XIVAPI `ContentFinderCondition.RequiredExVersion`。護欄用**英文名對位**（386/386 全對）而不是 patch——因為 patch 本身才是壞的：**抓到 18 筆 `patch` 與 ExVersion 矛盾，逐筆確認全是 `patch` 錯**（究極武器破壞作戰是 ARR 卻標 6.0、深空天坑是 7.0 卻標 6.0、亞歷山大機神城是 3.0 卻標 2.45），成因是 `build-dungeons.mjs` 走 XIVAPI **v1** 而 v1 已停更。已證實為錯的 patch 清成 null（保留錯值會讓版本篩選把副本分到錯的資料片），**但不猜正確值**。
    - **不要再試這幾條路**：Teamcraft `patch-content.json` **沒有 ContentFinderCondition 類別**，拿 CFC id 去比 achievement/action/item 會得到 385/386、386/386 這種「幾乎全中」的假象（不同 id 空間撞號）；`UnlockType`／`UnlockCriteria` 實測 386 筆全是 0；bosses／rewards 無 datamine 來源。
  - **坐騎頁有 4 筆玩家永遠拿不到的幻影條目**（新腳本 [`patch-collection-order.mjs`](../scripts/patch-collection-order.mjs)）：id 103 尼祿專用魔導裝甲（與 69 同一隻）、147 力氣大的魔象（與 146 同一隻）、149 真獅鷲（**真獅鷲一度在頁面上出現兩次**）、128 捕獲的魔導裝甲。判別依據是 **`Mount.Order === -1`**＝不在遊戲的坐騎手冊裡，不是「TC 站沒收」或「sources 是空的」那些症狀。**它們不是「取得方式待補」的資料缺口，是根本不該顯示的列**——先前把它們算進缺口是搞錯方向。引擎預設 `include` 加上 `order !== -1`（其餘 11 頁的 order 皆 ≥0，0 影響），**坐騎 301 → 297 隻**。順帶確認名稱沒有錯位：本地 `nameEn` vs XIVAPI `Singular` **0 筆不符**、TC 收藏站 **287/287 同 id 同名**。
  - **全站收藏頁的「無 sources」歸零**（坐騎 297／寵物 525／鳥鞍 100／樂譜 724／幻卡 435／表情 250／髮型 39 皆 0 筆）。樂譜最後 3 筆（白帝竹林／月下芳華／高貝扎四天王之戰）用 [`patch-sources-from-om.mjs`](../scripts/patch-sources-from-om.mjs) 從 `obtainable-methods` 補上「討伐戰」型別——**om 只給得出型別、給不出是哪一場，所以只寫型別不編 detail**。查過但沒用的路：TC 快照只有 682/724 且上游重抓仍是 682（不是快照過期，是來源沒收）、這 3 筆無配方（TC 標的 "Craftable" 是錯的）、`loot-sources.msgpack` 查無。
  - **青魔的副本名一直是簡轉繁**（新腳本 [`patch-blue-magic-content-ids.mjs`](../scripts/patch-blue-magic-content-ids.mjs)）：頁面早就寫好 `DUNGEON_NAMES[l.contentId] || l.detail`，但 **`contentId` 是 0/142，那段一直是死碼**。用五層「轉換後精確且唯一命中」補到 **141/142**，**35 個副本名換成台服官方名**（利維亞桑→真 利維坦殲滅戰、索菲婭→女神索菲亞、薩菲洛特→極 魔神賽菲羅特、莫古力賢王→善王莫古爾·莫古XII世、樵明洞→樵鳴洞…）。
    - 規則 0/A/B/C 是字面規則（直接 101／真 4／極 9／同字重排 4）；**關鍵是規則 D「簡中 datamine 反查」**——`ffxiv-datamining-cn` 的 `ContentFinderCondition.csv` 每列的 **key 就是 CFC id**，把它的簡中官方名轉繁後比對即可直接得到 id。本站這些副本名本來就是簡中官方名轉繁來的，**這等於沿同一條翻譯鏈往回走**，A–C 拆不掉的譯名差異一次解掉 23 筆。
    - **刻意不用模糊比對**：實測最相似項常常是錯的（「拉姆殲殛戰」最像「恩歐殲殛戰」、「索菲婭殲殛戰」最像「澤蓮尼婭殲殛戰」）。
    - **護欄＝兩條獨立路徑交叉驗證**：A–C 與 D 都解得出來的那批必須給出同一個 id，矛盾就中止不寫入。實測**一致 68、矛盾 0**，這才是敢採用 D 的依據。
    - 另有 5 筆是**我方資料寫錯字**（樵明洞／加巴勒／監牢鐵臂／帝國南方堡外圍激戰／伊修加爾德），列在腳本的 `DETAIL_TYPOS` 並逐筆附證據。仍剩 **1 筆「皇都伊修加爾德保衛戰」**——它解得出 CFC 885，但 The Steps of Faith 在 6.1 已從遊戲移除、`dungeons.json` 沒收，屬預期內。
    - 野外 **64/64 補上 `mapId`** 並把 detail 正規化成官方地名（庫爾扎斯→**庫爾札斯**西部高地）；同名多列時只取野外類（黑衣森林東部林區有野外 5 與副本 180 兩列）。**頁面新增 📍 開地圖**：只知地區沒有座標，所以 `map-modal.js` 加了「無座標」模式——不畫大頭針、座標列改標「整區皆可能」，**不要拿 0 或 NaN 去算位置**，那會把針釘在左上角看起來像真有這個點。

  **② UX 一致性**
  - **手機 430px 水平溢出修掉了**（站內既有現象，先前被歸類為「非本次造成」就一直放著）。根因不是 `100vw`：`.col-grid` 容器只有 367px，但軌道被算成 **`198px 198px`**（198×2＋10 gap＝406）——**`1fr` 的軌道下限是項目的 min-content**，各頁在窄螢幕寫死 `grid-template-columns: 1fr 1fr` 時就縮不回去。在 `common.css` 加 `.col-grid > * { min-width: 0 }`（等同 `minmax(0,1fr)`）一次修掉所有頁。**headless Edge + CDP 實量 25 個頁面，430px 全數 scrollWidth == clientWidth**（本機 headless Chromium 起不來，Edge 可用；Node 24 有原生 WebSocket，不必裝 puppeteer）。
  - **限時採集「即將開放」門檻 30 分 → 5 分**：ET 一天只有 70 真實分鐘，30 分鐘等於涵蓋 43% 的循環——實測 225 個節點取樣 200 次，平均 **160 個（71%）**同時掛著「即將開放」，等於沒有鑑別度（開放中才 16%）。改 5 分鐘後平均 27 個（12%），與「開放中」同量級。門檻改成具名常數 `SOON_SECS` 並附上量測方法。
  - **首頁「我的收藏進度」精簡成合計一行**（使用者指定）：原本 12 條個別進度條資訊量太大，改為只呈現 `合計 n / m（x%）` ＋一條總進度條，細項到各追蹤頁看。同日先做的「🎯 快完成了」提示列**依使用者指示一併移除**（`.pd-nearly` 與相關 CSS／JS 已全部刪除，`REG` 只留 `key`／`name`）。無任何進度時仍顯示區塊，讓「匯入全站進度」在換裝置時可用。
  - **首頁加「🕘 最近使用」**：26 個工具的卡片牆要捲很久。記錄點放在 `nav.js`（**每一頁都會載入**，所以不管從首頁點、用命令面板跳、還是直接開書籤都記得到），存 `ffxiv_recent_tools`，首頁沿用 `nav.js` 的 `TOOLS` 畫 chips（不另維護一份，否則新增工具會走鐘）。路徑比對取**最長相符**，否則 `tools/gathering-log/` 會被記成 `tools/gathering/`（已實測）。

  **③ 效能**
  - **市場查價頁不再阻塞在 10MB**：原本開頁 `await fetch('items.json')`，整包下載＋parse 完之前整頁不能動。實查那頁只用六個欄位，新增 [`build-items-market.mjs`](../scripts/build-items-market.mjs) → `data/items-market.json`：**10.0MB → 2.0MB（gzip 836KB → 471KB）**。三段瘦身＝只留六欄並改陣列列／category 換字典索引（113 種）／icon 只存 6 位數編號（路徑格式固定，**已對 43748 筆驗證資料夾都推得回來，不符就中止不產檔**）。**缺 icon 用 -1 不能用 0**——編號 0 是真的存在的（24225 演技教材·神典石）。展開後與 `items.json` 逐欄比對 **43748 筆 0 差異**。
  - **lazy loading 實查後只缺一處**（market 的製作清單表格列，可達數十列，已補）。其餘沒有 `loading=lazy` 的 4 張都是單張、首屏內的圖，加了反而有害；`map-explorer.js` 那張是選中地圖才載的底圖，也不該 lazy。多數頁面根本沒有 `<img>`（釣魚／樂譜／髮型都是 0）。

  **驗收**：`validate-data.mjs` **54 檔 0 error 0 warning**；`validate-links.mjs` mapId 類全數歸零；jsdom 追蹤頁回歸 **31/31**（含坐騎 297、真獅鷲去重、幻卡仍無名稱 11 筆、dungeons 欄位、11 頁 DOM 渲染）；headless Edge 實量 **25 頁 430px 全無溢出**、9 個改動頁 **0 console error**；market 搜尋「棉布」60 筆結果與 icon URL 正確；`bump-sw-version.mjs` 已更新（`sgt-e6dc6b20fc` → `sgt-d99ca5124e`）。

- **2026-07-26（全站統一：收藏切換一律是卡片右上角的 ✓ 鈕）**：使用者指定「統一全網站的點擊收藏為右上角，並且要相同的格式」。原本全站有四種長相——`.col-card.owned::before` 的 ✓ 角標（6 頁，不可點、靠點整張卡切換）、寵物圖示右下的 `.check-badge`、青魔法術書左上的金色方塊、幻卡右上的 ✓ 鈕。
  - **唯一定義處**：`assets/css/common.css` 的 `.ct-check` ＋ `assets/js/collection-tracker.js` 新增的 `buildCheck()`。引擎替每張卡片加 `.ct-card` 並掛上這顆鈕（右上 6px、24px 圓形、未收藏 opacity .55、hover 1、已收藏填 `--accent`）。自訂版型（青魔 `.bm-slot`、幻卡 `.tt-slot`）改呼叫 `tracker.buildCheck()`，不再各自刻一顆。
  - **卡片本身不再切換擁有**（使用者選定「只有右上角能收藏」）：誤觸是主因，卡片點擊留給各頁的 `onCardClick`（看詳情、開地圖）。`role=button`／`tabIndex`／`aria-pressed` 從卡片移到 ✓ 鈕上。要一次大量標記仍用工具列的「✓ 標記全部／✗ 取消全部」。
  - **各頁清掉自刻的擁有指示器**：common.css 的 `.col-card.owned::before`、髮型 `.hs-card.owned::before`、寵物 `.check-badge`、釣魚 `.fish-check` 圓圈（連帶 `onCardClick` 裡替它讓路的分支）、青魔的 `.bm-slot-mark`、幻卡的 `.tt-check` 樣式。**風脈泉與採集紀錄是子項目模式**（收藏單位是卡片裡的 chip），依設計不掛這顆鈕。
  - **讓位處理**：`.ct-card .col-name` 補 `padding-right:26px`（一次處理 6 個 `.col-*` 頁）、髮型 `.hs-info` 補 22px；**釣魚的 `.fish-patch` 版本號原本就絕對定位在右上角、正好被鈕蓋住 → 往左讓到 `right:2.3rem`**。7 頁副標改為「點卡片右上角的 ✓ 標記…」。
  - **驗收**：新寫 headless Chrome 逐頁探針（scratchpad 的 `ct-serve.cjs ?ctprobe=1` ＋ `ct-check.mjs`），對 12 頁量「鈕是否真的在右上角、電腦樣式跨頁是否完全相同、點卡片不會改變收藏、點鈕才會、鈕沒壓到卡內文字」→ **97 項全通過，✓ 鈕電腦樣式 12 頁只有 1 種**（`absolute 24px 24px 50% 6px 6px`）。青魔 jsdom 回歸 86/86；`validate-data.mjs` 0 error 0 warning；改了 `assets/` 的 css/js 故已跑 `bump-sw-version.mjs`（`sgt-be154ebf6a` → `sgt-e6dc6b20fc`）。

- **2026-07-26（幻卡追蹤：改成遊戲內幻卡手帳版型，並補齊漏掉的 14 張卡）**：使用者附上遊戲截圖指定「幻卡使用這個的格式一頁一頁呈現，比較貼近遊戲」，接著要求「不需要分清單、手帳」「檢查有沒有缺的幻卡，還有 15 張編號外的幻卡沒有納入」。

  **① 版型：整頁只有「幻卡手帳」一種呈現**（原本的 `.col-card` 清單整個移除，不留切換鈕）。對齊遊戲：**一頁 5×6＝30 格**（435 ÷ 30 = 15 頁，末頁 15 格，不足處補空格不縮版）、**頁籤一次列 5 頁＋«/» 換頁組**、右側詳情欄（編號／放大卡面／名稱／★／類型／版本／四向數值／取得方式含 📍 開地圖）、底部「總計 n / m」與 ⛛ 篩選（捲回篩選區）。引擎（`collection-tracker.js`）仍負責進度條／工具列／篩選／排序／分頁狀態，只是它的 `#ct-grid`／`#ct-pagination`／`#ct-empty` 一律用 CSS `!important` 收起、`card()` 回傳空字串。
  - **格子狀態**：未取得＝**灰階卡面**（依使用者指示，不用遊戲的「？」牌背——這是追蹤工具，要看得到還沒收到的卡長什麼樣；hover 才微微透出原色，選中時刻意不透以免看起來像已取得）；已取得＝彩色卡面＋強調色框。✓ 章只在 hover／選中浮出（狀態已由彩色／灰階表達，遊戲裡也沒有這顆）。
  - **分頁直接用引擎的 `pageSize: 30`**：手帳的「一頁」＝`onRender` 給的 `pageSlice`，所以頁碼跟著上網址 `?p=`（可分享、上一頁可還原），換篩選／搜尋／排序自動回第 1 頁，載入的卡面圖也從 435 張降到 30 張。**與青魔的「淡化不抽走」刻意不同**，理由見[慣例 §2.9](專案慣例與記憶.md#29-仿遊戲內圖鑑版型的做法2026-07-26青魔法術收藏首例)。
  - **鍵盤**：方向鍵移動（走到邊界自動翻頁）、Home/End 跳這頁頭尾、PageUp/PageDown 換頁、空白／Enter 標記已取得；焦點掛在格子容器上，重畫不掉焦點。
  - **引擎沿用不動**：`storageKey`／`schema`／`keyOf` 全沒改（既有進度不受影響）。

  **② 資料：425 → 435 張，頁面顯示由 421 → 435（＝遊戲內「總計 x/435」）**
  - **漏卡根因**：`build-triple-triad-all.mjs` 把張數寫死 `TOTAL_CARDS = 425`，7.1 開的 **編號 426–435 這 10 張**（卡尼洛喀站長／Ark Angel MR–EV／德庫洛涅／畝鼠米卡／Prishe／Shadow Lord）從來沒被抓進來。**張數的真實來源＝`items.json` 裡 category「九宮幻卡」的道具數（台服客戶端資料）**，目前正好 435，與遊戲畫面的「總計 x/435」一致。
  - **另有 4 張被前端誤擋**：`include` 原本要求「名稱含中文字」，把台服官方就是拉丁字母卡名的 **9S／2P／2B／N-7000** 判成未開放。改為 `!!c.name`（`name` 只來自台服卡片道具名，有值就是台服有）。連同新加的 Ark Angel MR–EV／Prishe／Shadow Lord，共 **11 張拉丁名卡**現在都正常顯示。
  - **新腳本 [`scripts/patch-triple-triad-new-cards.mjs`](../scripts/patch-triple-triad-new-cards.mjs)**（dry-run 預設、`--apply` 才寫入、可重複執行）：只補缺的卡，不整包重建（重建要 60–90 分鐘且會蓋掉手動校正）。每個欄位都可回查：名稱／patch／icon ← items.json；英文名／星級／數值／類型 ← XIVAPI **v2**（v1 已停在舊版本，`TripleTriadCard/426` 直接 404）；取得方式 ← `TripleTriadCardResident.Acquisition`（＝遊戲卡片一覽的「取得方法」），指向副本就對 `dungeons.json` 取繁中名、指向 NPC 就看它有沒有 `TripleTriad` 牌組（有＝NPC對戰，固定／隨機由牌組 Fixed／Variable 決定；沒有＝商店，只記 NPC 與地點、不猜貨幣）。位置對應（第 N 個卡片道具＝編號 N）每次執行都會對全部卡名驗一次，不符即中止。
  - **順手校正 26 張的 `patch`**：15 張原本是 null（版本閘門與版本篩選都吃不到）、11 張偏早（黑貓標 6.5 但道具是 7.01；編號 414–417 標 6.0 但道具是 7.0——卡片不可能早於它的道具）。一律改以卡片道具的 patch 為準；現在 435 張都有 patch，版本篩選各區間相加＝435。**注意：不要用「patch 隨編號單調遞增」當驗證**，實測有 29 處交錯（編號 173 是 3.55b、174 是 3.5），編號並非嚴格按上線時間發配。
  - **卡面圖**：`download-triple-triad-images.mjs` 原本抓 ffxivcollect 的 sprite sheet，該站已改版（CSS 裡的 `cards-large-*.png` 沒了，舊流程停在「找不到 sprite sheet URL」）→ 改為逐張抓卡片頁的大圖（`/assets/cards/large/<id>-<hash>.png`，本來就是 208×256，不必再放大，比舊的 104×128 上採樣清晰）。新卡 10 張已補齊 435/435，並移除 `assets/triple-triad/_sprite.png` 這個 7.7MB 中間產物（會跟著發佈上 Pages 佔額度，而且「新 CSS offset ＋ 舊 sprite」會安靜地裁錯圖）。

  **③ 排列順序：改成跟遊戲手帳一致（不是照編號）**
  - 使用者指出「有 15 張幻卡放在遊戲內最後一頁，並沒有在對應的編號內，確認 No.68~No.80 還有不知道哪兩張」。查 `TripleTriadCardResident` 得到答案：手帳排序是 **先 `UIPriority` 再 `Order`**。420 張 `UIPriority=0` 的卡依 Order 1–420 排，另外 **15 張 `UIPriority=5`（`SortKey` 都是 48）的 FF 歷代主角卡** Order 也是 1–15，於是整批被推到最後一頁（位置 421–435）。
  - 這 15 張＝**編號 68–80**（光之戰士／弗利歐尼爾／洋蔥騎士／賽西爾／巴茲／蒂娜／克勞德／史克爾／吉坦／提達／香托托／梵恩／雷光）＋使用者不確定的那兩張＝**編號 252 諾克提斯**（FF15）與 **編號 405 克萊夫**（FF16）。`(UIPriority, Order)` 是無並列的完全排序，420+15 剛好 435。
  - 資料新增 `order`／`uiPriority` 兩欄（同支腳本回填 435/435），前端 `prepare` 改照 `(uiPriority, order)` 排 → 每一頁的卡跟遊戲同一批。**編號 68–80 被抽走後，位置 68 由編號 81 遞補，其後每張普通卡的位置都比編號小 13**，所以詳情欄加上「手帳第 N 頁」徽章（算的是未篩選的完整順序，等於「進遊戲要翻到第幾頁」）。
  **④ 重新編號＋換頁列重做（2026-07-26 使用者指定）**
  - 使用者要求「把這 15 張當編號外幻卡重新編號，以及前面 420 張也重新照順序編號」。既然那 15 張在遊戲裡不在編號序列內，代表**遊戲的編號就是 `Order`（1–420）**，我們原本顯示 row id（1–435）才是跟遊戲不一致的那邊。現在：一般卡顯示 **編號 1–420**（＝`order`＝手帳位置），15 張主角卡顯示 **編號外 1–15**（金色標示），卡格左下角也印上編號（`外1`–`外15`），找特定編號不用逐張點開。**`id`（row id）只留作進度存檔的鍵**（`keyOf` 沒動，既有進度不受影響）。連帶效應：Shadow Lord 從「編號 435」變成「編號 420」，420÷30 剛好 14 整頁，所以**第 15 頁整頁都是編號外的 15 張**。
  - **換頁列重做**（使用者回報「很難使用」）：原本仿遊戲的 `« 1 2 3 4 5 »`，`«/»` 一次跳 5 頁一組，要到第 12 頁得先按兩次 `»` 再點 12。改成 **15 個頁碼一次全列出（一鍵直達）＋「‹ 上一頁 / 下一頁 ›」走單頁**，並讓頁碼列 **sticky 黏在頂列下方**（`top:46px`）——一頁 6 排卡片很高，捲到下面還要滑回去換頁本身就是個坑。頁數多到排不下（>20 頁）才退回「首末＋當前±3＋…」視窗式。PageUp/PageDown 與方向鍵翻頁照舊。
  **⑤ 驗收**：jsdom 回歸 100/100（格數／頁籤／總計／詳情／✓ 鈕與 localStorage 相容／鍵盤／換頁／篩選連動／空結果／📍／批次標記／popstate／新卡資料正確／11 張拉丁名卡都在／版本區間加總＝435／**最後一頁正好是那 15 張主角卡且第 3 頁已無主角卡**／無 console error）；`validate-data.mjs` 0 error 0 warning；headless Edge 實拍 1500・680・430px 與亮暗兩主題，並抽查新卡卡面（編號 435 卡面烙印的數值 A/4/A/4 與 sheet 一致）。430px 有水平溢出，但**未動過的坐騎頁同寬同樣溢出＝站內既有現象**，非本次造成。沒動 `assets/` 的 css/js，故不需 `bump-sw-version`（SW 對 HTML 是 network-first）。

  **⑥ 仍未處理（已知缺口）**：`sources` 的 `副本`（194 筆）與 `藏寶圖`（82 筆）是舊資料，上游只給 id 沒給名稱，詳情欄只能標「型別 ×n」；副本的 182 個 `instanceId` 只有 66 個對得上 `dungeons.json`（其餘是 2xxxx/3xxxx 的討伐戰／大型任務）。新加的 10 張已改用 `contentId`＋繁中 `detail`，舊的要補請回上游解，**不要在前端猜**。

- **2026-07-26（青魔法術收藏改成遊戲內〈青魔法之書〉版型）**：使用者附上遊戲截圖，指定「青魔法使用這樣的格式呈現，比較貼近遊戲」。
  - **新增「法術書」檢視並設為預設**（原本的 `.col-card` 清單保留為「卡片」檢視，切換鈕在 `#ct-root` 之前，狀態記在 localStorage `ffxiv_bluemagic_view`）。版型：**8 個頁籤 × 每頁 4×4 共 16 格**（124 ÷ 16 = 8 頁，末頁 12 格）、格子固定依 No. 排列（與遊戲書同位置，可照著對）、底部「技能總數 n / 124」。
  - **格子狀態**：未習得＝**原圖＋灰底**（依使用者指示，不用問號圖）；已習得＝強調色底＋左上金色方標＋號碼轉強調色（對應遊戲格子左上的小方塊）。頁籤右上小圓點＝該頁完成度（綠＝全習得／金＝部分／灰＝尚無）。
  - **篩選／搜尋改成「淡化」而非抽走**（`.bm-slot.dim`）：版面重排就失去「跟遊戲書同位置」的意義，所以不符條件的格子留在原位淡化，並在書下方標「符合 n 個，其餘格子淡化顯示」；整頁無符合的頁籤也一併淡化。
  - **右側詳情欄取代 hover 提示框**：帶出 No.、名稱、英文名、Rank／屬性／類型標籤、機制、取得方式（副本名仍走 contentId → dungeons.json 繁中名），並附「標記為已習得」鈕。窄螢幕（≤860px）自動疊到書下方。
  - **引擎沿用不動**：`storageKey`／`schema`／`keyOf` 全部沒改（既有進度不受影響）；書是掛在 `onRender` 上同步，格子只建一次、之後只換 class（整片重建會吃掉鍵盤焦點）。方向鍵可在整本書內移動並自動翻頁。
  - **同日第二輪（使用者回饋三點）**：
    1. **點格子從「標記」改成「檢視」**——原本詳情跟著 hover 走，使用者反映「滑鼠移出中間那格時會一路掃過旁邊的格子」，等於選不到想看的。現在點格子＝檢視（`.sel` 框標示），hover 不再換詳情；**標記已習得改點格子左上那顆方塊鈕**（原本只是裝飾，現在是真的按鈕：未習得空框／已習得填金色，`stopPropagation` 不連帶觸發檢視），詳情欄裡也還有一顆。格子因此由 `<button>` 改為 `div[role=button][tabindex=0]`（button 不能巢狀 button），Enter／空白鍵自己補。
    2. **篩選區壓縮**：4 組篩選改成「標籤與選項同一列、各組橫向流排」（`#ct-filters` flex wrap），1440px 下 4 組收進 1 列，法術書不再被推到很下面。
    3. **右邊留白**：拿掉 `.bm-book` 的 1000px 上限、書身 424→520px（格子更大），詳情欄吃滿剩餘寬度；詳情欄自身在 ≥1160px 再把「機制／取得方式」拆成兩欄。
  - **驗收**：jsdom 回歸 **86/86**（結構、點格子＝檢視、方塊鈕勾選、存檔相容性、詳情欄、淡化篩選、換頁、鍵盤、檢視切換、批次標記）；headless Chrome 實拍 1440／1100／500px 與亮暗兩主題，500px 無水平溢出（scrollW 485 ≤ 500）。只改 HTML 故不需 `bump-sw-version`（SW 對 HTML 是 network-first）。

- **2026-07-26（三頁的時間顯示統一：新增 ET 時鐘列共用元件 `assets/js/et-bar.js`）**：使用者指出釣魚紀錄追蹤、限時採集節點查詢、艾歐澤亞天氣預報「都有時間的顯示，但顯示的方式都不一樣」，要求**通通改成天氣預報的格式**。
  - **原本三套**：釣魚＝hero 橫幅內置中大字 `ET 20:26` ＋一行小字；限時採集＝卡片內左右兩塊（ET＋日夜 ｜ 本地時間），中間一條分隔線；天氣＝三欄時鐘列（ET 時鐘 ｜ 下次換天氣進度條 ｜ 現實時間）。
  - **新元件 [`assets/js/et-bar.js`](../assets/js/et-bar.js) ＋ [`assets/css/et-bar.css`](../assets/css/et-bar.css)**：版型取天氣預報那一套，三欄固定＝[艾歐澤亞時間＋日夜]／[週期標籤＋進度條＋倒數]／[現實時間＋「1 ET 小時 ≈ 2 分 55 秒」]。頁面只放 `<div id="etBar"></div>` 並呼叫 `mountEtBar('#etBar', { metric })`，元件自己每秒 tick。慣例見[專案慣例與記憶 §2.8](專案慣例與記憶.md#28-et-時鐘列共用元件-assetsjset-barjs2026-07-26-建立)。
  - **中欄是唯一的頁面差異**：天氣／釣魚用 `metric:'weather'`（下次換天氣），限時採集用 `metric:'ethour'`（下個 ET 整點）——採集節點只吃 ET 整點、不吃天氣，掛「下次換天氣」在那頁是雜訊。
  - **三頁原本各有的資訊全部保留**：限時採集的日夜（☀️白天／🌆黃昏／🌙夜晚，分界沿用原本的 5–17／17–19／其餘）與本地時間、釣魚的「1 ET 小時 ≈ 2 分 55 秒」，都併進統一版型。移除釣魚的 `.hero` 橫幅（裡面只有時鐘）與三頁各自的 `tickClock()`／`getEorzeaDate()`。
  - **驗收**：三頁在 1440px 亮／暗兩主題與 375px 行動版皆版型一致（截圖比對），0 console error，375px 無水平溢出；`bump-sw-version.mjs` 已更新快取版本（`sgt-de07b17519` → `sgt-be154ebf6a`）；`validate-links.mjs` 無新增斷鏈。

- **2026-07-26（收藏品判定改用權威旗標；新增 `data/collectable-items.json`）**：使用者指出「有些收藏品前面不會有『收藏用』字樣」，要我重查物品資料裡有沒有收藏品相關參數。**指正正確，我原本的分類器是錯的。**
  - **本機三個來源都沒有旗標**：`items.json` 只有 category／icon／ilvl／marketable／rarity／stackSize（收藏品的 `category` 一律「雜貨」、`rarity` 1、`marketable` false，都不足以判別）；`gathering.json` 也沒有；`items-lite.json` 只有 id→名稱。
  - **權威＝XIVAPI `Item.IsCollectable`**。逐筆核對限時採集節點的 **325 種產物**：
    - **48 種是收藏品卻沒有「收藏用」前綴**——火砂礫、雷砂礫、火光礫、強火性岩、赤玉土、腐殖土、水薄荷、野生鼠尾草、梅茵菲娜月桂、黑雷岩、陽風岩、金色樹枝、不定性結晶花、土之石英…
    - 反向 **0 種**（有前綴的必定是收藏品），所以前綴是**子集**，只會漏不會誤判。
    - 節點層級：前綴法 **38** 個 → 正確答案 **76** 個，**少算了一半**。
  - **`AlwaysCollectable` 也不能用**：它不是「專屬收藏品」的意思——64 個「收藏用○○」裡有 **48 個是 `false`**。判斷「能不能當收藏品採」只看 `IsCollectable`。
  - **新增 [`scripts/build-collectable-items.mjs`](../scripts/build-collectable-items.mjs) → `data/collectable-items.json`**：分頁掃 XIVAPI Item sheet（106 頁／52800 列），取 `IsCollectable` 為真且 `items.json` 有的，共 **1023 筆、6.4KB**。前端是靜態頁不能即時打 API，所以把旗標烘成資料。`--check` 可只比對不寫入。已登記進 `_meta.json` 的 `databases` 與 `data/SCHEMA.md` §2.1b。
  - **修正後的分佈**（213 個限時節點）：**收藏品 76／素材 137**，合計 213。收藏品×節點種類＝傳說 46／靈砂 30——**所有靈砂節點都可採收藏品**（前一版誤判為 0）。另有 38 個是「混合節點」（同一點既產收藏品也產一般素材，如「黑雷岩★、土之水晶」），依「任一產物可當收藏品即算收藏品」歸類，兩組因此互補不重疊。
  - **抽查驗證**：黑雷岩(43931)✓收藏品、陽風岩✓、金色樹枝✓、火砂礫✓、收藏用皇金沙✓；土之水晶／雷之水晶／風之水晶／圖拉爾明礬／真銀礦皆✗，符合預期。
  - **驗收**：頁面收藏品 76／素材 137／合計 213；`validate-data.mjs` **53 檔** 0 error 0 warning；0 console error。

- **2026-07-26（限時採集：移除「開放狀態」篩選，新增「產物類型」收藏品／素材）**：
  - **移除開放狀態篩選**：狀態每秒都在變，做成篩選會讓清單自己增減——這與「只在改篩選時才動」的原則衝突。狀態已改用顏色表達（開放中綠／即將開放黃／未開放灰），篩選這一組就是多餘的。
  - **新增「產物類型」：收藏品／素材**。與現有的「節點種類（傳說／靈砂）」是**不同的軸**——後者講節點本身，前者講節點產出什麼，所以群組名稱刻意分開命名。
    - **命名取捨**：站內用詞統計「素材」150 次（主流、也是台服製作材料的用詞）、「產物」49、「原料」13、「收藏品」6，最後採用**產物類型：收藏品／素材**（使用者選定）。
    - **分類依據見同日後續條目**——初版用「收藏用」名稱前綴判斷是**錯的**，已改用 XIVAPI `Item.IsCollectable`（38 → 76 個節點）。
  - **驗收**：篩選組變成 職業／節點種類／產物類型／版本（無開放狀態）；取消與復原正常；地圖檢視、顏色標示、靜置 8 秒不自己動皆維持；0 console error。

- **2026-07-26（限時採集：節點順序不再隨時間跳動，狀態改用顏色表達）**：使用者回報右邊的節點清單會因為篩選「跟時間」一直變動，要求只在改篩選時才動，並用顏色標示開放／即將開放／未開放。
  - **根因**：預設排序 `ver` 的比較條件是「版本 → 等級 → **開放狀態 → 倒數**」，後兩項都是時間算出來的。這頁每秒重畫一次，所以同版本同等級的節點會跟著倒數不斷重排；節點一開窗／關窗更是整列跳位。地圖（群組）順序又是取「該圖第一個節點在排序結果中的位置」，於是連左邊的地圖清單也一起漂移。
  - **實證**：抓當下那張圖的 5 個節點，全是 v7.x／Lv.100，倒數為 31秒 → 31秒 → 12分11秒 → 23分51秒 → 53分01秒 **嚴格遞增**——順序完全由倒數決定；第一個再過 31 秒就會關閉並掉到最後。
  - **改法**：`ver` 排序的 tiebreaker 由「開放狀態→倒數」改為 **節點 id**，變成完全與時間無關（版本 → 等級 → id）。`time` 排序保留給明確想看「現在能採什麼」的情況，下拉標籤加註「（順序固定）／（會隨時間重排）」講清楚差別。
  - **狀態改用顏色**：元件（`map-explorer.js`）改為把 `mx-s-<state>` 一併掛在 `.mx-point` 列上（原本只掛在小圓點），本頁再據此上色——**開放中＝淡綠底＋綠色粗體名稱與倒數／即將開放＝淡琥珀底＋琥珀倒數／未開放＝不加底、文字轉淡**。左側 border 仍保留給「選中」，不跟狀態搶。
  - **驗收**：靜置 8 秒地圖清單與節點順序皆不動；倒數已非遞增（37分43秒→14分23秒→2分43秒→…）確認與時間脫鉤；三種狀態的 computed 樣式各異（綠 `rgba(74,222,128,.1)`／琥珀 `rgba(251,191,36,.09)`／無底色）；篩選全部仍正確（職業 102、傳說 183、開放中 35/35、未開放 30/0、版本 7.x 18、交集 22、搜尋 28）；釣魚與採集紀錄兩頁不受元件改動影響、0 console error。
  - ⚠️ **驗證時的坑（第二次踩）**：在網址加 `?cb=` 只會破 HTML 的快取，**不會破 `import` 進來的 `map-explorer.js`**，會誤判成「改了沒生效」。改共用 js 後驗證請直接換 port 開新 origin。

- **2026-07-26（限時採集節點查詢：篩選版型對齊全站）**：使用者指出這頁的篩選方式跟其他頁不一樣。
  - **根因不是版型寫歪，是這頁從來沒接上共用樣式**：`tools/gathering/index.html` **沒有載入 `assets/css/common.css`**，整套設計自己手寫，連 `:root` 色票都複製了一份（且已飄移：`--text-muted` `#4a5568` vs 共用的 `#717c91`、`--transition` 0.2s vs 0.18s，另缺 `--cyan/--orange/--accent/--glow-*`）。所以 `.toolbar`／`.filter-section` 這些共用 class 在這頁根本沒有樣式可吃。
  - **改法**：補上 `common.css`（放在頁內 `<style>` 之前，頁面專屬樣式仍然勝出），**刪掉重複的 `:root`**（確認過所有用到的變數 common.css／theme.css 都有，刪除後全站色票才真的一致）。
  - **版型改為與其他 12 頁相同的兩段式**：上排 `.toolbar`（搜尋／地圖／排序／⭐ 只看追蹤），下方 `.filter-section` 分組標籤 chips（職業／節點種類／開放狀態／版本）。原本是**全部擠在同一列、沒有分組標籤**，版本與地圖用下拉、職業與類型還各多一顆「全部 XX」。
  - **互動也對齊**：篩選標籤改為引擎的語意——**每組單選、點已選中的等於取消**，所以「全部職業／全部類型」那兩顆多餘的標籤移除。原本的布林開關「僅顯示開放中」升級成**三選一的「開放狀態」組**（開放中／即將開放／未開放）。版本標籤沿用全站格式「N.x 資料片繁中名」。檢視切換移到控制面之上、改用與另兩頁相同的 `.view-toggle`。
  - **不遷入 `collection-tracker.js`**：那支引擎繞著「已擁有／進度」建（進度條、標記全部、匯出匯入進度、已/未三態），而本頁沒有「已採集」的概念——⭐ 是待辦清單＋鬧鐘。硬遷得在引擎加「無進度模式」，會動到 12 頁，不划算。只沿用它的樣式與互動語意。
  - **驗收**：職業 213→102 且再點一次還原、傳說 183、開放中 33/33、未開放 23/0、版本 7.x 18、職業＋版本交集 22、搜尋「水晶」28、地圖「中拉諾西亞」3，全部正確；只看追蹤的 `on`／`aria-pressed` 正確；追蹤列與鬧鐘四個元件（提醒／提前秒數／音效／試響）都還在；清單↔地圖來回正常；手機 390 無水平溢出；三頁 0 console error。
  - **順帶浮現的既有行為**（未改）：「即將開放」的定義是**現實時間 30 分鐘內**（≈10 ET 小時），所以這組佔比很大（實測 213 個節點中約 157 個）。原本只有「僅顯示開放中」時看不出來，現在三選一才顯現。要調整的話是動 `nodeStatus()` 的門檻，屬於另一個決定。
  - **改版型時自己弄出來的回歸（已修）**：使用者回報「地圖的左右留白沒了」。原因是替換工具列時，舊 `<div class="controls">` 的**結尾 `</div>` 落在替換區之外**，替換後多出一個，把 `.container` 提早關掉——`#gMapView` 因此變成 `<body>` 的直接子節點，吃不到 `.container` 的 `padding: 0 24px`。修掉多餘的那個 `</div>` 後 `.mx-layout` 的 left/right 回到 24/1416。**教訓**：整段替換 markup 後要驗 div 收支，別只看畫面（版面看起來「只是變寬」，很容易當成樣式問題）。已對三頁做 div 平衡檢查，皆為 0。

- **2026-07-26（釣魚頁新增魚餌篩選＋稀有度篩選：一般魚／魚王／魚皇）**：使用者要求加魚餌篩選與「一般魚／魚王／魚皇」，並指定先查清楚魚王與魚皇是什麼。
  - **查證結果**：**魚王＝釣場之王**（日文ヌシ、英文 Big Fish），綠色品質稀有魚，遊戲資料有旗標＝`fishes.json` 的 `bigFish`。**魚皇＝釣場之皇**（日文オオヌシ、英文 Living Legend），是魚王中條件最嚴苛的一階，**每個資料片版本末期只追加 6 隻**（2.4／3.5／4.55／5.55／6.55），共 30 隻；7.x 的要等 7.55／7.56，台服未到、資料庫（至 7.5）也還沒有。
  - **魚皇沒有任何資料旗標，只能維護名單**。實測 XIVAPI `FishParameter`：海中老人（8753，一般魚王）與波太郎（8775，魚皇）的 `AchievementCredit=267`、`IsHidden=true`、`IsInLog=true` **完全相同**；上游 fish-tracker `data.js` 的 21 個欄位裡也只有 `bigFish`。名單取自中文維基「釣場之皇」條目，寫進 `scripts/patch-fish-legendary.mjs` 標成 `legendary`。
  - **名單有交叉驗證過**：蒼穹／紅蓮／暗影／曉月四個資料片的 6 隻，剛好各自是該資料片 itemId 最大的**連續 6 個**（17588-17593、24990-24995、33239-33244、41407-41412），與維基名單完全吻合；重生之境（2.4）的 6 隻是散落的（8754/8756/8763/8768/8772/8775），只能照名單。腳本內建健檢：id 不存在、繁中名對不上、或該魚不是 `bigFish` 就中止，擋 id 漂移。
  - **三級互斥**：一般魚 1117 ＋ 魚王 267 ＋ 魚皇 30 ＝ 1414（版本閘門後全部）。所以「種類」組裡原本的「大魚」移除（會與稀有度重複），改補「🧠魚識」。卡片與詳情彈窗的標籤同步：`大魚` → `魚王`／`👑魚皇`。
  - **順手修掉一個資料錯誤：81 條魚的釣餌顯示成 id 字串**。上游 `bestCatchPath` 的每一段可能是 `[餌A, 餌B]`＝兩者皆可（82 條），`build-fishing.mjs` 直接 `.map(id => ({itemId: id, name: baitName(id)}))`，陣列那段就變成 `{itemId:[43849,43852], name:"43849,43852"}`——**itemId 型別錯了，畫面直接印數字**（星鯨的餌本來顯示「36597,36596」）。已修根因，並用 `scripts/patch-fish-bait-alts.mjs` 就地救回既有資料（壞掉的 itemId 陣列本身就留著兩個 id，名稱回查 items.json，不用連外）。新形狀：`{itemId, name:"星塵／震撼板鉤", alts:[{itemId,name},…]}`，篩選要一併比對 `alts`。
  - **魚餌篩選用下拉不用標籤**：有 85 種起始餌，標籤排不下。`collection-tracker.js` 因此新增 `render:'select'`（＋`allLabel`），舊的標籤路徑原封不動移進 `else`。**只列「掛在鉤上的第 0 段餌」**——以小釣大後面那幾段是要現釣的魚、不是買得到的餌，列出來只會誤導。選項標籤帶使用數並依數量排序（蜜蜂餌 60、黃金幼蟲 49、嘭嘭擬餌 49…）。
  - **用詞改成「魚識」**：卡片標籤、篩選選項、詳情彈窗原本寫「直感」，使用者指定改為**魚識**（以小釣大的那個機制），全站已無「直感」字樣。詳情彈窗那列原本是「捕魚人直感」，直接改成「魚識」（「捕魚人魚識」讀起來重複），秒數改「（持續 600 秒）」。
  - **篩選區改成橫向流排**：6 組直排會吃掉 **470px**，第一批魚卡被推到很下面。`#ct-filters` 改 `display:flex; flex-wrap:wrap`（只加在釣魚頁，沒動共用樣式）——選項多的地區獨佔一列，稀有度／種類／魚餌／目標魚並排一列，版本一列，**470px → 199px**。手機 390 每組仍各自換行，無水平溢出。
  - **驗收**：jsdom 回歸 31 項全過（舊標籤路徑 8 項＋新下拉路徑 12 項＋其餘 11 個追蹤頁資料載入渲染）；實機 1440／390、深淺兩色系皆正常、0 console error；魚皇篩選 = 30 種 / 30 張地圖 / 30 個釣場（每張圖一隻，與維基說法一致）；嘭嘭擬餌 = 49 種 / 7 張地圖 / 19 個釣場；星鯨的餌已正確顯示「星塵／震撼板鉤 → 事件穹界的回歸者」；`validate-data.mjs` 53 檔 0 error 0 warning、`validate-links.mjs` mapId 類全數歸零、SW 已 bump。

- **2026-07-26（釣魚紀錄追蹤補上版本閘門）**：使用者指出釣魚頁沒做版本管控。實查屬實——全站 12 個追蹤頁只有它把引擎的 `include` 覆寫成 `() => true`，舊註解寫「魚庫本身即台服可見範圍，不另做 patch gate」。
  - **那句註解是錯的**：`fishes.json` 有 **35 筆 patch 7.2–7.5**（7.2×8／7.3×11／7.4×8／7.5×8）。它們的 `itemId` **完全不在 `items.json`**（`validate-links` 早就報 `fishes.itemId → items 35/1449`，一直被當成「預期內」），`name` 全是 `null`，而卡片是 `f.name || f.nameEn` —— 所以這 35 筆會以**英文名**露在頁面上（Goldentail、Prime Adjudicator…），違反繁中名鐵則。
  - **改法**：拿掉覆寫，沿用引擎預設 `e.name && e.name !== e.nameEn && PatchGate.released(e.patch, gp)`。**兩條規則在這裡完全重合**（版本 > 7.15 的 35 筆＝無繁中名的 35 筆，集合相同），且 `name === nameEn` 的魚有 **0 筆**，故預設規則不會誤殺。**1449 → 1414 種**。
  - **確認沒有連帶損傷**：① 被擋的 35 筆碰到 32 個既有釣場，但每個釣場都還有 **≥3 條**已開放的魚，所以地圖上的釣場數維持 **307**、64 張地圖不變；② 倖存 1414 筆的**餌 1058 條、獵物 53 條全部有繁中名**，沒有其他英文外洩；③ patch 為 null 的 345 筆 itemId 全在 `items.json`（台服已開放、只是缺 patch 標記），依規則不主動隱藏是對的。
  - 版本篩選 7.x 由 195 筆組成（7.0×186＋7.1×9），與擋掉 7.2 以上一致。`<meta description>`／README 的「1449 種」同步改為 1414。
  - **驗收**：頁面顯示 `1414 / 1414 種`、8 個 7.3 英文魚名在整頁 innerText 中**皆查無**、0 console error。

- **2026-07-26（地圖檢視排序修正：工具列排序終於作用到地圖、預設改版本新→舊）**：使用者回報「排序功能未生效」。
  - **確認是真的沒生效**：三頁在地圖檢視下改排序下拉，地圖清單與地點列**完全不動**（實測 `mapsChanged:false, rowsChanged:false`）。原因是我在共用元件的第一版為了 DOM 穩定，在三頁的 `points()` 都寫死 `sort((a,b)=>a.id-b.id)`，把頁面排序好的順序整個蓋掉。
  - **修法不是「拿掉排序就好」**——限時採集頁每秒重畫，順序若進結構簽章就會每秒重建 DOM、打斷倒數與捲動。改成**簽章分兩種**：結構簽章只看「有哪些地圖、各有哪些地點」的**集合**（id 排過再串，刻意與順序無關）；另加一個**順序簽章**，順序變動時只用 `appendChild` **搬既有節點**（詳情卡跟著它那一列一起搬）。實測換排序後 `domReused: true`——節點是同一顆，沒有重建。
  - **地圖（群組）順序也跟著排序走**：以該圖第一個地點在排序結果中的位置定序，所以換排序時左邊地圖與右邊清單一起動。`type=instance／dungeon` 殿後的規則保留（雲冠群島仍在最後）。
  - **釣魚頁的釣場順序要重新推導**：原本走 `SPOTS.values()`（id 序），改成走 `filtered`（已排序的魚）逐條跑、釣場以第一次出現定序。**兩種推導的釣場集合已比對過：都是 307 筆、差集為空**，只有順序不同。
  - **預設排序改為版本新→舊**：釣魚 `defaultSort: 'window'` → `'patch-desc'`；採集紀錄新增 `defaultSort: 'patch-desc'`（原本第一項是名稱）；限時採集 `sortMode` 預設 `'time'` → `'ver'`，下拉標籤改為「排序：版本新→舊＞等級」。三頁開頁第一張圖都是 **v7.0 圖拉爾**。
  - **一個看起來像 bug 但不是的情形**：限時採集的 `ver` 在版本與等級都相同時，tiebreaker 就是「開放狀態→倒數」，所以在同版本同等級的地圖上（例如德拉瓦尼亞河谷地 7 個節點全是 v3.x／Lv.60）`ver` 與 `time` 的順序本來就一樣。已寫進慣例文件避免下次誤判。
  - **驗收**：三頁換排序後 `mapsChanged: true`；釣魚與採集紀錄 `rowsChanged: true`、`domReused: true`；三頁預設排序皆「版本新→舊」、預設地圖檢視、**0 console error**；`validate-data.mjs` 52 檔 0 error 0 warning；SW 已 bump。

- **2026-07-26（地圖檢視三項回饋：預設開地圖、雲冠群島排最後、修好「消失的地圖」）**：
  - **三頁改為開頁就是地圖檢視**（原本預設清單）：`setView('map')`／`setGView('map')` 放在各頁 init 尾端，清單隨時可切回去、不記憶選擇。
  - **雲冠群島排到最後**：元件的地圖排序改為「野外／主城在前，`type=instance／dungeon` 最後，各組內再依地點數多→少」。雲冠群島有 49 個採集點（全站最多）所以原本永遠排第一，但它是要另外進本的特殊區域，擋住了真正常用的野外圖。採集紀錄頁實測位置 1/47 → **47/47**。
  - **「雲冠群島的地圖消失了」真正的原因不是圖沒下載**：`assets/maps/a2fx_00.jpg`（629KB）其實一直都在，但 `data/maps.json` 的 584 把 `image.key` 寫成 **`default/00`**——那是 XIVAPI 的空白羊皮紙佔位圖。前端去要不存在的 `default_00.jpg` → 404 → fallback 抓遠端，於是拿到一張沒有地形的米色底圖，看起來就像地圖不見了。
    - **根因**：`scripts/fix-mapkeys.mjs` 以**英文地名**比對 XIVAPI Map 列、同名多列時取第一個。「The Diadem」在遊戲裡有多列 Map，其中一列的 `Id` 正是 `default/00`。已加規則：**同名多列時佔位圖永遠讓位給有真實底圖的那列**。
    - **既有資料補正**：新增 [`scripts/patch-map-default-images.mjs`](../scripts/patch-map-default-images.mjs)（dry-run 預設、`--apply` 寫入、idempotent；逐筆連 XIVAPI 查該列真實 `Id` 再寫，不憑印象填）。全庫掃出 **2 筆**中招：**584 雲冠群島 → `a2fx/00`**、**557 完璧王座 → `n4fb/00`**（後者未被任何採集點／釣場引用，一併修正）。
    - **驗收**：下載 `a2fx/00` 目視確認標題橫幅是 The Diadem、地形是浮島群（`default/00` 則是全空白）；修完後採集紀錄頁選雲冠群島，底圖 2048×2048 正常載入，49 個採集點**全部落在浮島上**，反過來交叉驗證了座標換算。
  - **`body.mx-mapmode` 規則搬到 `assets/css/common.css`**（原本由地圖元件注入）：採集紀錄頁的元件是動態 `import()`，規則若跟著元件才注入，開頁預設地圖檢視時卡片清單會先閃一下。
  - **驗收**：三頁 `defaultIsMap: true`、list↔map 來回正常、**0 console error**；`validate-data.mjs` 52 檔 0 error 0 warning；SW 版本已 bump。⚠️ 實測時一度以為改動沒生效，實為**瀏覽器快取舊的 `map-explorer.js` 與 `maps.json`**——改共用 js/json 後驗證請換 port 或強制重新整理，別誤判成程式沒改對。

- **2026-07-25（釣魚／採集三頁地圖檢視重做，抽成共用元件）**：使用者要求「釣魚跟採集的地圖搜尋功能重新製作」。實查三頁後動工：
  - **先找到真正的壞處：釣魚頁的地圖檢視是壞的**。`setView()` 把 `#ct-grid` 設 `display:none` 後又呼叫 `renderCurrent()`，而 `collection-tracker.js` 的 `renderGrid()` 會無條件把它設回 `''`（[該檔第 328 行](../assets/js/collection-tracker.js#L328)）。結果切到「🗺️ 地圖」時魚卡清單完全沒收起來，地圖被推到頁面 **5748px** 以下，等於找不到。採集紀錄頁是同一個潛在雷（它剛好沒在 setView 後重畫，但**在地圖檢視下改任一篩選就會復發**）。正解不是改引擎（會波及 12 個追蹤頁），而是改用 `body.mx-mapmode` class ＋ `!important`，inline style 才不會被洗掉。
  - **新增共用元件 [`assets/js/map-explorer.js`](../assets/js/map-explorer.js)**，三頁共用，版面沿用無人島採集地圖：**左底圖標點、右搜尋＋清單，兩邊連動**。原本三頁各自手寫「一個下拉選單、一次只能看一張地圖、右半邊全空」，現在改為右欄一次列出所有符合篩選的地圖（`64 張地圖 · 307 個釣場`），選中的那張展開該圖的地點列，點進去在原地展開詳情。點地圖圓點會選中並把對應列捲進視野，點列則切到該張地圖並高亮圓點。
  - **「搜尋」是這次的重點**：搜尋框跨地圖吃地圖名／地區名／地點名／產物名——在釣魚頁打「銀鯊」直接得到 `4 張地圖 · 5 個釣場`，不必先猜牠在哪張圖。
  - **效能**：限時採集頁每秒重畫一次，所以元件把重畫拆成兩層——結構簽章（地圖分組＋地點順序＋選中項）變了才重建 DOM，狀態顏色與倒數文字每次只做原地 patch，搜尋框永不重建。實測選中節點的詳情卡倒數 1分21秒→1分19秒且 DOM 節點不變。**代價是 `points()` 的順序必須穩定**，三頁都固定依 id 排序。
  - **詳情卡兩種更新法**：倒數在跳的用 `tick(point, el)` 原地更新（限時採集）；內容因勾選而變的用 `detailSig(point)` 併進簽章觸發重建（釣魚的 ✓ 已釣、採集紀錄的 ✓ 已採）。少了後者會出現「勾了產物但 ✓ 沒亮」——已驗證修正。
  - **各頁保留原有語意**：釣魚＝藍(尚有未釣)／金(已全釣)、限時採集＝綠(開放中，圓點脈動)／黃(即將)／灰(未開放)＋追蹤星＋時窗＋📋 flag、採集紀錄＝橘(採礦工)／綠(園藝工)／金(已全採)＋產物勾選（滑鼠與 Enter/空白鍵都可）。三頁都在清單下方標出「另有 N 個無座標的點只在清單檢視顯示」（採集紀錄 99 個、限時採集 6 個）。
  - **順手修掉**：釣魚頁 `renderFishMap` 原本每次重畫都對 1449 筆做 `allFish.find()` 反查，改建 `FISH_BY_ID` Map；地圖欄 sticky 由 `top:12px` 改 `58px`（否則被全站頂列蓋住，見慣例 §2.6）。
  - **採集紀錄頁的「🗺️ 地圖」按鈕根本找不到**（使用者回報）：`.gl-viewbar` 排在 `#ct-root` **之後**，而 `#ct-root` 連 40 張卡片格線＋分頁都渲染在裡面，等於按鈕被壓在整頁卡片底下（頁高 6730px、按鈕在 5000px 之後），要捲到底才看得到。已搬到 `#ct-root` 之前，與釣魚頁一致——現在按鈕在頁面 173px 處，一進頁就看得到。**新增有檢視切換的頁面時記得：切換鈕一律放 `#ct-root` 前面。**
  - **驗收**（本機靜態站 + headless Chromium，桌機 1440／1280、手機 390）：三頁 list↔map 來回切換、切到地圖後改篩選清單不再跑回來、跨地圖搜尋、點圓點↔點清單雙向連動與捲動定位、勾選即時反映、限時採集倒數原地更新、追蹤星、深淺兩色系皆正常，**三頁 0 console error**，手機無水平溢出。`validate-data.mjs` 52 檔 0 error 0 warning；`validate-links.mjs` mapId 類全數歸零；`bump-sw-version.mjs` 已更新（新檔自動納入雜湊）。

- **2026-07-25（時尚品鑑全面改版：推薦標準／換週流程／過渡期顯示／清單加值）**：使用者回報「每次更新都用不一樣的方式顯示」，並指出染色也要花錢、也要找購買方式，且完整清單不該只能複製名稱。逐項處理：
  - **根因確認（git 歷史佐證）**：答案的完整性寫在**人工散文**（`scoring.note100`／`easy80.note`／`easy80.desc`）而非資料結構裡——440 給 4 件、441～443 給 3 件＋一段文字補述，沒被推薦到的部位有時交代有時不交代，item 欄位也逐週漂移（`npc`／`alt`／`dye` 時有時無）。schema 2 已刪除全部散文欄位。
  - **推薦標準重訂**：舊標準只排裝備的取得管道、把染色當免費。新標準代價分三層依序比較——① 門檻（部族聲望／製作職業／限時活動／看運氣）② 金幣總額（裝備＋染劑，每染一格算一支）③ 件數；以列舉「湊哪幾件提示裝 × 染哪幾格」的 2^10 組合求最佳解，**不再人工挑件**，並同時輸出「最省」與「完全無門檻」兩解。
  - **實證效果（week 443 同一週）**：舊頁「省事 80 分・全程 116 金幣」是錯的——要染的萄乾棕只有南薩納蘭蜥蜴人族雜用商人賣（**需部族聲望**），100 分方案的東洲藍是**刻木匠製作限定且不可交易**。新標準下 80 分線＝**146 金幣・0 染劑・0 門檻**，100 分線＝**472 金幣・0 染劑・0 門檻**（另 1 件身體裝需製作／市場板，已單獨標示且不計入總額）。
  - **新增 `data/dyes.json`（114 支）**：顏色色票（Stain.Color）、染色面板分組、可否上市場板、完整取得管道（金幣價／兌換貨幣／製作職業／販賣 NPC 繁中名與座標）與門檻。統計現實：**只有 20 支可上市場板、62 支有門檻**，蠻族雜用商人壟斷一批常用色。
  - **新增 `data/fashion-fillers.json`**：「穿任意裝備染色」是陷阱——頭部最便宜的三頂蛋殼帽 `DyeCount` 全是 0，根本染不上去。改為五個防具部位各給一件全職業／NPC 直購／確定可染的具體件（全套 550 金幣），被剔除的候選留在 `rejected` 當證據。武器不做通用填充（一定有職業限制）。
  - **新增 `data/fashion-themes.json`（week 440–525）**：主題名可離線預查（row = 週次+9）。**過渡期因此能顯示「第 444 週・風信子冒險者」這個真主題**，而不是空白或把上週答案擺最上面。
  - **換週狀態機**：確認**遊戲端沒有空窗期**（週二 16:00 收榜＝新主題揭曉同一刻），所謂過渡期是本站資料落後造成的，故狀態＝遊戲階段（時鐘算）×資料新鮮度（週次比對＋status）共七個，含資料超前防呆。來源站 `lastOptions` **沒有新鮮度旗標、週次會停在舊值**，唯一可靠判斷是拿 API 週次比對自算週次；腳本在週次不符時**主動拒跑**不覆蓋存檔。另修掉舊 `fmtMD()` 用瀏覽器本地時區取日期卻硬寫 16:00 的時區不自洽。
  - **完整清單加值**：每列加需求等級／裝等、可裝備職業、**可否染色**、**性別種族限制**、販賣 NPC＋可點地圖、市場板查價連結、版本、複製英文名；可依部位／取得難度篩選，依價格／等級排序，中英文搜尋。預設依「好不好取得」排。
  - **管線全程式化**：新增 `scripts/build-fashion-report.mjs`（一支到底，含計分公式回頭驗算：拿來源站 easy80／easy100 代入公式，對不上就中止）＋`build-dyes.mjs`／`build-fashion-fillers.mjs`／`build-fashion-themes.mjs`＋共用模組 `scripts/lib/game-sources.mjs`。週更由「9 步驟半手工」變成跑一支腳本。
  - **兩條新硬規則（寫進 `game-sources.mjs` 檔頭）**：① **只採台服查得到 NPC 與地圖的商店**——曾把「草布半指手套 42 金幣」指到台服未開放 map 1003 的 NPC「Godgyth」；② **價格與販賣者必須同源**，不可拿 A 店價格配 B 店 NPC。
  - **⚠️ 國際服 7.5 已把單色染劑整併下架**，Garland／XIVAPI／英文 wiki 都查不到那些染劑的取得方式；台服停在 7.15 仍用舊系統，染劑資料只能用本站 7.2 離線資料。台服升 7.5 時整個染劑層要重做。
  - **文件**：新增 [fashion-report-spec.md](fashion-report-spec.md)（唯一權威規格），SOP 重寫為「跑一支腳本＋錯誤處置表」，workflow 降為歷史紀錄。
  - **驗收**：`validate-data.mjs` 52 檔 0 error 0 warning；前端以 DOM stub 跑 render 回歸（本機無 headless Chromium），版面八項檢查全過、無 `undefined`／`NaN`／`[object Object]` 洩漏，七個換週狀態逐一驗證文案與徽章正確。

- **2026-07-25（時尚品鑑 week 443 更新）**：依 [SOP](fashion-report-update-sop.md) 更新 `data/fashion-report.json` 到 **week 443「真麻正式裝」（True Linen Formal）verified 版**。本週 4 個提示各異、分佈四部位：頭＝野獸（Animal Instincts, cat 4）、身＝真麻（True Linen, cat 97）、手＝正式（Fresh and Formal, cat 20）、腿＝垮襠（Suddenly Sarouels, cat 124）。接受清單 **84 件（頭 53／身 14／手 3／腿 14）**，映射驗收 84/84、同名歧義 0、無台服名 0。染色 6 部位：武器＝珊瑚粉、頭＝萄乾棕、身＝鼴鼠棕、手＝珍珠白、腿/腳＝東洲藍（`萄乾棕` 為台服官方縮寫名，非漏字，已回查 items.json 確認）。本週為近期最省：easy80＝手部「草布短手套」（NPC 116 金幣）＋頭/身各染萄乾棕/鼴鼠棕；easy100＝頭「飛龍革禦敵鬃盔」染萄乾棕＋手「草布短手套」＋腿「棉布垮褲」染東洲藍，身/腳任意裝備染鼴鼠棕/東洲藍補分。**全 84 件均為固定成本可取得（NPC 金幣／各式軍票／狼印戰績／製作／少數副本掉落）**，故直接採用社群驗證版、無需替換。SOP 步驟 5（改道 items.json）／步驟 6（通用版染劑優先）兩條 week 442 新規本次照跑無阻。瀏覽器實測（桌機 1440／手機 375）：週次 443、100/80 分卡與染色標籤、6 格染色表、84 件完整清單（53/14/3/14）皆正確，無 console error。

- **2026-07-24（無人島動物時鐘補齊至 43/43）**：使用者要求參考 [素素無人島動物時鐘](https://wrd.ffsusu.com/#/bell) 補上剩餘 14 種（6.4 後追加）、簡體直接轉繁不標註。
  - **資料來源**：素素時鐘元件內嵌一份 spawn JSON（key＝MJIAnimals row id，值含 x/y/weather/spawn/duration）。從頁面 chunk 抠出（`umi.js` 模組 96259），對回我方 row id。
  - **對位驗證**：素素素材表每列帶動物 Icon（070NNN）＝MJIAnimals.Icon，用它精確對回 row，並逐筆比對基本/稀有素材與 datamine 的 rewards，43 列全部吻合。
  - **交叉驗證既有 29 筆**：拿素素 id 1–29 的出現資料回頭比對我方（來自 steamxo）——**時窗與天氣 29/29 全同**，座標 22/29 相同、7 筆差 1 格（量測誤差，採我方原值）。兩個獨立社群站的時窗/天氣完全一致，可信度高。
  - **補上 id 30–43**：名稱簡中直接轉繁（獅鷲／樂園虎／魔界花骨朵／石英・紫晶・古怪魔石精／狂野・樂園疣豬／魔菇／阿爾科諾斯特／魔界花／精金龜／無齒翼龍／巨礦爬蟲），依使用者指示不另標註。體型/稀有度/常駐與否與 datamine 完全對得上（33/35 是 r1 故常駐、34/37 限時）。**這些是簡中民間譯名非台服官方**（BNpc 非物品、tw-items 不涵蓋），已記在 `_animalSource2.knownIssues`。
  - 天氣代碼 3「阴云」對齊我方無名島天氣名「陰天」；14 筆天氣皆落在無名島 6 種內，build 護欄通過。
  - 驗收：jsdom **89/89**；id30–43 機率反推最大誤差 0.13 個百分點；validate-data 0/0。


- **2026-07-24（無人島：素材反查與採集地圖合併、工坊類型可點篩選）**：兩點 UX 回饋。
  - **素材反查＋採集地圖合併成一個分頁**（`🗺️ 採集地圖／素材`）：五分頁→四分頁。桌機左地圖、右素材清單／詳情；兩邊連動——選素材會在地圖上以金框標出它的採集區域圈，點地圖圓圈會列出該區素材、可再點進詳情（同頁不跳走）。原本「素材詳情按開地圖→彈窗」「地圖點素材→切到素材反查分頁」的來回都省掉了。舊網址的 `?t=mat`／`?t=map` 相容導向新分頁。
  - **工坊生產的製作類型不再標「非台服翻譯」**：主題名已補繁中（`cn-hant`），使用者反映工坊頁不需要那個提示，移除主題標籤的虛線／tooltip 與 filter-label 的說明（素材反查的建築名仍保留標注）。
  - **卡片上的製作類型可點**：類型標籤從 `<span>` 改成 `<button>`，點了直接把工坊生產篩到那一類、對應 filter chip 同步 active、同步網址；再點同類取消。
  - 驗收：jsdom 無人島頁 **89/89**；validate-data 0/0。


- **2026-07-24（無人島動物時鐘：體型分類＋捕捉道具、時鐘放大）**：使用者兩點回饋。
  - **體型分類＋捕捉道具**：資料層本就有 `size`／`sizeName`（小/中/大），這次補上 `capture`——體型決定捕捉道具是**遊戲固定機制**（小→捕獸網 37615、中→捕獸繩 37616、大→捕獸用睡眠球 37617），itemId 是真實道具、名稱走 `items.json` 官方名，且對應關係已被開拓等級表交叉驗證（2 級捕獸網→小、6 級捕獸繩→中、8 級睡眠球→大）。前端加**體型篩選**（小/中/大，可與狀態／素材疊加、同步網址），卡片條件區顯示捕捉道具＋icon，體型標籤帶 tooltip。
  - **時鐘放大**：`anNow` 從一行小字改成**大型 ET 時鐘**——時:分 52px、秒 26px、等寬數字（`tabular-nums`）、金色光暈，每秒走動；島上天氣／下次天氣倒數移到時鐘右側分隔欄。
  - 驗收：jsdom 無人島頁 **74/74**；validate-data 0/0。


- **2026-07-24（無人島：縮圖、採集工具與重疊區、繁中名、第三期等級表）**：使用者一次給了五項回饋，全部完成。
  - **① 全站加縮圖**：新增 [`scripts/download-island-icons.mjs`](../scripts/download-island-icons.mjs)，把 **271 張圖示**（動物 43／工坊生產品／素材／採集工具／建築）縮成 48×48 png 存進 `assets/island/icons/`（合計 1.7MB）。**為什麼存本機**：頁面載不起 10MB 的 `items.json`，所以 icon id 改由 `build-island.mjs` 寫進各 `island-*.json` 的 `icon` 欄；圖檔本機化則讓 SW 能離線快取，與收藏頁一致。
  - **② 採集區域重新審視 — 補上兩塊真正缺的資訊**：原本只列「這圈有哪些素材」，但那不足以規劃。
    - **所需工具**：解出 `MJIGatheringItem.Tool → MJIGatheringTool → MJIKeyItem → itemId` 這條鏈（**沒解鎖工具就採不到，這才是關鍵**）。11 種：徒手／石斧／石錘／銅鏟／銅鐮／青銅魚叉／十字鎬／鐵斧／鋼錘／秘銀十字鎬／鑿子。地圖加「只顯示這把工具採得到的區域」篩選。
    - **重疊區域**：圓圈會互相重疊，站在交界處那幾圈的素材都採得到。加 `overlaps` 與 `reachableCount`——**區域 #9 自己只有 2 種，但與 6 個圈重疊，站那裡實際可採 17 種**。這是原本完全看不到的資訊。
  - **③ 非物品名改用繁中**（使用者指示「直接翻譯成繁體就好」）：建築 25／主題 16／地區 6／分類 9 全部補上，標 `nameSource: "cn-hant"`，頁面以虛線底線＋tooltip 標注「非台服官方譯名」。**這個口子只開給非物品字串**——物品一律走 `items.json`，理由見下。
  - **④ 第三期「開拓等級」上線**：1–20 級的經驗門檻（`MJIRank`）＋各級解鎖內容（datamine 沒有，`MJIRank.LogMessage[]` 只是跨等級重複的通用訊息 id），解鎖內容整理自 [素素無人島攻略](https://wrd.ffsusu.com/#/guide)。**經驗值逐級對回 MJIRank：19/19 完全一致**；工具解鎖也與上述工具鏈逐項吻合。可搜尋、素材可點跳轉。
  - **⑤ 簡轉繁在專有名詞上會錯得很像真的——這次抓到 6 個實例**：`开拓用鹤嘴锄`→官方**開拓用十字鎬**、`高级捕兽用催眠球`→**高級捕獸用睡眠球**、`海岛红辣椒`→**海島紅彩椒**、`海岛西葫芦`→**海島櫛瓜**、`海岛西兰花`→**海島花椰菜**、`长臂虾`→**無人島長臂蝦**。另外**我自己逐字轉的「開拓工房」也是錯的**——官方物品叫「**開拓工坊**酸泡菜／烤南瓜／水煮蛋」，是靠反查 `items.json` 才發現。因此 `build-island.mjs` 新增**護欄**：等級解鎖敘述裡以「」括起來的詞若不是 `items.json` 的台服官方物品名、也不在 `NON_ITEM_TERMS` 白名單內，**直接 throw**（已實測攔截）。
  - 驗收：jsdom 無人島頁 **60/60**；validate-data 0 error 0 warning。**本機 headless Chromium 起不來（已知），無瀏覽器截圖驗收**。

- **2026-07-24（無人島第二期上線：動物時鐘）**：使用者提供 [steamxo 的動物一覽](https://www.steamxo.com/2023/01/05/2700775)（「雖然是無官方確認，但資料應該是正確的」），卡了三天的動物名與出現條件解鎖。
  - **沒有直接採信，先做了逐筆對位驗證**：文章只給名稱／體型／時間／天氣／座標／產出，沒有 row id。以「**體型＋稀有度＋兩項報酬素材的先後順序**」對回 `MJIAnimals`，29 筆中 **27 筆唯一命中**；剩兩組歧義各自解掉——奧猴／松鼠報酬完全相同，改**比對 Icon 圖像**（70123 靈長類大眼＝奧猴、70127 尖吻齧齒＝松鼠）；洞山羊／水牛同為 L·乳汁+角片，由稀有側 `id20`（角片+乳汁）鎖定 sort10＝水牛、餘者 sort13＝洞山羊。**稀有度不是文章給的**，是由「常駐 / 與常駐同座標 / 座標獨占」推的，等於多一層獨立約束。
  - **名稱另有台服官方佐證**：29 個名稱的生物詞幹全部能在 `data/monsters.json`（`nameSource=tw-mobs`，台服官方怪物名）找到同詞條——奧猴／碧企鵝／松鼠／星點栗鼠／渡渡鳥／雌羚羊／雄羚羊／公洞山羊／母洞山羊／短吻鱷／猴面雀／席茲／刺草球／殼蟹／犰狳／水牛…故非簡轉繁、亦非臆測。依鐵則「台服官方優先、社群繁中站次之」，來源等級記在 `island-names-tw.json` 的 `_animalSource.tier`。
  - **座標系統交叉驗證**：文章座標範圍 x12~33／y11~28 與我們從 datamine 推出的 26 個採集區域（x13.0~33.3／y10.4~29.2）幾乎重合；把 29 點畫上底圖，**全部落在陸地**且與採集區域分布互相咬合。
  - **修正了原文三處錯誤**（全記在 `_animalSource.knownIssues`）：① 星點栗鼠原文寫 `9am-12am`（＝09:00-00:00），實為 **09:00-12:00**（全表時窗皆 3 小時）；② 猴面雀那列時間與天氣兩欄對調；③ 雄羚羊／公洞山羊的第二項報酬與 datamine 不符——**報酬一律以 `MJIAnimals` 為準**，原文報酬只用於對位。
  - **時間一律 24 小時制**：`am/pm` 的 12am／12pm 極易看錯（原文就是栽在這裡），資料檔、頁面、文件全部只用 0–23 整點，外部來源轉錄前先換算。
  - **天氣完全不需要新資料**：使用者另貼的 `WeatherFinder`（SaintCoinach 演算法）與站上 `assets/js/eorzea-weather.js` 比對 **22000 個天氣時段：seed 0 筆不一致、天氣結果 0 筆不一致**，`maps.json` id 772 的機率表也逐項吻合。時鐘是純計算，不連任何 API。
  - **資料層**：`island-names-tw.json` 新增 `animalSpawns`（座標／ET 時窗／天氣／備註），`build-island.mjs` 合併進 `island-animals.json` 的 `spawn/weather/coords/note/obsMissing`，並**驗證天氣名必須落在無名島 6 種天氣內，寫錯直接 throw**。
  - **頁面**：新增「🐑 動物時鐘」分頁——即時 ET／島上天氣／下次天氣倒數；每隻動物顯示出現條件、地點（可開地圖／複製座標）、產出素材（可跳素材反查）；可捕獲者排前面並倒數剩餘時間，未出現者倒數下次出現。篩選「現在可捕獲」與 9 種產出素材，三種排序，全部同步網址。素材反查的「牧場」列也改為**列出具體動物名並可跳轉**。
  - **測試抓到一個真 bug**：`nextFlip` 原本只往後掃 14 ET 天，但十年取樣實測**金刺草球最長空窗達 2805 ET 小時（現實 5.7 天）**，會算不出下次出現時間而顯示空白徽章。上限改為 400 ET 天，並讓超過 6 小時的等待改標實際日期時間（`7/25 14:26`）而非「136時24分後」。
  - **邏輯正確性用機率反推驗證**：十年 87600 個 ET 小時取樣，每隻動物的實測可捕獲時間佔比與「時窗比例 × 天氣機率」的理論值**最大誤差 0.37 個百分點**（誤差來自天氣抽樣波動）。
  - 驗收：jsdom 無人島頁 **35/35**；validate-data 0 error 0 warning；validate-links 無新斷鏈。

- **2026-07-23（無人島第一期修正之二：採集區域升為一級概念、分類軸改為製作類型）**：使用者再指出兩點。
  - **① 一個區域可以採到好幾種素材**：`MJIGatheringItem` 是一素材一列，很容易誤以為「一種素材＝一個採集點」。實測多個素材共用同一組座標＋半徑——**48 種可採素材只分佈在 26 個區域**，最多的一區有 4 種（X:33.3 Y:24.6 可採球藻／珊瑚／烏賊／水母）。資料層新增 **`island-gather-areas.json`（26 筆）**把區域升為一級概念、素材掛 `gathering.areaId` 連回去；地圖改**以區域為單位畫 26 個圈**（原本 48 個），點區域列出該區能採的全部素材，素材詳情也加「同區還可採到」。
  - **② 工坊生產的分類軸用錯了**：原本用「工房等級需求」分類，但排程時真正的分類軸是**製作類型（主題）**——連續生產同主題會有效率加成。篩選改為 16 種主題；主題名 datamine 只有簡中，依鐵則不簡轉繁，頁面顯示簡中並標注「尚無台服官方來源」，補進 `island-names-tw.json` 的 `themes` 後即會自動換成台服名。
  - 驗收：jsdom 無人島頁 35/35；validate-data 0/0。

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
    - `tools/fishing/`（1449 種，1392→約 1130 行）：分頁 60、預設排序＝開窗時間（可釣中優先）。ET 時鐘、目標魚面板＋開窗鬧鐘、地圖檢視、魚詳情彈窗（竿型／提鉤／餌鏈／魚識／未來窗口）、多釣場切換全部保留；「🎯 只看目標」改為引擎篩選標籤，卡片點擊分流（🎯目標／📍地圖／點圓圈勾已釣／點其他開詳情）改由 `onCardClick` 處理。
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

- **2026-07-16（介面統整＋遊戲內分頁對齊＋釣魚頁魚糕式重做）**：(1) **幻化配裝圖鑑介面統整**——`tools/glamour/index.html` 由舊獨立站 GitHub 深色系（#0d1117）改為站內共用色票（--bg-base #0a0c10、金 #c8a96e、藍 #4fc3f7）、共用字體堆疊與背景光暈，navbar 加「← 水神的工具箱」返回鍵、標題改實色金並更名「幻化配裝圖鑑」、`<title>` 對齊站內格式、補共用頁尾；官方套裝卡片 tag 改套 CARD_TAGS 過濾（不再露出未翻譯的 `alljob`）。(2) **收藏頁 vs 遊戲內圖鑑分頁稽核**——樂譜（gameCategory 分類＋No. 排序）、青魔（No.）、幻卡（編號＋星級）原本已符合；**表情頁補上遊戲內分頁**（一般/特殊/情感表現，data/emotes.json 的 category 欄 General/Special/Expressions），卡片加分頁標籤；坐騎/寵物在遊戲內為無分類平鋪圖鑑，維持現狀。(3) **釣魚頁參考魚糕重做**——卡片改固定四欄資訊列（釣場/釣餌/時間/天氣，無限制時明示「全天/不限」）、ET 24 小時時間窗 bar（金色＝可釣時段、綠線＝現在 ET，跨午夜自動切兩段）、釣餌鏈以金色箭頭串接＋竿型（! 輕杆/!! 中杆/!!! 重杆）與提鉤（精準/強力）小章、天氣鏈「前一時段 → 當前」、魚識標籤；新增「地區」下拉篩選（釣場→地圖→region，對應遊戲內釣魚手帳的地區分頁，選項依 maps.json 資料片順序）。瀏覽器實測（桌機 1440/手機 375）：三頁皆無 console error，地區篩選（庫爾札斯 78 筆）、表情分頁（情感表現 29 筆）、時間窗 bar 與倒數皆正常。

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

- **2026-06-11**：地圖 ID 統一修正完成（待辦 #0）。maps.json 重 key 成遊戲 Map sheet row id 並擴充 67→210 張（地名 tw-places 優先）；fishing-spots 307 筆補 coords.mapId（territory→map 對應）；gathering 濾除 EventItem 偽 id 356 次、剔除 232 個純偽 id 節點（965→733）、141 筆 mapId=0 加 mapMissing 標記。新增 scripts/validate-links.mjs（全庫連結驗證）、rekey-maps.mjs；改 build-fishing / build-gathering / download-maps。mapId 類斷鏈 17444＋17958＋524 → 全部歸零。SCHEMA.md 明文 mapId=Map sheet row id；_meta.json 同步 maps/gathering/fishes/fishing-spots。底圖 8 張待本機補（已於 2026-07-28 補齊並刪除該清單）。
- **2026-06-10**：建立本進度文件；盤點 repo 實際狀態（比先前紀錄多了 weather/gathering 工具頁、mounts/minions 收藏頁、dungeons/barding/blue-magic/monsters/obtainable-methods/fishes 等資料庫）。
- 2026-06-09：blue-magic、monsters 資料更新。
- 2026-06-08：npcs（22079）、triple-triad（425）、obtainable-methods、fishes/fishing-spots 完成。
- 2026-06-05：minions（581）、dungeons（386）完成。
- 2026-06-04：mounts、barding 完成；_meta.json 最後更新。
- 2026-06-02：風脈泉 aether-currents 決定擱置。
- 2026-05-31：無人島攻略工具規劃完成。
- 2026-05-29：統一資料庫架構建立（SCHEMA.md）。
