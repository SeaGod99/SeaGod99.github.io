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
| `condition` | | 成就的達成條件（`patch-achievement-sources.mjs` 補；只有 `type: "成就"` 才有）|
| `questId` | | `type: "任務"` 時的任務 id（`patch-collection-quest-npc.mjs` 補）|
| `via` | | 上面那個 `questId` 是怎麼認定的：`"reward"`＝任務獎勵裡有這個物品（可證）、`"name"`＝任務名唯一命中 |
| `level` | | 任務的接取等級 |
| `issuer` | | 接取 NPC `{ id, name }`；查不到台服名就整個不給 |
| `at` | | 接取地點 `{ mapId, mapName, x, y }`，座標慣例同 §1.7 |

> `questId` 以下五欄由 `node scripts/patch-collection-quest-npc.mjs --apply` 補，涵蓋坐騎／寵物／樂譜／鳥鞍／表情。
> 認不出來的（多為季節活動任務，台服任務表裡沒有）**原樣不動**——寧可不顯示，也不要顯示猜的。
> 畫面層走 `CollectionTracker.sourceWhere(s)`，各頁不要自己排版。

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


### 1.9 台服名守門

**「有中日韓漢字」不等於「是台服名」。** 判斷一律走 `scripts/lib/tw-text.mjs`：

| 函式 | 規則 | 用在哪 |
|------|------|--------|
| `isTw(s)` | 要有漢字、沒有假名、不是遊戲內部佔位列 | 物品名／NPC 名／地名／店名（上游缺口是英文原文，所以必須要求漢字）|
| `isTranslated(s)` | 只擋假名與佔位列，**不要求漢字** | `twName()`——台服客端真的會顯示 HP／MP／GP／CP／PvP／F.A.T.E./2P |

擋掉的內部佔位列長這樣：`_rsv_4389_…`、`（仮）空島中ボス1名稱`、`ラベル削除予定`、`●未使用アクション`、`×泥まりも`。

**欄名以 `Ja`／`_ja` 結尾是刻意的日文對照欄**（`fishes.spotNameJa`、`monsters.nameJa`、
`bluemage-sources-tc.spell_ja`），不受守門管，但**前端不得 render**。

`validate-data.mjs` 會掃整個 `data/`（含分片目錄）擋回歸，白名單在那支裡面。細節與踩過的雷見知識庫 §4.72。

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

#### 2.1b collectable-items（可當收藏品採集的物品）

```json
{ "schema": "collectable-items", "source": "xivapi Item.IsCollectable",
  "count": 1023, "data": [5214, 5218, 12966, …] }
```

`data` 就是 itemId 陣列（僅收 `items.json` 有的，即台服已開放者），6.4KB。

**為什麼要獨立一份**：`items.json` **沒有**任何收藏品欄位（收藏品的 `category` 一律是「雜貨」、`rarity` 1、`marketable` false，都不足以判別），而前端是純靜態頁不能即時打 XIVAPI。

⚠️ **絕對不要用名稱前綴「收藏用」判斷收藏品**。台服收藏品**不一定**叫「收藏用○○」——實查限時採集節點的 325 種產物，有 **48 種是收藏品卻沒有那個前綴**（火砂礫、雷砂礫、強火性岩、赤玉土、腐殖土、水薄荷、梅茵菲娜月桂、黑雷岩、陽風岩…），用前綴會把 76 個收藏品節點少算成 38 個。反向倒是安全（有前綴的必定是收藏品）。
⚠️ 也**不要用 `AlwaysCollectable`**：那不是「專屬收藏品」的意思，64 個「收藏用○○」裡有 48 個是 `false`。判斷「能不能當收藏品」只看 **`IsCollectable`**。

