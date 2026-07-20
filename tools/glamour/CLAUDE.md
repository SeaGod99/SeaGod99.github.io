# FF14 時尚配裝專案說明

本文件說明新增套裝圖片後，如何更新 `data/curated_outfits.json` 並重建網頁資料的完整流程。

---

## 執行環境注意

本機（Windows）的 `python` 指令是 Microsoft Store 假捷徑（執行會靜默結束），
請一律改用 `py`，例如：`py scripts\update_all.py`、`py -m pip install pillow msgpack`。

## 專案結構

```
FF14時尚配裝/
├── index.html            # 主要展示頁面（「配裝｜官方套裝」雙檢視 + 卡片列表 + 彈出視窗）
├── curated_outfits.js    # 精選套裝資料（由 build_site.py 從 MD 產生，頁面立即載入）
├── mirapri_outfits.js    # 社群套裝資料（由 build_site.py 產生，頁面延遲載入）
├── official_sets.js      # 官方套裝資料（由 build_site.py 產生，社群載完後延遲載入）
├── 配裝圖片/             # 套裝圖片，命名格式：{編號}-{套裝名}.jpe
│   ├── 縮圖/             # 卡片縮圖（make_thumbs.py 產生，寬 640px／q78）
│   ├── icons/            # 官方套裝裝備 icon（fetch_icons.py 下載，40px PNG）
│   └── 官方套裝/         # 官方套裝示意照（fetch_set_photos.py 從 consolegameswiki 抓，640px JPG）
├── scripts/
│   ├── update_all.py     # ★ 一鍵更新總控（full / local 兩種模式）
│   ├── build_site.py     # data/curated_outfits.json → curated/mirapri_outfits.js + official_sets.js
│   │                     #   並用 item_fallback 名稱精確比對把 iid/dye/mb（徽章）蓋進每件裝備
│   ├── build_sets.py     # ★ 官方套裝資料（見「官方套裝圖鑑」一節）→ data/official_sets.json
│   ├── build_item_sources.py # ★ 裝備ID → 完整取得方式清單 → item_sources.js（見「完整取得方式」）
│   ├── backfill_curated_iid.py # 精選套裝道具 ID 回填（名稱唯一才填；--apply 才寫入）
│   ├── fetch_icons.py    # 官方套裝所需裝備 icon 批次下載（可續傳、已有跳過、失敗清單重試）
│   ├── fetch_set_photos.py # ★ 官方套裝示意照：consolegameswiki 模特照下載（見「官方示意照」）
│   ├── health_check.py   # 資料健檢（缺圖、缺繁中、重複編號、官方套裝 ID/icon/收錄準則…）
│   ├── make_thumbs.py    # 產生縮圖（可給秒數上限分批跑）
│   ├── compress_mirapri.py # 壓縮 mirapri 原圖（長邊1100/q76，防重複壓縮）
│   ├── verify_data.py    # curated 資料正確性檢查（名稱/等級/職業/取得方式 vs DB），輸出 data/驗證報告.md
│   ├── pipeline.py       # Mirapri 抓取 + enrich 流程
│   ├── ocr_check.py      # ★ 用 Ollama 視覺模型對圖做 OCR（v2 逐件 item↔dye），比對現有資料（見「OCR 檢查流程」）
│   ├── apply_dyes.py     # OCR 結果 → 逐件染色 mirapri_piece_dyes.json + 整套 fallback + 可見裝備
│   ├── itemdb.py         # FF14 道具資料庫索引（norm(日文)→id→繁中/英/日；resolve 解析 OCR 字串，
│   │                     #   本機 DB 對不到時自動查 item_fallback_multilang.json 救回 7.x 新裝備）
│   ├── build_item_fallback.py # 多語系裝備備選庫（XIVAPI＋本機 DB → item_fallback_multilang.json；
│   │                     #   含 7.x 日英名/部位/patch，繁中 DB 未收錄時 resolve 與重建靠它）
│   ├── resolve_ocr.py    # OCR 字串對回資料庫正式值（抓漏候選/繁中校正）→ 報告，不改 curated
│   ├── ab_resolution.py  # Phase 4：在 OCR 失敗集上 A/B 解析度與模型（決定 max_edge）
│   ├── reconstruct_empty.py # 空殼套裝用 OCR+DB 重建裝備（部位/繁中/染色/取得方式）→ mirapri_reconstructed.json
│   └── update_db.py      # ★ 從 cycleapple/ffxiv-item-search-tc 抓最新繁中道具 DB（先 --check 比版本，--apply 才覆蓋）
├── data/
│   ├── curated_outfits.json       # ★ 精選套裝唯一資料來源（直接編輯這份）
│   ├── all_outfits_enriched.json  # pipeline 產出，build_site.py 的社群資料來源
│   ├── dye_names_ja.json          # 官方染色日文名白名單（ocr_check.py 降噪用）
│   ├── dye_ja_to_zh.json          # 日文染色官方名 → 繁中名對照（apply_dyes.py 用）
│   ├── mirapri_piece_dyes.json    # apply_dyes.py 產出：{outfit_id: {裝備日文名: [繁中染色]}}（v2 逐件，彈窗逐列顯示）
│   ├── mirapri_dyes.json          # apply_dyes.py 產出：{outfit_id: [繁中染色]}（整套 fallback，未有逐件時用）
│   ├── mirapri_visible.json       # apply_dyes.py 產出：{outfit_id: [圖上可見裝備]}，build_site.py 用來濾掉替代裝備
│   ├── official_sets.json         # build_sets.py 產出：官方套裝（兩層混合，v1 準則收錄約 2000 套）
│   ├── set_photos.json            # fetch_set_photos.py 產出：官方套裝 wiki 示意照對應表（含 miss 記錄）
│   ├── xivapi_sets_cache.json     # build_sets.py 的 XIVAPI 快取（離線重建靠它；--fetch 刷新）
│   ├── 套裝報告.md                 # build_sets.py 產出：分組統計＋同鍵衝突組＋收錄抽樣（調校用）
│   ├── item_fallback_multilang.json # build_item_fallback.py 產出：全裝備多語名+部位+patch
│   │                              #   ＋dye(染色欄數)/mb(可交易)/icon/ilvl/cjc；本地 DB 無 DyeCount，
│   │                              #   XIVAPI 是全件唯一來源，徽章與官方套裝分組都靠這份
│   └── OCR無解清單.md              # 重建時「無解」的件（附套裝 id/圖）→ 待 Claude 視覺複查補 aliases
└── 資料來源/
    ├── items.json       # 繁中道具資料庫（主要來源）
    ├── en-items.msgpack # 英文道具名稱（msgpack 格式）
    ├── ja-items.msgpack # 日文道具名稱（msgpack 格式）
    ├── zh-items.msgpack # 繁中道具名稱（msgpack 格式，備用）
    ├── sources.json     # 道具取得來源資料庫
    └── recipes.json     # 製作配方資料庫
```

