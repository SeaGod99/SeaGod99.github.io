# 時尚品鑑推薦 — 週更流程完整記錄

> 首次手跑：**week 440「新大陸騎手（Western Rider）」**，執行於 2026-07-03（五）10:11–10:40（UTC+8）。
> 目的：把整條週更管線逐步跑一遍並記下每步的輸入、指令、實際輸出與人工介入點，作為後續決定「哪些步驟要自動化」的依據。

## 流程總覽

| # | 步驟 | 來源／工具 | 實際結果 | 自動化評估 |
|---|------|-----------|---------|-----------|
| 1 | 抓本週狀態 | fashionreportxiv `/api/report-state` | week 440、主題、4 提示、6 部位染色 | ✅ 可全自動 |
| 2 | 主題繁中化 | `FashionCheckWeeklyTheme.csv`（CN）＋ opencc-js | row 449「新大陆骑手」→「新大陸騎手」 | ✅ 可全自動 |
| 3 | 提示分類繁中化 | XIVAPI EN sheet ＋ CN CSV join ＋ opencc-js | 4/4 命中（西格瑪／騎手／新大陸風格／水晶都） | ✅ 可全自動 |
| 4 | 抓接受裝備清單 | `/api/hint?hint=X&slot=Y` ×4 | 52 件（14＋5＋18＋15） | ✅ 可全自動 |
| 5 | 英文名→台服名映射 | `out_data/en-items.msgpack` 反轉＋`tw-items.msgpack` | **52/52 命中、0 歧義、0 未實裝** | ✅ 可全自動＋⚠️ 需驗收門檻 |
| 6 | 染色繁中化 | 同上（`<色名> Dye` 物品名映射） | 4 色全命中（珍珠白/石板灰/羅蘭莓/玉米黃） | ✅ 可全自動 |
| 7 | 組出資料檔 | Node 腳本 | `data/fashion-report.json`（含計分推導） | ✅ 可全自動 |
| 8 | 本記錄撰寫 | 人工 | 本文件 | 一次性 |

**總耗時約 30 分鐘（含探索）；若腳本化，預估單次執行 < 30 秒。**

---

## 各步驟詳細記錄

### 步驟 1：抓本週狀態

```
GET https://fashionreportxiv.com/api/report-state
（需帶瀏覽器 User-Agent）
```

實際回傳要點：

- `lastOptions.week = "440"`、`reportTitle = "Western Rider"`
- 4 個提示（本週全為防具、無飾品）：
  - body：The Great Sigmascape
  - hands：Riding High
  - legs：Go West
  - feet：Crystarium Couture
- `dyeData`：6 個左側部位各有 plus2 精確色＋plus1 色系
- `easy80 / easy100 itemPairs = []`（**空**——評分本日 16:00 才開放，社群尚未實測）
- `links.theorycraft`：當週 Reddit 討論串

**時序注意**：週二 16:00（UTC+8）提示揭曉後即可跑「預測版」；週五 16:00 評分開放、社群實測後重跑可取得 easy80/easy100 與驗證後資料（`status` 由 `predicted` → `verified`）。本次執行時間為週五 10:11，屬預測版。

### 步驟 2：主題繁中化

換算規則（已實測校準）：**`FashionCheckWeeklyTheme` 的 row ＝ 社群週次 ＋ 9**。

```
https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/FashionCheckWeeklyTheme.csv
row 449 = 「新大陆骑手」 → opencc-js(cn→tw) → 「新大陸騎手」
```

驗證：該表 EN 版 row 449 =「Western Rider」，與 API 回傳一致。✅

### 步驟 3：提示分類繁中化

`FashionCheckThemeCategory`（EN 270 筆，XIVAPI `?limit=300&fields=Name`）與 CN CSV 同 row join：

| 英文提示 | row | 簡中 | 繁中（opencc） |
|---|---|---|---|
| The Great Sigmascape | 241 | 西格玛 | 西格瑪 |
| Riding High | 25 | 骑手 | 騎手 |
| Go West | 41 | 新大陆风格 | 新大陸風格 |
| Crystarium Couture | 251 | 水晶都 | 水晶都 |

> 分類是 270 筆的固定字典、跨週重複使用 → 可一次性預建 `data/fashion-categories.json`（row／en／tc），之後每週零查詢。

### 步驟 4：抓接受裝備清單

```
GET /api/hint?hint=<英文提示>&slot=<部位>   ×4（間隔 1 秒禮貌延遲）
```

