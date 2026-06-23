# ⚓ 水神的工具箱 | SeaGod's Toolbox

> 為 FFXIV 繁體中文伺服器玩家打造的冒險者工具集合

**網站**：[seagod99.github.io](https://seagod99.github.io)

---

## 目前可用工具

| 工具 | 路徑 | 說明 |
|------|------|------|
| ⛅ 艾歐澤亞天氣預報 | `/tools/weather/` | 即時天氣、多地圖概覽、目標天氣搜尋與天氣鏈搜尋 |
| 📖 天書奇談計算器 | `/tools/wondrous-tails/` | Monte Carlo 模擬連線機率，建議保留或重貼 |
| 🎰 仙人微彩計算機 | `/tools/cactpot/` | 期望值分析，建議最佳翻牌與選線策略 |
| ⛏️ 限時採集節點查詢 | `/tools/gathering/` | 傳說／稀有採集點開放時間、座標與職業，依 ET 即時更新 |
| 🐎 坐騎收藏追蹤 | `/collections/mounts/` | 取得來源查詢、版本篩選、追蹤擁有進度 |
| 🐣 寵物收藏追蹤 | `/minions/` | 取得來源查詢、篩選搜尋、追蹤擁有進度 |
| 🦜 鳥鞍收藏追蹤 | `/collections/barding/` | 陸行鳥鞍具來源查詢，追蹤擁有進度 |
| 🌬️ 風脈泉追蹤器 | `/tools/aether-currents/` | 31 地區 303 個風脈泉，任務型/野外型標示，追蹤解鎖進度 |
| 💙 青魔法術收藏 | `/collections/blue-magic/` | 法術來源追蹤與習得路線建議 |
| 🃏 幻卡追蹤 | `/collections/triple-triad/` | 幻卡取得來源與對戰策略查詢 |
| 🎵 樂譜收藏追蹤 | `/collections/orchestrion/` | 演奏團樂譜來源查詢，追蹤蒐集進度 |
| 💇 髮型收藏追蹤 | `/collections/hairstyles/` | 髮型樣式書來源查詢，追蹤解鎖進度 |
| 💃 表情收藏追蹤 | `/collections/emotes/` | 表情動作來源查詢，追蹤擁有進度 |
| 👁️ 探索筆記追蹤器 | `/collections/exploration-log/` | 全版本景觀查詢，天氣與時間提醒 |
| 🏰 冒險者小隊計算機 | `/tools/squadron/` | 設定隊員職業等級，計算最佳任務派遣組合與成功率 |
| 🌱 園藝配種計算 | `/tools/gardening/` | 正查兩株配種結果，反查目標植物的配種路徑 |
| 🎣 釣魚紀錄追蹤 | `/tools/fishing/` | 1104 種魚查詢（釣場/餌/時間/天氣），追蹤已釣進度 |
| ⛏️ 採集紀錄追蹤 | `/tools/gathering-log/` | 733 個採集節點，追蹤已採物品進度 |
| 🛡️ 配裝規劃器 | [gearing.ffsusu.com](https://gearing.ffsusu.com/) | 外部連結，全職業配裝規劃 |

---

## 規劃中的工具

### 📅 日常工具
- 👗 時尚品鑑推薦

### 🏆 收藏 / 成就

### 🌿 生活職（採集 / 製作 / 市場）
- 📊 市場查價 + 比價
- 🔍 物品 / 製作搜尋
- 🗺️ 藏寶圖採集點查詢（G8～G18）

---

## 技術架構

全站為純靜態頁面，部署於 GitHub Pages，無後端伺服器。各工具的資料盡量採用站內統一資料庫（`/data/`），詳見 `/data/SCHEMA.md` 與 `/data/_meta.json`。

### 資料來源

| 來源 | 用途 | 備註 |
|------|------|------|
| [XIVAPI v2](https://v2.xivapi.com) | 物品、配方、職業、圖示 | 免費，無需 API Key |
| [Universalis](https://universalis.app) | 即時市場價格、歷史成交 | 免費，繁中服完整支援；規劃中工具使用 |
| [FFXIV Teamcraft](https://ffxivteamcraft.com) | 採集點座標、藏寶圖位置、配方、各內容 patch 對照（`patch-content` / `patch-names`） | 公開 JSON |
| [thewakingsands/ffxiv-datamining-cn](https://github.com/thewakingsands/ffxiv-datamining-cn) | 中文物品名稱（簡中 + OpenCC 轉繁） | 社群 datamining |
| [ffxivcollect](https://ffxivcollect.com) | 收藏品 patch、取得來源（坐騎/寵物/表情/鳥鞍/樂譜） | 公開 API；來源文字為英文，無簡中 locale |
| [consolegameswiki](https://ffxiv.consolegameswiki.com) | 青魔法習得來源（圖騰兌換條件等） | 人工查證 |

繁中物品名稱以 `tw-items.msgpack`（台服官方譯名）為準，找不到對應名稱視為台服未開放，前端直接隱藏，不使用簡中/英文名稱替代。

各欄位的來源與重建腳本對照、更新流程，詳見 [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md)。

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

FFXIV 天氣為純數學計算，不需要 API。Eorzea Time 與現實時間的換算比率為 `20.5714...`（即 1 ET 小時 = 175 秒）。共用邏輯見 `/assets/js/eorzea-weather.js`。

---

## 專案結構

```
SeaGod99.github.io/
├── index.html                       # 工具站入口頁面
├── tools/
│   ├── weather/                     # 艾歐澤亞天氣預報
│   ├── wondrous-tails/              # 天書奇談計算器
│   ├── cactpot/                     # 仙人微彩計算機
│   └── gathering/                   # 限時採集節點查詢
├── collections/
│   ├── mounts/                      # 坐騎收藏追蹤
│   ├── barding/                     # 鳥鞍收藏追蹤
│   ├── blue-magic/                  # 青魔法術收藏
│   └── triple-triad/                # 幻卡追蹤
├── minions/                          # 寵物收藏追蹤
├── data/                              # 統一資料庫（SCHEMA.md / _meta.json）
├── scripts/                           # 資料產生與校正腳本
└── assets/
    ├── css/                          # 共用樣式
    ├── js/                           # 共用腳本
    └── {collection}/                 # 各收藏頁本機圖示快取
```

---

## 免責聲明

本站為玩家自製的非官方工具網站，與 Square Enix 無關。

FINAL FANTASY XIV © SQUARE ENIX CO., LTD.
