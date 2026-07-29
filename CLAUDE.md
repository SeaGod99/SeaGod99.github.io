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
index.html              # 入口頁（含全站進度儀表板與備份匯出入）
tools/<name>/           # 各工具頁，一頁一目錄，index.html 自帶樣式與邏輯
collections/<name>/     # 收藏追蹤頁（+ minions/ 在根目錄，歷史因素）
data/                   # 統一資料庫（SCHEMA.md／_meta.json）＋前端讀的 json
scripts/*.mjs           # 資料產生／校正腳本（node，非執行期依賴）
assets/css|js/          # 共用樣式與腳本（common.css、eorzea-weather.js…）
out_data/               # 大型中繼檔（msgpack），不進前端
tools/glamour/          # 併入的獨立子專案，自帶 Python 管線與 CLAUDE.md（資料吃主庫，見 scripts/maindb.py）
```

| 我要做的事 | 指令 |
|-----------|------|
| 重建某份資料 | `node scripts/build-<名稱>.mjs` |
| 校正既有資料（patch 系列） | `node scripts/patch-<名稱>.mjs`（多數 dry-run 預設，`--apply` 才寫入） |
| 資料驗收（改完資料必跑） | `node scripts/validate-data.mjs`（會順便報 `_meta.json` 不同步） |
| `_meta.json` 與資料檔同步（validate 報不同步時跑） | `node scripts/sync-meta.mjs`（`--apply`） |
| 副本庫補收漏掉的副本 | `node scripts/patch-dungeon-add-missing.mjs`（`--apply`／`--offline`） |
| 幻卡英文散文來源結構化 | `node scripts/patch-triple-triad-prose-sources.mjs`（`--apply`） |
| 連結檢查 | `node scripts/validate-links.mjs` |
| 壓縮前端會載入的 data/*.json（改完資料後） | `node scripts/minify-data.mjs`（dry-run 預設／`--apply` 寫入；`_meta.json` 刻意保留可讀） |
| 重建物品精簡表（改完 items.json **兩支都要跑**） | `node scripts/build-items-lite.mjs`（採集兩頁用）＋`node scripts/build-items-market.mjs`（市場頁用） |
| 更新 SW 快取版本（改完 assets/ 的 css/js 必跑） | `node scripts/bump-sw-version.mjs`（`--check` 只驗證） |
| 時尚品鑑週更（每週二／週五各一次） | `node scripts/build-fashion-report.mjs`（`--dry-run` 只印／`--offline` 用快取）|
| 時尚品鑑跨週不變資料（改版時才跑） | `node scripts/build-dyes.mjs`／`build-fashion-fillers.mjs`／`build-fashion-themes.mjs` |
| 重建無人島資料層 | `node scripts/build-island.mjs`（`--offline` 用快取／`--refresh` 強制重抓） |
| 幻卡補新卡（台服開新卡時） | `node scripts/patch-triple-triad-new-cards.mjs`（dry-run／`--apply` 寫入）→ `node scripts/download-triple-triad-images.mjs` |
| 幻卡取得方式補繁中名（補完新卡後） | `node scripts/patch-triple-triad-source-names.mjs`（`--apply`／`--offline`，冪等） |
| 副本補資料片欄位（改完 dungeons.json） | `node scripts/patch-dungeon-expansion.mjs`（`--apply`／`--offline`） |
| 坐騎／寵物補手冊排序（重建後必跑，用來擋幻影條目） | `node scripts/patch-collection-order.mjs`（`--apply`／`--offline`） |
| 青魔補副本／地區連結 | `node scripts/patch-blue-magic-content-ids.mjs`（`--apply`） |
| 收藏頁補空 sources（由 obtainable-methods 推） | `node scripts/patch-sources-from-om.mjs`（`--apply`） |
| 幻化配裝圖鑑重建 | `py tools\glamour\scripts\update_all.py local`（離線）／不帶 `local`＝完整抓取 |
| 幻化配裝圖鑑的主庫健檢 | `py tools\glamour\scripts\check_maindb.py`（不改檔；msgpack 解不開會直接報出來） |
| 重建物品分類對照表（改完 items.json） | `node scripts/build-item-categories.mjs`（`--offline` 只驗證） |
| 看頁面 | 直接開檔或 `/browse`；無 dev server |

**一次性／低頻腳本**（不在上表，但 repo 裡有；2026-07-29 盤點補登記，免得換機後不知道它們幹嘛）：

| 腳本 | 什麼時候跑 | 產出 |
|------|-----------|------|
| `build-squadron.mjs` | 幾乎不用（4.x 後小隊內容未變，數值內嵌在腳本裡）。**跑完必接 `minify-data.mjs --apply`＋`sync-meta.mjs --apply`**（腳本寫的是 pretty JSON，但前端載的是壓縮版） | `data/squadron.json` |
| `build-blue-magic.mjs` | 台服開新青魔法時（XIVAPI AozAction 全抓） | `data/blue-magic.json` |
| `build-barding.mjs` | 新增鳥鞍時 | `data/barding.json` |
| `build-npcs.mjs` | 換 Teamcraft TW 版本時（只有建置用，前端不載） | `data/npcs.json` |
| `build-obtainable.mjs` | 重建取得方式摘要表（前端篩選用；**詳細版在 `out_data/obtainable-methods.msgpack`**） | `data/obtainable-methods.json` |
| `build-mounts-desc.mjs` | `build-mounts` 跑完補 description（那支跑完會是 null） | 就地改 `data/mounts.json` |
| `patch-aether-coords.mjs` | 補風脈座標（303 筆，已補完） | 就地改 `data/aether-currents.json` |
| `patch-fishing-common.mjs` | 補常駐普通魚（已補完） | 就地改 `data/fishes.json` |
| `download-emotes-icons.mjs` | 新表情出現時 | `assets/emotes/`（前端用本地路徑） |
| `download-barding-icons.mjs` | 新鳥鞍出現時 | `assets/barding/` |
| `download-blue-magic-icons.mjs` | 新青魔法出現時 | `assets/blue-magic/` |
| `download-dungeon-images.mjs` | **目前沒有頁面用**——`assets/dungeons/`（379 檔 11MB）是為未來副本頁備的素材，`dungeons.json` 的 `image` 欄有 386 筆指向它，但沒有任何頁面顯示副本圖 | `assets/dungeons/`＋改 `dungeons.json.image` |

**環境注意**：
- 本機 `python` 指令是 Microsoft Store 假捷徑（執行會靜默結束），**Python 一律用 `py`**。
- 終端機走 VS Code 內建終端機，避免彈出獨立視窗。
- Bash 工具下多行 commit 訊息要用 `git commit -F <檔案>`，**不要用 PowerShell here-string**（Bash 是 POSIX sh，`@'...'@` 會變成字面字元）。

**repo 很大（約 860MB／2.8 萬檔，主要是 glamour 的圖）**：
- `git clone`／`git pull`／`git checkout` 動輒數分鐘，**下 git 指令請把 timeout 拉到 5 分鐘以上**。曾因 2 分鐘超時中斷 checkout，留下 index.lock ＋ 5 千個沒寫完的檔案。
- 還原檔案時**先確認範圍**：`git restore .` 會連同你正在編輯的檔案一起還原（曾因此洗掉未 commit 的文件修改），只想補回某目錄就寫 `git restore tools/glamour`。
- 距 **GitHub Pages 1GB 發佈上限**只剩約 140MB 餘裕，新增大批圖片前先估增量。
- 跑完 `update_all` 後，衍生的 js 與新縮圖**記得 commit**（`.gitignore` 已不擋）。

**另外兩條鐵則**（違反過、代價高，細節見「專案慣例與記憶」）：
- **對使用者一律繁體中文回覆**；技術名詞可保留原文（§1.1）。
- 天氣槽位順序不可合併同名天氣、`WEATHER_TC` 與 `eorzea-weather.js` 的譯名表改任一邊必須同步另一邊（§4.4）；收藏頁「取得方式」永遠預設顯示，勿改回 hover／toggle（§2.1）。

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
- **改了追蹤頁／共用引擎（`assets/js/collection-tracker.js`）** → 12 個追蹤頁全部吃這支，改完務必跑一次 jsdom 回歸（見 [docs/專案慣例與記憶.md](docs/專案慣例與記憶.md) §2.5；本機 headless Chromium 在此環境跑不起來）。
- **新增工具頁** → `/spec` 釐清需求 → 實作 → `/qa` → `/ship`。
- **要更新外部來源資料** → `/scrape` 抓取 → 跑 `/scripts` 產生 → `node scripts/validate-data.mjs` → `/verify`。
- **改了幻化配裝圖鑑** → 先讀 [tools/glamour/CLAUDE.md](tools/glamour/CLAUDE.md) → 改碼／改 `data/curated_outfits.json` → `py tools\glamour\scripts\update_all.py local` 重建＋健檢 → `/browse` 驗收。**重建任何一份前端 js 後都會連帶重跑 `build_item_sources.py`**，漏跑不會報錯、只會安靜地退回單一來源。
- **改了主庫 `data/items.json`（或跑了 `build-items.mjs`）** → 除了 `build-items-lite`／`build-items-market`，**幻化配裝圖鑑也吃這份**：跑 `py tools\glamour\scripts\update_all.py local` 讓它跟上。社群套裝的裝備名另外吃 `all_outfits_enriched.json` 快取，要一併更新得跑 `py tools\glamour\scripts\pipeline.py enrich`；精選／官方套裝的名稱則來自 `item_fallback_multilang.json`，需 `py tools\glamour\scripts\build_item_fallback.py`（連網約 3 分鐘）。
- **時尚品鑑週更** → `node scripts/build-fashion-report.mjs` → `node scripts/validate-data.mjs` → 開頁驗收。**別再手工挑推薦裝**，推薦標準與換週狀態機是程式定的，規格見 [docs/fashion-report-spec.md](docs/fashion-report-spec.md)、操作見 [docs/fashion-report-update-sop.md](docs/fashion-report-update-sop.md)。腳本報「來源尚未換週」是**正常的換週真空期，什麼都不用做**。
- **重建釣魚資料** → `node scripts/build-fishing.mjs` → **必接** `patch-fishing-multispot.mjs` 與 `patch-fish-legendary.mjs --apply`。後者漏跑不會報錯，只會安靜地把 30 隻魚皇（釣場之皇）降級成普通魚王——上游沒有這個旗標，名單是我們自己維護的（見知識庫 §4.8）。
- **幻卡少了新卡** → `node scripts/patch-triple-triad-new-cards.mjs`（dry-run 看要補什麼）→ 加 `--apply` → `node scripts/download-triple-triad-images.mjs` 補卡面圖 → `node scripts/patch-triple-triad-source-names.mjs --apply`（補取得方式的繁中名）→ `node scripts/validate-data.mjs`。**張數不要相信 build 腳本裡的常數**（`build-triple-triad-all.mjs` 寫死 425，7.1 的 10 張新卡就這樣安靜漏掉）；真實張數＝`items.json` 裡 category「九宮幻卡」的道具數。7.1 以後的 sheet 只有 XIVAPI **v2** 有（v1 已停更）。
- **接外部工具站的 id 之前** → **先用名稱對一次再接**。幻卡舊資料的 `instanceId` 是 Garland 自家 id，182 個裡 64 個「剛好」也是 `dungeons.json` 的有效 key，但其中 **151 個對到的是錯的副本**（知識庫 §4.10）。同一個坑在 mapId 已經踩過一次。
- **看到收藏頁某筆「沒有取得方式」** → 先確認**它在遊戲裡是不是真的存在**。坐騎有 4 筆是 `Mount.Order === -1` 的內部列（玩家拿不到、其中 3 筆還是重複），補 sources 是補錯方向（知識庫 §4.11）。
- **要重跑任何 `build-*.mjs` 之前** → 先確認那份 JSON 裡**每個 `kind`／區塊都有腳本會產生**。`squadron.json` 的 60 筆隊員曾經只存在於 JSON、沒有腳本產它，重跑會安靜洗掉（知識庫 §4.19）。最快的檢查＝跑完跟舊檔 diff 一次。
- **新頁要存 localStorage** → key 一律 `ffxiv_` 開頭，否則首頁全站備份掃不到、使用者的資料備份不出去也不會有提示（知識庫 §2.3）。
- **要量版面／水平溢出／console error** → 用 headless **Edge** ＋ CDP（本機 Chromium 起不來，Node 24 有原生 WebSocket 故不必裝 puppeteer）。**`setDeviceMetricsOverride` 要 `mobile:false`**，傳路徑參數要 `MSYS_NO_PATHCONV=1`（知識庫 §3.5）。jsdom 只驗得了 DOM 結構，量不了版面。
- **升台服版本** → 改 `data/_meta.json` 的 `gamePatch` → `patch-backfill` 三支（`--apply`）→ `backfill-sources.mjs` → `validate-data.mjs` → commit。