結果：身體 14 件（鑽石／金剛砂系列＝西格瑪零式裝）、手部 5 件、腿部 18 件（新世界／圖拉爾／克扎爾系列）、腳部 15 件（水晶都系列）。回傳為英文名＋icon URL。

> 關聯 key 是（提示,部位）二元組——同名提示在不同部位是不同清單，入庫時 key 必須帶 slot。

### 步驟 5：英文名 → itemId → 台服繁中名

站內現成資產即可完成，**無需外部查詢**：

1. `out_data/en-items.msgpack`（id→`{en}`，48,162 筆）反轉成「小寫英文名→id」索引
2. `out_data/tw-items.msgpack`（id→`{tw}`）取台服繁中名
3. `data/items.json` 補 `marketable` 等 meta

本次結果：**52/52 命中、同名歧義 0 件、無台服名（未實裝）0 件**。

自動化時的驗收門檻建議（任一不過即不出檔、改人工介入）：

- 映射失敗率 = 0（一件都不能少，缺了就是資料源出新裝，需更新 msgpack）
- 同名歧義（一個英文名對多個 id）→ 列出待人工挑選
- 無台服名 → 標記「陸服未實裝」而非放行英文名

### 步驟 6：染色繁中化

染劑本身是物品，直接用步驟 5 的同一條映射（`"<色名> Dye"`）：

Pearl White→珍珠白染劑(30123)、Slate Grey→石板灰染劑(5732)、Rolanberry Red→羅蘭莓染劑(5737)、Millioncorn Yellow→玉米黃染劑(5766)。色系（plus1）另建小型對照表（white→白色系 等 11 色系）。

### 步驟 7：組出 `data/fashion-report.json`

Schema（v1）：

```jsonc
{
  "schema": 1,
  "week": 440,
  "status": "predicted",        // predicted（週二理論版）| verified（週五實測版）
  "source": "fashionreportxiv.com",
  "updated": "2026-07-03",
  "theme": { "name": "新大陸騎手", "nameEn": "Western Rider" },
  "slots": [{                    // 4 筆
    "slot": "body", "slotName": "身體",
    "hint": "西格瑪", "hintEn": "The Great Sigmascape", "categoryId": 241,
    "items": [{ "id": 21683, "name": "鑽石禦敵戰甲", "nameEn": "Diamond Armor of Fending", "marketable": false }]
  }],
  "dyes": {                      // 6 個左側部位
    "body": { "slotName": "身體", "name": "石板灰", "nameEn": "Slate Grey",
              "dyeItemId": 5732, "family": "灰色系", "familyEn": "grey" }
  },
  "scoring": {                   // 由提示組成自動推導
    "base": 68, "armorHints": 4, "accHints": 0,
    "maxWithoutDye": 100, "needDyeFor100": false,
    "easy80": "任兩個提示部位各穿 1 件清單內裝備即可（84 分）"
  },
  "links": { "theorycraft": "…reddit…" }
}
```

計分推導規則（前端也可自算）：基礎分＝有飾品提示 70／無 68；防具 +8、飾品 +6；`maxWithoutDye ≥ 100` 則滿分免染色。80 分門檻＝基礎分＋兩件提示裝。

---

## 產出物

- `data/fashion-report.json` — 本週推薦資料（week 440，predicted 版）
- 本文件 — 流程記錄
- （工作檔於 session scratchpad：`map-week440.mjs`、`build-week440.mjs`、各 API 回應快照，屬拋棄式）

### 步驟 8（後補）：easy80／easy100 配裝精選 — **目前唯一的人工判斷步驟**

頁面只呈現 80／100 分配裝建議（使用者決策），故每週需從各部位清單中挑「最容易取得」的 1 件＋替代：