> **資料庫來源**：`資料來源/`（items.json / sources.json / recipes.json / items-index.json / 語言 msgpack）
> 來自開源繁中工具站 **cycleapple/ffxiv-item-search-tc** 的 `public/data/`（繁中名上游為 ffxiv-datamining-tc；
> 已驗證本專案 items.json 與其 byte 相同）。注意 item-names-multi.json 的 `cn` 欄是「簡中」，繁中名一律取 items.json 的 `name`。
> 改版後更新繁中：`py scripts\update_db.py`（比對線上版本）→ `--apply`（下載覆蓋＋重產 ja/en/zh msgpack）。
> ⚠ 上游需等社群 datamine + cycleapple 重建，**伺服器更新當天通常還抓不到新版**。

---

## 套裝命名規則

- 編號：兩位數字，補零（01, 02, … 34, 35…）
- 圖片檔名：`{編號}-{套裝名}.jpe`，例如 `35-新套裝名稱.jpe`
- 套裝名稱：中文名稱，反映外觀主題或色彩，例如「緋紅蒸汽」「白雪魔法少女」
- 色彩描述：用 `×` 分隔主色與配色，例如 `深紅 × 黑`

---

## 裝備欄位（部位）

| 欄位名 | 說明 |
|--------|------|
| 頭部 | 頭盔、帽子、髮飾等 |
| 上身 | 上衣、外袍等 |
| 手部 | 手套、護腕等 |
| 腿部 | 長褲、裙子等 |
| 腳部 | 靴子、鞋子等 |
| 武器 | 武器（非戰鬥套裝通常省略） |

特殊情況：套裝 33 有 6 個子套裝（33a–33f），每個子套裝各有獨立裝備欄位。

---

## 裝備名稱查詢

### JSON 欄位格式（data/curated_outfits.json）

每套是一個物件：

```json
{
  "type": "curated",
  "id": "42",
  "name": "套裝名稱",
  "color": "主色 × 配色",
  "image": "配裝圖片/42-套裝名稱.jpe",
  "note": "",
  "gender": "female",
  "race": "aura",
  "pieces": [
    {
      "slot": "頭部", "zh": "繁中名稱", "en": "English Name", "ja": "日本語名",
      "dye1": "—", "dye2": "—",
      "source": "🗡️副本名稱（迷宮挑戰）", "patch": "7.0",
      "lv": "1", "job": "全職業", "iid": 12345
    }
  ]
}
```

`st` 與 `tags` 不必填——build_site.py 會從 `source` 的 emoji 與 `job` 自動推導。

**`iid`（道具 ID）要填**：這是每件裝備的權威識別，徽章（可染／可交易）與
`item_sources.js` 的完整取得方式都靠它外連。以前不填、由 build_site.py 每次用
「名稱精確且唯一」現猜——猜不到不會報錯，該件就靜默掉 iid 連帶掉徽章與取得方式
（改版撞同名或官方改譯名就會踩到）。現在 500/500 件都已回填，`stamp_badges()` 改為
**有 iid 就以 iid 為準**，只有沒 id 的新件才退回名稱比對。

**`job`（職業限制）不要手填**：由 `iid` 的 `cjc`（ClassJobCategory）推導，
`apply_db_fields()`／`job_from_cjc()` 建置時算好。整職能→群組名（治療職業、近戰職業…）、
子集→列具體職業（cjc 103「ROG NIN VPR」＝忍者、劍蛇師）、全戰鬥→全職業、
Disciple of the Hand/Land→製作／採集職業。手填常錯：自創詞「偵察職業」、把整職能寫成
單一職業、只列部分職業、給專武填錯職能（月讀太刀填「盾衛職業」實為暗黑騎士專武）。

