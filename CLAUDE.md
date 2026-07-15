# CLAUDE.md

水神的工具箱（SeaGod's Toolbox）— FFXIV 繁中玩家工具站。純靜態頁面，部署於 GitHub Pages，無後端。專案概況、工具清單、資料來源與結構詳見 [README.md](README.md)。

---

## ⭐ 開工前必讀（跨機延續規則）

**這個專案會在多台電腦上輪流開發。** Claude Code 的本機記憶（`~/.claude/projects/<專案>/memory/`）與 session 快取（`*.jsonl`）**不會跟著 git 走**，所以所有長期知識都必須落在 repo 內的文件。動任何工作前先讀：

1. [docs/PROGRESS.md](docs/PROGRESS.md) — **單一進度來源**：各頁狀態、資料庫狀態、更新紀錄。完工後**必更新**。
2. [docs/專案慣例與記憶.md](docs/專案慣例與記憶.md) — **可攜知識庫**：慣例、決策、資料權威來源、踩過的雷（本機 memory 資料夾的鏡像）。完整文件地圖也在此檔 §6。
3. [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md)＋[data/SCHEMA.md](data/SCHEMA.md) — 資料管線與格式。

**維護規則（務必遵守，否則換機知識遺失）**：
- 有**新慣例／決策定案** → 除了讓 Claude 存進本機 memory，**同步補進 `docs/專案慣例與記憶.md`**。
- 有**新流程／SOP 說明** → 寫成 `docs/*.md` 並在上述知識庫的文件地圖（§6）＋本檔登記；本檔的「gstack 使用情境／常見工作流」是流程索引的入口。
- 有**功能或資料變更** → 更新 `docs/PROGRESS.md`。
- 條目過時或被推翻 → 直接修正／刪除，不要疊加矛盾敘述。

> 換到新電腦時，只要 clone repo 並讀完上面三份文件，即可無縫接續——本機 memory 缺席不影響延續。

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
- **改了共用資料或腳本（`/data`、`/scripts`、`/assets/js`）** → `/verify` 確認受影響頁面行為正常 → `/code-review`。
- **新增工具頁** → `/spec` 釐清需求 → 實作 → `/qa` → `/ship`。
- **要更新外部來源資料** → `/scrape` 抓取 → 跑 `/scripts` 產生 → `/verify`。
