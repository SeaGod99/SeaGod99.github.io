# FFXIV 市場查詢工具 - 數據格式規範

## 最後更新：2026-01-19

---

## 1. 標準物品對象 (Item Object)

所有物品統一使用此格式：

```javascript
{
  // === 基本信息 ===（必須）
  id: number,              // 物品ID
  name: string,            // 物品名稱
  
  // === 擴展信息 ===（可選）
  icon: string|null,       // 圖標路徑
  level: number,           // 物品等級（預設 0）
  recipeLevel: number,     // 製作等級/配方等級（預設 0）
  category: string,        // 物品分類（預設 '未分類'）
  rarity: number,          // 稀有度（預設 0）
  canBeHQ: boolean,        // 是否有高品質（預設 false）
  
  // === 價格信息 ===（查詢價格後添加）
  price: {
    nqMin: number,         // NQ 最低價格
    nqAvg: number,         // NQ 平均價格
    hqMin: number,         // HQ 最低價格
    hqAvg: number,         // HQ 平均價格
    lastUploadTime: number|null,  // Unix 時間戳（秒）
    server: string         // 伺服器名稱
  }
}
```

### 使用場景：
- **基本物品**：搜索結果、物品詳情、配方成品
- **配方材料**：見下方配方成本對象說明

### 重要規則：
- ✅ **Item = Ingredient**，材料只是在配方中使用的物品
- ✅ 搜索結果只需要：`id`, `name`, `icon`, `level`, `category`
- ✅ 價格信息統一在 `price` 對象中
- ✅ 統一使用 `amount` 表示數量

---

## 2. 標準配方對象 (Recipe Object)

```javascript
{
  id: number,              // 配方ID
  classJob: string,        // 職業簡稱（如 'CRP'）
  level: number,           // 配方等級
  difficulty: number,      // 難度
  durability: number,      // 耐久
  
  // === 成品信息 ===
  resultItem: Item,        // 成品物品對象（包含 id, name, icon, price 等）
  yields: number,          // 產出數量
  
  // === 材料列表 ===
  ingredients: Item[],     // 材料數組，每個材料包含：
  /*
    材料 = Item + 配方相關屬性：
    {
      ...Item,              // 繼承所有 Item 屬性
      amount: number,       // 需要數量
      unitPrice: number,    // 單價（從 price.nqMin 取得）
      subRecipe: Recipe|null  // 子配方（如果材料可製作）
    }
  */
  
  // === 成本計算 ===
  totalCost: number,       // 材料總成本
  costPerUnit: number      // 單個成品成本 = totalCost / yields
}
```

### 使用說明：
- **resultItem**: 成品是一個完整的 Item 對象，包含價格信息
- **yields**: 每次製作的產出數量
- **ingredients**: 材料數組，每個材料都是 Item 對象 + 配方相關屬性
- **totalCost** 和 **costPerUnit**: 查詢價格後計算得出

### 材料屬性說明：
配方中的材料是 Item 對象的擴展，額外添加：
- `amount`: 需要數量
- `unitPrice`: 單價（從 `price.nqMin` 或 `price.nqAvg` 取得）
- `subRecipe`: 如果該材料可製作，包含子配方的完整信息

### 重要規則：
- ✅ Recipe 對象同時包含配方信息和成本計算結果
- ✅ resultItem 和 ingredients 中的材料都是完整的 Item 對象
- ✅ subRecipe 可以遞迴包含子材料的配方
- ✅ 沒有伺服器時，totalCost 和 costPerUnit 為 0

---

## 3. API 響應映射

### 3.1 XIVAPI 響應映射
```javascript
// XIVAPI 返回（大寫開頭）
{
  ID: number,
  Name: string,
  Icon: string,
  LevelItem: number,
  Rarity: number,
  CanBeHq: number,  // 0 或 1
  ItemSearchCategory: {
    Name: string
  }
}

// 映射為標準格式
{
  id: response.ID,
  name: response.Name,
  icon: response.Icon,
  level: response.LevelItem || 0,
  rarity: response.Rarity || 0,
  category: response.ItemSearchCategory?.Name || '未分類',
  canBeHQ: Boolean(response.CanBeHq)  // 轉換為布爾值
}
```