**`zh`／`ja`／`en`／`patch`／`lv` 不要手填**：這五個欄位客觀可由 `iid` 推導，
`build_site.py` 的 `apply_db_fields()` 每次建置都會以 DB 重算（`上身①/②` 標記保留）。
填錯了也會被蓋掉，不必手動維護。2026-07-20 稽核出 211 處人工輸入誤差就是這樣清掉的
（版本一律填 7.0、等級留在預設 1、日文名濁點長音抄錯、**自編繁中名**）。
一次性校正舊資料：`py scripts\normalize_curated_from_db.py --apply`（dry-run 預設）。
手填的主觀欄位不受影響：`source`（取得方式）、`dye1`／`dye2`（該套實際染色）、
`job`、`gender`／`race`、套裝名稱與色彩描述。

### 查詢流程

**步驟 1：從圖片辨識裝備**
圖片超過 256KB 時，需先縮圖再讀取：
```python
from PIL import Image
img = Image.open(path)
img.thumbnail((800, 800))
img.save('/tmp/thumb.jpg', 'JPEG', quality=70)
```

**步驟 2：查詢繁中名稱（ZH）**
`資料來源/items.json` 結構：`{"items": {"道具ID": {"name": "繁中名稱", ...}}}`
```python
import json
with open('資料來源/items.json', encoding='utf-8') as f:
    items = json.load(f)['items']
# 以名稱建立反查表
name_map = {v['name']: v for v in items.values()}
```

**步驟 3：查詢英文名稱（EN）**
`資料來源/en-items.msgpack` 結構：`{"道具ID": {"en": "English Name"}}`
```python
import msgpack
with open('資料來源/en-items.msgpack', 'rb') as f:
    en_data = msgpack.unpackb(f.read(), raw=False)
# en_data: {str_id: {"en": "name"}}
en_name_by_id = {k: v['en'] for k, v in en_data.items() if isinstance(v, dict)}
```

**步驟 4：查詢日文名稱（JA）**
`資料來源/ja-items.msgpack` 結構同 EN，欄位為 `"ja"`。

**注意事項：**
- 繁中版資料庫（items.json）的 ID 上限約 45590，更新版本的道具可能找不到繁中名稱，留空即可
- 以 `(outfit編號, 部位)` 的位置對應方式比名稱比對更可靠

---

## 取得方式查詢

### 資料來源

- `資料來源/sources.json`：道具取得來源，以道具 ID 為 key
- `資料來源/recipes.json`：製作配方，包含 `classJobLevel` 欄位

### 取得方式格式（Emoji 前綴）

`source` 字串的 emoji 前綴決定 st 分類（12 桶，build_site.py 的 `ST_TAGS`／
index.html 的 `ST_TAG_SET` 兩邊要同步）。**同一套資料 curated／mirapri／official
共用這張表**，所以官方套裝的「🪙兌換：巧手橙票」與精選的「🔶巧手橙票」會落在同一桶。

| Emoji | 類型 | st 標籤 |
|-------|------|---------|
| 🗡️ | 副本（迷宮挑戰、討伐殲滅戰、聯隊突擊、深層迷宮等） | `raid` |
| 🗺️ | 探索型內容（優雷卡／博茲雅）——寶圖除外，見下方關鍵字 | `raid` |
| 📋 | 任務獎勵（單獨出現才算；與 🛒 合併顯示時 🛒 在前 → `npc`） | `quest` |
| 🛒 | NPC 商店 / 失物管理人 / 金幣購買 | `npc` |
| 🪙 | 代幣兌換（神典石、狩獵戰利品、軍票、部族貨幣等） | `token` |
| 🔶 | 巧手橙票（製作職業神典石） | `scrip` |
| 🟣 | 製作紫票 | `scrip` |
| 🔨 | 製作／採集／分解 | `craft` |
| 🎲 | 金碟遊樂園 MGP | `gs` |
| ⚔️ | PvP（狼印戰績 / 戰利水晶 / 排位） | `pvp` |
| 💎 | Mog Station（付費商城）／老玩家獎勵 | `store` |
| 🗓️ 💒 | 季節活動 | `event` |
| 🎁 | 來源對不出來的幻化套裝箱 | `other` |

**關鍵字覆寫（`ST_KEYWORDS`，比 emoji 優先，由上而下第一個命中就算數）**——
同一個 emoji 底下要再分家的：

| 順位 | 關鍵字 | st | 為什麼 |
|------|--------|-----|--------|
| 1 | 寶圖 | `other` | 🗺️ 但不是副本。**必須排第一**：箱子名會帶別的玩法字眼<br>（「🗺️寶圖（無人島特殊配給貨箱）」），排在 special 後面就會被誤判 |
| 2 | 伊修加德重建／無人島／宇宙探索／友好部族 | `special` | 🛒 但不是一般商人，是各自成套的長期玩法 |
| 3 | 成就 | `other` | 🪙成就獎勵不是兌換 |
| 4 | `Gil×` | `npc` | 🪙Gil×N ＝ 拿金幣買，等同商店 |
| 5 | 橙票／紫票／白票／黃票／綠票 | `scrip` | 官方套裝寫成「🪙兌換：巧手橙票」，靠票名歸回 scrip。<br>只認「{顏色}票」——「拉札漢的三類票據」是部族貨幣，留 `token` |
| 6 | 幻化套裝箱 | `other` | wiki 對不出 source-type 的殘餘（約 35 套） |

無 emoji 也無關鍵字（例：「待確認」）→ `other`。

⚠ 別加「優雷卡／南方博茲雅」之類的地名關鍵字：🗺️／🗡️ emoji 本來就歸 raid，
加了反而會把「🛒義軍整備兵（南方博茲雅戰線）」這種正牌 NPC 商人拖進 raid。
改 `ST_KEYWORDS` 後請跑一次全 source 字串的稽核（1102 條），確認沒有規則互相搶單。