**建置**：`node scripts/build-collectable-items.mjs`（`--check` 只比對不寫入）。重建 `items.json` 後建議重跑。

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
  "patch": "2.51",
  "icon": 27662,
  "order": 1,
  "uiPriority": 0
}
```

`type`：獸人/蠻神/帝國/拂曉/null。`numbers` 為四邊數值（10 在遊戲裡顯示為 A）。
`id` ＝遊戲卡片一覽的**編號**，且**第 N 個「九宮幻卡」道具（依 itemId 排序）就是編號 N**——
台服張數與繁中名都以此推得（見 `scripts/patch-triple-triad-new-cards.mjs`）。`patch` 取該卡片道具的 patch。

`order`／`uiPriority`（取自 `TripleTriadCardResident`）＝**遊戲手帳的排列順序，先 uiPriority 再 order**。
前端一律照 `(uiPriority, order)` 排，**不要改回照 `id` 排**，否則每一頁的內容都跟遊戲對不起來。

**畫面上的「編號」＝`order`，不是 `id`**（2026-07-26 定案）：420 張 `uiPriority=0` 的卡編號 1–420；
15 張 `uiPriority=5` 的 FF 歷代主角卡（row id 68–80、252、405）在遊戲裡不在編號序列內，站上標成
**「編號外 1–15」**（卡格左下角縮寫「外1–外15」）。`id`（row id）只當**進度存檔的鍵**與資料主鍵、
不對使用者顯示——`keyOf` 仍是 `id`，所以改顯示編號**不會**動到既有進度。

`sources[]` 依 `type` 帶不同欄位：

| type | 欄位 |
|------|------|
| `NPC對戰` | `npcId`／`npcName`／`npcTitle`／`dropType`（固定・隨機）／`location`{`mapId`,`mapName`,`x`,`y`}。**這型別沒有 `detail` 是正常的**，前端靠 `npcName`＋`location` 組行 |
| `副本`／`多人副本`／`討伐戰`／`大型任務` | `contentId`（對 `dungeons.json` 的 id）＋`detail`（繁中副本名）。type 一律由 `dungeons.json` 的 `type` 推得，不沿用上游 |
| `商店`（含 `MGP商店`／`雙色寶石商店`…） | `detail`；部分另帶 `npcId`／`npcName`／`location` |
| `卡包` | `itemId`（對 `items.json`）＋`detail`＝「卡包名（兌換 NPC・價格）」 |
| `任務` | `questId`＋`detail`（Teamcraft `tw/tw-quests.json` 官方繁中任務名） |
| `藏寶圖` | `itemId`＋`detail`（寶藏物品名） |

**2026-07-28 補齊**（[`patch-triple-triad-source-names.mjs`](../scripts/patch-triple-triad-source-names.mjs)）：
原本 281 筆來源只有 id 沒有名稱，已補到剩 11 筆。三個必須記住的點：

1. **舊資料的 `instanceId` 是 Garland Tools 自家 id，不是 ContentFinderCondition id。**
   182 個裡有 64 個「剛好」也是 `dungeons.json` 的有效 key，但實測 **151 個對到的是錯的副本**
   （Garland 96＝深空天坑，dungeons.json 96＝巴哈姆特大迷宮邂逅之章4）。解析一律走
   **英文名比對**。已解出的 178 個副本，`instanceId` 已刪除、改存 `contentId`，避免下次誤用。
2. **舊資料的 `treasureId` 其實是 `itemId`**，而且 10 個裡有 7 個是金碟幣買的「九宮幻卡◯包」
   卡包（`obtainable-methods.json` 佐證），型別「藏寶圖」是上游標錯的，已拆成 `卡包`／`藏寶圖`。
3. **仍留 17 筆純英文 `detail`**：14 筆成就名（Title/Achievement 非物品，`tw-items` 不涵蓋，
   全站對成就繁中名的立場是擱置）＋2 筆 wiki 英文句子＋1 筆 `Mount Rokkon`。另 11 筆無名稱＝
   `dungeons.json` 沒收的內容（Cape Westwind 已下架、36xxx 段的異聞迷宮 3 座）。**要補請先補
   `dungeons.json`，不要在前端或這支腳本裡猜。**

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
  "name": "海雀棧道",
  "nameEn": "Barracuda Piers",
  "zone": "利姆薩·羅敏薩",
  "zoneEn": "Limsa Lominsa",
  "coords": { "mapId": 11, "mapName": "利姆薩·羅敏薩上層甲板", "x": 9.6, "y": 7.8 },
  "trigger": "情緒動作「眺望」",
  "weather": null,
  "timeStart": 8,
  "timeEnd": 11,
  "patch": "2.0"
}
```

`coords`：2026-09-23 由 [`scripts/patch-exploration-coords.mjs`](../scripts/patch-exploration-coords.mjs) 補齊 **338/340**。
來源＝XIVAPI v2 `Adventure`（row id 由 2162688 起連號，`adventureId = 2162688 + id - 1`）→ `Level` 的 X／Z／Map，
再用 `maps.json` 的 sizeFactor／offset 換算（公式同 `patch-aether-coords.mjs`）。
缺的 2 筆（#212 遊末邦軍總司令部、#213 蜂箱夜總會）是 Map row 554／555 的室內子地圖，`maps.json` 只收主地圖。

`coords.mapName` 刻意與 mapId 並存（同 `triple-triad.json` 的 `location`）：頁面的座標列與 `/coord X Y 地名`
都要地名，而這頁只載 `exploration-log.json`，為了一個名字多載 80KB 的 `maps.json` 不划算。

`weather` 全 340 筆為 null 且**刻意不補**：`Adventure` sheet 沒有天氣欄位，該資訊只存在英文 `Description`
散文裡，依鐵則「對不到台服官方來源就不顯示」。

`timeStart`／`timeEnd`：ET 時段（`Adventure.MinTime`／`MaxTime` 的小時部分）。這兩欄同時是 id 映射的驗證器——
補座標時逐筆比對，不符就跳過不寫（實測 0 筆不符）。

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

實際拆成兩檔：`fishes.json`（魚）與 `fishing-spots.json`（釣場），以 `spotId` 互連。

```json
{
  "itemId": 41412,
  "name": "星鯨",
  "nameEn": "Cetus",
  "spotId": 366, "spotName": "湖丙β", "spotNameEn": "...", "spotNameJa": "...",
  "spots": [366],
  "startHour": 0, "endHour": 24,
  "weatherSet": [{ "id": 1, "name": "Clear Skies" }],
  "previousWeatherSet": [],
  "bait": [
    { "itemId": 36597, "name": "星塵／震撼板鉤",
      "alts": [{ "itemId": 36597, "name": "星塵" }, { "itemId": 36596, "name": "震撼板鉤" }] },
    { "itemId": 41398, "name": "事件穹界的回歸者" }
  ],
  "predators": [{ "itemId": [36521, 1], "name": "36521,1" }],
  "intuitionLength": 600,
  "hookset": "Powerful", "tug": "heavy",
  "bigFish": true, "legendary": true,
  "fishEyes": false, "snagging": null, "folklore": "...",
  "patch": "6.55"
}
```