- 判斷依據（**2026-07-03 使用者定案**）：**① NPC 可購／兌換（金幣・詩學・軍票等固定成本）最優先** → ② 市場板可購（`marketable: true`）→ ③ 製作 → ④ 副本／討伐／金碟幣 → ⑤ 零式／絕版墊底。同級 tie-breaker：穿戴門檻低（裝等低・泛職業）＞ 系列件數多 ＞ 可染色。80 分推薦不固定部位，全部候選攤開取成本最低兩件；NPC 路徑之外在 note 附市場板替代。
- 本週結果（依步驟 9 實際取得資料修正後）：easy80＝腳部「水晶都脛甲」（NPC 100 金幣）＋手部「牛鬼革巧匠手套」（NPC 15,681 金幣），合計不到 1.6 萬金幣；easy100 另加腿部「落雷絹巧匠寬鬆七分褲」（NPC 47,765 金幣）＋身體「碳矽晶」（零式素材兌換——本週身體無休閒取得選項，替代註明）。
- 寫入 `fashion-report.json` 的 `easy100[]`／`easy80{}` 區塊；fashionreportxiv 自家的 easy 套裝於週五驗證後有值，屆時可交叉比對。
- ⚠️ 教訓（兩次）：①譯名不可望文生義——Carborundum 台服名是「碳矽晶」（曾誤寫金剛砂），一律以 tw-items 映射為準。②**取得方式不可憑印象**——曾憑「舊神典石裝」直覺判定碳矽晶／水晶都靴＝詩學兌換，實際資料（步驟 9）顯示碳矽晶＝零式素材兌換、非改良型水晶都靴已無取得途徑、真正的詩學品是**改良型**（345 詩學），而最便宜的是 100 金幣的水晶都脛甲。取得方式一律以 Garland 資料為準。
- 可優化：接 Universalis 查市場價自動排序「最便宜路徑」；或直接採用 fashionreportxiv 的 easy 套裝（驗證版）。

### 步驟 9（後補）：全清單取得方式＋固定成本價格（Garland Tools）

每件裝備向 `https://www.garlandtools.org/db/doc/item/en/3/{id}.json` 查詢（52 件、250ms 間隔約 15 秒），分類寫入每個 item 的 `srcType`／`how`：

- `vendors` → `npc-gil`「NPC 金幣商店 N 金幣」（`item.price`，**固定成本一律帶價格**）
- `tradeShops` → 貨幣 id 28＝「NPC 詩學兌換 N 詩學」；其他貨幣以 tw-items 譯名＋數量；貨幣為裝備本身＝「基礎件升級兌換」（`upgrade`）；貨幣為零式素材＝「零式素材兌換」（`raid`）
- `craft` → 製作；`drops/instances` → 副本／掉落；皆無 → 「—」（活動／商城／已移除兌換）
- ⚠️ 版本差：Garland 為國際服 7.2x 資料——例如綠咬鵑褲的兌換貨幣是 7.2 數學神典石（**陸服 7.15 未實裝**，tw 名為空），此類標成中性「NPC 神典石兌換 ×N」；老內容（2.x–6.x）則與陸服一致。
- 頁尾「完整接受裝備清單」以列表呈現：名稱（點擊複製）＋可交易標記＋取得方式（金字＝NPC 固定成本含價格）。

## 已知限制與待辦

1. **predicted vs verified**：本次為評分開放前的預測版；週五 16:00 後應重跑一次取得社群驗證資料（easy80/easy100 屆時才有值）。
2. **hints-db 累積未啟動**：每週跑完應把（categoryId, slot）→items 寫入 `data/fashion-hints-db.json`，累積後遇到重複分類可離線預填。
3. **第三方 API 禮節**：fashionreportxiv 為無文件 API，正式自動化前宜聯繫站主；目前守則＝低頻（每週 2 次）、帶 UA、快取、頁面標註來源並回連。
4. **市場查價整合**：推薦裝備可點擊複製名稱，但尚未串 `/tools/market/` 即時查價。

## 頁面（2026-07-03 同日完成）

`/tools/fashion-report/index.html` 已上線並自首頁連結：只呈現 **滿分配裝（100 分）** 與 **省事 80 分** 兩張建議卡（使用者指定），加上週次／主題／準備期・評分期倒數、預測版／已驗證標示、摺疊式染色補分表、Reddit 討論串連結。前端自算週次（anchor：week 440 ＝ 2026-06-30 16:00 UTC+8 起），**資料週次與當前週次不符時自動 fallback** 成「尚未更新」卡＋外部來源連結，忘記週更也不會顯示過期答案。

## 可優化路徑（下次討論用）

- **合併步驟 1–7 為一支 `scripts/update-fashion-report.mjs`**：本次驗證所有環節皆可程式化，無任何必要人工步驟；預估單次執行 < 30 秒。
- **一次性預建**：`data/fashion-categories.json`（270 分類字典）＋主題表（week+9 位移）→ 每週執行時零 XIVAPI 查詢，只打 fashionreportxiv 3～5 個請求。
- **每週兩個執行點**：週二晚（predicted）＋週五晚（verified），對應手動／GitHub Actions／Claude routines 三種觸發方式（評估見規劃討論）。
- **驗收門檻內建**：映射失敗、歧義、週次不連續、清單為空 → 不寫檔並回報，防止壞資料上線。