⚠ **社群套（mirapri）的 st 一律在 build_site.py 重算**，不吃
`all_outfits_enriched.json` 帶來的舊值——那是 pipeline.py 用當年的分類算的，
改 `ST_TAGS` 時不會跟著更新。曾因此讓社群的 🪙 停在 `other`、精選的 🪙 卻是 `token`，
同一顆按鈕在兩個檢視行為不一致。

### 職業篩選

職業 tag（healer/tank/caster/melee/pranged/crafter）之外另有 **`alljob`（👥 全職業）**：
整套每一件的 `job` 都是「全職業」＝沒有職業限制，誰都能穿。判定三邊一致
（build_site.py `is_all_job()`／index.html `isAllJob()`／官方套裝在 `transform_sets()`
以 cjc 涵蓋全戰鬥職業或 XIVAPI `All Classes` 認定）。`alljob` 不列入 `CARD_TAGS`——
官方 454/1971、社群 1320/6533 都是全職業，上卡等於每張卡都掛同一個標。

### 副本類型對應

```python
INST_TYPE = {
    1: '試煉', 2: '迷宮挑戰', 3: '高難度討伐',
    4: '討伐歼滅戰', 5: '聯隊突擊', 6: '絕境戰',
    22: '聯隊突擊', 28: '絕境戰'   # 28=絕（絕巴哈姆特/絕龍詩…）
}
```

### 特殊情況

- **NPC 兌換升級**：`specialshop` 的 `currencyItemId` 指向裝備道具（categoryId 1–49）＝拿前一階裝備向 NPC 兌換升級版，顯示為「🛒{NPC}（{地點}）」（無 NPC 資料時「🛒裝備升級兌換」）。**注意：這不是任何副本，更沒有「幻洋奇境」這個地名——舊版誤標已修正。**
- **PvP 貨幣**：ID 25（狼印戰績）、36656、40479 顯示為「⚔️PvP …」
- **MGP**：ID 29、41629 顯示為「🎲金碟遊樂園 MGP×…」

---

## 裝備限制查詢

### 資料來源

`資料來源/items.json` 中每個道具的 `equipStats` 欄位：
```json
{
  "equipLevel": 80,
  "equipStats": {
    "classJobCategoryName": "CNJ WHM SCH AST SGE"
  }
}
```

### 職業分組邏輯

個別職業縮寫合併為群組名稱：

| 群組名稱 | 進階職業 | 排除基礎職業 |
|---------|---------|------------|
| 治療職業 | WHM SCH AST SGE | CNJ |
| 盾衛職業 | PLD WAR DRK GNB | GLA MRD |
| 法系職業 | BLM SMN RDM BLU PCT | THM ACN |
| 遠程物理職業 | BRD MCH DNC | ARC |
| 近戰職業 | MNK DRG NIN SAM RPR VPR | PGL LNC ROG |

所有進階戰鬥職業都在 → 顯示「全職業」

### 限制欄位格式

- 有等級限制：`Lv.80 治療職業`
- 無特定職業：`全職業`
- 製作職業：`布衣師`、`製革師` 等（以 `classJobCategoryName` 直接換算）

### 注意：繁中版跨職業投影限制

**繁中版目前尚未開放跨職業幻化（Glamour Plate 跨職業功能）**。因此：
- 某套裝若含有特定職業限制的裝備（如盾衛職業的靴子用在治療職業套裝），在繁中版無法實際幻化
- 裝備限制欄位仍顯示 DB 的正確資料，供參考

---

## 新增套裝的完整流程

### 1. 準備圖片

將圖片放入 `配裝圖片/` 資料夾，命名為 `{新編號}-{套裝名稱}.jpe`。

### 2. 在 JSON 新增套裝物件

複製 `data/curated_outfits.json` 中現有套裝的格式，新增於陣列末尾，
依「JSON 欄位格式」一節填寫（id 兩位數補零、image 對應實際檔名）。

### 3. 查詢名稱

1. 讀取圖片，從外觀辨識各部位裝備
2. 在 `資料來源/items.json` 搜尋繁中名稱
3. 透過道具 ID 在 `en-items.msgpack` 取得英文名稱
4. 透過道具 ID 在 `ja-items.msgpack` 取得日文名稱
5. **把道具 ID 填進 `iid` 欄**（查名稱時本來就會拿到）。不想手填就先留空，
   之後跑 `py scripts\backfill_curated_iid.py --apply` 用名稱回填——但**名稱撞名或
   官方改譯名時它會拒填並列進報告**，屆時仍要人工補。`health_check.py` 會擋缺 id 的件。

### 4. 查詢取得方式與限制

使用 `資料來源/sources.json` 和 `recipes.json` 查詢（格式參考「取得方式格式」一節），結果填入 JSON 的 `source` 欄位。

### 5. 重建資料檔（不再手動改 HTML）

```bash
python scripts/update_all.py local   # 一鍵：重建資料檔 + 健檢（改完 JSON 後用，數秒完成）
```

完整更新（抓 Mirapri 新資料 → 壓縮新圖 → 縮圖 → 重建 → 健檢）：

```bash
python scripts/update_all.py
```

（也可單獨跑 build_site.py / health_check.py / make_thumbs.py / compress_mirapri.py）