| 欄位 | 說明 |
|------|------|
| `spotId` / `spots[]` | 主釣場／所有可釣釣場（主釣場排最前，由 `patch-fishing-multispot.mjs` 補） |
| `startHour` / `endHour` | ET 開窗，`0`+`24` 代表全天 |
| `weatherSet` / `previousWeatherSet` | 天氣／前置天氣（`name` 目前是英文，前端用 `eorzea-weather.js` 對照表轉繁中） |
| `bait[]` | 釣餌鏈，**第 0 段是實際掛鉤的餌，之後是要現釣的以小釣大魚**。一段若「A 或 B 皆可」，`itemId`/`name` 取第一個＋合併名，完整選項在 `alts[]`（釣魚頁的魚餌篩選要一併比對 `alts`） |
| `predators[]` | 觸發**魚識**（以小釣大）所需的前置魚，`itemId` 是 `[魚 itemId, 需要數量]`（沿用上游形狀，`name` 不可用，前端自行回查） |
| `intuitionLength` | 魚識持續秒數，`null`＝不需魚識 |
| `tug` / `hookset` | 咬鉤力道（`light`/`medium`/`heavy`）／建議提鉤技能 |
| `bigFish` | **魚王＝釣場之王**（日文ヌシ、英文 Big Fish），綠色品質稀有魚。上游有旗標 |
| `legendary` | **魚皇＝釣場之皇**（日文オオヌシ、英文 Living Legend），魚王中條件最嚴苛的一階，每個資料片版本末期只追加 6 隻。**遊戲資料與上游都沒有這個旗標**（XIVAPI `FishParameter` 的 `AchievementCredit`／`IsHidden` 在魚王與魚皇之間完全相同），由 `scripts/patch-fish-legendary.mjs` 依中文維基名單標記，目前 30 隻（2.4／3.5／4.55／5.55／6.55 各 6）。`legendary ⊂ bigFish` |
| `gig` | **魚叉尺寸**（`Small`／`Normal`／`Large`／`UNKNOWN`），203 條。只有魚叉捕魚（水下）的魚有；一般垂釣的魚沒有這個 key |
| `aquarium` | 可養進**水族箱**：`{ water: "Freshwater"｜"Saltwater", size: 1–4 }`，197 條 |
| `collectable` | **收藏品門檻值**（1–1181），147 條。有值＝這條魚可以當收藏品交付 |
| `lure` | **擬餌**（7.0 新機制）`Ambitious`（大膽擬餌）／`Modest`（謹慎擬餌），13 條 |
| `dataMissing` | 上游自標的資料缺漏，有值代表該筆條件不完整 |
| `folkloreBook` | `folklore` 對應的**傳承錄實體書**：`{ itemId, name }`，293 條。`folklore` 本身是 `GatheringSubCategory` 的 row id（12 個值），書名回查 `items.json` |

> ⚠️ **`gig`／`aquarium`／`collectable`／`lure`／`dataMissing`／`folkloreBook` 六欄「值為 null 就不寫這個 key」**。
> 多數魚這幾欄都是 null，照其他欄位那樣一律寫會讓前端要載的 `fishes.json` 多出約 120KB（+18%）。
> 前端一律用 `f.gig`／`f.aquarium` 這種存在性判斷，缺 key 與 null 等價。

**釣場（`fishing-spots.json`，355 個）**：

| 欄位 | 說明 |
|------|------|
| `name` | **台服官方繁中地名**——`FishingSpot.csv` 第 24 欄的 PlaceName row id → `out_data/places.msgpack` 的 `twPlaces`。**不可用 OpenCC 簡轉繁**（舊版這樣做，307 個裡 25 個是錯的：女巫崖→「落魔崖」、風之節點→「地場節點·風」、白銀市集→「白銀集市」…，而釣場詳情的 `/coord X Y 地名` 會把錯地名複製進遊戲） |
| `spearfishing` | `true`＝**魚叉捕魚（水下）釣場**，48 個。來源是上游 data.js 的 `SPEARFISHING_SPOTS`（另一個 section，與 `FISHING_SPOTS` 分開）＋ XIVAPI v2 `SpearfishingNotebook`（用 `GatheringPointBase` row id ＝上游 `_id` 來 join，取 PlaceName／TerritoryType／X／Y／等級）。一般垂釣釣場沒有這個 key |
| `level` | 捕魚人需求等級，目前只有魚叉釣場有（來自 `SpearfishingNotebook.GatheringLevel`） |
| `coords` | 魚叉釣場的 X/Y 是 `SpearfishingNotebook` 的 0–2048 地圖空間值，換算 `X/2048*41/c + 1`（`c = sizeFactor/100`），與 `build-island.mjs` 的 `frac→gameCoord` 同式 |
| `patch` | **沒有任何上游來源**（`patch-backfill-all.mjs` 明列 `fishing-spots` 為「無來源」）。`build-fishing.mjs` 重建時會從舊檔帶過來，否則會安靜洗掉 307 筆現有值 |

