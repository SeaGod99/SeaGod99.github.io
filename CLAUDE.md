# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

水神的工具箱（SeaGod's Toolbox）— FFXIV 繁中玩家工具站。純靜態頁面，部署於 GitHub Pages，無後端。專案概況、工具清單、資料來源與結構詳見 [README.md](README.md)。

---

## ⭐ 開工前必讀（跨機延續規則）

**這個專案會在多台電腦上輪流開發。** Claude Code 的本機記憶（`~/.claude/projects/<專案>/memory/`）與 session 快取（`*.jsonl`）**不會跟著 git 走**，所以所有長期知識都必須落在 repo 內的文件。動任何工作前先讀：

1. [docs/PROGRESS.md](docs/PROGRESS.md) — **單一進度來源**：各頁狀態、資料庫狀態、更新紀錄。完工後**必更新**。
2. [docs/專案慣例與記憶.md](docs/專案慣例與記憶.md) — **可攜知識庫**：慣例、決策、資料權威來源、踩過的雷（本機 memory 資料夾的鏡像）。完整文件地圖也在此檔 §6。
3. [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md)＋[data/SCHEMA.md](data/SCHEMA.md) — 資料管線與格式。

動到幻化配裝圖鑑（`tools/glamour/`）時另讀 [tools/glamour/CLAUDE.md](tools/glamour/CLAUDE.md)——那是併進來的獨立子專案，有自己的 Python 管線，慣例與全站其他頁不同。**2026-07-28 起它的資料已併回主庫**（`data/`＋`out_data/`，入口 `tools/glamour/scripts/maindb.py`），不再自帶 `資料來源/`。

**三條最容易踩的鐵則**（細節見知識庫 §4）：
- **繁中名稱絕不用簡轉繁（s2t／OpenCC）硬翻、也不憑印象寫**。台服官方來源優先，社群繁中站次之；對不到＝台服未開放 → 前端直接不顯示，不用英文／簡中補。
- **職業名**查 `data/equip.json` 的 names 表（白魔道士、巴術士、奪魂者…），**副本名**查 `data/dungeons.json` 的 `nameEn → name`，**地名**查 `out_data/places.msgpack` 的 `twPlaces`。
- **取得方式不憑印象**，一律回查資料來源。

**維護規則（務必遵守，否則換機知識遺失）**：
- 有**新慣例／決策定案** → 除了讓 Claude 存進本機 memory，**同步補進 `docs/專案慣例與記憶.md`**。
- 有**新流程／SOP 說明** → 寫成 `docs/*.md` 並在上述知識庫的文件地圖（§6）＋本檔登記；本檔的「gstack 使用情境／常見工作流」是流程索引的入口。
- 有**功能或資料變更** → 更新 `docs/PROGRESS.md`。
- 條目過時或被推翻 → 直接修正／刪除，不要疊加矛盾敘述。

> 換到新電腦時，只要 clone repo 並讀完上面三份文件，即可無縫接續——本機 memory 缺席不影響延續。

---

## 專案結構與常用指令

純靜態站，**沒有建置步驟、沒有測試框架**——HTML 直接開就是成品。`package.json` 只有資料腳本用的三個依賴（msgpack／opencc-js／sharp），沒有 npm scripts。

```
index.html              # 入口頁（含進度備份匯出入；2026-09-01 起不再呈現收藏進度）
tools/<name>/           # 各工具頁，一頁一目錄，index.html 自帶樣式與邏輯
                        #（邏輯長到難維護就抽成同目錄的 .js，如 tools/market/market.js；
                        #  別放 assets/js/——那裡是跨頁共用的東西）
collections/<name>/     # 收藏追蹤頁（+ minions/ 在根目錄，歷史因素）
data/                   # 統一資料庫（SCHEMA.md／_meta.json）＋前端讀的 json
scripts/*.mjs           # 資料產生／校正腳本（node，非執行期依賴）
assets/css|js/          # 共用樣式與腳本（tokens.css＝全站色票/字體/圓角單一來源、theme.css＝亮色覆蓋、common.css、eorzea-weather.js…）
out_data/               # 大型中繼檔（msgpack），不進前端
tools/glamour/          # 併入的獨立子專案，自帶 Python 管線與 CLAUDE.md（資料吃主庫，見 scripts/maindb.py）
```