- 性別（gender）／種族（race）直接填在套裝物件上，未填會被歸入「未指定」
- 篩選 tag（healer/tank/…＋event/pvp/store/raid/craft/npc/scrip/gs/other）由 build_site.py 從 `job`、`source`
  自動推導（社群套由前端 annotate() 依同一邏輯推導）；卡片上只顯示 CARD_TAGS（職業＋event/pvp/store/raid），
  其餘 st 僅供「取得方式」按鈕篩選。改 ST_TAGS 記得同步 index.html 的 ST_TAG_SET
- `update_all.py` 已涵蓋 pipeline → 壓縮 → 縮圖 → build → 健檢 的完整順序
- 精選原圖可刪（縮圖留著即可）：彈窗載不到原圖會自動改用縮圖，健檢也只在「原圖與縮圖都不存在」時警告
- 舊的 `配裝清單.md` 已歸檔於 `archive/`，僅供查閱，不再是資料來源

### 前端功能備註

- **延遲載入**：index.html 先載 157KB 的精選資料立即顯示，8MB 社群資料背景載入
- **縮圖**：卡片優先載 `配裝圖片/縮圖/`，失敗自動回退原圖
- **繁中版可幻化**：套裝全部裝備都有繁中名稱才算（zh 欄空白 = 繁中版未實裝）
- **多選篩選**：取得方式／職業可複選，群組內 OR、群組間 AND，社群套裝也適用
- **裝備反查**：彈窗中點裝備名 = 以該裝備名搜尋全部套裝
- **複製清單**：彈窗右上「📋 複製清單」複製部位＋繁中名＋染色
- **染色色票**：DYE_COLORS 表（index.html 內），新增染色名請順手補近似色碼

---

## 官方套裝圖鑑（official sets）

「📖 官方套裝」檢視回答「遊戲裡有哪些整套裝備」，套裝資料全部自建；
示意照另從 consolegameswiki 抓官方模特照（見「官方示意照」小節，這是唯一的第三方來源）。

### 資料層（build_sets.py，兩層混合）

- **第一層（權威）**：XIVAPI v2 `MirageStoreSetItem`——row_id＝幻化套裝箱道具 ID，
  Head/Body/… 欄＝各部位道具 ID。涵蓋商城/活動/特典套裝箱（約 1,080 套）。
  套裝 ID `mirage:{row_id}`（遊戲原生，永久穩定）。空列（~89）與 row 0 排除。
  ⚠ XIVAPI v2 sheet 必須「指名 fields 參數」才回資料，預設回空物件；
  `after` 參數只吃無號整數（首頁請求不帶 after）。
- **第二層（啟發式）**：sources.json 分組副本/兌換/任務/商店裝。
  分組鍵＝(來源簽名, ClassJobCategory ID, ilvl)——必含職業分類，否則同副本多職能套會黏住。
  來源簽名：inst:{副本名排序}／shop:cur{貨幣ID}／quest:{ID}／gc／npc:{NPC名排序}。
  同鍵撞出重複可見部位（如三大軍團色違）→ 整組進衝突桶不硬拆，記錄於 data/套裝報告.md。
- **v1 收錄準則**：套內含上身＋可見件（頭/上身/手/腿/腳）≥2；跨層去重（啟發式 ⊆ 官方 → 砍啟發式）。
- 「擁有」逐件勾選追蹤已整組移除（使用者不用；星號收藏 favs 保留）。
- **取得方式**：啟發式套用 sources.json（兌換會帶貨幣名；PvP 貨幣→⚔️、MGP→🎲、
  Gil→🛒金幣購買、貨幣是裝備→🛒裝備升級兌換）；幻化套裝箱在 sources.json 完全查不到
  （0/1078），改用 wiki `source-type`/`obtain-by`（見「官方示意照」，WIKI_STYPE_LABEL
  對照表在 build_site.py），對不出來的 35 套維持「🎁幻化套裝箱」。
- **逐件取得細項**：build_sets.py `fmt_piece_source()` 把每件的 sources.json 條目
  格式化成「🪙貨幣×價格（NPC｜地點）」「🗡️副本名（類型）」等（去重取前兩條，
  存 piece 的 `src` 欄），彈窗裝備名下方以 `.item-src` 樣式顯示；約 10,068/11,082 件有資料。

### 屬性徽章（可染/可交易）

- `DyeCount`（染色欄數 0-2）**本地 items.json 沒有**，唯一來源是 XIVAPI——由
  build_item_fallback.py 全件掃描帶回（同時帶 ItemSearchCategory→mb、Icon、LevelItem、cjc）。
- build_site.py 用「名稱精確且唯一」比對把 iid/dye/mb 蓋進 curated/mirapri 每件裝備
  （同名不同屬性＝放棄蓋章，寧缺勿錯）；前端 chips 顯示 🎨×n／可交易／擁有／📖所屬套裝。
- ⚠ EquipRestriction 不能當「Viera/Hrothgar 頭部顯示」訊號（那在 EST 模型表，XIVAPI 沒有），
  此徽章已否決，勿再嘗試。

### 官方示意照（fetch_set_photos.py，consolegameswiki）

- 來源：ffxiv.consolegameswiki.com（MediaWiki API），每套抓一張全身模特照的
  640px 縮圖 → `配裝圖片/官方套裝/{套裝ID安全化}.jpg`，對應表 `data/set_photos.json`
  （`{set_id: {img, page, file, who}}`；對不到記 `{miss: 原因}`，重試加 `--retry-miss`）。