**建置**：`node scripts/build-fishing.mjs` → 接著必跑 `patch-fishing-common.mjs`（補回 ~339 條常駐普通魚，上游只有 1110 條）、`patch-fishing-multispot.mjs`（多釣場 `spots[]`＋回填 31 條上游 `location=null` 的魚）與 `patch-fish-legendary.mjs --apply`（後者漏跑不會報錯，只會安靜地把 30 隻魚皇降級成魚王）。
跑完 `validate-links.mjs` 的「fishes.spotId → fishing-spots」應為 **0 斷鏈**。

**既有資料的一次性補正**：`scripts/patch-fishing-upstream-gaps.mjs`（dry-run 預設／`--apply`／`--offline`，冪等）——2026-08-31 用它把上面這些缺角補進既有資料（48 個魚叉釣場、25 個官方地名、5 個上游欄位、傳承錄書）。`build-fishing.mjs` 已同步修好，之後重建不需要再跑它。

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

### 2.18 gardening（園藝配種）

**以「作物」為單位**（`productId` = 收成物的 itemId）。信封多帶一個 `rules` 區塊放遊戲機制常數，
供頁面的「機制速查」直接渲染——機制的**文字出處與查證記錄在 [`docs/gardening-rules.md`](../docs/gardening-rules.md)**，
改任一邊要同步另一邊。

```json
{
  "productId": 8166,
  "name": "薩維奈圓蔥",
  "nameEn": "Thavnairian Onion",
  "icon": "/i/025000/025203.png",
  "kind": "crop",
  "category": "雜貨",
  "seedId": 8183,
  "seedName": "薩維奈圓蔥種子",
  "seedNameEn": "Thavnairian Onion Seeds",
  "seedIcon": "/i/027000/027453.png",
  "seed": {
    "sources": [{ "type": "gather", "text": "園藝工 Lv.24（草場）", "gate": null, "npc": null }],
    "marketable": true,
    "crossOnly": true
  },
  "duration": 240,
  "crossBreeds": [
    { "baseSeedId": 8169, "baseSeedName": "克里耶蘿蔔種子",
      "adjacentSeedId": 7750, "adjacentSeedName": "皇家可可豆種子",
      "alsoYields": [{ "id": 4836, "name": "生薑" }] }
  ],
  "flower": null,
  "usedIn": { "count": 12, "top": [{ "id": 4593, "name": "…" }] },
  "patch": "2.3"
}
```

| 欄位 | 說明 |
|------|------|
| `productId` / `name` / `nameEn` / `icon` / `category` | 收成物。名稱與圖示取自 items.json（台服官方物品表） |
| `kind` | `crop`（作物）／`flower`（花卉，另有 `flower` 欄）／`crystal`（碎晶） |
| `seedId` / `seedName` / `seedIcon` | 種下去的那個道具（栽培用品） |
| `seed.sources` | 種子的**非市場板**取得管道（NPC 商店／採集／任務…），由 `lib/game-sources.mjs` 解析，最多 3 筆 |
| `seed.marketable` | 市場板買不買得到 |
| `seed.crossOnly` | `true` ＝除了市場板與配種之外沒有別的管道（**＝真的得自己配**）。頁面的成本模型就是以此為葉節點判準 |
| `duration` | 培育時數（小時） |
| `crossBreeds[]` | 配出**這個作物的種子**要用的組合：`baseSeed` 種在本株那格、`adjacentSeed` 種在鄰格 |
| `crossBreeds[].alsoYields` | 同一組合也可能配出的其他結果（隨機）。選填；全庫 14 組有此欄 |
| `flower` | 花卉才有：`{ species, defaultColor, colors[9] }`；每色帶 `id`／`name`／`icon`／`hex`／`pomace[]`／`rng`／`isDefault` |
| `usedIn` | 這個作物被幾個配方吃掉（由 recipes.json 推），`top` 最多 4 筆。選填 |
| `parentOf` | **這個作物的種子是哪些作物的配種父本**（productId 陣列，名稱由前端自己查）。對 48 小時那批（塞爾法特爾沙果、瓦爾醋栗…）來說這就是它們唯一的用途。選填 |
| `productSources` | **收成物自己**買不買得到／採不採得到。有的話代表「根本不必種」。⚠ 只收**可重複**的管道——薩維奈圓蔥有一筆一次性的 `quest`，收了它等於騙人。選填 |
| `minion` | 收成物是寵物時才有：`{ id, gardeningOnly }`（對回 minions.json；`gardeningOnly` ＝除了園藝沒有別條路）。全庫 6 隻，其中 4 隻只能靠園藝 |
| `useNote` | 既不是製作素材、也不是配種父本、也不是寵物，但確實有用的少數例外（薩維奈圓蔥、克拉卡蘿蔔的陸行鳥用途）。**社群來源**，出處記在 [`docs/gardening-rules.md`](../docs/gardening-rules.md)，寫在 `build-gardening.mjs` 的 `USE_NOTE` 表。選填 |
| `patch` | 物品版本（前端 `PatchGate` 用） |

