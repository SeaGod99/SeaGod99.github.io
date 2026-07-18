# 時尚品鑑推薦 — 週更操作手冊（SOP）

> 這是可重複執行的「照著做」版本。首次探索與各步驟自動化評估見 [fashion-report-workflow.md](fashion-report-workflow.md)（week 440 首跑記錄）。
> 本手冊以 **week 441「知性蠻族工匠」（2026-07-15 執行）** 為 worked example，指令可直接複用。
> **最新一次執行：week 442「亞拉戈高位裝扮」（2026-07-18），新增兩條規則——步驟 5 的 tw-items 損毀改道、步驟 6 的通用版染劑優先。**
>
> 產出物：更新 [`data/fashion-report.json`](../data/fashion-report.json)，頁面 [`tools/fashion-report/index.html`](../tools/fashion-report/index.html) 讀它即時渲染。

---

## 0. 什麼時候該跑

時尚品鑑一週循環（台北時間）：**週五 08:00 開放 → 週二 08:00 收榜**。前端以錨點自算週次（`ANCHOR = 2026-06-30 16:00 UTC+8 = week 440`，每 7 天 +1，週二 16:00 換週）。

| 時機 | 能拿到什麼 | status |
|------|-----------|--------|
| 週二 16:00 提示揭曉後 | 主題、4 提示、6 染色、接受裝備清單 | `predicted`（社群尚未實測 easy80/100） |
| 週五 16:00 評分開放、社群實測後 | 上面全部 ＋ **驗證版 easy80/easy100 配裝** | `verified` |
| **兩週之間（週二收榜 ~ 週五開放）** | API 仍是上一週的 verified 存檔，新一週提示尚未釋出 | 只能更新到「上一週 verified」，前端會判定 stale 顯示「尚未更新」卡＋存檔 |

> **week 441 執行當下（2026-07-15 週三）就是「兩週之間」**：API `lastOptions.week` 還是 441（`dyesFresh:false`），442 提示未出。所以更新到 441（verified）是當下能做的最新真實資料；頁面時鐘已到 442，會把 441 當存檔顯示——屬預期行為，等 442 開放後重跑即可。

---

## 1. 抓本週狀態（fashionreportxiv `/api/report-state`）

