# 地圖 ID 統一修正計畫（2026-06-10）

> 對應 PROGRESS.md 待辦 #0。執行前先讀本檔；每完成一階段就在本檔勾選並更新 PROGRESS.md。

## 問題回顧

`maps.json` 用自編連號 id（67 張，2–305），但 Teamcraft 來源的庫用**遊戲 Map sheet row id**：

| 地圖 | maps.json | npcs/monsters/gathering 引用 |
|------|-----------|------------------------------|
| 紅玉海 | 83 | 371 |
| 庫爾札斯西部高地 | 60 | 211 |
| 雷克蘭德 | 100 | 491 |

ARR 低編號兩套剛好重疊（對得到但可能對錯），HW 以後全部對不到。另外 `fishing-spots.json` 用 `territoryId`（TerritoryType id，第三套 ID 空間）。

**有利條件**（已查證）：目前**沒有任何前端頁面讀取 maps.json 或 mapId**，重 key 不會弄壞現有頁面，純資料層工程。

## 決定：統一以「遊戲 Map sheet row id」為全站 mapId 標準

理由：npcs（22079）、monsters（14361）、gathering、Teamcraft 所有未來資料源都用它，改 maps.json 一個檔最省；XIVAPI 可直接查證。

---

## 修改清單

### A. 資料檔
1. **data/maps.json** — id 全部改為 Map sheet row id；並擴充收錄資料引用到的地圖（npcs 缺 187 種、monsters 缺 37 種、gathering 缺 40 種，去重後估 ~200 種，多為副本/特殊區域）
2. **data/fishing-spots.json** — 補 `coords.mapId`（由 territoryId 轉換），`territoryId` 保留
3. **data/gathering.json** — 過濾 `items`/`hiddenItems` 中 2000000+ 的 EventItem 偽 id（352 個）；373 筆 mapId=0 標記或保留待查
4. **data/SCHEMA.md** — 明文規定：`mapId` = 遊戲 Map sheet row id；territoryId 僅輔助欄位
5. **data/_meta.json** — 同步各庫 status 與 updated

### B. 腳本
6. **scripts/fix-mapkeys.mjs → 改造或新增 scripts/rekey-maps.mjs** — 重 key + 擴充地圖（它已會打 XIVAPI Map sheet，加取 row_id 即可）
7. **scripts/build-fishing.mjs** — 產出 mapId（territory→map 對應）
8. **scripts/build-gathering.mjs** — 加 2000000+ 過濾
9. **新增 scripts/validate-links.mjs** — 把這次的全量連結驗證固化成腳本，之後每次 build 完跑一次
10. **scripts/download-maps.mjs** — 重跑補抓新增地圖的底圖（已有的自動略過）

---

## 步驟安排（依序，各步可獨立 commit）

### 第 0 步：git commit 現況
data/、collections/、docs/ 等大量檔案尚未 commit。先 commit 一版，之後每步的 diff 才看得出來。

### 第 1 步：建 validate-links.mjs（先有驗證才能改）
把 2026-06-10 的驗證邏輯寫成腳本，輸出各連結的斷鏈數。修正前跑一次留基準數字。

### 第 2 步：重 key maps.json
1. 抓 XIVAPI Map sheet 全表（row_id、Id=mapKey、PlaceName、SizeFactor、Offset、TerritoryType）
2. 既有 67 張用 mapKey（如 `e3f1/00`）比對 → id 換成 row_id（mapKey 比 nameEn 可靠）
3. 收集 npcs/monsters/gathering 引用的全部 mapId，缺的補進 maps.json：
   - 繁中名（2026-06-10 更新優先序）：**① Teamcraft `tw/tw-places.json`（台服官方，PlaceName id 為 key，已確認存在且連副本內部地名都有）→ ② thewakingsands `PlaceName.csv`（中國服）+ OpenCC（build-monsters.mjs 的 `fetchCnPlaceNames()` 可搬用，注意過度轉換如佈/布）→ ③ nameEn + `nameMissing: true`**
   - Map→PlaceName 對應用 XIVAPI（`fetchMapPlaceIds()` 搬用）
   - type 補 `dungeon`/`instance` 等新分類
4. 跑 download-maps.mjs 補底圖（副本圖可選，見待決事項）

### 第 3 步：territory→map 對應
抓 XIVAPI TerritoryType sheet（Map、PlaceName 欄），做成對應表；改 build-fishing.mjs 重產 fishing-spots.json（補 mapId）。

### 第 4 步：清 gathering
build-gathering.mjs 加過濾後重跑（來源 Teamcraft nodes.json）。

### 第 5 步：驗證收尾
1. 跑 validate-links.mjs，mapId 類斷鏈應歸零（或只剩台服未開放地圖）
2. 更新 SCHEMA.md、_meta.json、PROGRESS.md（待辦 #0 完成、更新紀錄加一筆）
3. git commit

---

## 所需網頁資源

| 資源 | 用途 | 網址 |
|------|------|------|
| XIVAPI v2 Map sheet | row_id／mapKey／SizeFactor／Offset／天氣 | `https://v2.xivapi.com/api/sheet/Map?fields=Id,PlaceName.Name,SizeFactor,OffsetX,OffsetY,TerritoryType` （分頁抓法見 reference-xivapi-v2 記憶／fix-mapkeys.mjs 現成程式） |
| XIVAPI v2 TerritoryType sheet | territoryId → mapId 對應 | `https://v2.xivapi.com/api/sheet/TerritoryType?fields=Map,PlaceName.Name` |
| XIVAPI 地圖底圖 | 新增地圖的圖 | `https://v2.xivapi.com/api/asset/map/{mapKey}` |
| Teamcraft nodes.json | 重跑 gathering | `https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/nodes.json` |
| Teamcraft fish 相關 JSON | 重跑 fishing（build-fishing.mjs 內已有來源 URL） | 同上 repo |
| thewakingsands PlaceName.csv | 中國服地名 → OpenCC 轉繁中（build-monsters.mjs 已驗證可用，06-09 跑過） | `https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/PlaceName.csv` |
| （本機）out_data/places.msgpack | 台服地名，優先用；沒有才 fallback 中國服轉繁 | 不需上網 |

不需要的：灰機 wiki、A Realm Remapped（這次用不到）；台服物品名照舊用本機 tw-items.msgpack。

---

## 已決事項（2026-06-10 確認）

1. **收錄範圍**：只收資料引用到的（~200 張）
2. **底圖**：野外/主城才下載，副本/特殊區域留 url 欄位需要再抓
3. **地名來源**：台服 places.msgpack 優先 → 沒有的用中國服 PlaceName.csv 轉繁中（地名不適用 tw-items 隱藏原則，那是物品專屬）→ 還是沒有才記 nameEn + `nameMissing: true`。注意中國服版本若落後國際服，最新版本地圖可能對不到，屆時走 nameEn fallback

## 進度勾選

- [ ] 第 0 步 commit 現況
- [ ] 第 1 步 validate-links.mjs + 基準數字
- [ ] 第 2 步 maps.json 重 key + 擴充
- [ ] 第 3 步 fishing-spots 補 mapId
- [ ] 第 4 步 gathering 清理
- [ ] 第 5 步 驗證收尾 + 文件更新