信封的 `rules`：`pomace`（三種油粕，附 `buy` ＝哪裡買）、`colorOrder`／`colorHex`、
`soils`／`plainSoil`（各級附 `buy`）、`crossbreed`（判定時機、鄰接順序、產出是種子、園圃格數）、
`care`（枯萎／施肥）。

**資料來源**：Teamcraft `seeds.json`（配方與時數）＋ items.json（名稱／圖示／分類）＋
`out_data/en-items.msgpack`（英文名）＋ `lib/game-sources.mjs`（種子管道）＋ recipes.json（用途）。
**建置**：`node scripts/build-gardening.mjs --apply`（`--offline` 用快取；**直接寫 minified**，
`minify-data.mjs` 對它是 no-op，要看改了什麼請看腳本印出的摘要）。
**台服未開放規則**：無台服名者保留 `#<id>` 佔位（`patch-tw-names.mjs` 靠它在升版後補名），
**前端負責過濾**（`name` 非 `#\d+` 佔位 ＋ `PatchGate.released`）。

### 2.19 craft-actions / craft-recipes / craft-consumables（製作模擬器）

製作模擬器（`tools/crafting-sim/`）專用的三份表，由 `scripts/build-craft-sim.mjs` 一起產生。
**刻意不擴充 `recipes.json`**：那份的 `patch` 欄是 `patch-backfill-all.mjs` 事後補的，
重跑 `build-recipes.mjs` 會把它洗掉（§4.19 的反例），所以模擬需要的欄位另開一份。

#### craft-actions.json

```json
{
  "schema": "craft-actions", "count": 36,
  "levelTable": { "51": 120, "…": 0, "100": 690 },
  "hqTable": [1, 1, "…", 100],
  "data": [
    { "key": "basicSynthesis", "name": "製作", "nameEn": "Basic Synthesis",
      "ids": [100001, 100015, "…"], "nameSrc": "craft", "type": "progress",
      "level": 1, "cp": 0, "dur": 10, "eff": { "base": 100, "at": 31, "up": 120 } }
  ]
}
```

| 欄位 | 說明 |
|------|------|
| `key` | 引擎用的穩定識別字（`craft-engine.js` 的規則以此為鍵，**不要改**） |
| `name` | **台服官方名**，取自 Teamcraft `tw/tw-craft-actions.json`／`tw/tw-actions.json`。不可簡轉繁 |
| `ids` | 八個製作職各自的 action id（順序＝ jobId 8→15），用來查繁中名 |
| `type` | `progress`／`quality`／`buff`／`repair`／`cp`／`other`（決定 UI 分組與配色） |
| `level`/`cp` | 解鎖等級與基礎 CP，**由 XIVAPI CraftAction／Action sheet 校驗**（建置時不符會印警告） |
| `eff`／`effProgress` | 效率；`{base, at, up}` 表示 `at` 級後升為 `up`。**遊戲 sheet 沒有效率**，來源為 Teamcraft 模擬器（MIT） |
| `dur`／`duration`／`succ`／`comboCp`／`flags` | 耐久消耗／增益持續步數／成功率／連段折扣 CP／特殊規則旗標 |
| `desc` | **台服官方說明文**（`tw/tw-craft-descriptions`／`tw-action-descriptions`），已清掉客戶端排版標籤與條件值標記；保留換行，前端以 `white-space: pre-line` 呈現在技能浮層 |
| `levelTable` | 工匠等級 → rlvl（判斷「等級低於配方」的懲罰）；社群模擬器共用常數 |
| `hqTable` | 品質% → HQ 機率%，索引 0–100 |

#### craft-recipes.json

欄位名放在 `columns`，資料列為**陣列**（13,835 筆全展開成物件太肥）；
`rlvlTable` 是 rlvl → `[progressDivider, qualityDivider, progressModifier, qualityModifier]`。

```json
{
  "schema": "craft-recipes", "count": 13835,
  "columns": ["id", "itemId", "jobId", "lvl", "rlvl", "stars", "durability", "quality",
              "progress", "hq", "expert", "conditionsFlag", "requiredQuality",
              "craftsmanshipReq", "controlReq", "patch", "hqIngredients"],
  "rlvlTable": { "690": [170, 150, 90, 75] },
  "data": [[5618, 44104, 15, 100, 690, 0, 80, 12000, 6600, 1, 0, 15, 0, 0, 0, "7.0",
            [[36077, 1, 6000]]]]
}
```

| 欄位 | 說明 |
|------|------|
| `hq` / `expert` | 可否 HQ（0/1）／是否為「高難度配方」（官方用字） |
| `conditionsFlag` | 位元遮罩，決定這份配方會出現哪些作業狀態（一般配方＝15） |
| `requiredQuality` | 收藏品的品質門檻，0＝不是收藏品 |
| `craftsmanshipReq`／`controlReq` | 配方本身的數值門檻，未達成遊戲不讓你做 |
| `hqIngredients` | `[[itemId, 最大數量, 每個的品質貢獻], …]`，只收可 HQ 的材料 |

