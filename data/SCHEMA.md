# 水神的工具箱 — 統一資料庫設計規範

本文件定義所有 FF14 資料庫的統一結構，供各工具（坐騎、寵物、製作、採集…）共用讀取。

**儲存格式**：純 JSON 檔，放在 `/data/` 下。工具用 `fetch()` 載入，不混入程式碼。
**真實來源（single source of truth）**：JSON 檔本身。現有 `collections/mounts/mounts.js` 視為待遷移的舊格式。
**繁中資料策略（混合）**：
- 結構化資料（物品、配方、地圖、NPC、採集點）→ XIVAPI v2 抓取 + thewakingsands 簡中 datamining 經 OpenCC 轉繁，存 `itemId`/`xivId` 對照。
- 收藏品「取得方式」（坐騎/寵物/樂譜…的 sources）→ 手動整理，每大版本人工補充。

---

## 1. 全域慣例

### 1.1 目錄結構

```
/data/
  _meta.json            ← 版本資訊、各資料庫檔案清單、最後更新日
  items.json            ← 全物品主表（其他庫以 itemId 外連）
  maps.json             ← 地圖／區域
  npcs.json             ← NPC
  aether-currents.json  ← 風脈泉
  gathering.json        ← 採集點
  recipes.json          ← 製作配方
  dungeons.json         ← 副本（一般/高難度/大型/絕境戰）
  triple-triad.json     ← 幻卡
  blue-magic.json       ← 青魔法
  exploration-log.json  ← 探索筆記（探索手帳）
  emotes.json           ← 表情
  orchestrion.json      ← 樂譜
  minions.json          ← 寵物
  mounts.json           ← 坐騎
  barding.json          ← 鳥鞍
  squadron.json         ← 冒險者小隊
  fishing.json          ← 釣魚
```

大型庫（items 預估數萬筆）日後可分片為 `items/0.json`、`items/1.json`，`_meta.json` 記錄分片清單。初期單檔即可。

### 1.2 檔案外層格式

每個 JSON 檔統一為「信封 + 陣列」結構，方便附帶 metadata：