### 3.2 tnze.yyyy.games 響應映射
```javascript
// tnze API 返回（小寫+下劃線）
{
  id: number,
  name: string,
  level: number,
  rlv: number,        // 製作難度
  can_be_hq: number,  // 0 或 1
  category_id: number
  // 注意：tnze API 不返回 icon 和 category 名稱
}

// 映射為標準格式
{
  id: response.id,
  name: response.name,
  level: response.level || 0,
  recipeLevel: response.rlv || 0,  // 製作難度
  canBeHQ: Boolean(response.can_be_hq),  // 轉換為布爾值
  icon: null,
  category: '未分類',
  rarity: 0
}
```

**注意事項**：
- tnze API 返回的數據不完整，可能需要結合 XIVAPI 來獲取完整信息
- `category_id` 需要另外查詢才能轉換為 `category` 名稱

### 3.3 Universalis 響應映射
```javascript
// Universalis API 返回（駝峰式）
{
  itemID: number,  // 或 itemId
  minPriceNQ: number,
  averagePriceNQ: number,
  minPriceHQ: number,
  averagePriceHQ: number,
  lastUploadTime: number
}

// 映射為標準 price 對象
{
  nqMin: response.minPriceNQ || 0,
  nqAvg: Math.round(response.averagePriceNQ) || 0,
  hqMin: response.minPriceHQ || 0,
  hqAvg: Math.round(response.averagePriceHQ) || 0,
  lastUploadTime: response.lastUploadTime || null,
  server: state.selectedServer
}
```

---

## 4. 命名規範

### 4.1 變數命名
- **物品/材料對象**: `item`, `ingredient` 或 `ing`（本質相同）
- **配方對象**: `recipe`
- **配方成本**: `recipeCost`
- **價格對象**: `price` 或 `priceData`

### 4.2 屬性命名規則
- ✅ 使用駝峰式命名：`nqMin`, `lastUploadTime`, `unitPrice`
- ✅ 數量統一用：`amount`

### 4.3 布爾值命名
- 使用 `is`, `has`, `can` 前綴
- 例如：`canBeHQ`, `hasPrice`, `isLoading`

---

## 5. 函數返回值規範

### 5.1 查詢物品
```javascript
// 返回：Item 對象數組
searchItemByName(query) -> Promise<Item[]>
```

### 5.2 獲取價格
```javascript
// 修改物品對象，添加 price 屬性
getItemPrice(item) -> Promise<void>
// item.price 會被設置
```

### 5.3 構建配方
```javascript
// 返回：Recipe 對象（包含配方信息、材料列表和成本計算）
buildRecipe(recipeDetail, hasServer) -> Promise<Recipe>
```

---

## 6. 全局狀態 (state)

```javascript
const state = {
  // 伺服器選擇
  selectedServer: string|null,
  selectedDatacenter: string|null,
  
  // 語言設置
  selectedLanguage: 'tc'|'en',
  
  // 數據緩存
  serversByDC: object|null,
  datacenters: array|null,
  
  // 載入狀態
  isLoading: boolean,
  isDataLoaded: boolean,
  isDatacentersLoaded: boolean,
  isWorldsLoaded: boolean
}
```

**注意**：
- 不再使用 `state.lastItemPriceData`
- 使用 `currentItem` 存儲當前查詢的物品（含價格）
- 價格直接附在物品對象的 `price` 屬性中

---

## 7. 顯示格式規範

### 7.1 價格顯示
- 使用 `toLocaleString()` 格式化數字
- 添加 " G" 後綴表示金幣
- 例如：`1,234,567 G`

### 7.2 時間顯示
- 使用相對時間：`formatUpdateTime(timestamp)`
- 1分鐘內：剛剛
- 1小時內：X 分鐘前
- 1天內：X 小時前
- 1週內：X 天前
- 超過1週：顯示完整日期

### 7.3 圖標尺寸
- 搜索結果：無圖標
- 材料列表（製造成本）：36×36px
- 材料卡片（合成表）：42×42px
- 子材料：20×20px

---

## 8. 錯誤處理

### 8.1 缺少必須屬性
```javascript
// 物品必須有 id 和 name
if (!item.id || !item.name) {
  console.error('Invalid item object:', item);
  return null;
}
```

### 8.2 價格查詢失敗
```javascript
// 設置預設價格對象
item.price = {
  nqMin: 0,
  nqAvg: 0,
  hqMin: 0,
  hqAvg: 0,
  lastUploadTime: null,
  server: state.selectedServer
};
```