**只收八大製作職（jobId 8–15）**：工會工坊（`fc*`）與無人島配方不是用製作技能做的，沒有 rlvl 與除數。
**版本閘門不在建置期做**：`patch` 照樣輸出，前端用 `patch-gate.js` 依 `_meta.json` 的 gamePatch 過濾，
再加上「成品在 items-lite 查無繁中名就不顯示」。
#### craft-consumables.json

料理與藥品的加成。**加成是「百分比 ＋ 上限」兩段**，而且料理與藥品**各自從基礎值算**再相加
（不是疊加後再算），跟遊戲一致。

```json
{
  "schema": "craft-consumables", "count": 61,
  "data": [
    { "id": 44088, "name": "酸檸檬醃魚", "kind": "food", "ilvl": 720, "patch": "7.1",
      "bonuses": { "cms": [1, 4, 120, 5, 150], "cp": [1, 21, 76, 26, 96] } }
  ]
}
```

| 欄位 | 說明 |
|------|------|
| `kind` | `food`（料理）／`medicine`（藥品） |
| `bonuses` | 只收 `cms`（作業精度）／`ctl`（加工精度）／`cp` 三種；採集用的 GP／獲得力不收 |
| `bonuses.*` | `[是否百分比, NQ 值, NQ 上限, HQ 值, HQ 上限]`。百分比＝1 時值是 %，`floor(基礎值 × 值 / 100)` 後取 `min(…, 上限)` |

**查無台服繁中名的不收**（依鐵則不用英文補），`patch` 交給前端 `patch-gate.js` 過濾。
來源：Teamcraft `foods.json`／`medicines.json`（源自 `ItemFood` sheet）× `data/items.json` 的繁中名與 patch。

**建置**：`node scripts/build-craft-sim.mjs`（`--offline` 用 `out_data/cache/craft-sim/` 快取，
`--refresh` 強制重抓；三份一起產）。**改完引擎、求解器或這三份表要跑 `node scripts/validate-craft-sim.mjs`**——
它拿 Teamcraft 模擬器的官方測試案例回歸公式，確認頁面的四套內建範本仍然做得完，
並確認自動求解在同樣四組情境下解得出來、品質不輸範本、且沒排進任何靠運氣的技能。

---

### 2.20 system-unlocks（系統解鎖索引／職業與行會）

一個檔兩份清單，前端 `/tools/unlock-index/` 一次載完。

```json
{
  "schema": "system-unlocks", "count": 26, "jobCount": 42,
  "data": [{
    "key": "gold-saucer", "name": "金碟遊樂園", "tool": "/tools/cactpot/",
    "basis": "金碟入場任務；仙人微彩／幻巧戰／幻卡皆在金碟內",
    "gcVariants": true,
    "quests": [{ "id": 65970, "name": "…", "nameEn": "…", "level": 15,
                 "genre": "…", "issuer": { "id": 0, "name": "…" },
                 "at": { "mapId": 0, "mapName": "…", "x": 0, "y": 0 },
                 "prev": [{ "id": 0, "name": "…", "level": 0 }] }]
  }],
  "jobs": [{
    "id": 19, "abbr": "PLD", "name": "騎士", "nameEn": "Paladin", "kind": "job",
    "role": { "id": 186, "name": "防護職業" },
    "parent": { "id": 1, "abbr": "GLA", "name": "劍術士" },
    "requires": { "id": 1, "abbr": "GLA", "name": "劍術士", "level": 30 },
    "soulCrystal": { "id": 4542, "name": "騎士之證", "icon": "/i/026000/026003.png" },
    "quest": { "…同上" }
  }]
}
```

| 欄位 | 說明 |
|------|------|
| `data[].key` | 系統代號；也是 `?id=sys:<key>` 與 site-index 用的鍵 |
| `data[].tool` | 本站對應工具頁的站內路徑，沒有對應頁就是 `null`。`unlock-banner.js` 認的就是這欄 |
| `data[].basis` | **當初憑遊戲資料裡的什麼訊號認定它是解鎖任務**，日後複查用；頁面收在可展開的「依據」裡 |
| `data[].gcVariants` | 該系統的解鎖任務依大國防聯軍分三條（內容相同、接取地點不同），`quests` 會有 3 筆 |
| `jobs[].kind` | `"class"`＝20 個基礎職（行會任務）／`"job"`＝進階職業（`ClassJob.UnlockQuest`）|
| `jobs[].requires` | 接取條件。ARR 進階職的 `name` 是指定的基礎職；2.0 之後的職業 `name` 為 `null`＝任一戰鬥職達該等級 |
| `jobs[].parent` | 前置職業（`ClassJobParent`），指向自己時視為無前置 → `null` |
| `jobs[].soulCrystal` | 只有 `kind: "job"` 才有。生產職的「名匠之證」是另一套特職系統，**刻意不放在這裡**，放了會被誤讀成職業解鎖條件 |
| `at.mapId` | 可能是 `null`——副本／室內的實例地圖不在 `maps.json`，這時只有 `mapName`（走 `twPlaces`），座標為 `null` |

**建置**：`node scripts/build-system-unlocks.mjs --apply`。系統那半的「哪個任務解鎖哪個系統」
是人工對照表（`scripts/lib/system-unlock-map.mjs`，遊戲資料沒有這個欄位）；
職業那半的 24 個進階職**完全不靠對照表**，只有 20 個基礎職的行會任務要維護。
新增條目先用 `--find <關鍵字>` 查候選與其 `QuestParams` 訊號，確認唯一命中再寫進去。