```json
{
  "schema": "mounts",
  "patch": "7.2",
  "updated": "2026-05-29",
  "source": "manual",
  "count": 165,
  "data": [ ... ]
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `schema` | string | 對應本文件章節名，固定 |
| `patch` | string | 資料涵蓋到的遊戲版本 |
| `updated` | string | ISO 日期 `YYYY-MM-DD` |
| `source` | string | `xivapi` / `manual` / `teamcraft` / `mixed` |
| `count` | number | `data` 筆數，供載入檢查 |
| `data` | array | 主資料陣列 |

### 1.3 共用欄位慣例（所有 entry 盡量遵守）

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:---:|------|
| `id` | number | ✅ | 該資料庫內的穩定主鍵。優先沿用遊戲內部 ID（XIVAPI row id）。 |
| `name` | string | ✅ | 繁中名稱（顯示用） |
| `nameEn` | string | | 英文名稱（搜尋、跨站對照用） |
| `itemId` | number | | 若此物件對應一件物品，填物品庫 id（外鍵）。坐騎/寵物/樂譜的「使用道具」用此連回 items。 |
| `patch` | string | | 加入版本，如 `"6.4"` |
| `icon` | string | | XIVAPI 圖示路徑，如 `"/i/004000/004400.png"`（不含網域，前端組合） |
| `sources` | array | | 取得方式陣列，見 1.4 |
| `category` | string | | 分類標籤（各庫自訂字典） |

**ID 原則**：能對到遊戲內部 ID 就用，不要自編流水號（避免跨版本衝突）。手動庫若暫無官方 ID，用穩定遞增整數並在 `_meta.json` 註記。

### 1.4 `sources` 取得方式（跨庫共用）

收藏類（坐騎、寵物、樂譜、表情、鳥鞍、幻卡…）共用同一套取得方式結構：

```json
"sources": [
  { "type": "高難度副本", "detail": "極神「火神伊夫利特」", "patch": "2.0" }
]
```

| 欄位 | 必填 | 說明 |
|------|:---:|------|
| `type` | ✅ | 取得方式分類，須為 1.5 字典之一 |
| `detail` | ✅ | 具體說明（副本名、成就名、商店與幣值…） |
| `patch` | | 該來源開放的版本（選填） |
| `itemId` | | 若需道具兌換，兌換道具的物品 id（選填） |

### 1.5 取得方式分類字典（`SOURCE_TYPES`）

**描述性、非強制**：前端各頁的篩選 chip 由該頁資料的 `type` 動態產生（`[...new Set(types)]`），
故此處為實際在用的分類總覽，新增來源時沿用既有用語、避免再造同義詞即可。

核心（沿用 mounts.js）：
```
主線任務 / 任務 / 副本掉落 / 高難度副本 / 絕境 / 狩獵 / PvP /
成就 / 金碟 / 商店 / 製作 / 採集 / 市場板 / 探索航行 /
節慶活動 / 聯名活動 / 信任系統 / 藍魔 / 其他
```

收藏頁回填後實際擴充（ffxivcollect 對照 + 各庫既有）：
```
副本 / 討伐戰 / 深層迷宮 / 異聞副本 / 多人副本 / 危命任務 / 寶箱/容器 / 怪物掉落 /
商城 / 兌換 / 部族任務 / 部族商店 / MGP商店 / 雙色寶石商店 / 蒼穹石板商店 /
青魔法師商店 / PvP商店 / 博茲雅 / 尤雷卡 / 新月島 / 無人島 / 伊修加德重建 /
宇宙探索 / 天書奇談 / 探索航行 / 遠航探索 / 雇員探險 / 採集獲得 / 園藝獲得 /
精製獲得 / 秘籍習得 / 時間限定 / 預設 / 動作指南書 / 圖騰 / App / 野外
```

**已正規化同義詞**（`scripts/normalize-source-types.mjs`）：任務獎勵→任務、成就獎勵→成就、
NPC商店→商店、商城購買→商城。
**刻意保留並存**：`副本掉落`（坐騎/寵物/樂譜＝副本掉落物）與 `副本`（青魔＝副本內習得，非掉落）語意有別，不合併。

### 1.6 版本分組字典（`PATCHES`）

```
ARR 2.x / HW 3.x / SB 4.x / ShB 5.x / EW 6.x / DT 7.x
```

判斷方式：取 `patch` 主版號（如 `7.2` → 7 → DT）。

### 1.7 座標慣例

地圖座標統一用遊戲內顯示座標（非像素），物件帶 `mapId` 連回 maps：

```json
"coords": { "mapId": 132, "x": 11.5, "y": 13.2 }
```

**`mapId` 定義（2026-06-11 地圖ID統一修正計畫定案）**：`mapId` = **遊戲 Map sheet 的 row id**（XIVAPI v2 `/sheet/Map` 的 `row_id`），全站唯一標準，`maps.json` 主鍵即此 id。Teamcraft 來源資料（npcs/monsters/gathering）原生就是這套 id，不需轉換。
`territoryId`（TerritoryType row id，見 fishing-spots）與 `coords.zoneId`（同為 territory 系，見 gathering）**僅為輔助欄位**，顯示與跨庫連結一律用 `mapId`；territory→map 對應表在 `out_data/territory-map.json`（build-fishing.mjs 會用）。

### 1.8 職業字典（`JOBS`）— 台服官方譯名

全資料庫（製作 recipes、採集 gathering、釣魚 fishing…）的 `job` 欄位**一律用台服官方譯名**。
`jobId` 為 FFXIV ClassJob 內部編號（Teamcraft recipes 的 `job`、採集點推導用），名稱用台服譯名。

製作職（Disciples of the Hand）：

| jobId | 縮寫 | 台服官方名 |
|:---:|:---:|------|
| 8 | CRP | 刻木匠 |
| 9 | BSM | 鍛鐵匠 |
| 10 | ARM | 鑄甲匠 |
| 11 | GSM | 雕金匠 |
| 12 | LTW | 製革匠 |
| 13 | WVR | 裁衣匠 |
| 14 | ALC | 煉金術士 |
| 15 | CUL | 烹調師 |

採集職（Disciples of the Land）：

| jobId | 縮寫 | 台服官方名 |
|:---:|:---:|------|
| 16 | MIN | 採礦工 |
| 17 | BTN | 園藝工 |
| 18 | FSH | 捕魚人 |

特殊製作系統（非八大製作職，recipes 庫會出現）：

| jobId | 台服名 | 內容 |
|:---:|------|------|
| 0 | 工會工坊 | 飛空艇/潛水艇零件、房屋外牆、機工製作台 |
| -10 | 無人島 | 無人島開拓製作（人工28 + 經濟型106） |

**注意**：採集點（gathering）庫的 `job` 一律用「採礦工 / 園藝工」（不可寫「礦工 / 漁夫」）；釣魚用「捕魚人」。

---

## 2. 各資料庫 schema

以下只列 `data[]` 內單筆 entry 的欄位；外層信封一律照 1.2。

### 2.1 items（全物品）— 主表

其他所有庫以 `itemId` 外連到這裡。

```json
{
  "id": 5057,
  "name": "黑鐵錠",
  "icon": "/i/020000/020801.png",
  "category": "金屬",
  "ilvl": 14,
  "rarity": 1,
  "stackSize": 999,
  "marketable": true,
  "equip": {
    "slot": 1,
    "level": 5,
    "jobs": ["GLA", "PLD"],
    "pDmg": 11, "mDmg": 5, "pDef": 0, "mDef": 0, "delay": 1920, "unique": 0
  }
}
```

| 欄位 | 來源 | 說明 |
|------|------|------|
| `id` | — | itemId（主鍵） |
| `name` | `tw-items.msgpack` | 繁中名稱（現成繁中，無需轉簡） |
| `icon` | XIVAPI | 圖示路徑，由 `Icon.path`（`ui/icon/020000/020801.tex`）轉 `/i/020000/020801.png` |
| `category` | XIVAPI | `ItemUICategory.Name`（轉繁） |
| `ilvl` | XIVAPI | `LevelItem.value` |
| `rarity` | XIVAPI | 0普通/1白/2綠/3藍/4紫 |
| `stackSize` | XIVAPI | 可堆疊上限 |
| `marketable` | XIVAPI | `!IsUntradable`，能否上市場板（連動市場查價工具） |
| `equip` | `equipment.msgpack` | 裝備專屬資料，非裝備則無此欄位 |

`equip.slot` = equipSlotCategory（部位）；`jobs` 為可裝職業代碼。

**繁中名稱來源**：使用者提供的 `tw-items.msgpack`（43,748 筆現成繁中）+ `equipment.msgpack`（24,098 筆裝備數值）。圖示與分類等由 XIVAPI 補。

**建置**（本機執行，需 Node 18+）：`node scripts/build-items.mjs`
讀兩個 msgpack + XIVAPI 分頁抓圖示/分類/ilvl/可上市 → 合併輸出 `items.json`。圖示檔可另跑下載腳本存進 `/assets/icons/`，或前端直接引用 XIVAPI 圖床。

### 2.2 maps（地圖／區域）

```json
{
  "id": 2,
  "name": "格里達尼亞新街",
  "nameEn": "New Gridania",
  "region": "黑衣森林",
  "zone": "格里達尼亞",
  "type": "city",
  "sizeFactor": 100,
  "offsetX": 0,
  "offsetY": 0,
  "weatherRates": [{ "weather": "晴朗", "rate": 40 }],
  "image": {
    "key": "s1f1/00",
    "local": "/assets/maps/s1f1_00.jpg",
    "url": "https://v2.xivapi.com/api/asset/map/s1f1/00"
  },
  "patch": "2.0"
}
```

**`id` = 遊戲 Map sheet row id**（2026-06-11 起，不再用自編連號；見 1.7）。
`type`：`city`（主城）/`field`（野外）/`housing`（居住區）/`dungeon`（副本）/`instance`（特殊區域，含副本內部圖、活動圖）。
`sizeFactor` + `offsetX/Y` 供遊戲座標↔像素換算。`weatherRates` 供天氣演算法（風脈/採集/釣魚共用；目前僅手動策展的 67 張有，新擴充的副本/特殊圖無）。
`image`：底圖。`key` 為 XIVAPI 的 Map 圖層代號；`local` 是下載後 repo 內路徑（前端 `<img src>` 用）；`url` 為來源。**底圖只下載 field/city/housing；dungeon/instance 僅留 `url`**，需要時 `node scripts/download-maps.mjs --all` 再抓。
`nameMissing: true`：tw-places 與 nameEn 皆查不到名稱（無 PlaceName 的特殊圖），前端勿顯示。
地名繁中來源優先序：本機 `out_data/places.msgpack`（台服官方）→ Teamcraft `tw/tw-places.json` → 中國服 PlaceName.csv + OpenCC → `nameEn` + `nameMissing: true`（地名不適用 tw-items 的「對不到即隱藏」原則，那是物品專屬）。
**圖片下載**（本機執行，需 Node 18+）：
1. `node scripts/fix-mapkeys.mjs` — 從 XIVAPI 撈每張地圖正確的 `mapKey` 回填 maps.json（手動推測的 key 多會 404，這步修正）。
2. `node scripts/download-maps.mjs` — 抓底圖進 `/assets/maps/`，略過已存在檔案、可重複執行補檔。

前端用 `image.local` 當 `<img src>`。

### 2.3 npcs（NPC）

```json
{
  "id": 1000236,
  "name": "蒙德里安",
  "nameEn": "Mordian",
  "title": "雙蛇黨補給官",
  "coords": { "mapId": 132, "x": 9.6, "y": 11.4 },
  "role": ["任務", "商人"]
}
```

### 2.4 aether-currents（風脈泉）

```json
{
  "id": 1,
  "name": "風脈泉 #1",
  "zone": "庫爾札斯西部高地",
  "patch": "3.0",
  "type": "field",
  "coords": { "mapId": 397, "x": 30.1, "y": 25.8 },
  "questId": null
}
```

`type`：`field`（野外採集型，有座標）/`quest`（任務獎勵型，填 `questId`）。每區一組，前端依 `zone` 分組顯示。

### 2.5 gathering（採集點）

**以「節點(node)」為單位**（一個採集點通常產出多個物品），對齊 Teamcraft `nodes.json` 結構。`id` = Teamcraft nodeId。

```json
{
  "id": 211,
  "type": 2,
  "typeName": "礦脈",
  "job": "礦工",
  "level": 50,
  "items": [5395],
  "hiddenItems": [10099, 10335],
  "coords": { "mapId": 18, "zoneId": 381, "x": 29.17, "y": 12.79, "radius": 89 },
  "limited": true,
  "spawns": [9],
  "duration": 180,
  "legendary": true,
  "ephemeral": false
}
```

| 欄位 | 說明 |
|------|------|
| `type` / `typeName` | 採集點種類。0=礦脈(MIN) /1=岩脈(MIN) /2=良材(BTN) /3=草場(BTN)；對應 `job` 礦工或園藝工。漁場另見 fishing 庫。 |
| `job` | 礦工 / 園藝工（依 type 推導） |
| `level` | 採集等級 |
| `items` | 可採集物品 id 陣列（外連 items 主表取名稱） |
| `hiddenItems` | 隱藏物品（需高採集力或特定手法才出） |
| `coords` | `mapId` 連 maps（= Map sheet row id，見 1.7）；`zoneId` 為 TerritoryType id（輔助欄位）；`x`/`y` 為地圖座標；`radius` 為節點群分布半徑 |
| `mapMissing` | Teamcraft 來源無地圖資訊（mapId=0）的節點標記，前端地圖功能須跳過（僅該類節點有此欄位） |
| `limited` | 是否限時節點 |
| `spawns` | 限時點的 ET 開始整點陣列（如 `[9]` = ET 9:00 出現）；非限時為 `[]` |
| `duration` | 限時點持續分鐘數（ET），如 180 = 3 ET 小時 |
| `legendary` | 傳說採集點（需風脈解鎖、暗示型節點） |
| `ephemeral` | 靈砂節點（以太還元用） |

物品繁中名稱不存在本表，由 `items` id 連 items 主表顯示。資料來源 Teamcraft `nodes.json`（座標/時間/物品）。
**EventItem 過濾（2026-06-11 起）**：`items`/`hiddenItems` 中 ≥2000000 的 id 是 EventItem 偽 id（風脈/任務採集點專用，不在 items.json 的物品 id 空間），build 時一律過濾；過濾後完全沒有物品的節點整筆剔除。

**前端顯示規則（重要）**：採集點產物 / hiddenItems 的 itemId 若在 items.json 對不到名稱，代表**台服尚未開放**該物品（Teamcraft 跟國際服較新版）→ **前端直接不顯示該物品**，不標示、不留空、不可 fallback 去 XIVAPI 抓名稱。物品名稱以 tw-items 為唯一真實來源。

### 2.6 recipes（製作配方）

```json
{
  "id": 1,
  "itemId": 5056,
  "job": "鍛鐵匠",
  "jobId": 9,
  "level": 1,
  "rlvl": 1,
  "stars": 0,
  "yield": 1,
  "ingredients": [
    { "itemId": 5106, "qty": 2 },
    { "itemId": 5107, "qty": 1 },
    { "itemId": 2,    "qty": 1 }
  ],
  "durability": 40,
  "quality": 80,
  "progress": 9,
  "expert": false
}
```

| 欄位 | 說明 |
|------|------|
| `id` | Teamcraft recipeId |
| `itemId` | 成品物品 id（外連 items 主表取繁中名） |
| `job` / `jobId` | 製作職業（台服譯名，見 1.8 JOBS）；jobId 8–15 |
| `level` / `rlvl` | 職業等級 / 配方等級 |
| `stars` | 星級難度 |
| `yield` | 一次製作產出數量 |
| `ingredients` | 材料陣列 `{itemId, qty}`，itemId 連 items；亦可連回 recipes 形成製作樹 |
| `durability`/`quality`/`progress`/`expert` | 製作模擬數值（供進階用，利潤計算可略） |

物品繁中名稱不存於本表，由 `itemId`/`ingredients[].itemId` 連 items 主表顯示。**同 2.5 規則**：對不到名稱（台服未開放）的成品/材料，前端直接不顯示。資料來源 Teamcraft `recipes.json`。

### 2.6b dungeons（副本）

通用副本主表。涵蓋一般副本、高難度（極神/蠻神）、大型副本（幻想大地/魔大陸）、絕境戰。
供多個工具共用查詢（副本名稱/難度/解鎖條件/掉落外觀）。

#### `type` 分類字典

| 值 | 意義 |
|---|---|
| `dungeon` | 一般副本（主線/支線，4人） |
| `trial_hard` | 蠻神討伐戰（8人，中難度） |
| `trial_ex` | 極神（8人，高難度） |
| `raid_normal` | 一般討伐戰（8人，Savage 版稱 `raid_savage`） |
| `raid_savage` | 零式討伐戰（8人） |
| `alliance_raid` | 大型協力副本（24人） |
| `large_content` | 大型特殊內容（夢幻大地/優雷卡等，結構不固定） |
| `ultimate` | 絕境戰（8人，最高難度） |

#### 範例

```json
{
  "id": 101,
  "name": "極神「火神伊夫利特」",
  "nameEn": "The Bowl of Embers (Extreme)",
  "type": "trial_ex",
  "patch": "2.0",
  "ilvlSync": 55,
  "ilvlReq": 49,
  "levelReq": 50,
  "partySize": 8,
  "avgTime": 15,
  "expansion": "ARR",
  "unlock": {
    "type": "quest",
    "questName": "一燃而起",
    "questId": null
  },
  "bosses": [
    { "name": "伊夫利特", "nameEn": "Ifrit" }
  ],
  "rewards": {
    "tomestones": null,
    "itemLevel": 55,
    "itemIds": [],
    "mounts": [{ "mountId": 5, "name": "夢幻陸行鳥" }],
    "minions": []
  },
  "notes": "七色水晶武器素材來源"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:---:|------|
| `id` | number | ✅ | 主鍵（建議沿用 XIVAPI ContentFinderCondition row_id） |
| `name` | string | ✅ | 繁中名稱 |
| `nameEn` | string | | 英文名（搜尋用） |
| `type` | string | ✅ | 副本類型，見上方字典 |
| `patch` | string | ✅ | 開放版本 |
| `ilvlSync` | number\|null | | 裝等同步上限（無同步則 null） |
| `ilvlReq` | number | | 入場最低裝等 |
| `levelReq` | number | | 入場最低等級 |
| `partySize` | number\|null | | 隊伍人數（結構不固定的大型內容填 null） |
| `avgTime` | number\|null | | 平均耗時（分鐘，估計值） |
| `expansion` | string | | 資料片代號（ARR/HW/SB/ShB/EW/DT） |
| `unlock` | object | | 解鎖條件 |
| `unlock.type` | string | ✅ | `msq`（主線）/ `quest`（支線）/ `unlock_item`（道具）/ `achievement`（成就）/ `none` |
| `unlock.questName` | string\|null | | 任務名稱 |
| `unlock.questId` | number\|null | | 任務 ID（連 npcs 或 XIVAPI） |
| `bosses` | array | | Boss 清單，每筆 `{ name, nameEn }` |
| `rewards` | object | | 掉落獎勵（用於外觀/坐騎追蹤） |
| `rewards.tomestones` | string\|null | | 掉落神典石種類（如「不朽石」），無則 null |
| `rewards.itemLevel` | number\|null | | 掉落裝備裝等 |
| `rewards.itemIds` | number[] | | 掉落物品 itemId 陣列（外連 items） |
| `rewards.mounts` | array | | 掉落坐騎 `[{ mountId, name }]`（外連 mounts） |
| `rewards.minions` | array | | 掉落寵物 `[{ minionId, name }]`（外連 minions） |
| `notes` | string\|null | | 備注 |

**與其他庫的關聯**：
- `rewards.itemIds[]` → `items.id`
- `rewards.mounts[].mountId` → `mounts.id`（收藏追蹤工具可用此反查副本）
- `rewards.minions[].minionId` → `minions.id`
- `mounts/minions` 的 `sources[].type = "高難度副本"` 時，`detail` 填副本 `name`（繁中），方便前端顯示時跨查

**資料來源**：XIVAPI `ContentFinderCondition` sheet（解鎖條件、等級、隊伍人數）；掉落外觀、坐騎手動補充。

---

### 2.7 triple-triad（幻卡）

```json
{
  "id": 1,
  "name": "怪鳥",
  "nameEn": "Dodo",
  "stars": 1,
  "type": null,
  "numbers": { "top": 4, "right": 2, "bottom": 5, "left": 2 },
  "sources": [{ "type": "商店", "detail": "幻卡商人購入" }],
  "patch": "2.51"
}
```

`type`：獸人/原初/帝國/拂曉/null。`numbers` 為四邊數值。

### 2.8 blue-magic（青魔法）

```json
{
  "id": 1,
  "name": "水炮",
  "nameEn": "Water Cannon",
  "no": 1,
  "rank": 1,
  "aspect": "水",
  "learnFrom": [
    { "monster": "水元精", "zone": "中拉諾西亞", "coords": { "mapId": 135, "x": 24, "y": 35 } }
  ],
  "patch": "4.5"
}
```

`no`：青魔法手帳編號（1–248…）。`learnFrom` 為習得怪物與地點。來源優先 Teamcraft。

### 2.9 exploration-log（探索筆記／探索手帳）

```json
{
  "id": 1,
  "name": "某景點名稱",
  "zone": "格里達尼亞新街",
  "coords": { "mapId": 132, "x": 12.0, "y": 13.0 },
  "trigger": "情緒動作「眺望」",
  "patch": "2.0"
}
```

### 2.10 emotes（表情）

```json
{
  "id": 82,
  "name": "表情：沉思",
  "nameEn": "Reflect",
  "command": "/reflect",
  "unlockLink": 389,
  "itemId": 22498,
  "icon": "/i/246000/246126.png",
  "category": "Expressions",
  "sources": [{ "type": "動作指南書", "detail": "習得自「演技教材·沉思」" }],
  "patch": null
}
```

`command`：文字指令。`unlockLink`：`Emote.UnlockLink`，`0` 代表預設動作。`itemId`：真正的表情書物品 id（連市場查價），無對應書物品則 `null`。`category`：`EmoteCategory`（General / Special / Expressions）。

**來源（sources）分桶**（由 `scripts/build-emotes.mjs` 產生，全 292 筆皆有來源）：

| type | 判定 | detail | 筆數 |
|------|------|--------|------|
| `預設` | `unlockLink === 0` | 預設動作（角色初始即可使用） | 94 |
| `動作指南書` | 反查到表情書物品 | 習得自「<台服書名>」（itemId 連市場；台服未開放的書無譯名時顯示泛稱） | 163 |
| `任務` | `unlockLink >= 65536`（= Quest row id）或 `MANUAL_SOURCES` | 任務「<繁中任務名>」獎勵 | 29 |
| `成就` | `MANUAL_SOURCES` | 成就「<繁中成就名>」獎勵 | 4 |
| `App` | `MANUAL_SOURCES` | 下載並登入 Companion App（手機） | 2 |

> ⚠️ 舊版誤把 `Emote.UnlockLink` 當成物品 id 直接查 Item，導致對應到神典石/過期裝備、198 筆 `name=null` 被隱藏。正確反查路徑：表情書物品（名為「Ballroom Etiquette」/「Battlefield Etiquette」，台服「演技教材·」）的 `ItemAction.Data[0] == Emote.UnlockLink`（一本書可解鎖共用同 UnlockLink 的多個表情）。書物品以 `Name~"Etiquette"` ∪ 舊版 `Data[1]=5211` 聯集列舉。
>
> 小值 `unlockLink`、無表情書者（任務/成就/App 解鎖）以 `scripts/build-emotes.mjs` 內的 `MANUAL_SOURCES`（key = unlockLink）補齊，繁中任務/成就名由英文名→XIVAPI Quest/Achievement row→Cafemaker `Name_chs`→OpenCC，來源逐筆查 FFXIV consolegameswiki + ffxivcollect API 佐證。繁中表情名走 Cafemaker 簡中 Emote 名 → OpenCC `s2twp`（與站內其他無台服譯名資料一致）。

### 2.11 orchestrion（樂譜）

```json
{
  "id": 1,
  "name": "序曲",
  "nameEn": "Prelude",
  "number": 1,
  "itemId": 12727,
  "category": "蒼天",
  "sources": [{ "type": "副本掉落", "detail": "某副本" }],
  "patch": "3.0"
}
```

`number`：管弦樂機編號。`itemId`：樂譜物品（連市場查價）。

### 2.12 minions（寵物）

```json
{
  "id": 1,
  "name": "陸行鳥雛鳥",
  "nameEn": "Wind-up Cursor",
  "itemId": 6149,
  "behavior": "獨特",
  "icon": "/i/004000/004401.png",
  "sources": [{ "type": "成就", "detail": "成就「玩家之友」" }],
  "patch": "2.0"
}
```

### 2.13 mounts（坐騎）— 遷移現有 mounts.js

```json
{
  "id": 11,
  "name": "法爾法德",
  "nameEn": "Markab",
  "itemId": null,
  "seats": 1,
  "icon": "/i/004000/004352.png",
  "sources": [{ "type": "高難度副本", "detail": "極神「極地神」" }],
  "patch": "2.0"
}
```

`seats`：可乘人數（單人/雙人/多人篩選用）。沿用舊 mounts.js 的 `id/name/patch/sources` 即可直接轉。

### 2.14 barding（鳥鞍）

```json
{
  "id": 1,
  "name": "黑陸行鳥鞍甲",
  "nameEn": "Black Barding",
  "itemId": 6062,
  "slot": "全套",
  "sources": [{ "type": "成就", "detail": "某成就" }],
  "patch": "2.0"
}
```

`slot`：頭/身/腿/全套。

### 2.15 squadron（冒險者小隊）

兩類資料：成員（recruits）與任務（missions）。用 `kind` 區分，共存於同一檔。

```json
{ "kind": "recruit", "id": 1, "name": "某成員", "race": "人族", "role": "DPS", "attributes": { "physical": 0, "mental": 0, "tactical": 0 } }
```
```json
{ "kind": "mission", "id": 101, "name": "某訓練任務", "require": { "physical": 230, "mental": 200, "tactical": 180 }, "rewardExp": 5000, "rewardItem": null }
```

供小隊計算機：依成員屬性湊出滿足 mission `require` 的最佳組合。

### 2.16 fishing（釣魚）

```json
{
  "id": 1,
  "itemId": 4869,
  "name": "馬米鯛",
  "spot": "中央濕地",
  "coords": { "mapId": 135, "x": 24, "y": 21 },
  "bait": [{ "itemId": 4868, "name": "淡水浮游生物" }],
  "weather": ["晴朗", "陰天"],
  "timeWindow": { "start": [9], "end": [16] },
  "tug": "中",
  "hookset": "強力提鉤",
  "patch": "2.0"
}
```

`tug`：咬鉤力道（輕/中/重）。`timeWindow`/`weather` 為限定魚條件（連動天氣演算法），無限定則設 `null`。

### 2.17 treasure-maps（藏寶圖採集點）

**以「藏寶圖等級」為單位**（一個等級對應多個挖寶座標），供藏寶圖工具查詢挖掘地點。
`id` = 藏寶圖道具的物品 id（外連 items 主表）。

```json
{
  "id": 17836,
  "grade": "G10",
  "series": "G",
  "gradeNum": 10,
  "name": "陳舊的地圖G10",
  "icon": "/i/025000/025930.png",
  "expansion": "紅蓮之狂潮",
  "major": 4,
  "locations": [
    { "mapId": 354, "x": 12.1, "y": 18.8, "partySize": 8 }
  ],
  "aliases": [{ "grade": "S1", "id": 24794, "name": "陳舊的地圖S1" }]
}
```

| 欄位 | 說明 |
|------|------|
| `id` | 藏寶圖道具 itemId（連 items 主表；名稱即台服「陳舊的地圖G#／S#」） |
| `grade` / `series` / `gradeNum` | 等級碼（`G8`）／系列（`G` 常規、`S` 特殊）／等級數字（排序用） |
| `name` | 台服官方道具名（已內嵌，工具無需另載 10MB 的 items.json） |
| `icon` | 道具圖示路徑（XIVAPI，前端組網域） |
| `expansion` / `major` | 資料片繁中名（由挖寶區域的 `maps.json` patch 推導）／主版本號 |
| `locations` | 挖寶座標陣列：`mapId` 連 maps（= Map row id）、`x`/`y` 為遊戲地圖座標、`partySize`（1 單人／8 組隊寶物庫） |
| `aliases` | 座標集完全相同的同內容別名圖（台服 S 系列多與某 G 系列等價，合併為 alias 避免介面重複；選填） |

**資料來源**：Teamcraft `treasures.json`（挖寶座標／partySize）＋ items.json（台服名稱、圖示）＋ maps.json（地區名、資料片）。
**建置**：`node scripts/build-treasure-maps.mjs`（沙箱擋外網時 `--local <treasures.json路徑>`）。
**台服未開放規則**：名稱對不到 items.json（如國際服較新的圖）→ 整個等級不列出（見 2.5 同規則）。座標所在地圖若無 maps.json 對應則跳過該座標。

---

## 3. 前端載入慣例

```js
// 共用載入器
async function loadDB(name) {
  const res = await fetch(`/data/${name}.json`);
  const db = await res.json();
  if (db.count !== db.data.length) console.warn(`[${name}] count mismatch`);
  return db.data;
}
// 用法
const mounts = await loadDB('mounts');
```

物品名稱顯示時，若 entry 有 `itemId` 而無 `name`，可從 items 庫補；建議建立 `itemId → item` 的 Map 快取避免重複查找。

## 4. 維護流程

1. **結構化庫**（items/maps/npcs/recipes/gathering）：寫一支 Node 腳本 `scripts/build-data.mjs`，從 XIVAPI v2 抓 → OpenCC 轉繁 → 輸出 JSON。每大版本跑一次。
2. **收藏取得方式**（sources）：手動維護，PR/commit 補充。
3. 每次更新後跑 `jq` 驗證格式並更新 `_meta.json` 的 `updated`。
