# API 模組組織結構

本項目已將所有 API 調用分離到獨立的 JavaScript 模組中，以提高代碼的可維護性和可讀性。

## 檔案結構

```
assets/js/
├── api/                      # API 模組目錄
│   ├── corsproxy.js         # CORS 代理工具
│   ├── xivapi.js            # XIVAPI 包裝器
│   ├── universalis.js       # Universalis API 包裝器
│   ├── tnze.js              # Tnze 多語言 API 包裝器
│   ├── tcsearch.js          # 台灣搜尋服務 API 包裝器
│   └── manager.js           # API 管理器（統一介面）
├── script.js                 # 主應用程式邏輯
└── jquery-*.js              # jQuery 庫檔案
```

## 各模組說明

### 1. **corsproxy.js** - CORS 代理工具
- 用途：處理跨域資源共享（CORS）問題
- 提供代理 URL 包裝和代理服務切換功能
- 主要物件：`CORSProxy`

**關鍵方法：**
- `CORSProxy.wrapUrl(url)` - 用代理包裝 URL
- `CORSProxy.switchProxy()` - 切換到下一個可用的代理

### 2. **xivapi.js** - XIVAPI 包裝器
- 用途：從 XIVAPI (https://xivapi.com) 獲取物品和配方數據
- 主要物件：`XivAPI`

**關鍵方法：**
- `XivAPI.getItemInfo(itemId)` - 獲取物品信息
- `XivAPI.getRecipeDetails(recipeId)` - 獲取配方詳情
- `XivAPI.getIconUrl(iconPath)` - 獲取物品圖標 URL

### 3. **universalis.js** - Universalis API 包裝器
- 用途：從 Universalis (https://universalis.app) 獲取市場價格數據
- 主要物件：`UniversalisAPI`

**關鍵方法：**
- `UniversalisAPI.getDataCenters()` - 獲取所有資料中心列表
- `UniversalisAPI.getWorlds(dataCenterName)` - 獲取特定資料中心的伺服器列表
- `UniversalisAPI.getItemPrice(world, itemIds)` - 獲取單個物品價格
- `UniversalisAPI.getUnitPrice(world, itemIds)` - 批量獲取多個物品在特定伺服器的單位價格（含掛單明細）

### 4. **tnze.js** - Tnze 多語言 API 包裝器
- 用途：從 Tnze (https://tnze.yyyy.games) 獲取支持繁體和英文的物品數據
- 主要物件：`TnzeAPI`
- 功能：自動分頁、語言支援、重複 ID 過濾

**關鍵方法：**
- `TnzeAPI.search(query, language, maxPages)` - 搜尋物品（支持分頁）
  - `language` 參數：'zh-TW' (繁體) 或 'en' (英文)
  - `maxPages` 參數：最多搜尋頁數
- `TnzeAPI.getItemInfo(itemId, language)` - 獲取物品詳情

### 5. **tcsearch.js** - 台灣搜尋服務 API 包裝器
- 用途：從台灣搜尋服務 (tc-ffxiv-item-search-service) 獲取繁體中文物品數據
- 主要物件：`TCSearchAPI`

**關鍵方法：**
- `TCSearchAPI.search(query)` - 搜尋物品（返回繁體中文結果）

### 6. **manager.js** - API 管理器
- 用途：提供統一的 API 介面，簡化主應用程式中的 API 調用
- 主要物件：`APIManager`
- 功能：自動調用適當的 API、合併結果、去重

**關鍵方法：**
- `APIManager.searchItems(query, language)` - 根據語言搜尋物品（繁體會同時調用 Tnze 和 TCSearch，英文只調用 Tnze）
- `APIManager.searchItemsTc(query)` - 搜尋繁體中文物品
- `APIManager.searchItemsEn(query)` - 搜尋英文物品
- `APIManager.getItemInfo(itemId, language)` - 獲取物品信息
- `APIManager.getRecipeInfo(recipeId)` - 獲取配方信息
- `APIManager.getItemPrice(world, itemId)` - 獲取物品價格
- `APIManager.getItemPrices(world, itemIds)` - 批量獲取物品價格
- `APIManager.getDataCenters()` - 獲取資料中心列表
- `APIManager.getWorlds(dataCenterName)` - 獲取伺服器列表
- `APIManager.mergeAndDeduplicateItems(tcItems, tnzeItems)` - 合併並去重搜尋結果

## 使用示例

### 在 HTML 中引入模組
```html
<!-- 必須按順序載入 -->
<script src="assets/js/api/corsproxy.js"></script>
<script src="assets/js/api/xivapi.js"></script>
<script src="assets/js/api/universalis.js"></script>
<script src="assets/js/api/tnze.js"></script>
<script src="assets/js/api/tcsearch.js"></script>
<script src="assets/js/api/manager.js"></script>
<script src="assets/js/script.js"></script>
```

### 在 JavaScript 代碼中使用

```javascript
// 搜尋物品
const results = await APIManager.searchItems('水精靈', 'tc');

// 獲取物品信息
const itemInfo = await APIManager.getItemInfo(4086, 'tc');

// 獲取物品價格
const price = await APIManager.getItemPrice('Tonberry', 4086);

// 批量獲取物品價格
const prices = await APIManager.getItemPrices('Tonberry', [4086, 4087, 4088]);

// 獲取資料中心和伺服器列表
const dataCenters = await APIManager.getDataCenters();
const worlds = await APIManager.getWorlds('陸行鳥');
```

## API 超時設置

所有 API 模組都配置了 15 秒的超時時間。如需修改，可以在各個模組檔案中編輯 `timeout` 屬性。

## 錯誤處理

所有 API 調用都包含完整的錯誤處理。當 API 調用失敗時，模組會記錄詳細的錯誤信息到瀏覽器控制台，並返回空陣列或 null。

## 向後相容性

API 管理器提供了與原始 `searchItems()` 和 `getItemInfo()` 函數相同的介面，以確保與現有代碼的相容性。

## 遷移指南

對於在 `script.js` 中的舊 API 調用，應該按以下方式遷移：

| 舊代碼 | 新代碼 |
|------|------|
| `searchFromTnzeAPI(query, 'zh-TW')` | `APIManager.searchItems(query, 'tc')` |
| `searchFromTcService(query)` | 自動包含在 `APIManager.searchItems(query, 'tc')` 中 |
| `searchFromUniversalisAPI(world, itemId)` | `APIManager.getItemPrice(world, itemId)` |

## 今後改進

1. 新增快取機制，避免重複 API 調用
2. 新增 API 調用統計和性能監控
3. 新增更多的 API 來源支援
4. 考慮使用 TypeScript 進行型別檢查
5. 新增單元測試

## 個人說明

1. xivapi.com/item的搜尋只找icon跟iconHD