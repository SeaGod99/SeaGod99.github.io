# ⚓ 水神的工具箱 | SeaGod's Toolbox

> 為 FFXIV 繁體中文伺服器玩家打造的冒險者工具集合

**網站**：[seagod99.github.io](https://seagod99.github.io)

---

## 目前可用工具

| 工具 | 路徑 | 說明 |
|------|------|------|
| 🎰 仙人微彩計算機 | `/tools/cactpot/` | 期望值分析，建議最佳翻牌與選線策略 |
| 📖 天書奇談計算器 | `/tools/wondrous-tails/` | Monte Carlo 模擬連線機率，建議保留或重貼 |
| 📊 市場查價工具 | `/market/` | 即時查詢各伺服器市場價格、製作成本分析 |
| 🛡️ 配裝規劃器 | [gearing.ffsusu.com](https://gearing.ffsusu.com/) | 外部連結，全職業配裝規劃 |

---

## 規劃中的工具

### 📅 日常工具
- ⛏️ 限時採集節點計時器（Teamcraft nodes API）
- 🔪 B 怪討伐路線（各版本 B 怪位置與每日路線）
- 🌬️ 風脈泉追蹤器
- 👗 時尚品鑑推薦

### 🏆 收藏 / 成就
- 🐎 坐騎收藏追蹤
- 🐣 寵物收藏追蹤
- 🎵 樂譜收藏追蹤
- 💃 表情收藏追蹤
- 💇 髮型收藏追蹤
- 🦜 鳥鞍收藏追蹤
- 🖼️ 肖像收藏追蹤
- 👘 時尚裝備收藏追蹤
- 👁️ 探索筆記追蹤器
- 💙 青魔法術收藏
- 🃏 幻卡追蹤

### ⚔️ 戰鬥 / 副本
- 🏰 冒險者小隊計算機
- ⚡ 優雷卡 / 禁地天氣・NM

### 🌿 生活職（採集 / 製作 / 市場）
- 💰 製作利潤計算機（繁中目前空缺）
- 🔍 物品 / 製作搜尋
- 🗺️ 藏寶圖採集點查詢（G8～G18）
- 🌱 園藝配種計算
- 🏝️ 無人島開拓工具
- 🎣 釣魚紀錄追蹤
- ⛏️ 採集紀錄追蹤

---

## 技術架構

全站為純靜態頁面，部署於 GitHub Pages，無後端伺服器。

### 資料來源

| 來源 | 用途 | 備註 |
|------|------|------|
| [XIVAPI v2](https://v2.xivapi.com) | 物品、配方、職業、圖示 | 免費，無需 API Key |
| [Universalis](https://universalis.app) | 即時市場價格、歷史成交 | 免費，繁中服完整支援 |
| [FFXIV Teamcraft](https://ffxivteamcraft.com) | 採集點座標、藏寶圖位置 | 公開 JSON |
| [thewakingsands/ffxiv-datamining-cn](https://github.com/thewakingsands/ffxiv-datamining-cn) | 中文物品名稱（簡中 + OpenCC 轉繁） | 社群 datamining |

### 繁中伺服器資訊

Universalis 繁中伺服器清單（Elemental DC 下）：

| 伺服器名 | ID |
|---------|-----|
| 伊弗利特 Ifrit | 4028 |
| 迦樓羅 Garuda | 4029 |
| 利維坦 Leviathan | 4030 |
| 鳳凰 Phoenix | 4031 |
| 奧汀 Odin | 4032 |
| 巴哈姆特 Bahamut | 4033 |
| 拉姆 Ramuh | 4034 |
| 泰坦 Titan | 4035 |

### 天氣計算

FFXIV 天氣為純數學計算，不需要 API。Eorzea Time 與現實時間的換算比率為 `20.5714...`（即 1 ET 小時 = 175 秒）。

---

## 專案結構

```
SeaGod99.github.io/
├── index.html                  # 工具站入口頁面
├── market/
│   └── index.html              # 市場查價工具
├── tools/
│   ├── cactpot/
│   │   └── index.html          # 仙人微彩計算機
│   └── wondrous-tails/
│       └── index.html          # 天書奇談計算器
└── assets/
    ├── css/                    # 共用樣式
    └── js/                     # 共用腳本
```

---

## 免責聲明

本站為玩家自製的非官方工具網站，與 Square Enix 無關。

FINAL FANTASY XIV © SQUARE ENIX CO., LTD.