| 我要做的事 | 指令 |
|-----------|------|
| 重建某份資料 | `node scripts/build-<名稱>.mjs` |
| 校正既有資料（patch 系列） | `node scripts/patch-<名稱>.mjs`（多數 dry-run 預設，`--apply` 才寫入） |
| 資料驗收（改完資料必跑） | `node scripts/validate-data.mjs`（會順便報 `_meta.json` 不同步） |
| ↑ 那支同時掃「日文原文有沒有漏到前端資料」 | 走 `scripts/lib/tw-text.mjs` 的守門掃整個 `data/`（含分片目錄）；白名單在 `validate-data.mjs` 裡，每條都要寫得出為什麼。守門本身跑 `node scripts/lib/tw-text.mjs`（21 項自我測試）|
| 重建全站搜尋索引（改完任一收藏／工具資料後） | `node scripts/build-site-index.mjs`（dry-run 預設／`--apply`；gzip 超過 200KB 會中止） |
| 重建軍需品調達＋專家交納 | `node scripts/build-gc-supply.mjs`（dry-run 預設／`--apply`／`--offline`） |
| 補成就的達成條件與官方名 | `node scripts/patch-achievement-sources.mjs`（dry-run 預設／`--apply`／`--offline`） |
| 重建討伐筆記 | `node scripts/build-hunting-log.mjs`（dry-run 預設／`--apply`／`--offline`） |
| 重建雇員探險 | `node scripts/build-ventures.mjs`（dry-run 預設／`--apply`；吃 obtainable-methods，不連網） |
| 重建季節活動商店 | `node scripts/build-seasonal-shop.mjs`（dry-run 預設／`--apply`；吃 out_data/cache/tc-shops.json） |
| 追蹤頁回歸（**改完 `collection-tracker.js` 或 `toast.js` 必跑**） | `node scripts/validate-tracker-pages.mjs`（jsdom，需先 `npm i jsdom --no-save`；驗 12 頁控制面＋「按清除→取消，進度不能動」） |
| 頁內快捷鍵回歸（**改完 `nav.js` 的快捷鍵區或 `collection-tracker.js` 的 `wireShortcuts` 必跑**） | `node scripts/validate-shortcuts.mjs`（jsdom，37 項：登記佇列、s／o／`[`／`]`、`?` 浮層、焦點不外逃、輸入框與 `<dialog open>` 時不攔）|
| 刷新 Teamcraft 台服語系檔（成就／FATE／理符／怪物／探險／商店／幻卡規則…） | `node scripts/fetch-tw-locales.mjs`（dry-run 預設／`--apply`／`--list` 看內容）→ `out_data/tw-locales.msgpack`，讀取走 `scripts/lib/tw-locales.mjs` |
| 多幣種變現排行重建（45 種貨幣） | `node scripts/build-currency-shop.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/currency-shop.json` |
| 系統解鎖＋職業行會重建 | `node scripts/build-system-unlocks.mjs`（dry-run／`--apply`／`--offline`／`--find <關鍵字>` 查候選任務）→ `data/system-unlocks.json` 的 `data[]`＋`jobs[]`；對照表人工維護在 `scripts/lib/system-unlock-map.mjs`（`SYSTEMS` 26 條、`GUILD_QUESTS` 20 條；**24 個進階職不用維護，走 `ClassJob.UnlockQuest`**）|
| 收藏頁任務來源補接取點（改完上述任一或 tw-quests 後） | `node scripts/patch-collection-quest-npc.mjs`（dry-run 預設／`--apply`／`--offline`；**寫的是 pretty JSON，必接 `minify-data.mjs --apply`**）|
| 重建理符報酬＋收藏品交納（改版時才跑；**兩個消費端的上游**） | `node scripts/build-extra-sources.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/extra-sources.json`（理符 1,030 件＋收藏品 127 件）；**跑完必接 `build-market-sources.mjs` 與 `build-item-sources.mjs --apply`** |
| ↑ 那兩型的回歸（**改完上面那支或兩個消費端的合併處必跑**） | `node scripts/validate-extra-sources.mjs`（29 項；最重要的是「措辭不可承諾」與「分片層要走 om ∪ extra 的聯集」）|
| 重建取得管道分片層（改完 obtainable-methods、items 或 extra-sources 後） | `node scripts/build-item-sources.mjs`（dry-run 預設／`--apply`）→ `data/item-sources/`（45 片＋`_index.json`）；前端走 `assets/js/item-sources.js`，**刻意不進 `minify-data.mjs`** |
| ↑ 上面那支同時產 `data/item-source-types.json` | itemId → 取得管道位元遮罩（差分陣列，gzip 15KB），市場頁的「🎁 取得方式」篩選吃這份。**與分片層由同一支保證同步**，不要另外寫一支 |
| 視窗計算回歸（**改完 `window-calc.js` 或釣魚／限時採集的時間窗邏輯必跑**） | `node scripts/validate-window-calc.mjs`（差分測：把重構前兩頁的實作抄一份當參照，307 種魚＋36 組天氣案例＋225 個節點逐筆比對）|
| 鬧鐘回歸（**改完 `et-alarm.js` 或釣魚／限時採集／天氣任一頁的鬧鐘接線必跑**） | `node scripts/validate-et-alarm.mjs`（45 項：三頁真的載了引擎且沒有人自己再寫一份、同一窗只響一次、primeOnly、提前量、舊 key 遷移、天氣訂閱）|
| 全站頁面體檢（**改完任何版面、共用 CSS／JS 或新增頁面必跑**） | `MSYS_NO_PATHCONV=1 node scripts/validate-pages.mjs`（真瀏覽器：36 頁 × 360／768／1280 三寬度，驗 console error／水平溢出／重複 id／缺 alt／點擊目標）；`--page <關鍵字>` 只驗某頁、`--shot <目錄>` 存截圖 |
| 重建金碟獎品價目表（改完 items 或商店表後） | `node scripts/build-gold-saucer.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/gold-saucer.json`（金碟幣＋金碟聲譽，附六本圖鑑的收藏對應）|
| 重建物品四語名稱查詢分片（換台服版本或四語快照後） | `node scripts/build-item-names.mjs`（dry-run 預設／`--apply`）→ `data/item-names/`（256 片＋`_index.json`）；**跑完必接 `node scripts/validate-item-names.mjs`**（驗前後端的正規化與雜湊一致）|
| 重建技能／狀態四語查詢分片（換台服版本後） | `node scripts/build-action-names.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/action-names/`（256 片）；**與 `build-item-names.mjs` 共用 `shardOf`，SHARDS 要一起改**；跑完必接 `validate-item-names.mjs` |
| 重建 NPC 金幣直購價（改完 items 或商店表後） | `node scripts/build-vendor-prices.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/vendor-prices.json`（4,641 種，市場頁用它對材料成本封頂）|
| 重建 NPC 商店目錄（改完 items／npcs／商店表後） | `node scripts/build-npc-shops.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/npc-shops/`（89 張圖＋`_index.json`，依 mapId 分片）；**刻意不進 `minify-data.mjs`** |
| 幻卡來源語意修正（**跑完 `build-triple-triad-all.mjs` 必接**） | `node scripts/patch-triple-triad-sources.mjs`（dry-run 預設／`--apply`／`--offline`） |
| 探索筆記補座標（已補完 338/340，留著備查） | `node scripts/patch-exploration-coords.mjs`（dry-run 預設／`--apply`／`--offline`） |
| `_meta.json` 與資料檔同步（validate 報不同步時跑） | `node scripts/sync-meta.mjs`（`--apply`） |
| 副本庫補收漏掉的副本 | `node scripts/patch-dungeon-add-missing.mjs`（`--apply`／`--offline`） |
| 幻卡英文散文來源結構化 | `node scripts/patch-triple-triad-prose-sources.mjs`（`--apply`） |
| 連結檢查 | `node scripts/validate-links.mjs` |
| 重建魚的圖示與用途（改完 items／recipes／collectable-items 後） | `node scripts/build-fish-uses.mjs`（dry-run 預設／`--apply`；產 `data/fish-uses.json`，釣魚頁的圖示、收藏品旗標與料理用途） |
| 釣魚資料缺角一次性補正（已跑完，留著備查） | `node scripts/patch-fishing-upstream-gaps.mjs`（dry-run 預設／`--apply`／`--offline`，冪等；魚叉釣場＋官方地名＋5 個上游欄位＋傳承錄書。`build-fishing.mjs` 已同步修好，重建不需再跑） |
| 壓縮前端會載入的 data/*.json（改完資料後） | `node scripts/minify-data.mjs`（dry-run 預設／`--apply` 寫入；`_meta.json` 刻意保留可讀） |
| 刷新台服物品繁中名快照（**升台服版本的第一步**） | `node scripts/build-tw-items-msgpack.mjs`（dry-run 預設／`--apply`；跑完必接 `build-items.mjs`） |
| 補新開放條目的繁中名（魚／園藝／鳥鞍／隨從） | `node scripts/patch-tw-names.mjs`（dry-run 預設／`--apply`，來源＝items.json，只補不覆蓋） |
| 重建物品精簡表（改完 items.json **兩支都要跑**） | `node scripts/build-items-lite.mjs`（採集兩頁用）＋`node scripts/build-items-market.mjs`（市場頁用） |
| 重建市場頁的「取得管道」索引（改完 recipes／gathering／obtainable-methods） | `node scripts/build-market-sources.mjs` |
| 更新 SW 快取版本（改完 assets/ 的 css/js 必跑） | `node scripts/bump-sw-version.mjs`（`--check` 只驗證） |
| 重建 PWA 圖示（改了 `assets/icons/icon.svg` 才要跑） | `node scripts/build-pwa-icons.mjs`（dry-run 預設／`--apply`）→ 192／512／180／maskable-512 四張 PNG |
| PWA 可安裝性回歸（**改完 `manifest.json`、`assets/icons/` 或 `theme.js` 的注入區必跑**） | `node scripts/validate-pwa.mjs`（jsdom，36 項：圖示規格、shortcuts 指得到頁、三種深度的頁面都注入得到 link、安裝鈕行為）|
| 「資料已更新 ↻」回歸（**改完 `sw.js` 的快取策略、`theme.js` 的 SW 區或 `toast.js` 必跑**） | `node scripts/validate-sw-update.mjs`（37 項：直接取出 `sw.js` 的 `sameVersion()` 執行、只通報 `/data/`、`Toast.action()` 的去重與不自動消失）|
| 「現在能做什麼」回歸（**改完 `tools/now/` 或它吃的四份資料必跑**） | `node scripts/validate-now.mjs`（24 項，重點在兩個單位：探索筆記 `timeEnd` 含該小時、節點 `duration` 是 ET 分鐘）|
| 重建魔晶石與禁忌鑲嵌資料（改版時才跑） | `node scripts/build-materia.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/materia.json`（31 種屬性／229 件／12 階成功率）|
| 禁忌鑲嵌試算回歸（**改完 `tools/melding/` 或 `data/materia.json` 必跑**） | `node scripts/validate-melding.mjs`（35 項：成功率不可寫死、期望值與 90% 累積機率的算式、孔位選單要反映資料）|
| 收益排行接製作數值的回歸（**改完 `market.js` 的 `gateOf`／`applyMyStats` 必跑**） | `node scripts/validate-profit-stats.mjs`（18 項：沒存數值的人要完全不受影響、門檻欄位靠 `columns` 對位）|
| 重建製作理符（改版時才跑） | `node scripts/build-craft-leves.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/craft-leves.json`（1,120 張）|
| 製作理符回歸（**改完 `tools/leves/` 或 `craft-leves.json` 必跑**） | `node scripts/validate-leves.mjs`（24 項；最重要的是「頁面不得宣稱 HQ 加成倍率」）|
| 重建練級裝備路線（改完 items.json 後） | `node scripts/build-leveling-gear.mjs`（dry-run 預設／`--apply`）→ `data/leveling-gear/`（43 個職業檔＋`_index.json`）；**刻意不進 `minify-data.mjs`** |
| 練級裝備回歸（**改完 `tools/leveling-gear/` 或該目錄資料必跑**） | `node scripts/validate-leveling-gear.mjs`（25 項：槽位眾數比對、前緣單調性、取得管道真的有填上）|
| 重建潛水艇資料（改版時才跑） | `node scripts/build-submarine.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/submarine.json`（部件 40／航點 123／階級 145）|
| 潛水艇回歸（**改完 `tools/submarine/` 或 `data/submarine.json` 必跑**） | `node scripts/validate-submarine.mjs`（26 項；最重要的是「部位名不可從 Slot 編號推」與「不提供多點航程試算」）|
| 重建技能辭典（換台服版本後） | `node scripts/build-action-codex.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/action-codex/`（技能 1,326／特性 668／狀態 4,052）|
| 技能辭典回歸（**改完 `tools/action-codex/` 或該目錄資料必跑**） | `node scripts/validate-action-codex.mjs`（21 項：UI 標記洗乾淨、條件式收斂、PvP／PvE 分得開）|
| 綁定備份檔回歸（**改完首頁的進度備份區必跑**） | `node scripts/validate-backup-file.mjs`（32 項：不支援的瀏覽器不長鈕、`requestPermission` 只能在使用者手勢裡要、handle 只能放 IndexedDB、被拒時不可靜默失敗）|
| 多角色設定檔回歸（**改完 `assets/js/profiles.js` 必跑**） | `node scripts/validate-profiles.mjs`（28 項：白名單反轉、只覆蓋不刪、存不進去就不切）|
| 重建主線任務（換台服版本後） | `node scripts/build-msq.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/msq.json`（14 章／1,012 個）|
| 主線進度回歸（**改完 `tools/msq/` 或 `msq.json` 必跑**） | `node scripts/validate-msq.mjs`（26 項；最重要的是章節順序＝`JournalGenre` 的 row id）|
| 重建文書討伐目標（改版時才跑） | `node scripts/build-relic-note.mjs`（dry-run 預設／`--apply`／`--offline`）→ `data/relic-note.json`（9 本 × 19 個目標）|
| 文書跑圖回歸（**改完 `tools/relic-note/` 或 `relic-note.json` 必跑**） | `node scripts/validate-relic-note.mjs`（43 項；最重要的是「打勾的鍵要含書的 id」與「同名副本不給連結」）|
| 時尚品鑑週更（每週二／週五各一次） | `node scripts/build-fashion-report.mjs`（`--dry-run` 只印／`--offline` 用快取）→ `node scripts/validate-fashion-render.mjs`（頁面 render 回歸，七個週狀態，不需瀏覽器） |
| 時尚品鑑跨週不變資料（改版時才跑） | `node scripts/build-dyes.mjs`／`build-fashion-fillers.mjs`／`build-fashion-themes.mjs` |
| 重建無人島資料層 | `node scripts/build-island.mjs`（`--offline` 用快取／`--refresh` 強制重抓） |
| 幻卡補新卡（台服開新卡時） | `node scripts/patch-triple-triad-new-cards.mjs`（dry-run／`--apply` 寫入）→ `node scripts/download-triple-triad-images.mjs` |
| 幻卡取得方式補繁中名（補完新卡後） | `node scripts/patch-triple-triad-source-names.mjs`（`--apply`／`--offline`，冪等） |
| 副本補資料片欄位（改完 dungeons.json） | `node scripts/patch-dungeon-expansion.mjs`（`--apply`／`--offline`） |
| 副本補時限／通關經驗／解鎖任務（改完 dungeons.json） | `node scripts/patch-dungeon-details.mjs`（dry-run 預設／`--apply`／`--offline`）；補 `timeLimit`（516/520）、`clearExp`、`clearGil`、`unlock`（32/520），並把 `image` 的 `000000` 佔位改成 null |
| 副本圖鑑回歸（**改完 `tools/duty-codex/` 或 `dungeons.json` 必跑**） | `node scripts/validate-duty-codex.mjs`（jsdom，29 項：類型標籤、篩選、`?id=duty:` 深連結、圖檔存在率）|
| 幻卡缺卡跑圖回歸（**改完 `collections/triple-triad/` 或 `triple-triad.json` 必跑**） | `node scripts/validate-triad-route.mjs`（jsdom，31 項：只認 `NPC對戰` 不認 `NPC牌組`、地圖篩選、**標記取得不會讓清單重排**）|
| 坐騎／寵物補手冊排序（重建後必跑，用來擋幻影條目） | `node scripts/patch-collection-order.mjs`（`--apply`／`--offline`） |
| 青魔補副本／地區連結 | `node scripts/patch-blue-magic-content-ids.mjs`（`--apply`） |
| 收藏頁補空 sources（由 obtainable-methods 推） | `node scripts/patch-sources-from-om.mjs`（`--apply`） |
| 幻化配裝圖鑑重建 | `py tools\glamour\scripts\update_all.py local`（離線）／不帶 `local`＝完整抓取 |
| 幻化配裝圖鑑的主庫健檢 | `py tools\glamour\scripts\check_maindb.py`（不改檔；msgpack 解不開會直接報出來） |
| 幻化配裝圖鑑查重複投稿 | `py tools\glamour\scripts\check_duplicates.py`（只稽核／`--report` 出清單／`--apply` 標記移除，之後要跑 `build_site.py` 才生效） |
| 幻化配裝圖鑑：把 Claude 親讀的判讀寫回快取 | `py tools\glamour\scripts\inject_claude_ocr.py 判讀.json`（dry-run 預設／`--apply`；名稱查無會整批中止，確認過的缺口用 `--allow-unknown "名稱"` 具名放行）→ 接 `apply_dyes`→`reconstruct_empty`→`build_site`→`build_item_sources`→`health_check` |
| 幻化配裝圖鑑圖片兩層化（新增圖片後） | `py tools\glamour\scripts\build_image_tiers.py`（卡片 320px WebP ＋ 彈窗 AVIF，已有的跳過）→ 兩層齊了再加 `--drop-jpg` 清中間檔。`update_all.py` full 模式已含這兩步 |
| 重建物品分類對照表（改完 items.json） | `node scripts/build-item-categories.mjs`（`--offline` 只驗證） |
| 重建園藝配種庫（含 216 件花色與種子取得管道） | `node scripts/build-gardening.mjs`（dry-run 預設／`--apply`／`--offline`；**直寫 minified**，看差異請看腳本摘要，別看 git diff） |
| 重建製作模擬器資料（技能表＋模擬用配方＋料理／藥品） | `node scripts/build-craft-sim.mjs`（`--offline` 用 `out_data/cache/craft-sim` 快取／`--refresh` 強制重抓；會用 XIVAPI 校驗每個技能的 CP 與等級） |
| 製作模擬引擎回歸驗證（**改引擎、求解器或技能表必跑**） | `node scripts/validate-craft-sim.mjs`（Teamcraft 官方測試案例 ＋ 內建範本是否仍做得完 ＋ 自動求解在同樣情境不輸範本） |
| 看頁面 | 直接開檔或 `/browse`；無 dev server |

**一次性／低頻腳本**（不在上表，但 repo 裡有；2026-07-29 盤點補登記，免得換機後不知道它們幹嘛）：

| 腳本 | 什麼時候跑 | 產出 |
|------|-----------|------|
| `build-squadron.mjs` | 幾乎不用（4.x 後小隊內容未變，數值內嵌在腳本裡）。**跑完必接 `minify-data.mjs --apply`＋`sync-meta.mjs --apply`**（腳本寫的是 pretty JSON，但前端載的是壓縮版） | `data/squadron.json` |
| `build-blue-magic.mjs` | 台服開新青魔法時（XIVAPI AozAction 全抓） | `data/blue-magic.json` |
| `build-barding.mjs` | 新增鳥鞍時 | `data/barding.json` |
| `build-ornaments.mjs` | 台服開新時尚配飾時（XIVAPI search `Item.ItemAction.Action=20086`）。**跑完必接 `minify-data.mjs --apply`＋`sync-meta.mjs --apply`** | `data/ornaments.json` |
| `build-npcs.mjs` | 換 Teamcraft TW 版本時（只有建置用，前端不載） | `data/npcs.json` |
| `build-obtainable.mjs` | 重建取得方式摘要表（前端篩選用；**詳細版在 `out_data/obtainable-methods.msgpack`**） | `data/obtainable-methods.json` |
| `build-mounts-desc.mjs` | `build-mounts` 跑完補 description（那支跑完會是 null） | 就地改 `data/mounts.json` |
| `patch-aether-coords.mjs` | 補風脈座標（303 筆，已補完） | 就地改 `data/aether-currents.json` |
| `tools/glamour/scripts/backfill_curated_added.py` | 補精選套裝的 `added`（收錄日期，95 筆已補完）。資料來源只剩檔案 mtime——git 歷史全是同一個 commit、EXIF 0/95，細節見該檔檔頭與知識庫 §4.37 | 就地改 `tools/glamour/data/curated_outfits.json` |
| `patch-fishing-common.mjs` | 補常駐普通魚（已補完） | 就地改 `data/fishes.json` |
| `download-emotes-icons.mjs` | 新表情出現時 | `assets/emotes/`（前端用本地路徑） |
| `download-barding-icons.mjs` | 新鳥鞍出現時 | `assets/barding/` |
| `download-blue-magic-icons.mjs` | 新青魔法出現時 | `assets/blue-magic/` |
| `download-dungeon-images.mjs` | 副本圖鑑（`/tools/duty-codex/`）用的圖，`assets/dungeons/` 目前 433 檔 13MB。**跑完會把 `dungeons.json` 整份寫成 pretty JSON**（303KB → 426KB）且不會提醒你——必接 `minify-data.mjs --apply`＋`sync-meta.mjs --apply` | `assets/dungeons/`＋改 `dungeons.json.image` |

**環境注意**：
- 本機 `python` 指令是 Microsoft Store 假捷徑（執行會靜默結束），**Python 一律用 `py`**。
- 終端機走 VS Code 內建終端機，避免彈出獨立視窗。
- Bash 工具下多行 commit 訊息要用 `git commit -F <檔案>`，**不要用 PowerShell here-string**（Bash 是 POSIX sh，`@'...'@` 會變成字面字元）。

**repo 很大（約 860MB／2.8 萬檔，主要是 glamour 的圖）**：
- `git clone`／`git pull`／`git checkout` 動輒數分鐘，**下 git 指令請把 timeout 拉到 5 分鐘以上**。曾因 2 分鐘超時中斷 checkout，留下 index.lock ＋ 5 千個沒寫完的檔案。
- 還原檔案時**先確認範圍**：`git restore .` 會連同你正在編輯的檔案一起還原（曾因此洗掉未 commit 的文件修改），只想補回某目錄就寫 `git restore tools/glamour`。
- **GitHub Pages 1GB 發佈上限**：2026-09-26 實測 git 追蹤總計 **758MB**，餘裕約 266MB（磁碟上的 1.8G 含 `out_data/`、`node_modules/` 與 glamour 的中間檔，那些都不進 git）。新增大批圖片前先估增量，量法：`git ls-files -z | xargs -0 du -cb | awk '/total$/{s+=$1} END{print s/1048576}'`。
- 跑完 `update_all` 後，衍生的 js 與新縮圖**記得 commit**（`.gitignore` 已不擋）。

**另外三條鐵則**（違反過、代價高，細節見「專案慣例與記憶」）：
- **對使用者一律繁體中文回覆**；技術名詞可保留原文（§1.1）。
- 天氣槽位順序不可合併同名天氣、`WEATHER_TC` 與 `eorzea-weather.js` 的譯名表改任一邊必須同步另一邊（§4.4）；收藏頁「取得方式」永遠預設顯示，勿改回 hover／toggle（§2.1）。
- **色票／字體／圓角一律取自 `assets/css/tokens.css`，頁面不要自己開一份 `:root` 色票**（§3.6）。曾經 26 頁各抄一份、值全飄掉。單頁專屬的顏色（含亮色版）寫在該頁自己的 `<style>`，**不要塞進 `theme.css`**——那裡的 `:root[data-theme="light"]` 是全域選擇器，一個「weather 專用」的 `--accent` 就把 13 頁的識別色全壓成同一個藍。

---

## UI/UX 設計輔助 Skill（ui-ux-pro-max）

已安裝 [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 到系統層 `~/.claude/skills/`（隨帳號走、非本 repo 內容，不會進 git）。內含 7 個技能，本站以 `ui-ux-pro-max` 為主：可查版面／色彩／字體／無障礙／動效／圖表的設計知識庫（84 種風格、192 組色票、74 組字體配對、98 條 UX 準則），涵蓋純 HTML/CSS（本站無框架）。其餘 6 個（banner-design／brand／design／design-system／slides／ui-styling）多半是 React/Tailwind 元件庫或品牌／簡報用途，本站少用，備而不查。

**規則：本專案只要碰到「畫面」相關的問題或任務（版面、間距、配色、字體排印、無障礙、互動動效、圖表呈現、視覺一致性），一律先呼叫 `ui-ux-pro-max` Skill 取得設計依據，再動手改**。與既有 gstack 流程分工：`ui-ux-pro-max` 提供「該怎麼設計／哪裡不符準則」的知識庫查詢，`/design-review`（gstack）負責實際開頁截圖抓視覺缺陷並修——兩者可接續使用（先問 ui-ux-pro-max 定調，再用 `/design-review` 驗收）。

---

## gstack 使用情境

本專案已安裝 gstack 技能組（目前 v1.60.x）。以下依「我現在想做什麼」列出對應該叫用的指令。多數情況直接以自然語言描述需求即可，Claude 會自動叫用；也可手動以 `/指令` 觸發。

> **不確定用哪個指令？** 直接輸入 `gstack`（或 `/gstack`）即可——它現在是「總路由」，你描述想做什麼，它會幫你導到對的技能。它已不再等同 `/browse`；開瀏覽器看畫面請直接用 `/browse`。

### 🌐 開瀏覽器看畫面（最常用）

| 我要做的事 | 指令 | 說明 |
|-----------|------|------|
| 打開某頁、截圖、檢查畫面 | `/browse` | 無頭瀏覽器，導航、點擊、填表、量測 RWD、截圖存證 |
| 確認部署後的線上站正常 | `/browse` | 開 `seagod99.github.io` 對應頁面 dogfood |
| 匯入真實瀏覽器 cookie | `/setup-browser-cookies` | 需登入狀態時使用（本站多為公開頁，少用） |

> 本站每個工具都是獨立頁面（`/tools/...`、`/collections/...`、`/minions/`）。改完版面或 JS 後，用 `/browse` 開該頁截圖比對是最快的驗收方式。

### ✅ 測試與驗收

| 我要做的事 | 指令 | 說明 |
|-----------|------|------|
| 系統性 QA 並自動修 bug | `/qa` | 走查使用流程、發現問題並修復 |
| 只跑 QA 出報告（不改碼） | `/qa-only` | 純測試報告，適合先盤點問題 |
| 確認某次改動真的有效 | `/verify` | 實際跑起來觀察行為，驗證 PR / 修復 / 功能 |
| 設計／視覺層面的 QA | `/design-review` | 抓間距、層級、不一致、AI slop、互動卡頓並修正 |
| 效能回歸檢查 | `/benchmark` | 用 browse daemon 偵測效能退化（資料量大的收藏頁適用） |

### 🔍 改碼前後的審查

| 我要做的事 | 指令 | 說明 |
|-----------|------|------|
| 找正確性 bug + 清理 | `/code-review` | 審當前 diff，low→ultra 不同深度 |
| 只做精簡／重用清理 | `/simplify` | 不抓 bug，只做可讀性與重用優化 |
| 上線前 PR 審查 | `/review` | land 前的整體把關 |
| 雲端多代理深度審查 | `/code-review ultra` | 由使用者觸發、計費；Claude 無法自行啟動 |
| 程式碼品質儀表板 | `/health` | 整體健康度概覽 |

### 🚢 出貨與部署

| 我要做的事 | 指令 | 說明 |
|-----------|------|------|
| 完整出貨流程 | `/ship` | 合併基底分支、跑測試、審 diff、bump VERSION、更新 CHANGELOG、commit、推送、開 PR |
| 出貨並部署 | `/land-and-deploy` | land + 部署一條龍（首次需 `/setup-deploy` 設定） |
| 部署後金絲雀監控 | `/canary` | 上線後監測 |

### 🐛 除錯與設計

| 我要做的事 | 指令 | 說明 |
|-----------|------|------|
| 系統性除錯找根因 | `/investigate` | 結構化追根究柢 |
| 從網頁抓資料 | `/scrape` | 抓 XIVAPI / Universalis / Teamcraft 等來源資料（本站資料管線常用） |
| 規劃一份可執行 spec | `/spec` | 把模糊需求轉成精確規格 |
| 設計系統諮詢 / 多版型比稿 | `/design-consultation`、`/design-shotgun` | 字型、色彩、版面提案與比較 |

### 📄 文件與圖表

| 我要做的事 | 指令 | 說明 |
|-----------|------|------|
| markdown 轉高品質 PDF | `/make-pdf` | |
| 文字描述產生圖表 | `/diagram` | 產出 source + 可編輯 `.excalidraw` |
| 補產缺漏文件 | `/document-generate` | 為功能／模組／整站產文件 |
| 上線後更新文件 | `/document-release` | |

### 🛡️ 安全防護（操作 gstack 時）

| 我要做的事 | 指令 | 說明 |
|-----------|------|------|
| 危險指令護欄 | `/careful` | 破壞性指令警告 |
| 限制只能改某目錄 | `/freeze` / `/unfreeze` | session 內鎖定編輯範圍 |
| 完整安全模式 | `/guard` | 破壞性警告 + 目錄鎖定 |

### 🧰 gstack 本身的維運

| 我要做的事 | 指令 | 說明 |
|-----------|------|------|
| 升級到最新版 | `/gstack-upgrade` | 檢查新版、升級並列出更新內容 |
| 存 / 取工作脈絡 | `/context-save`、`/context-restore` | 長 session 中斷前後保存與還原進度 |
| 記錄專案學習 | `/learn` | 把踩過的雷、慣例存成專案 learnings，之後自動帶入 |

---

## 本站常見工作流建議

- **改了收藏頁版面 / 樣式** → 改碼 → `/browse` 開該頁截圖 → `/design-review` 視覺把關。
- **改了共用資料或腳本（`/data`、`/scripts`、`/assets/js`）** → `node scripts/validate-data.mjs` → `/verify` 確認受影響頁面行為正常 → `/code-review`。改到 `assets/` 的 css/js 還要跑 `node scripts/bump-sw-version.mjs`（否則使用者會被舊 SW 快取黏住）。
- **改了版面／共用樣式／新增頁面** → `MSYS_NO_PATHCONV=1 node scripts/validate-pages.mjs`。頁面清單**直接讀 `nav.js` 的 TOOLS**，新頁只要登記在那裡就會自動納入。點擊目標分兩級：低於 24×24 違反 WCAG AA（擋），24–44 只是沒達到 AAA 建議（警告）。**站內好幾處用 `::after` 透明擴張層把小圖示的命中區推到 44px**，所以這支量的是 `elementFromPoint` 的實際命中區而不是盒子尺寸——新做小圖示鈕請沿用那個做法，不要改字級。
- **新增工具頁時記得在首頁卡片補 `data-added="YYYY-MM-DD"`** → 首頁的「新」徽章 2026-09-26 起改由日期決定（30 天內才標），**HTML 裡不再寫死**。沒有 `data-added` 的卡一天都不會被標成新的。改的原因：寫死的徽章沒有人會回來拿掉——盤點時 30 張卡裡有 23 張掛著「新」，其中 13 張是六～八月加的。
- **登記在 `nav.js` 不等於首頁有入口** → 兩者各自維護。2026-09-27 盤點時首頁**少了 9 張卡**（now／action-codex／msq／duty-codex／submarine／leveling-gear／ornaments／leves／melding），全都只在 `nav.js` 裡、首頁點不進去，累積九輪沒人發現。**新頁兩邊都要登記**，並在該頁回歸裡寫一條斷言。分類計數（`section-count`）已改成由實際卡片數算——寫死的數字會飄（曾經三個分類全錯）。
- **`sync-meta.mjs` 只同步既有登記** → 它報「✓ 全部已同步」的同時可以有 29 個檔沒進 `databases[]`（它會在下面列出來，**別只看第一行**）。新資料庫要自己補一筆 `{name,file,count,updated,desc,source}`。
- **追蹤頁的「✨ 本次新增」不必各頁實作** → `collection-tracker.js` 的 `addWhatsNewFilter()` 會自動掛，13 頁一次受惠。它比對的是 `ffxiv_seen_patch`（使用者上次看到的版本）與 `_meta.json` 的 `gamePatch`。三條規則寫在那支的註解裡：**第一次來的人不掛**（沒有比較基準時全部都算新）、**該頁沒有新條目就不掛**、**數量由該頁過濾後的 LIST 算**（不是資料庫總數——同一版新增的東西不見得每頁都收）。
- **寫「查不到台服名就不收」的過濾時，記得金幣（id 1）是例外** → `items.json` 與 `tw-items.msgpack` 裡它的名字都是 **"Gil"**，沒有中日韓字。NPC 商店目錄第一版因此丟掉 **16,237 筆**交易（佔被濾掉的 46% 裡絕大多數）——金幣是全遊戲最常見的成本。前端顯示成「金幣」。這不是破例：鐵則要擋的是「把英文名放行到畫面上」，金幣的顯示字串是我們自己給的 UI 標籤。
- **一行接一行的連結不能用 `::after` 透明擴張層補命中區** → 44px 高的擴張層會蓋到上下兩列，`elementFromPoint` 探到的是鄰居，體檢會報「點擊目標太小」而你怎麼加都沒用。**改用真實 padding／`min-height` 把自己的盒子撐大**（金碟頁的預算格、NPC 商店目錄的交易列都是這樣修的）。擴張層只適合**孤立**的小圖示鈕（頂列站名、橫幅連結）。
- **算材料成本時不要只看市場板** → 有 4,641 種可交易物品是 NPC 直接賣金幣的（配方材料裡佔 13%），市場板上常常更貴（有人掛高價等新手）。市場頁的 `costOf()` 會用 `data/vendor-prices.json` **對成本封頂**。但 `VENDOR_GATES` 只涵蓋 5 個部族 NPC，**軍階／主線／城市解鎖那些門檻沒有建模**，所以封頂之後一定要把「跟誰買、在哪、單價多少」顯示出來讓使用者判斷——**不可以偷偷把數字換掉**。NPC 庫存視為無限，所以是單純乘法、不走 `fillQuote`（那是市場板掛單才需要的，§3.14）。
- **技能名有「玩家技能」與「敵人技能」之分，一定要優先玩家技能** → `tw-actions.json` 的 38,490 筆裡只有 **1,373 個是玩家技能**（XIVAPI v2 的 `Action.IsPlayerAction`），其餘是敵人／NPC 技能。全部一起收會撞出 3,113 個同名衝突：英文 `Infuriate` 同時是戰士的「戰嚎」與某敵人的「勃然大怒」、`Attack` 同時是「攻擊」與「防衛反應」。先到先贏的話巨集翻譯會把玩家技能翻成敵人技能的名字，**而且完全看不出來**。`build-action-names.mjs` 分兩輪寫（玩家先佔位），並把剩下的 4 組「玩家技能互撞」單獨報出來。
- **台服技能說明有三層要洗，每一層洗錯都會直接印到畫面上** → ①`<UIForeground>F201F8</UIForeground>` 包的是**顏色碼**，要連內容一起刪，只刪標籤會印出 `F201F8F201F9威力：0101180` ②`<If(…)>A<Else/>B</If>` 條件式有 **359/1326** 個技能在用，多數分支文字相同，拆行後去重就對了，不處理會看到七八行一樣的句子 ③**說明也要各自過守門**——名字翻了不代表說明也翻了（實測 16 條狀態的說明仍是日文），`validate-data` 的掃描會抓到。
- **技能的 PvP 版與 PvE 版同名但威力差幾十倍** → 火焰 PvE 180、PvP 6000。而且 **PvP 版的 `ClassJob` 掛在進階職（黑魔道士）、PvE 版掛在基礎職（咒術士）**，所以依職業篩選時 PvP 版會排在前面——黑魔點進來第一個看到的就是 6000。用 `Action.IsPvP` 分開（159 個），**預設只看 PvE**。
- **要用「名字」查東西（跨語言）** → 前端用 `assets/js/item-names.js` 的 `ItemNames.lookup()`／`lookupMany()`。**它的 `normalizeName()` 與 `shardOf()` 必須與 `scripts/build-item-names.mjs` 逐字一致**——不一致的徵狀是「明明收錄了的東西查不到」，兩邊都不會報錯。`validate-item-names.mjs` 會拿 12,000 個真實名稱逐筆比對兩邊的輸出。
- **分片層要依「查詢鍵」切時，別套用 id 分片的經驗** → `item-sources` 依 `id >> 10` 切，因為它用 id 查；`item-names` 用名字查，所以依 `FNV-1a(正規化鍵) % 256` 切。**試過「片內共用名稱陣列」去重，結果反而更大**（3.4MB → 3.76MB）：雜湊分片會把同一件物品的四個鍵打散到四個不同的片，片內根本沒有重複可去。真正有效的是把片切小。
- **要在頁面之間傳一份材料清單** → 市場頁的 `#craft=<id>:<數量>,…`（也收 `?craft=`）。它逐件走既有的 `addToCraft()`，上限與去重的規則只有那一份；查無的 id 安靜略過並提示件數。製作模擬器的「💰 帶這些材料去市場頁算成本」就是走這條。
- **要打 XIVAPI** → 用 `scripts/lib/xivapi.mjs` 的 `xiv.sheet/rows/row`，**不要再手寫一份 `getJson`＋分頁迴圈**（站內曾有 13 份副本）。三個內建的雷：`?rows=` 不指名 `fields` 只回預設欄位、`?rows=` 有一個 id 不存在會整批 404、**v1（`xivapi.com/<Sheet>`）已停更但仍回 200**（TripleTriadCard 在 v1 是 425 筆、v2 是 475 筆）。注意 `xivapi.com/i/...` 是圖示 CDN，不是 v1 API。
- **要讀商店表** → 用 `scripts/lib/shops.mjs` 的 `loadShops()`，別直接讀 `out_data/shops.msgpack`（舊 dump，7.21 後的兌換品不在裡面）或自己抓 Teamcraft `shops.json`。台服店名走 `tw-locales` 的 `shops`（1,875 間，完全涵蓋 msgpack 的 1,815 間）。
- **要「依取得方式篩選」而不是「查單一物品的取得方式」** → 那是兩件事：分片層（`data/item-sources/`）按需載入、答得了「這一件哪來的」，但答不了「哪些家具是 NPC 直接買得到的」——後者要把 36,335 件掃一遍。用 `data/item-source-types.json`（類型位元遮罩，差分陣列 gzip 15KB）。**選項名單要從那份檔案自己長出來**，寫死的話新增一種管道會從篩選裡安靜消失。
- **要判斷「這個字串能不能印在畫面上」** → 用 `scripts/lib/tw-text.mjs` 的 `isTw()`，**不要再手寫 `/[一-鿿]/`**（站內曾有 19 份，每一份都有同一個洞：只要字串裡任何一處有漢字就整串放行，所以「コメンデーションクリスタルの取引」這種日文原文會直接上畫面）。`twName()` 用的是寬鬆版 `isTranslated()`——它只擋假名與遊戲內部佔位列，不要求漢字，因為台服真的會顯示 HP／PvP／F.A.T.E. 這類拉丁字串。**`twName()` 回傳有值不等於那是台服名**：上游語系檔的 `shops` 10 筆、`mobs` 89 筆、`statuses` 77 筆是未翻譯的日文。
- **`ItemSources.getMany()` 回的是 `Map` 不是物件，而且鍵是數字** → 寫成 `map[id]` 會永遠拿到 `undefined`，**而且完全不報錯**——那一欄只是留白，看起來像「本站資料沒收」。正確寫法是 `map.get(+id)`。練級裝備路線第一版就是這樣，分片明明載進來了（log 看得到 `item-sources/18.json`）畫面上卻全空。回歸要驗「取得管道有填上」而不只是「有去載分片」。
- **要把取得管道翻成畫面上的字** → 用 `scripts/lib/obtainable.mjs` 的 `convertOm()`＋`normalizeEntries()`。**兩種 skip 集合不要混用**：`SKIP_MARKET`（市場頁湊材料，濾掉製作／秘籍／商城）與 `SKIP_CATALOG`（分片層，製作與商城**是**有效答案）。上游的 `shopName`／NPC 名有 2,444 處是英文，`twOnly` 會擋掉，補得回來的走 `twShop` 解析器。
- **做「下次什麼時候開」的功能** → 用 `assets/js/window-calc.js` 的 `nextWindows()`＋`statusOf()`，鬧鐘用 `assets/js/et-alarm.js`。**不要再寫第三份視窗演算法**——釣魚與限時採集兩頁已經收斂成薄包裝。改完必跑 `node scripts/validate-window-calc.mjs`（鬧鐘的錯誤是該響沒響，畫面上看不出來）。
  **鬧鐘 2026-09-27 才真的接上**：`et-alarm.js` 先前是寫好卻沒有任何頁面載它的死碼，兩頁各自留著自己的實作，而本檔與知識庫都宣稱「已收斂」。現在釣魚／限時採集／天氣三頁都走 `ETAlarm.create()`，改完跑 `node scripts/validate-et-alarm.mjs`——那支的第一組斷言就是「檔案真的被載了，而且沒有人自己再寫一份」。
- **天氣的時間窗不要拿 window-calc 算**（單獨查「下次下雨」時）→ 天氣是 8 ET 小時一段、由雜湊決定，權威是 `assets/js/eorzea-weather.js` 的 `getWeatherAt()`；天氣頁的 `scanWeather()` 是目標搜尋／天氣鏈／我的天氣目標三處共用的那一份。**但把天氣當成條件掛在別的視窗上時走 window-calc**（`spec.weather = {mapId, keys, prevKeys}`，`startHour 0`／`endHour 24` 等於不限時段）。
- **新增或改了「某個系統要先解鎖」的資訊** → 改 `scripts/lib/system-unlock-map.mjs` → `node scripts/build-system-unlocks.mjs`（先 dry-run 看閘門過不過）→ `--apply` → **`node scripts/build-site-index.mjs --apply`**（命令面板吃這份，漏跑會搜不到新系統）→ `validate-data` → `sync-meta --apply`。工具頁的橫幅**不必改頁面**——`assets/js/unlock-banner.js` 認的是 `system-unlocks.json` 的 `tool` 欄位對上網址路徑；新工具頁只要在 `<head>` 加一行 `<script src="../../assets/js/unlock-banner.js"></script>`。
- **改了收藏頁的 `sources`（尤其 `type: "任務"`）** → `node scripts/patch-collection-quest-npc.mjs`（dry-run 看認出幾筆）→ `--apply` → **`node scripts/minify-data.mjs --apply`**（那支寫 pretty JSON）→ `validate-links`（`收藏頁 sources[].at.mapId → maps` 要 0 斷鏈）→ `validate-tracker-pages`。接取點的畫面層是共用的 `CollectionTracker.sourceWhere()`，**各頁不要自己排版**。
- **改了追蹤頁／共用引擎（`assets/js/collection-tracker.js`）** → 12 個追蹤頁全部吃這支，改完務必跑一次 jsdom 回歸（見 [docs/專案慣例與記憶.md](docs/專案慣例與記憶.md) §2.5；本機 headless Chromium 在此環境跑不起來）。
- **新增工具頁** → `/spec` 釐清需求 → 實作 → `/qa` → `/ship`。
- **要更新外部來源資料** → `/scrape` 抓取 → 跑 `/scripts` 產生 → `node scripts/validate-data.mjs` → `/verify`。
- **改了幻化配裝圖鑑** → 先讀 [tools/glamour/CLAUDE.md](tools/glamour/CLAUDE.md) → 改碼／改 `data/curated_outfits.json` → `py tools\glamour\scripts\update_all.py local` 重建＋健檢 → `/browse` 驗收。**重建任何一份前端 js 後都會連帶重跑 `build_item_sources.py`**，漏跑不會報錯、只會安靜地退回單一來源。
- **幻化配裝圖鑑抓新投稿（「更新名單」那一輪）** → `py tools\glamour\scripts\pipeline.py all` → `compress_mirapri` → `make_thumbs` → `build_image_tiers`（＋`--drop-jpg`）→ **新圖由 Claude 逐張親讀**（不要跑 ollama 的 `ocr_check` 當真值，準度 58% vs 99%）→ `inject_claude_ocr.py --apply` → `apply_dyes` → `reconstruct_empty` → `build_site` → **`check_duplicates.py`（先看報告，類型 1 再 `--apply`，之後要再跑一次 `build_site`）** → `build_item_sources` → `health_check` → 開頁驗收。稽核**不能省**：09-05 那輪漏跑，8 組英文版重投一路活到 09-15 才被抓到。**每件裝備名一律回查 `ja-items.msgpack`＋`item_fallback_multilang.json`、每個染色對 `dye_names_ja.json`**——`inject_claude_ocr.py` 會強制這件事。英文介面投稿的**染色名是片假名讀回來的英文詞、不是官方英文染劑名**，別直接查 `dye_aliases.json`（知識庫 §4.38）。
- **改了社群配裝的前端資料格式** → 那份是「`item_db.js` 共用裝備字典 ＋ 緊湊編碼」，**格式定義只有 `tools/glamour/scripts/mira_codec.py` 一份**（`build_site.py` 寫，`build_review.py`／`check_duplicates.py`／前端 `rehydrateMirapri()` 讀）。`build_site.py` 每次建置都會把編碼解回來與原始結構完整比對，對不上直接中止——**不要為了讓建置過而拿掉這個閘門**，掉欄位在畫面上完全看不出來（知識庫 §4.35）。
- **在 `tools/glamour/配裝圖片/` 下新增產出目錄** → 先把所有會 `rglob` 圖片的腳本掃一遍。新增卡片層時 `make_thumbs.py`（`EXTS` 含 `.webp`）把它當來源圖、生了 237MB 的「縮圖的縮圖」，`health_check.py` 的覆蓋率分母也多算了 7,060 張，兩邊都不報錯（知識庫 §4.36）。
- **改了主庫 `data/items.json`（或跑了 `build-items.mjs`）** → 除了 `build-items-lite`／`build-items-market`／**`build-dyes.mjs`（染劑庫，新版本會加新染劑，漏跑會讓時尚品鑑週更直接中止）**，**幻化配裝圖鑑也吃這份**：跑 `py tools\glamour\scripts\update_all.py local` 讓它跟上。社群套裝的裝備名另外吃 `all_outfits_enriched.json` 快取，要一併更新得跑 `py tools\glamour\scripts\pipeline.py enrich`；精選／官方套裝的名稱則來自 `item_fallback_multilang.json`，需 `py tools\glamour\scripts\build_item_fallback.py`（連網約 3 分鐘）。**染色對照也吃主庫**：`py tools\glamour\scripts\build_dye_names.py --apply`（白名單／日繁／英文別名三份）——**漏跑不會報錯，新色會被模糊比對指派成最像的舊色**（知識庫 §4.24）。
- **時尚品鑑週更** → `node scripts/build-fashion-report.mjs` → `node scripts/validate-data.mjs` → `node scripts/validate-fashion-render.mjs` → 開頁驗收。**別再手工挑推薦裝**，推薦標準與換週狀態機是程式定的，規格見 [docs/fashion-report-spec.md](docs/fashion-report-spec.md)、操作見 [docs/fashion-report-update-sop.md](docs/fashion-report-update-sop.md)。腳本報「來源尚未換週」是**正常的換週真空期，什麼都不用做**。
- **重建釣魚資料** → `node scripts/build-fishing.mjs` → **必接** `patch-fishing-common.mjs`（補回 ~339 條常駐普通魚，build 只產得出上游的 1110 條）、`patch-fishing-multispot.mjs` 與 `patch-fish-legendary.mjs --apply`。跑完 `validate-links` 的「fishes.spotId → fishing-spots」要是 **0 斷鏈**；**釣場名一律走 `twPlaces` 不可用 OpenCC**（舊版簡轉繁，307 個裡 25 個是錯的，而釣場詳情的 `/coord` 會把錯地名複製進遊戲）。後者漏跑不會報錯，只會安靜地把 30 隻魚皇（釣場之皇）降級成普通魚王——上游沒有這個旗標，名單是我們自己維護的（見知識庫 §4.8）。
- **幻卡少了新卡** → `node scripts/patch-triple-triad-new-cards.mjs`（dry-run 看要補什麼）→ 加 `--apply` → `node scripts/download-triple-triad-images.mjs` 補卡面圖 → `node scripts/patch-triple-triad-source-names.mjs --apply`（補取得方式的繁中名）→ `node scripts/validate-data.mjs`。**張數不要相信 build 腳本裡的常數**（`build-triple-triad-all.mjs` 寫死 425，7.1 的 10 張新卡就這樣安靜漏掉）；真實張數＝`items.json` 裡 category「九宮幻卡」的道具數。7.1 以後的 sheet 只有 XIVAPI **v2** 有（v1 已停更）。
- **潛水艇的部位名不可以從 `SubmarinePart.Slot` 編號推** → 那個編號與道具順序**完全不一致**，照順序猜會四個部位全錯（船首→Slot 2、艦橋→Slot 3、船體→Slot 0、船尾→Slot 1）。正確關聯是 **`Item.AdditionalData` = SubmarinePart 的 row id**（同幻卡那條，§4.10）；部位名一律取自**道具分類**（`潛水艇組件（船首）`）。**另外不要提供「勾幾個點跑一趟要幾桶」的試算**——那個公式不在遊戲資料裡，算錯會讓人把艇派出去回不來。
- **接外部工具站的 id 之前** → **先用名稱對一次再接**。幻卡舊資料的 `instanceId` 是 Garland 自家 id，182 個裡 64 個「剛好」也是 `dungeons.json` 的有效 key，但其中 **151 個對到的是錯的副本**（知識庫 §4.10）。同一個坑在 mapId 已經踩過一次。
- **看到收藏頁某筆「沒有取得方式」** → 先確認**它在遊戲裡是不是真的存在**。坐騎有 4 筆是 `Mount.Order === -1` 的內部列（玩家拿不到、其中 3 筆還是重複），補 sources 是補錯方向（知識庫 §4.11）。
- **要重跑任何 `build-*.mjs` 之前** → 先確認那份 JSON 裡**每個 `kind`／區塊都有腳本會產生**。`squadron.json` 的 60 筆隊員曾經只存在於 JSON、沒有腳本產它，重跑會安靜洗掉（知識庫 §4.19）。最快的檢查＝跑完跟舊檔 diff 一次。
- **要加頁內快捷鍵** → 登記到 `window.SGT_SHORTCUTS`（在 `assets/js/nav.js`，全站都載得到），**不要自己掛 `document.keydown`**——那會繞過「輸入框裡不攔」「彈窗開著不攔」「修飾鍵不攔」三道守門，而且 `?` 說明浮層列不出你的鍵。**時序陷阱**：nav.js 是 `defer` 載的，追蹤頁的 `init()` 是 inline 同步跑的，登記時 `SGT_SHORTCUTS` 常常還不存在 → 推進 `window.SGT_SHORTCUTS_PENDING`，nav.js 自己會吸乾。改完跑 `node scripts/validate-shortcuts.mjs`。
- **跑 `download-dungeon-images.mjs` 之後一定要接 `minify-data.mjs --apply`** → 那支會**把 `dungeons.json` 整份改寫成 pretty JSON**（303KB → 426KB），而且會把 `image` 改寫成本地 `.webp` 路徑。它不會提醒你，`validate-data` 也不會報——只有檔案大小看得出來。順序：`patch-dungeon-details.mjs --apply` → `download-dungeon-images.mjs` → `minify-data.mjs --apply` → `sync-meta.mjs --apply`。
- **要讓使用者「一鍵覆寫同一個備份檔」** → File System Access 的 `FileSystemFileHandle` 可以結構化複製，**存 IndexedDB**（`localStorage` 只吃字串，`JSON.stringify(handle)` 得到 `{}`，下次讀回來是個沒有 `createWritable` 的空物件，**執行到寫入那一刻才爆**）。三條：①**`requestPermission()` 必須在使用者手勢裡呼叫**，開頁時只能 `queryPermission`，放錯位置會被瀏覽器擋掉而且不報錯 ②**不支援的瀏覽器整顆鈕不要長出來**（Firefox／Safari 都沒有這個 API）③沒取得權限時要講出來，不可以靜默失敗。首頁的實作見「進度備份」區，回歸 `validate-backup-file.mjs`。
- **新頁要存 localStorage** → key 一律 `ffxiv_` 開頭，否則首頁全站備份掃不到、使用者的資料備份不出去也不會有提示（知識庫 §2.3）。市場頁 2026-08-10 才從 `sgt-market-*` 補救回來，**改名要留一次性遷移、且不要刪舊 key**。
- **多角色設定檔的 key 分類是「白名單反轉」** → `assets/js/profiles.js` 預設把**每個 `ffxiv_*` key 都當成角色態**，只有明列在 `SHARED` 裡的才算共用偏好。**不要反過來做**——反過來的話，日後新增一個忘了登記的進度 key，兩隻角色會共用同一份進度，那是**靜默的資料損壞**。這樣做的話分類錯的代價只是「某個偏好不跟著角色走」，看得見也改得回來。切換時**只覆蓋不刪**（目標設定檔沒有的 key 保持原樣），而且**存不進去就不切**（配額爆了硬切會遺失資料）。
- **改了製作模擬器（`tools/crafting-sim/`）** → 改完 `craft-engine.js`、`craft-solver.js` 或 `data/craft-actions.json` **必跑 `node scripts/validate-craft-sim.mjs`**（Teamcraft 官方測試案例＋內建範本＋自動求解，104 項）。製作公式的取整點很多，差一個 `Math.floor` 在高階配方上差幾百品質、**畫面上完全看不出來**。規則出處、兩處刻意與 Teamcraft 不同的地方、範本怎麼解出來的、求解器為什麼只用「不靠運氣」的技能，見 [docs/crafting-sim.md](docs/crafting-sim.md)。**作業／品質的封頂只做在畫面上**（引擎要跟 Teamcraft 的期望值逐值對得上）。
- **要算「買 N 個多少錢」** → 一律用 `Universalis.fillQuote()` 逐筆吃掉掛單，**絕不可用「最低價 × N」**。最便宜那筆常常只有 1～3 個，乘法會系統性低估、且低估幅度隨數量放大（知識庫 §3.14）。
- **做「幾步才做得到」的東西（園藝配種、長鏈製作）** → **要算最短路徑，不要列配方**。列一層等於把問題丟回給使用者。園藝的成本模型＝`cost(種子)=0 若可直接買／採；否則 min over 配方 of max(cost(本),cost(鄰)) + 本株作物時數`，**用定點迭代不要用遞迴 memo**（配種關係有環，遞迴會把 `Infinity` 記進 memo 害整條鏈變無解）。另外「直接可得」**不能認市場板**——它對每個種子都成立，認了整棵樹會縮成一層。機制與出處見 [docs/gardening-rules.md](docs/gardening-rules.md)。
- **主線章節的順序是 `JournalGenre` 的 row id，不是 `SortKey`** → `SortKey` **只在章節內有意義**，拿來跨章排會排出「第七星曆在新生艾奧傑亞前面」（新生第一個任務的 SortKey 是 2、其餘章節都是 1）。row id 剛好就是劇情順序：1 新生 → 2 第七星曆 → 3 蒼天 → … → 14 黃金終章。**判斷「哪些算主線」也不要用 genre id 白名單**——用 `JournalSection` 的名稱以 `Main Scenario` 開頭，不然改版新增章節會安靜漏掉。
- **要查一張 XIVAPI sheet 存不存在** → 打 **`/api/sheet` 拿全表清單**，**不要用取某一列（`/api/sheet/<name>/1`）來試**——很多表的 row id 不從 1 開始（`CraftLeve` 從 917504、`CollectablesShop` 從 3866624），取 row 1 會 404 而讓你誤判成「這張表不存在」。這個誤判差點讓 `leve-calculator` 與 `collectables-scrip-table` 兩案一起被錯誤放棄（知識庫 §4.81）。
- **要拿禁忌鑲嵌的成功率** → 用 `data/materia.json` 的 `tiers`（來源 XIVAPI `MateriaGrade`，**12 列正好一階一列**）。⚠ XIVAPI 另有一張 `MateriaJoinRate`，欄位名幾乎一樣但**只有 10 列**，與 12 階對不起來——**別用那張**。「雙數階只能鑲第一個禁忌孔」這條規則**不要自己寫**：資料裡第 2–4 孔本來就是 0，讓 0 自己說話。`MateriaGrade.ReturnRate`（100／80／40）意義查不出來，**刻意不收也不顯示**。
- **要拿 `exploration-log.json` 的時間窗** → **`timeEnd` 是「含該小時」**：`17–17` 代表 17:00–17:59（見 `collections/exploration-log/index.html` 的 `fmtTime()`）。`window-calc` 的 `endHour` 是開區間，所以要 **+1** 再傳。直接傳的話 `17–17` 變成零長度視窗（會算出「開著但剩 272 小時」這種鬼東西）、`8–11` 每次少算一小時，**兩種都不報錯**。同理 `gathering.json` 的 `duration` 單位是 **ET 分鐘**（120／180／240），不是小時。
- **`data/*.json` 走 stale-while-revalidate，所以資料更新後第一次進站看到的是舊的** → 2026-09-27 起 `sw.js` 會在背景比對出新版時 `postMessage({type:"sgt-data-updated"})`，`theme.js` 收到就長一條常駐提示「資料已更新 ↻ 重新整理」。**版本比對依序看 ETag → Last-Modified → Content-Length，三個都拿不到就當成沒變**——反過來做的話每次進站都會喊一次狼來了。**不自動重整**（正在填表的人會被惱到）。要做常駐＋帶動作鈕的提示用 `Toast.action(msg, {label, onClick, key})`，別再開第四種飄浮物。
- **動到 PWA（manifest／圖示／安裝）** → 三件事很容易各自看起來沒問題卻裝不起來，而且**全都不報錯**：①**頁面要有 `<link rel="manifest">`**——本站沒有任何一頁的 HTML 寫它，是 `theme.js` 執行期注入的，所以 grep HTML 會以為沒有 ②**Android 的安裝橫幅要 192／512 的 PNG**，只掛 SVG（`sizes:"any"`）時桌面 Chrome 吃得下但手機不出現提示 ③**iOS 的 `apple-touch-icon` 不吃 SVG**，指向 SVG 時 Safari 直接忽略、「加入主畫面」拿到的是網頁截圖。maskable 圖示要**另外畫**（縮到 80% 置中），拿原圖兼任會被 Android 裁掉外圈、變成圓角裡再一個圓角。改完跑 `node scripts/validate-pwa.mjs`。
- **要做「某種收藏」的新頁，但那張 sheet 沒有 Name 欄** → 走坐騎那套已驗證的路子：XIVAPI search API 查 `Item.ItemAction.Action=<N>`，`ItemAction.Data[0]` 就是收藏 id，名字一律取自解鎖道具的 `items.json` 繁中名。**Action id 不要用猜的**——把整張 `ItemAction` 抓下來依 Action 分組，挑「筆數與該 sheet 列數相近、且 `Data[0]` 全落在 1..N」的那個，再逐件對名字確認（時尚配飾＝20086，坐騎笛＝1322）。
- **幻卡的 `NPC牌組` 不是取得管道** → 「對局時對手手上會有這張卡」≠「打贏就拿得到」。真正的取得管道是 `NPC對戰`（`ItemPossibleReward`），258 筆／233 張卡；`NPC牌組` 有 944 筆。兩者 2026-09-23 才拆開，**先前 938 筆「NPC對戰」有 99.6% 其實是牌組**。做任何「我缺的卡去哪拿」的功能都只能認 `NPC對戰`，混進牌組會叫使用者跑一堆白跑的路。判別：牌組有 `slot`（固定／隨機），對戰有 `fee` 與 `rules`。
- **做「會一邊操作一邊看」的清單** → **排序鍵不可以是會變的值**。市場頁的製作計畫原本依金額排，重新查價／改數量／按一次「✓ 已有」就整份洗牌，剛在看的那列跑掉了；改成依**物品 ID 遞增**（順序永遠一樣，且 FFXIV 的 id 大致依資料片遞增、同階材料自然聚在一起）。**不要為此開排序選單**，但要用表頭 `title` 說明依據；欄位不可點就**不要掛 `aria-sort`**（知識庫 §3.19）。
- **要量版面／水平溢出／console error** → 用 headless **Edge** ＋ CDP（本機 Chromium 起不來，Node 24 有原生 WebSocket 故不必裝 puppeteer）。**`setDeviceMetricsOverride` 要 `mobile:false`**，傳路徑參數要 `MSYS_NO_PATHCONV=1`（知識庫 §3.5）。jsdom 只驗得了 DOM 結構，量不了版面。
- **升台服版本** → **先確認台服真的在哪一版**（拿 Teamcraft `tw/tw-items.json` 的 id 對 `patch-content`→`patch-names`，取最高版本；台服會把國際服的小改版併進同一次更新，2026-08-11 就是 7.2＋7.21 一起到）→ `build-tw-items-msgpack.mjs --apply` → `build-items.mjs` → 改 `patch-backfill.mjs` 的 `TW_PATCH`（它會寫 `_meta.json` 的 gamePatch）→ `patch-backfill` 三支（`--apply`）→ `backfill-sources.mjs --apply` → `patch-tw-names.mjs --apply` → 衍生檔四支＋**`build-dyes.mjs`**＋`minify-data --apply`＋`sync-meta --apply` → `validate-data.mjs` → 動過 `assets/` 再 `bump-sw-version.mjs` → commit。**版本號改了但沒刷新繁中名快照＝把英文名放行到前端**（知識庫 §4.5）。
