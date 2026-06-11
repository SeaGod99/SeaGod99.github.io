// ===== 物品數據定義 (Items) =====
const MockItems = {
  // 主物品：黑鐵短劍
  2896: {
    id: 2896,
    name: "黑鐵短劍",
    icon: "https://xivapi.com/i/060000/060103_hr1.png",
    level: 50,
    canBeHQ: true,
    price: {
      nqMin: 1500,
      nqAvg: 1800,
      hqMin: 2500,
      hqAvg: 2800,
      lastUploadTime: null,
      server: null
    }
  },
  
  // 材料 1：黑鐵銿
  5057: {
    id: 5057,
    name: "黑鐵銿",
    icon: "https://xivapi.com/i/022000/022007_hr1.png",
    level: 45,
    canBeHQ: true,
    price: {
      nqMin: 200,
      nqAvg: 250,
      hqMin: 350,
      hqAvg: 400,
      lastUploadTime: null,
      server: null
    }
  },
  
  // 材料 2：硬化劑
  5113: {
    id: 5113,
    name: "硬化劑",
    icon: "https://xivapi.com/i/022000/022457_hr1.png",
    level: 0,
    canBeHQ: false,
    price: {
      nqMin: 100,
      nqAvg: 120,
      hqMin: null,
      hqAvg: null,
      lastUploadTime: null,
      server: null
    }
  },
  
  // 材料 3：鐵礦
  5051: {
    id: 5051,
    name: "鐵礦",
    icon: "https://xivapi.com/i/020000/020801_hr1.png",
    level: 0,
    canBeHQ: false,
    price: {
      nqMin: 50,
      nqAvg: 60,
      hqMin: null,
      hqAvg: null,
      lastUploadTime: null,
      server: null
    }
  },
  
  // 主物品 2：黑鐵盾牌
  2897: {
    id: 2897,
    name: "黑鐵盾牌",
    icon: "https://xivapi.com/i/034000/034501_hr1.png",
    level: 50,
    canBeHQ: true,
    price: {
      nqMin: 1800,
      nqAvg: 2000,
      hqMin: 2800,
      hqAvg: 3200,
      lastUploadTime: null,
      server: null
    }
  }
};

// ===== 配方數據定義 (Recipes) =====
const MockRecipes = {
  // 黑鐵短劍的配方（鍛鐵匠製作）
  2896: {
    id: 30001,  // 配方 ID（獨立於物品 ID）
    resultItemId: 2896,  // 產出物品 ID
    classJob: "鍛鐵匠",
    level: 50,
    difficulty: 100,
    durability: 80,
    yields: 1,  // 製作 1 次產出 1 個黑鐵短劍
    ingredients: [
      {
        id: 5057,
        amount: 3   // 需要 3 個黑鐵銿
      },
      {
        id: 5113,
        amount: 1   // 需要 1 個硬化劑
      }
    ]
  },
  
  // 黑鐵銿的配方（鍛鐵匠製作）
  5057: {
    id: 30002,  // 配方 ID（獨立於物品 ID）
    resultItemId: 5057,  // 產出物品 ID
    classJob: "鍛鐵匠",
    level: 45,
    difficulty: 80,
    durability: 60,
    yields: 5,  // 製作 1 次產出 5 個黑鐵銿
    ingredients: [
      {
        id: 5051,
        amount: 8   // 需要 8 個鐵礦
      }
    ]
  },
  
  // 黑鐵盾牌的配方（鍛鐵匠製作）
  2897: {
    id: 30003,  // 配方 ID（獨立於物品 ID）
    resultItemId: 2897,  // 產出物品 ID
    classJob: "鍛鐵匠",
    level: 50,
    difficulty: 110,
    durability: 80,
    yields: 1,  // 製作 1 次產出 1 個黑鐵盾牌
    ingredients: [
      {
        id: 5057,
        amount: 2   // 需要 2 個黑鐵銿
      },
      {
        id: 5113,
        amount: 1   // 需要 1 個硬化劑
      }
    ]
  }
};

// ===== 預設已選物品 (Selected Items) =====
// 用戶選擇的物品，只需 id 和數量，其他資訊從 MockItems 和 MockRecipes 查找
const MockItemData = [
  {
    id: 2896,
    amount: 1  // 用戶想要製作 1 把黑鐵短劍
  },
  {
    id: 2897,
    amount: 1  // 用戶想要製作 1 個黑鐵盾牌
  },
  {
    id: 5057,
    amount: 1  // 用戶想要製作 1 個黑鐵銿
  }
];

// 暴露到全局作用域供 script.js 使用
window.MockItems = MockItems;
window.MockRecipes = MockRecipes;
window.MockItemData = MockItemData;
