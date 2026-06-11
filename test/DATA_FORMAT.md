# FFXIV 市場查詢工具 - 數據格式規範

## 最後更新：2026-01-20

---

## 1. 物品對象 (Item Object)

### 1.1 基本定義
物品是系統中最基本的數據單位，代表遊戲中的一個物品實體。

```javascript
{
  // === 必須屬性 ===
  id: number,              // 物品ID（唯一標識）
  name: string,            // 物品名稱
  
  // === 基本屬性 ===
  icon: string|null,       // 圖標URL或路徑
  level: number,           // 裝備等級
  category: string,        // 物品分類（如「耳飾」「手鐲」）
  canBeHQ: boolean,        // 是否可製作高品質版本
  
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

### 1.2 使用場景
- 搜索結果列表
- 材料清單
- 價格查詢顯示
- 配方中的材料或成品引用

### 1.3 重要規則
- ✅ 物品對象只包含物品本身的屬性
- ✅ 不包含「數量」，數量由使用場景決定
- ✅ 價格為單個物品的市場價格
- ❌ 不應包含配方相關信息（如 `recipes`）

---

## 2. 配方對象 (Recipe Object)

### 2.1 基本定義
配方描述如何製作一個物品，包含製作職業、所需材料和產出數量。

```javascript
{
  // === 配方基本信息 ===
  id: number,              // 配方ID

  classJob: string,        // 製作職業（如「雕金匠」「鍛鐵匠」）
  level: number,           // 配方等級
  difficulty: number,      // 難度
  durability: number,      // 耐久
  
  // === 成品信息 ===
  yields: number,          // 產出數量
  
  // === 材料列表 ===
  ingredients: [
    {
      id: number,          // 材料物品ID
      amount: number,      // 所需數量
    }
  ]
}
```

### 2.2 使用場景
- 配方顯示表格
- 成本計算
- 材料樹狀圖

### 2.3 重要規則
- ✅ 配方對象專注於「如何製作」
- ✅ `yields` 表示一次製作能產出多少個成品
- ✅ `ingredients` 中的 `amount` 是製作一次所需的數量
- ✅ 材料可以遞歸包含子配方（`recipes`）
- ❌ 配方不應包含成品的完整 Item 對象

---

## 3. 已選物品對象 (Selected Item)

### 3.1 基本定義
用戶在樹狀圖中選擇的物品，結合了物品屬性和配方信息。

```javascript
{
  // === 繼承自 Item ===
  id: number,
  name: string,
  icon: string,
  
  // === 用戶需求 ===
  amount: number,          // 用戶想要的數量
  
  // === 關聯配方 ===
  recipes: Recipe[]|null   // 該物品的可用配方列表
}
```

### 3.2 使用場景
- `selectedTreeItems` 全局變數
- 左側「已選擇物品」列表
- 樹狀圖渲染的資料來源

### 3.3 重要規則
- ✅ `amount` 是用戶需求量，不是配方產量
- ✅ 可以有多個配方（通常使用第一個）
- ✅ 如果 `recipes` 為 `null`，表示尚未加載配方

---

## 4. 數據關係圖

```
┌─────────────────┐
│  Item (物品)    │ ← 純粹的物品數據
│  - id           │
│  - name         │
│  - icon         │
│  - price        │
└─────────────────┘
        ↑
        │ 引用
        │
┌─────────────────┐
│ Recipe (配方)   │ ← 製作方法
│  - classJob     │
│  - level        │
│  - yields       │
│  - ingredients  │ → 包含材料ID和數量
└─────────────────┘
        ↑
        │ 關聯
        │
┌─────────────────┐
│ Selected Item   │ ← 用戶選擇的物品
│  (已選物品)     │
│  - amount       │ → 用戶需求量
│  - recipes[]    │ → 可用配方列表
└─────────────────┘
```

---

## 5. API 響應映射

### 5.1 XIVAPI 物品響應
```javascript
// API 返回
{
  ID: number,
  Name: string,
  Icon: string,
  LevelItem: number,
  ItemSearchCategory: { Name: string }
}

// 映射為 Item
{
  id: response.ID,
  name: response.Name,
  icon: XIVAPI.getIconUrl(response.Icon),
  level: response.LevelItem || 0,
  category: response.ItemSearchCategory?.Name || '未分類',
  price: null
}
```

### 5.2 tnze API 配方響應
```javascript
// API 返回
{
  id: number,
  class_job: string,
  rlv: number,
  yields: number,
  ingredients: [
    { id: number, name: string, amount: number }
  ]
}

// 映射為 Recipe
{
  id: response.id,
  classJob: response.class_job,
  level: response.rlv,
  yields: response.yields || 1,
  ingredients: response.ingredients.map(ing => ({
    id: ing.id,
    name: ing.name,
    icon: null,  // 需額外查詢
    amount: ing.amount,
    price: null,
    recipes: null
  }))
}
```

### 5.3 Universalis 價格響應
```javascript
// API 返回
{
  itemId: number,
  minPriceNQ: number,
  averagePriceNQ: number,
  lastUploadTime: number
}