- 對應方式：mirage 套「英文名＝wiki 頁名」直查（命中 ~97%）；啟發式套拿一件可見裝備
  查單品頁 wikitext 的 `set-name` → 家族頁，檔名須同時含套裝名頭字＋職能字才採用（寧缺勿錯）。
- 挑圖順位：`{頁名} Female.*` → `{頁名} Male.*` → `{頁名}N.*`（gallery）→ 職能圖
  （頁名任一實義字＋職能字；Augmented 頁的圖常不帶 Augmented 前綴）；
  都對不上再用裝備英文名交叉比對：共同**字尾**（Attire of the Behemoth King ↔
  Helm of the Behemoth King；圖檔名可能省略 of/the）→ 共同**字首**＋attire/set 泛字
  （Templar's attire ↔ Templar's Haubergeon）→ **詞庫比對**（檔名實義詞 ⊆ 裝備名＋頁名，
  且帶本套職能/群組字 heavy/war/magic/tank/healer/caster…，由 cjc 推得）→
  **職業名**（AF 頁 Dancer af1/Black Mage5，數字取頁面眾數防 navbox 混世代；含匠職）→
  上身裝備全名。⚠ 共同字首/字尾只用可見防具算——武器名（Rainmaker）會破壞字首。
  `…icon1.png` 等一律視為雜訊排除（曾誤抓過裝備 icon）；
  職能字比對一律整字（'aiming' 是 'maiming' 子字串，用 in 會誤判）。
- **第二來源 Gamer Escape**（[D] 段，consolegameswiki 沒圖才用）：逐件模型圖
  `Model-{裝備英文名}-Female-Hyur.png`（男性限定裝改 Male；GE 標題 `[F]`→`(F)`、`#` 拿掉），
  拿「上身」單件全身照當示意，快取 `src:"ge"`、前端標「上身單件模型圖（gamerescape）」。
  ⚠ GE 的 images 清單含紅鏈（引用了但沒上傳），要用 imageinfo 驗證檔案真的存在。
  覆蓋率：1970/1971（僅 7.5 新套 Zero's Luminary 兩站都還沒圖，改版後 --retry-miss 補）。
- build_site.py `attach_wiki_photos()`：wiki 照優先當 `img`（`imgSrc:"wiki"`），
  站內配裝照（attach_set_photos）只補沒 wiki 照的套；前端據 imgSrc 顯示
  「📖 官方外觀」或「👤 示意（N 件吻合）」。wiki 照已是 640px，thumbOf() 直接用原檔。
- 可續傳：已解析的吃 `set_photos.json` 快取、圖檔已在就跳過；`--force` 重新解析、
  `--limit N` 分批。⚠ 單品頁 wikitext 順帶有 `display-on-viera/hrothgar` 欄位
  （XIVAPI 沒有的 EST 資訊），日後想做該徽章可從這裡取。
- 同腳本第 [C] 段另抓 mirage 套裝頁 Outfit infobox 的 `source-type`＋`obtain-by`
  （活動名/Online Store/`{{i|副本名}}`）存進 set_photos.json → build_site.py
  `wiki_source_label()` 換掉籠統的「🎁幻化套裝箱」。改解析邏輯後把快取裡的
  stype/obtain/noinfo 欄清掉重跑即可（頁面 wikitext 會重抓，約 30 個請求）。

### 更新流程

```
py scripts\update_all.py           # full 模式已含：多語裝備庫 → 官方套裝(--fetch) → icon → 示意照 → 重建 → 健檢
py scripts\update_all.py local     # 離線重建（build_sets 吃 xivapi_sets_cache.json，不打網路）
py scripts\build_sets.py --fetch   # 單獨刷新官方套裝（改版後）
py scripts\fetch_icons.py          # 單獨補 icon（可續傳；--limit N 分批）
py scripts\fetch_set_photos.py     # 單獨補官方示意照（可續傳；--retry-miss 重試對不到的）
```

改版後順序：`update_db.py --apply`（繁中 DB）→ `build_item_fallback.py`（新裝備＋徽章）→
`build_sets.py --fetch` → `fetch_icons.py` → `fetch_set_photos.py` → `build_site.py` →
**`build_item_sources.py`**（吃三份前端 js，必須最後跑）。

### 完整取得方式（item_sources.js）

**每件裝備在三份資料檔裡只留一種來源**——`pipeline.py` 的 `_best()` 取優先度最高那個、
`build_sets.py` 的 `fmt_piece_source()` 取前兩條且一件掉多副本時只寫第一個副本名。
結果約四成裝備的其他取法根本沒進前端，用取得方式篩選會「拿得到卻找不到」。

修法是**外連**而非複製（`mirapri_outfits.js` 已 10MB）：`build_item_sources.py` 掃三份
前端 js 用到的裝備 ID（curated/mirapri 是 `iid`、官方套裝是 `id`），對 sources.json
＋recipes.json 產生 `item_sources.js`：

```js
const _ITEM_SOURCES = { k: [來源字串…], i: { 裝備ID: [k 的索引…] } };  // 792 種 / 11721 件 / 191KB
```

- 字串是**正規化來源鍵**：只有 emoji ＋ 來源名，**不含價格、NPC 地點、副本類型**
  （`🗡️水妖幻園多恩美格禁園`、`🪙亞拉戈詩學神典石`、`🛒葉川`）。這樣同一來源在官方套裝
  （「🗡️副本掉落：X」）與配裝（「🗡️X（迷宮挑戰）」）兩種寫法不會變成兩個對不起來的選項。