**需帶瀏覽器 UA**。回傳週次、主題、4 提示（hint＋slot）、6 部位染色（plus2 精確色／plus1 色系）、easy80/easy100 itemPairs、Reddit 連結。

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
curl -s -H "User-Agent: $UA" "https://fashionreportxiv.com/api/report-state" -o /tmp/frx-state.json
```

week 441 要點：
- `week=441`、`reportTitle="Mindful Master"`、4 提示全為防具無飾品：
  - head `Brain over Brawn`／body `Simple Is Best`／hands `Vagabond`／legs `More Beast than Man`
- 染色：weapon/body/legs = Soot Black（黑），head/hands/feet = Rust Red（紅）
- **驗證版** easy100 = head `Brass Spectacles`＋body `Extreme Survival Shirt`＋hands `Dhalmelskin Armguards of Aiming`；easy80 = **只有 head `Brass Spectacles`**
- `dyesFresh/easy100Fresh/easy80Fresh = false` → 這是「已收榜」的存檔資料

## 2. 主題繁中化（陸服 CSV，`row = 週次 + 9`）

```bash
curl -s "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/FashionCheckWeeklyTheme.csv" -o /tmp/theme-cn.csv
# week 441 → row 450
```
row 450 = 「知性蛮族工匠」→ opencc(cn→tw) → **「知性蠻族工匠」**。（驗證：row 449=「新大陆骑手」=Western Rider 對齊 week 440，位移正確。）

## 3. 提示分類繁中化 ＋ categoryId（XIVAPI EN sheet ＋ 陸 CSV 同 row join）

```bash
curl -s "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/FashionCheckThemeCategory.csv" -o /tmp/cat-cn.csv
curl -s "https://v2.xivapi.com/api/sheet/FashionCheckThemeCategory?limit=300&fields=Name" -o /tmp/cat-en.json
```
把英文提示名（小寫）對 EN sheet 的 `Name` → row_id（＝categoryId），再用 row_id 撈 CN CSV：

| slot | 英文提示 | categoryId | CN → 繁中 |
|---|---|---|---|
| head | Brain over Brawn | 18 | 知性 → 知性 |
| body | Simple Is Best | 66 | 简约 → 簡約 |
| hands | Vagabond | 27 | 无赖 → 無賴 |
| legs | More Beast than Man | 198 | 蛮族工匠 → 蠻族工匠 |

## 4. 抓 4 部位接受裝備清單（fashionreportxiv `/api/hint`）

```bash
# 每部位一次，帶 UA、間隔 1 秒禮貌延遲，hint 需 URL-encode
curl -s -H "User-Agent: $UA" "https://fashionreportxiv.com/api/hint?hint=Brain%20over%20Brawn&slot=head"
# ...body / hands / legs 同理
```
week 441 共 **33 件**：頭 8、身 7、手 6、腿 12。回傳英文名＋icon URL。
> key 是（提示,部位）二元組——入庫時必須帶 slot。

## 5. 英文名 → itemId → 台服繁中名（站內資產，零外部查詢）

- `out_data/en-items.msgpack`（`id→{en}`）反轉成「小寫英文名→id」索引
- 台服名＋`marketable` 走 **`data/items.json`**（`.data` 陣列，43748 筆，欄位 `id`／`name`／`marketable`）
- 有多個 id 時，優先取「在 items.json 內（＝有台服名）」的那個

> ⚠️ **不要用 `out_data/tw-items.msgpack` 取台服名——該檔已損毀**（2026-07-18 week 442 發現）。
> 第 11854 筆附近有字串的長度前綴與實際位元組數不符，`@msgpack/msgpack` v3 解碼會在該處失步，
> 先報 `The type of key must be string or number but object`（把字串中段的 `0x82` 誤讀成 fixmap），
> 加 `mapKeyConverter` 繞過後再爆 `Offset is outside the bounds of the DataView`。
> `en-items.msgpack` 結構相同但**正常**，可照用。
> `data/items.json` 本身就是由 tw-items 產出的，取台服名效果等同，故直接改道即可。
> **注意：`scripts/build-*.mjs` 全都直接 decode tw-items.msgpack，重建任何資料庫前要先修檔或改道。**

**week 441 驗收：33/33 命中、同名歧義 0、無台服名 0。** ✅

**驗收門檻（任一不過即不出檔、改人工）**：映射失敗率必須 = 0（缺件＝資料源出新裝，需更新 msgpack）；同名歧義列出待挑選；無台服名標「陸服未實裝」而非放行英文名。

## 6. 染色繁中化（染劑也是物品，走同一條映射）

`"<色名> Dye"` → 物品映射 → 去掉「染劑」尾。week 441：
- Soot Black → **煤煙黑**（5734，黑色系）
- Rust Red → **鐵鏽紅**（5739，紅色系）

**通用版優先規則（week 442 新增）**：先查 `"General-purpose <色名> Dye"`，有台服名就用它；查不到才退回 `"<色名> Dye"`。
原因：部分顏色有兩個物品——原版多為**商城限定**（台服名帶 `EX` 前綴），另有同色的 **General-purpose（通用）版**可在遊戲內取得。
week 442 的 Pastel Green 就是這種：`Pastel Green Dye` = 8737「EX柔彩綠染劑」（商城），`General-purpose Pastel Green Dye` = 13711「柔彩綠染劑」（遊戲內）。
顏色相同，推薦通用版對玩家才實用，顯示名也乾淨（不帶 EX）。ARR 系 5xxx 的老染劑沒有這個問題，會自動走 fallback。

## 7. Garland Tools 取得方式 ＋ 固定成本（每件一查，250ms 間隔）

```bash
curl -s -H "User-Agent: $UA" "https://www.garlandtools.org/db/doc/item/en/3/{id}.json"
```
分類規則（寫入每件的 `srcType`／`how`），優先序 = 固定成本優先：

| 判斷 | srcType | how |
|---|---|---|
| `item.vendors[]` 非空 | `npc-gil` | `NPC 金幣商店 {price} 金幣` |
| `item.tradeShops` 貨幣 id=28 | `npc-trade` | `NPC 詩學兌換 N 詩學` |
| tradeShops 貨幣＝裝備本身 | `upgrade` | `基礎件升級兌換` |
| tradeShops 其他貨幣 | `npc-trade` | `NPC {貨幣台服名}兌換 ×N`（如珊瑚幣、白骨幣、偽黑銅幣等蠻族幣） |
| `item.craft` | `craft` | `製作` |
| `item.instances`／`drops` | `drop` | `副本／掉落` |
| 皆無 | `other` | `—`（活動／商城／已移除兌換） |

`marketable` 另從 [`data/items.json`](../data/items.json) 的 `data[]` 取（**注意：是 `.data` 陣列，id 為 key，不是頂層物件**——week 441 首建時踩過這個雷）。

⚠️ 版本差：Garland 是國際服 7.2x 資料。week 441 無明顯落差；歷史上會有「陸服未實裝的兌換貨幣（如數學神典石）」需標中性名。蠻族裝的 `vendors` 70,000 金幣其實有聲望門檻，但只出現在「完整清單」參考區、不進推薦卡，故照分類器直帶。

## 8. easy80／easy100 配裝（verified 版直接採用 fashionreportxiv，再標註取得方式）

week 441 驗證版特別省事：
- **省事 80 分＝只要 1 件**：頭部「黃銅眼鏡」（NPC 355 金幣）染鐵鏽紅，其餘穿滿任意裝備即達 80。
- **滿分 100 分＝3 件提示裝**（頭黃銅眼鏡／身極限倖存者襯衫／手長頸駝革精準護臂）各染指定色，**腿部穿任意裝備染煤煙黑補分即可**（不需特定腿部提示裝）→ 寫進 `scoring.note100`。
- body 首選標製作／市場（`market:true`），替代標「春意襯衫（NPC 8,910 金幣・固定成本）」。

> 取捨原則（延續 440）：① NPC 金幣/詩學等固定成本最優先 → ② 市場板 → ③ 製作 → ④ 副本/掉落 → ⑤ 零式/絕版墊底。**有 verified easy 套裝時直接採用**（已實測達標），我方只補取得方式與替代。

**week 442 的例外：同清單內可換更好取得的件（新增規則）**
verified easy 套裝指定的是原版「亞拉戈高位禦敵手鎧」等（巴哈姆特大迷宮掉落・不可交易），
但同一份接受清單裡有**複製品版**（可製作・可交易），依取捨原則②③優於④。
兩者同屬該部位的接受清單、**計分完全相同**，故推薦改用複製品，並在 `alt`／`note` 註明原版與替換理由。
> 判準：只有在「替換件與 verified 件同部位、同屬本週接受清單」時才可換——這不影響達標，只換取得難度。跨部位或清單外的件不可自行替換。

## 9. 組檔 & 驗收

- 組出 `data/fashion-report.json`（schema 見 workflow 文件；本次新增 `scoring.note100`、`links.results`、easy 項目的 `dye` 欄）。
- 頁面本次微調兩處（[index.html](../tools/fashion-report/index.html)）：
  1. 100 分卡副標改讀 `d.scoring.note100`（有值時覆蓋預設「4 部位各穿 1 件」文案）
  2. `item()` 加 `🎨 染{color}` 染色小標籤（`.dye-chip`），easy80/100 每件顯示需染的色
- `/browse` 開 `tools/fashion-report/index.html` 截圖：確認存檔 banner、週次、100/80 分卡（含染色標籤）、指定染色表、完整接受裝備清單（33 件、取得方式、14 件可交易標記）皆正確、無 console error。✅

---

## 待辦 / 可優化（延續 workflow 文件）

1. **codify 成 `scripts/update-fashion-report.mjs`**：本次步驟 1–7 全程式化無阻礙（map + build 兩支腳本已在本次跑通，邏輯可直接搬）。
2. **預建 `data/fashion-categories.json`**（270 分類字典＋week+9 位移）→ 每週零 XIVAPI 查詢。
3. **hints-db 累積**：把（categoryId, slot）→items 寫入 `data/fashion-hints-db.json`，重複分類離線預填。
4. ~~**week 442**：2026-07-17（五）開放後重跑本手冊~~ — **已完成（2026-07-18）**，見步驟 5／6 新增規則。
5. **修復 `out_data/tw-items.msgpack`**（步驟 5 的警告）：該檔第 11854 筆附近字串長度前綴損毀，目前時尚品鑑管線已改道 `data/items.json` 不受影響，但 `scripts/build-*.mjs` 全都還在 decode 它——**重建任何資料庫前必須先處理**（重新產出該 msgpack，或把 build 腳本一併改道 items.json）。
6. **week 443**：2026-07-24（五）16:00 評分開放後重跑本手冊。主題已可預查＝CN CSV row 452「真麻正式装」→真麻正式裝。