---

### 2.21 item-sources（取得管道分片層）

`data/item-sources/` 是一個**目錄**不是單檔：36,335 件物品的取得管道依 `itemId >> 10`
切成 45 片（每片 1,024 個 id），加一份 `_index.json`。

```json
// data/item-sources/5.json
{ "schema": "item-sources", "shard": 5, "count": 610,
  "data": { "5594": [{ "t": "兌換", "d": "雜貨 · 狼印戰績 ×100", "w": "露露茨" }] } }
```

| 欄位 | 說明 |
|------|------|
| `t` | 管道類型（兌換／NPC商店／副本／採集／可製作／商城購買…）|
| `d` | 說明 |
| `w` | 地點或 NPC（可選，沒有就不寫這個欄位）|
| `map` | mapId（可選）|

欄位名刻意用單字母——整份是前端會載的，欄位名佔的位元組不比值少。
**片號由 id 直接算出**，查詢不必先載 `_index.json`；索引只給維運看（有哪些片、各片多大）。

**建置**：`node scripts/build-item-sources.mjs --apply`。
轉換規則在 `scripts/lib/obtainable.mjs`，與 `build-market-sources.mjs` 共用。
前端走 `assets/js/item-sources.js`（`ItemSources.get(id)` / `getMany(ids)` / `render(rows)`）。

**這個目錄刻意不進 `minify-data.mjs`**——它本來就是壓過的形狀。

**與 `market-sources.json` 的分工（不要合併）**：前者是「湊材料」的視角
（只收配方相關物品，但額外接了採集點座標與軍票價，市場頁整份載入）；
後者是「這是什麼、哪來的」的視角（全部物品，只有管道摘要，按片載入）。

---

### 2.22 gold-saucer（金碟獎品價目表）

```json
{ "schema": "gold-saucer", "count": 2,
  "data": [{ "key": "mgp", "id": 29, "name": "金碟幣", "count": 410,
    "items": [{ "itemId": 0, "name": "…", "icon": "/i/…", "category": "…", "patch": "…",
                "cost": 20000, "shop": "…", "npc": { "id": 0, "name": "…", "at": {…} },
                "own": { "c": "mounts", "label": "坐騎", "path": "collections/mounts/",
                         "sk": "ffxiv_mounts_owned", "k": "id:123" } }] }] }
```

| 欄位 | 說明 |
|------|------|
| `cost` | **同一件獎品在所有商店裡的最低單價**（同一件常常好幾間店都有）|
| `own` | 這件在哪本圖鑑。`sk`＝該收藏頁的 localStorage key、`k`＝該頁 `keyOf` 的輸出值 |

`own.k` **必須照各收藏頁的 `keyOf` 產生**（多數 `id:<id>`，寵物是純數字），
自己拼格式的話缺口預算會把「已有」算成「還沒有」，而畫面上看不出來。
幻卡沒有 `itemId` 欄位，走 `scripts/lib/triple-triad-map.mjs` 的可證對照。

**建置**：`node scripts/build-gold-saucer.mjs --apply`。
刻意不做變現排行——兌換品幾乎不能上市場板，見腳本檔頭。

---

### 2.23 item-names（物品四語名稱查詢分片）

`data/item-names/` 是一個**目錄**：45,546 件物品的四語名稱共 178,162 個查詢鍵，
依 `FNV-1a(正規化鍵) % 256` 切成 256 片（單片 gzip 約 15KB）＋一份 `_index.json`。

```json
// data/item-names/7.json
{ "schema": "item-names", "shard": 7, "count": 694,
  "k": { "en": { "ironingot": "黑鐵錠" }, "ja": {…}, "cn": {…}, "tw": {…} } }
```

語言分成四個子物件而不是每筆帶語言碼——178,162 個鍵各付一次欄位成本太貴。

**依「查詢鍵」分片而不是依 id**：這份是用名字查的，查之前不知道 id。
（試過片內共用名稱陣列去重，**反而更大**——雜湊分片會把同一件物品的四個鍵打散到四片，
片內沒有重複可去。詳見知識庫 §4.62。）

**建置**：`node scripts/build-item-names.mjs --apply`，
**跑完必接 `node scripts/validate-item-names.mjs`**——前端 `assets/js/item-names.js` 有一份
同樣的 `normalizeName()` 與 `shardOf()`，不一致的話「明明收錄了的東西查不到」且兩邊都不報錯（§4.63）。

這個目錄刻意不進 `minify-data.mjs`。

---

### 2.24 vendor-prices（NPC 金幣直購價）

```json
{ "schema": "vendor-prices", "count": 4641,
  "data": { "5111": { "p": 18, "n": "斯姆爾維布", "m": "利姆薩·羅敏薩上層甲板", "x": 10.66, "y": 15.21, "mi": 11 } } }
```

| 欄位 | 說明 |
|------|------|
| `p` | 單價（金幣）。同一件在多間店有賣時取**最低價** |
| `n` | 賣家 NPC 的台服名（查不到繁中名的整筆不收）|
| `m` `x` `y` `mi` | 賣家位置與 mapId（4,641 筆全都有）|