- 一件掉多個副本時**每個副本名各自成鍵**（不再是「等N處」），這是漏最多的一類。
- `instanceNames` 有些是英文（7.x 新副本，繁中 DB 未收）→ 共用 `build_site.duty_zh()` 翻成
  台服官方名，與官方套裝來源對齊。
- 前端 `pieceSrcKeys()` 優先查這張表，查不到（幻化套裝箱、商城／活動套等 sources.json 沒有的）
  才用 `srcKeyOf()` 把顯示字串正規化當退路；`entrySrcKeys()` 取整套聯集並快取在 `_sk`
  （`SK_GEN` 在表載入後 +1 讓快取重算）。篩選、搜尋、彈窗「取得方式總覽」都吃這份。
- **重建任何一份前端 js 後都要重跑這支**，否則新裝備查不到來源（前端會安靜地退回單一來源）。

### 前端（index.html）

- navbar「👗 配裝｜📖 官方套裝」切換；官方套裝檢視隱藏性別/種族篩選列。
- 「擁有」勾選追蹤（含備份/匯入工具列）已整組移除；星號收藏 favs（localStorage
  `ff14_favs`）保留。舊的 `ff14_owned_items` localStorage 資料留著不動、無 UI 讀取。
- 彈窗「染色／交易」欄：dye 無資料留空（不誤標「不可染」）、可染 🎨×n／不可染、
  可交易／不可交易兩態都明示。
- 配裝彈窗每件裝備的「📖所屬套裝」chip 可跳到官方套裝彈窗（等 Bootstrap hide 動畫完再開，
  否則 show 會被吃掉）；官方套裝彈窗的裝備名反向跳回配裝搜尋。

## OCR 檢查流程（Ollama）

用 Ollama 視覺模型對配裝圖做 OCR，讀出圖上的「日文裝備名 + 染色名」，
跟現有資料比對，找出可能抓錯／抓漏的部位，並補抓資料缺的染色資訊。
mirapri 圖本身有裝備名標籤，所以 OCR 用來「驗證」既有抓取結果；
上傳的遊戲截圖（含裝備名）也能用同一流程辨識。

### 前置

1. 本機跑著 Ollama，並下載視覺模型（CJK OCR 最佳）：

   ```
   ollama pull qwen2.5vl:7b      # VRAM 不足可改 qwen2.5vl:3b
   ```

   注意：`qwen2.5:7b-instruct` 是純文字版，**不能**讀圖，要 `qwen2.5vl`（vl）。
2. 安裝套件：`py -m pip install requests pillow --break-system-packages`

### 用法

**不帶參數 = 互動選單**（推薦給手動操作）：

```
py scripts\ocr_check.py
```

會逐步問：要檢查哪些圖、範圍（all/missing/confirmed）、數量上限、是否重跑。
全部直接 Enter＝`mirapri` + `all` + 不限（＝全部跑，吃快取續跑）。

也可直接帶參數（給排程／批次用）：

```
py scripts\ocr_check.py --target mirapri  --mode missing  --limit 50
py scripts\ocr_check.py --target curated  --mode confirmed
py scripts\ocr_check.py --target uploads  --images "C:\路徑\新截圖"
py scripts\ocr_check.py --target mirapri  --id <outfit_id>  --force
```

- `--target`：`mirapri`／`curated`／`uploads`（尚未進庫的圖）／`all`
- `--mode`（決定要看「哪些套」，比對範圍一律是整套）：
  - `missing`：只看「還有部位沒填取得方法」的套（待補的）
  - `confirmed`：只看「取得方法都填好」的套（改版復查名稱用）
  - `all`：全部
- `--limit N`：最多處理 N 套（大量圖時分批跑）
- `--force`：忽略快取重新 OCR
- `--self-test`：不呼叫 Ollama，用假 OCR 驗證流程能跑

### OCR 能做 / 不能做（重要）

- 能：① 驗證圖上有畫的裝備名　② 抽染色　③ 找抓漏。
- 種族（race）：曾試過讓 OCR 看角色外觀判種族，但配裝圖的頭飾會干擾（鹿角/角造型帽誤判成 aura、帽子蓋住真耳朵），準度不足已移除；種族維持手動填。
- **不能讀「取得方法（source）」**——圖上沒這資訊，source 仍要靠 sources.json／手動。
- 比對「整套有畫出來的裝備」，不是只比未填 source 的部位，命中率才反映真實 OCR 準度。
  飾品／武器等圖上常沒畫的部位歸 `not_shown`，不列入命中率、不算需確認。

### 已 OCR 過的會跳過

- `data/ocr_cache.json` 記錄每張圖的原始 OCR 結果（以檔案修改時間+大小為憑），
  同一張圖沒變就用快取、不重跑（要重跑加 `--force`）。改了降噪/比對邏輯後直接重跑，
  會吃快取、瞬間重算，不必重新 OCR。

### 自動降噪

腳本對 OCR 結果做四項清理，讓報告更乾淨：

- 比對前先去掉資料裡重複的同名部位（避免同一條報好幾遍）
- 把黏在裝備名後面的染色切出來（例：「メイドブルマ スートブラック」→ 裝備名 + 染色）
- 用 `data/dye_names_ja.json`（官方 146 色）過濾假染色，並把 OCR 錯字校回官方名
  （例：スーツブラック→スートブラック、スノーホワイト→スノウホワイト）
- 「資料有但 OCR 沒讀到」依相似度分兩類：`not_shown`（圖上多半沒擺，耳飾／武器常見，低優先）
  與 `maybe_wrong`（名稱可能有出入，需確認）。純 not_shown 不算需確認