// 更新 Item 的 price
item.price = response.minPriceNQ || response.averagePriceNQ || null;
```

---

## 6. 命名規範

### 6.1 變數命名
| 用途     | 變數名              | 類型          |
| -------- | ------------------- | ------------- |
| 單個物品 | `item`              | Item          |
| 物品列表 | `items`             | Item[]        |
| 材料     | `ingredient`, `ing` | Item + amount |
| 配方     | `recipe`            | Recipe        |
| 配方列表 | `recipes`           | Recipe[]      |
| 已選物品 | `selectedItem`      | Selected Item |

### 6.2 數量相關屬性
| 屬性     | 位置               | 含義       |
| -------- | ------------------ | ---------- |
| `amount` | Selected Item      | 用戶需求量 |
| `amount` | Recipe.ingredients | 配方所需量 |
| `yields` | Recipe             | 配方產出量 |

### 6.3 價格相關屬性
| 屬性     | 含義             |
| -------- | ---------------- |
| `price`  | 單個物品市場價   |
| 計算總價 | `price * amount` |

---

## 7. 實際應用範例

### 7.1 渲染配方表格
```javascript
selectedTreeItems.forEach(item => {
  const amount = item.amount || 1;  // 用戶需求
  const recipe = item.recipes[0];   // 使用第一個配方
  const yields = recipe.yields || 1;
  const multiplier = amount / yields;  // 計算倍數
  
  recipe.ingredients.forEach(ingredient => {
    const needed = Math.ceil(ingredient.amount * multiplier);
    const totalPrice = ingredient.price ? ingredient.price * needed : null;
    
    // 顯示：材料名、需求量、總價
  });
});
```

### 7.2 材料清單彙整
```javascript
const aggregated = {};

selectedTreeItems.forEach(item => {
  const amount = item.amount || 1;
  const recipe = item.recipes[0];
  const multiplier = amount / (recipe.yields || 1);
  
  recipe.ingredients.forEach(ing => {
    const needed = Math.ceil(ing.amount * multiplier);
    
    if (!aggregated[ing.id]) {
      aggregated[ing.id] = {
        id: ing.id,
        name: ing.name,
        icon: ing.icon,
        amount: 0,
        price: ing.price
      };
    }
    aggregated[ing.id].amount += needed;
  });
});

// 顯示彙總後的材料清單
Object.values(aggregated).forEach(item => {
  const totalPrice = item.price ? item.price * item.amount : null;
  // 顯示：材料名、總需求量、單價、總價
});
```

---

## 8. 錯誤處理

### 8.1 必須屬性檢查
```javascript
// Item 必須有 id 和 name
if (!item.id || !item.name) {
  console.error('Invalid item:', item);
  return null;
}

// Recipe 必須有 ingredients
if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) {
  console.error('Invalid recipe:', recipe);
  return null;
}
```

### 8.2 安全的數量計算
```javascript
const amount = item.amount || 1;
const yields = recipe.yields || 1;
const ingredientAmount = ingredient.amount || 1;

const needed = Math.ceil(ingredientAmount * (amount / yields));
```

### 8.3 價格處理
```javascript
// 顯示價格，未查詢時顯示「—」
const priceText = item.price !== null && item.price !== undefined
  ? item.price.toLocaleString() + ' G'
  : '—';
```


---

## 9. 全局狀態 (state)

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

---

## 10. 顯示格式規範

### 10.1 價格顯示
```javascript
// 格式化為帶千分位的金幣
const priceText = price !== null ? price.toLocaleString() + ' G' : '—';
```

### 10.2 數量顯示
```javascript
// 使用 × 符號
const qtyText = `×${amount}`;
```

### 10.3 圖標尺寸
| 場景       | 尺寸    |
| ---------- | ------- |
| 搜索結果   | 無圖標  |
| 表格中物品 | 32×32px |
| 表格中材料 | 20×22px |
| 材料彙整   | 28×28px |


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

#### 3.3.1 Aggregated Endpoint (彙總端點)
**端點**: `/api/v2/aggregated/{world}/{itemIds}`

**用途**: 獲取物品的最低價格（NQ/HQ）

```javascript
// API 返回（嵌套結構）
{
  results: [
    {
      itemId: number,
      nq: {
        minListing: {
          world: {
            price: number      // NQ 最低價格
          }
        }
      },
      hq: {
        minListing: {
          world: {
            price: number      // HQ 最低價格
          }
        }
      },
      worldUploadTimes: [number]  // 時間戳陣列（毫秒）
    }
  ]
}

// 映射為標準格式（由 _parseAggregatedResponse 處理）
{
  itemId: number,
  nqPrice: number,                    // nq.minListing.world.price
  hqPrice: number,                    // hq.minListing.world.price
  lastUploadTime: number              // worldUploadTimes[0] / 1000（轉為秒）
}
```

#### 3.3.2 Unit Price Endpoint (單價端點)
**端點**: `/api/v2/{world}/{itemIds}?fields=items.itemID,items.lastUploadTime,items.listings.*`

**用途**: 獲取詳細的市場掛單列表

```javascript
// API 返回（items 物件）
{
  items: {
    [itemId]: {
      itemID: number,
      lastUploadTime: number,         // 時間戳（毫秒）
      listings: [
        {
          pricePerUnit: number,       // 單價
          quantity: number,           // 數量
          total: number,              // 總價
          tax: number                 // 稅金
        }
      ]
    }
  }
}

// 映射為標準格式（由 getUnitPrice 處理）
{
  results: [
    {
      itemID: number,
      lastUploadTime: number,         // 轉為秒：Math.floor(ms / 1000)
      listings: [                     // 已合併同價格、排序（ASC）
        {
          pricePerUnit: number,
          quantity: number,           // 同價格數量合計
          total: number,              // 同價格總價合計
          tax: number                 // 同價格稅金合計
        }
      ]
    }
  ]
}
```

**重要說明**：
- Aggregated 端點用於快速獲取最低價，結構較簡單
- Unit Price 端點用於顯示詳細掛單，包含完整的市場資訊
- 時間戳統一轉換為秒（除以 1000）
- Unit Price 的 listings 已在 API 層完成價格合併和排序

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