**收錄條件**：商店只收金幣、賣家至少一個沒有已知門檻（`lib/game-sources.mjs` 的 `VENDOR_GATES`）、
該 NPC 有台服名、物品可交易且有台服名。

**用途**：市場頁的 `costOf()` 拿它對材料成本封頂。
**⚠ `VENDOR_GATES` 只涵蓋 5 個部族 NPC**，軍階／主線／城市解鎖那些門檻沒有建模，
所以前端一律把價錢與賣家顯示出來讓使用者判斷，**不偷偷換數字**（知識庫 §4.64）。

**建置**：`node scripts/build-vendor-prices.mjs --apply`。

---

### 2.25 npc-shops（NPC 商店目錄，依地圖分片）

`data/npc-shops/<mapId>.json` ＋ `_index.json`。回答「我人在這張圖，附近有哪些店、賣什麼」。

```json
// _index.json
{ "schema": "npc-shops-index", "count": 89,
  "maps": [ { "mapId": 3, "map": "格里達尼亞舊街", "npcCount": 22, "shopCount": 159 } ] }

// 3.json
{ "schema": "npc-shops", "mapId": 3, "map": "格里達尼亞舊街",
  "npcs": [ { "id": 1000199, "n": "商人", "x": 10.2, "y": 11.4,
    "s": [ { "id": 262151, "n": "雜貨商人", "t": "GilShop",
            "tr": [ { "c": [[1, 16]], "g": [[4680, 1]] } ] } ] } ] }
```

| 欄位 | 說明 |
|------|------|
| `npcs[].n` `x` `y` | NPC 台服名與座標（缺任一就不收）|
| `s[].n` | 台服官方店名（`tw-locales` 的 `shops`）|
| `s[].t` | `GilShop`（金幣店）或 `SpecialShop`（兌換店）|
| `tr[].c` / `tr[].g` | 付出／獲得，各為 `[itemId, 數量]` 陣列 |
| `tr[].r` | 需要的軍階（只有軍需品店有）|

**品項只存 id，不存名字**——39,000 筆交易每筆都帶名字檔案會爆，前端查既有的 `items-market.json`。
**金幣（id 1）刻意豁免台服名鐵則**：`items.json` 與 `tw-items.msgpack` 裡它都叫 `"Gil"`，
擋掉會丟掉 16,237 筆交易（知識庫 §4.67），前端顯示「金幣」——那是我們自己的 UI 標籤，不是放行英文。

**建置**：`node scripts/build-npc-shops.mjs --apply`。

---

### 2.26 action-names（技能／狀態／特性四語查詢分片）

`data/action-names/<shard>.json`，256 片，45,046 個查詢鍵。結構與 §2.23 `item-names` **完全相同**，
分片規則（`normalizeName`＋FNV-1a `shardOf`）也共用——前端由 `assets/js/item-names.js` 的
`NameLookup.create()` 同時產出 `ItemNames` 與 `ActionNames`，兩邊的規則只有一份。

```json
{ "schema": "action-names", "shard": 0, "count": 169,
  "k": { "a": { "en": { "stoneii": "中巨岩" }, "ja": { "ストンラ": "中巨岩" } },
         "s": { "en": {} }, "t": { "en": {} } } }
```

| 分類鍵 | 內容 |
|--------|------|
| `a` | 技能（Action）。**玩家技能優先佔位**，敵人技能只補空的 |
| `s` | 狀態（Status）|
| `t` | 特性（Trait）|

**只有 en / ja 兩種語言**——Teamcraft 的 `actions.json` 沒有簡中欄位。
**玩家技能只佔 1,373/38,490**，混在一起會撞出 3,113 個同名衝突且產出看不出錯（知識庫 §4.70）。

**建置**：`node scripts/build-action-names.mjs --apply` → 必接 `node scripts/validate-item-names.mjs`。

---

### 2.27 item-source-types（取得管道位元遮罩索引）

`data/item-source-types.json`。§2.21 的分片層答得了「這一件哪來的」，但答不了
「哪些家具是 NPC 直接買得到的」——後者要把 36,335 件一次掃過，所以另存一份整表索引。

```json
{ "schema": "item-source-types",
  "types": ["採集", "兌換", "園藝", "副本", "雇員探險", "遠航探索", "寶箱/容器", "怪物掉落",
            "任務獎勵", "分解獲得", "精製獲得", "NPC商店", "可製作", "成就獎勵", "商城購買",
            "危命任務", "無人島"],
  "count": 36335,
  "d": [2, 127, 1, 127, 1, 255] }
```

| 欄位 | 說明 |
|------|------|
| `types` | 管道名稱表，**遮罩的第 n 個位元對應 `types[n]`** |
| `d` | 差分陣列 `[id 差值, 遮罩, id 差值, 遮罩…]`，長度 = `count × 2` |

**為什麼是差分陣列**：物件形式 `{ "id": mask }` gzip 後 96KB，差分陣列 **15KB**，差六倍多。
**`types` 是權威名單**，前端的篩選選項要從它長出來——寫死的話新增一種管道會從篩選裡安靜消失。
由 `build-item-sources.mjs` **同一支**產生，與分片層保證同步。

**用途**：市場頁的「🎁 取得方式」篩選。

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