> `data/dye_names_ja.json` 由 items.json（categoryId 55 染料）+ ja-items.msgpack 產生，
> 缺檔時腳本照樣可跑，只是不過濾染色。

### 輸出（給人看 + 給 Claude 確認）

- `data/OCR檢查報告.md`：開頭有總命中率（圖上有畫的名稱驗證 hit/shown），
  逐套分「需確認」與「全部吻合」。需確認再細分：名稱可能不符、抓漏、可補染色、
  圖上沒畫（<sub> 低優先）。每套標 `驗證 hit/shown`。
- `data/ocr_check_result.json`：結構化結果，含全域 `verify_hit/verify_shown`，
  每套 `diff.verify`、每個 missing 帶 `likely`（not_shown／maybe_wrong），給 Claude 逐項確認用。

### 種族代碼與官方名稱（重新確認過）

| code | 繁中 | EN | code | 繁中 | EN |
|------|------|----|------|------|----|
| hyur | 人族 | Hyur | aura | 敖龍族 | Au Ra |
| elezen | 精靈族 | Elezen | hrothgar | 硌獅族 | Hrothgar |
| lalafell | 拉拉菲爾族 | Lalafell | viera | 維埃拉族 | Viera |
| miqote | 貓魅族 | Miqo'te | roegadyn | 魯加族 | Roegadyn |

> Hrothgar 舊資料誤寫成「赫羅斯加族」（音譯），已更正為官方「硌獅族」（index.html 的篩選按鈕與 RACE_ZH）。

### 把 OCR 結果寫回網站（apply_dyes.py）

`apply_dyes.py` 讀 `data/ocr_cache.json`（累積所有 OCR 過的圖）產出三份，build_site.py 會用：

1. `data/mirapri_piece_dyes.json` — **逐件染色** `{outfit_id: {裝備日文名: [繁中染色]}}`：
   OCR v2 的 pieces 已把「裝備名↔它下面的染色」配對好，apply_dyes 再用 best_match 把每件
   染色掛到該套記錄裝備上 → 彈窗**逐列顯示** dye1/dye2（比照精選套裝）。
2. `data/mirapri_dyes.json` — 整套繁中染色 `{outfit_id: [繁中染色]}`，當 **fallback**：
   尚未重跑成 v2（無逐件資料）的套，彈窗底部仍顯示「使用染色」整套清單。
3. `data/mirapri_visible.json` — 每套「圖上實際畫出來」的裝備（= OCR 有讀到的）。
   build_site.py 用它**濾掉替代裝備**：Mirapri 投稿常在同配方附替代款，原始清單會比圖片多；
   過濾後彈窗清單只剩圖上實際穿的。

> OCR 輸出格式版本 `OCR_SCHEMA_VER=2`：快取每筆帶 `ver` 與 `pieces`；`ver<2`（舊扁平）視為
> 過期、即使圖片未變也會重跑。改 prompt 後用 `--mode all` 即可全量遷移（resumable）。
> 縮圖長邊 `OCR_MAX_EDGE`（預設 1280；A/B 實測 1568/2048 零增益，故維持 1280）。

```
py scripts\ocr_check.py     # 1. 跑/吃快取，產生 v2 OCR 結果（選單一路 Enter＝全部）
py scripts\apply_dyes.py    # 2. 快取 → mirapri_piece_dyes.json + mirapri_dyes.json + mirapri_visible.json
py scripts\build_site.py    # 3. 填逐件染色、濾掉替代裝備，重建 mirapri_outfits.js
py scripts\resolve_ocr.py   # （選用）OCR 字串對回 DB 正式值 → data/OCR解析建議.md（人工審後再套）
```

注意：過濾只對「有 OCR 過且至少認出 1 件」的套生效，沒 OCR 的套原樣保留以免誤刪；
另外若某件其實有穿但 OCR 沒讀到（例如耳飾太小），會被一起隱藏——這是「直接隱藏」策略的已知取捨。

### 後續校正

OCR 可能有錯字或幻覺，報告／JSON 出來後，可請 Claude 把 OCR 名稱比對
`資料來源/items.json`、`ja-items.msgpack` 校正，再把確認好的 source／染色寫回
`data/curated_outfits.json`，最後照「新增套裝的完整流程」跑 `update_all.py local` 重建。

## 輔助腳本位置

腳本儲存於 Claude 的工作資料夾（`/outputs/`），每次新對話後路徑可能改變，但可請 Claude 重新生成。

| 腳本 | 功能 |
|------|------|
| `lookup_sources.py` | 查詢所有裝備的取得方式，輸出 `source_results.json` |

（舊的 `update_md_sources.py`、`update_html_final2.py`、`add_job_tags.py` 已不需要：
資料改由 `data/curated_outfits.json` 直接維護，tag 由 build_site.py 自動推導。）

---

## 常見問題

**道具在 DB 裡找不到繁中名稱**  
→ 繁中版尚未更新到該 patch，留空即可，英文名稱仍可正常查詢。

**取得方式顯示「待確認」**  
→ `sources.json` 中無此道具來源（通常是更新 patch 或付費商城道具）。

**Mog Station 道具的 st 為何是 `store` 而非 `other`**  
→ `源:💎Mog Station` 開頭的自動對應 `store`，付費內容獨立分類。

**腳本中的 msgpack 套件**  
```bash
pip install msgpack --break-system-packages
```
