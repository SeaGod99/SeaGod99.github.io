# FF14 時尚配裝網站

Final Fantasy XIV（繁中版）的精選幻化配裝展示網站，同時整合來自 [Mirapri](https://mirapri.com/) 的社群投稿。

- `index.html`：主網站（卡片列表 + 彈窗，含逐件染色、篩選、裝備反查）
- `review.html`：待檢視清單（把異常／需人工確認的套裝挑出來，逐套處理）

> 圖示說明：**★ = 你（人）要動手做的**、**🤖 = 雙擊 .bat 後自動跑的**、**🔧 = 進階／偶爾才用**。

---

## 快速開始

平常只要雙擊這兩個 `.bat`，不必打任何指令：

| 檔案 | 用途 | 執行時間 |
|------|------|---------|
| ★ `本地重建.bat` | 編輯精選套裝後重建網頁資料 | 數秒 |
| ★ `完整更新.bat` | 抓 Mirapri 新投稿並完整重建 | 視新圖量，數分鐘～數十分鐘（需網路＋Ollama） |

完成後直接開啟（或重新整理）`index.html` 即可看到最新內容。

> Windows 的 `python` 是假捷徑（會靜默結束），手動下指令時請一律用 **`py`**。

---

## 我要做什麼？（情境對照）

先看你想幹嘛，對照右邊要做的事就好：

| 你的情況 | ★ 你要做的 | 背後會跑什麼 |
|----------|-----------|-------------|
| 改了精選套裝 `data/curated_outfits.json` | 雙擊 `本地重建.bat` | 染色→重建空殼→build_site→健檢 |
| 想抓 Mirapri 新投稿、更新整站 | 雙擊 `完整更新.bat` | 下方「完整更新的 9 步」全跑 |
| 想用 OCR 重讀、提升辨識度 | `py scripts\reocr_originals.py --all` 後跑 `本地重建.bat` + `build_review.py` | 用**來源原圖**重 OCR（比壓縮圖清晰） |
| 想整理異常配裝 | 開 `review.html` 逐套標記，再跑 `build_site.py` | 套用你的移除／保留決定 |
| 遊戲改版、想更新道具庫 | 先更新 **repo 主庫**（根目錄 `node scripts/build-items.mjs` 等），再 `py scripts\check_maindb.py` | 本圖鑑不自帶資料庫，一律讀主庫 |
| 想檢查精選資料對不對 | `py scripts\verify_data.py` | 比對名稱／等級／職業／取得方式 vs DB |

---

## 完整流程（每一步在做什麼）

### A. 主要執行檔（總控）

| 執行檔 | 功能 | 怎麼執行 |
|--------|------|---------|
| ★ `本地重建.bat` | 改完 `data/curated_outfits.json` 後，重建網頁資料（不抓網路、不 OCR，數秒） | 雙擊　或　`py scripts\update_all.py local` |
| ★ `完整更新.bat` | 抓新投稿 → 壓圖 → 縮圖 → OCR → 染色 → 重建 → build → 健檢（需網路＋Ollama） | 雙擊　或　`py scripts\update_all.py full` |

`update_all.py` 是總控；不帶參數執行（`py scripts\update_all.py`）會跳選單讓你選「完整／本地」。

### B. 「完整更新」的 9 個子步驟（🤖 自動依序跑）

| 順序 | 腳本 | 在做什麼 |
|:----:|------|---------|
| 1 | `check_maindb.py` | 確認 repo 主庫（`data/`、`out_data/`）齊全可讀；缺檔就中止，不會硬跑 |
| 2 | `pipeline.py all` | 從 Mirapri 抓新投稿、下載圖，補繁中名稱／部位／取得方式 |
| 3 | `compress_mirapri.py` | 把新圖原地壓成長邊 1100／q76（壓過的自動跳過） |
| 4 | `make_thumbs.py` | 產生卡片縮圖（已有的自動跳過） |
| 5 | `ocr_check.py --target mirapri --mode all` | 用 Ollama 視覺模型讀圖上的裝備名＋染色（已 OCR 過的吃快取） |
| 6 | `apply_dyes.py` | OCR 結果 → 逐件染色 + 整套 fallback + 圖上可見裝備清單 |
| 7 | `reconstruct_empty.py` | 空殼套裝用 OCR+DB 重建裝備（部位／繁中／染色／取得方式） |
| 8 | `build_site.py` | 所有 `data/*.json` → `curated_outfits.js`／`mirapri_outfits.js` |
| 9 | `health_check.py` | 健檢：缺圖、缺繁中、重複編號、JSON 是否同步 |

> 「本地重建」只跑第 6、7、8、9 步（不抓網路、不 OCR）。
> 任一步出錯都能單獨重跑，例如 `py scripts\build_site.py`。

### C. OCR／染色 進階流程（🔧 需 Ollama）

需先裝 [Ollama](https://ollama.com/) 並 `ollama pull qwen2.5vl:7b`。

| 執行 | 在做什麼 / 產出 |
|------|----------------|
| 🔧 `py scripts\ocr_check.py` | OCR 比對裝備名、抽染色、找抓漏（不帶參數＝互動選單；吃快取可隨時中斷續跑）。產出 `data\OCR檢查報告.md`、`data\ocr_check_result.json`、`data\ocr_cache.json` |
| 🔧 `py scripts\reocr_originals.py --all` | **用「來源原圖」重 OCR 待檢視清單**。本地圖被壓成 1100/q76，OCR 一直讀壓縮圖；來源站原圖是 1280 新鮮 JPEG，**更清晰**。原圖「多認出件數／字更準」才寫回快取，變少則保留舊的不回退。實測待檢視清單一次少了約 18% |
| 🔧 `py scripts\apply_dyes.py` | OCR 快取 → 三份：`mirapri_piece_dyes.json`（逐件染色，彈窗逐列顯示）、`mirapri_dyes.json`（整套 fallback）、`mirapri_visible.json`（圖上實際可見裝備，用來濾替代款） |
| 🔧 `py scripts\reconstruct_empty.py` | 空殼套裝（OCR 抓不到的）用 OCR+DB 重建裝備。產出 `mirapri_reconstructed.json` + `重建報告.md` |
| 🔧 `py scripts\build_site.py` | 重建網頁資料：填逐件染色、**濾掉圖上沒畫的替代裝備**、併入重建、套用移除決定 |
| 🔧 `py scripts\resolve_ocr.py` | OCR 字串對回 DB 正式值（抓漏候選／繁中校正）→ `OCR解析建議.md` + `ocr_resolve.json`。**只報告、不改 `curated_outfits.json`**，人工審核後再套 |
| 🔧 `py scripts\build_review.py` | 把異常／待人工檢視的套裝彙整成 `review_data.js`（給 `review.html`）。分類見下方 |

> **OCR 讀原圖 vs 壓縮圖**：`compress_mirapri.py` 會把圖原地壓掉，所以平常 `ocr_check.py` 讀的是壓縮圖。
> 想榨出最佳辨識度時，用 `reocr_originals.py` 重抓原圖重讀（對**同一批原圖**再跑是 temp=0 的確定性 no-op，沒意義；只在有新圖或想一次性提升品質時用）。

`review.html` 的分類：

| 分類 | 意思 |
|------|------|
| 空殼(0件) | 圖上抓不到任何裝備（多半要移除或重抓） |
| 過少(1-3件) | 件數偏少（可能簡配或抓漏） |
| 過多(>7件) | 件數過多（多半含替代款／飾品，待修剪） |
| OCR漏讀 | OCR 只認出 <4 件、靠保留完整清單才湊滿 |
| 名稱可疑 | OCR 讀到但對不上記錄裝備 |
| 可能漏抓 | OCR 讀到、解析到 DB、但不在現有清單 |
| 重建待核 | 由 OCR+DB 自動重建的空殼套，待人工核對 |

### D. 道具庫更新（🔧 遊戲改版後）

本圖鑑 2026-07-28 起**不再自帶資料庫**，物品／取得方式／配方全部讀 repo 主庫
（`data/` 與 `out_data/`），入口是 `scripts/maindb.py`。所以改版後要做的是：

| 執行（在 **repo 根目錄**） | 在做什麼 |
|---------------------------|---------|
| `node scripts/build-items.mjs` | 重建物品主表（繁中名權威＝`out_data/tw-items.msgpack`） |
| `node scripts/build-item-categories.mjs` | 重建分類對照表（`categoryId` 靠它） |
| `node scripts/validate-data.mjs` | 主庫驗收 |
| 🔧 `py tools\glamour\scripts\check_maindb.py` | 回到本圖鑑，確認主庫齊全可讀（不改檔） |

> 為什麼不再抓 cycleapple：那份的繁中名有 570 筆是錯的（多為簡中用詞），
> 詳見 [CLAUDE.md](CLAUDE.md) 開頭與 `scripts/maindb.py` 檔頭。

### E. 隨時可單獨跑的檢查

| 執行 | 在做什麼 / 產出 |
|------|----------------|
| `py scripts\health_check.py` | 缺圖、缺繁中、重複編號、JSON 是否同步 |
| `py scripts\verify_data.py` | 精選套裝資料正確性（名稱／等級／職業／取得方式 vs DB）→ `data\驗證報告.md` |

---

## 所有腳本一覽（每個功能是做甚麼的）

| 腳本 | 類別 | 功能 | 主要產出 |
|------|------|------|---------|
| `update_all.py` | 🤖 總控 | local／full 兩模式，依序呼叫下面的子步驟 | — |
| `pipeline.py` | 🤖 完整更新 | Mirapri 抓投稿＋下載圖＋補繁中／部位／取得方式 | `all_outfits_enriched.json` |
| `compress_mirapri.py` | 🤖 完整更新 | mirapri 圖原地壓縮（1100/q76，防重壓、保留 mtime） | 覆蓋 `配裝圖片/mirapri/` |
| `make_thumbs.py` | 🤖 完整更新 | 產生卡片縮圖（寬 480） | `配裝圖片/縮圖/` |
| `ocr_check.py` | 🔧 OCR | Ollama 視覺模型 OCR（v2 逐件 item↔dye），比對現有資料 | `ocr_cache.json`、`ocr_check_result.json`、`OCR檢查報告.md` |
| `reocr_originals.py` | 🔧 OCR | 用**來源原圖**重 OCR 待檢視清單（比壓縮圖清晰），多認出才寫回 | 更新 `ocr_cache.json` |
| `apply_dyes.py` | 🤖 / 🔧 | OCR 快取 → 逐件染色＋整套 fallback＋可見裝備 | `mirapri_piece_dyes.json`、`mirapri_dyes.json`、`mirapri_visible.json` |
| `reconstruct_empty.py` | 🤖 / 🔧 | 空殼套裝用 OCR+DB 重建裝備 | `mirapri_reconstructed.json`、`重建報告.md` |
| `build_site.py` | 🤖 核心 | `data/*.json` → 網頁 JS（填染色、濾替代款、併重建、套用移除） | `curated_outfits.js`、`mirapri_outfits.js` |
| `build_review.py` | 🔧 | 彙整異常／待檢視套裝 | `review_data.js`（給 `review.html`） |
| `resolve_ocr.py` | 🔧 報告 | OCR 字串對回 DB 正式值（抓漏候選／繁中校正），**只報告不改資料** | `OCR解析建議.md`、`ocr_resolve.json` |
| `maindb.py` | ⚙️ 內部 lib | **唯一資料入口**：讀 repo 主庫 `data/`＋`out_data/`，轉成本專案格式 | 被幾乎所有腳本引用 |
| `check_maindb.py` | ✅ 檢查 | 主庫齊不齊全、msgpack 解不解得開、副本名解析率 | 終端報告 |
| `health_check.py` | ✅ 檢查 | 缺圖／缺繁中／重複編號／JSON 同步 | 終端報告 |
| `verify_data.py` | ✅ 檢查 | 精選資料正確性 vs DB | `驗證報告.md` |
| `itemdb.py` | ⚙️ 內部 lib | DB 索引：norm(日文)→id→繁中/英/日；`resolve()` 解析 OCR 字串 | 被 resolve_ocr／reconstruct／reocr 引用 |
| `ab_resolution.py` | ⚙️ 實驗（已結案） | A/B 測試 OCR 解析度與模型。**結論已內建**：`ocr_check.py` 的 `OCR_MAX_EDGE=1280`（實測 1568/2048 零增益）。留著是為了日後換模型時能重跑同一套比較 | 終端報告 |
| `build_ocr_aliases.py` | ⚙️ 一次性（**目前跑不動**） | 從 Claude 確認結果學 Ollama 的系統性誤讀。它要的輸入 `data/ocr_cache.bak_claude_*.json` 已不存在，所以現在跑會直接說「無法學習」。**產出 `data/ocr_aliases.json`（46KB）仍在用**（itemdb.py 的修正表），要重建得先留一份 Claude 校對後的 ocr_cache 備份 | `data/ocr_aliases.json` |
| `patch_curated_sources.py` | 🔧 資料校正 | 精選「待確認／空白」取得方式補成 DB 查得到的答案（dry-run 預設） | 就地改 `data/curated_outfits.json` |
| `maindb.py` | ⚙️ 內部 lib | **唯一資料入口**：讀 repo 主庫 `data/`＋`out_data/` | 被幾乎所有腳本引用 |

---

## 新增精選套裝

1. ★ 將套裝圖片放入 `配裝圖片/`，命名為 `{編號}-{套裝名稱}.jpe`（例：`38-星月旅人.jpe`）
2. ★ 編輯 `data/curated_outfits.json`，仿照現有格式在陣列末尾加入新套裝物件
3. ★ 雙擊 `本地重建.bat`

### JSON 範例

```json
{
  "type": "curated",
  "id": "38",
  "name": "星月旅人",
  "color": "藏青 × 銀",
  "image": "配裝圖片/38-星月旅人.jpe",
  "note": "",
  "gender": "female",
  "race": "hyur",
  "pieces": [
    {
      "slot": "頭部", "zh": "繁中名稱", "en": "English Name", "ja": "日本語名",
      "dye1": "—", "dye2": "—",
      "source": "🛒 NPC 商店", "patch": "7.0",
      "lv": "1", "job": "全職業"
    }
  ]
}
```

---

## 專案結構

```
FF14時尚配裝/
├── index.html              # 網站主頁（直接用瀏覽器開啟）
├── review.html             # 待檢視清單（異常配裝逐套處理）
├── curated_outfits.js      # 精選套裝資料（由 build_site.py 產生）
├── mirapri_outfits.js      # 社群套裝資料（由 build_site.py 產生）
├── 本地重建.bat             # ★ 改完 JSON 後執行
├── 完整更新.bat             # ★ 抓新 Mirapri 資料時執行
│
├── data/
│   ├── curated_outfits.json      # ★ 精選套裝唯一資料來源（直接編輯這份）
│   ├── all_outfits_enriched.json # pipeline 產出，社群資料來源
│   ├── ocr_cache.json            # OCR 累積快取（reocr_originals 會更新）
│   ├── mirapri_piece_dyes.json   # 逐件染色
│   ├── mirapri_dyes.json         # 整套染色 fallback
│   ├── mirapri_visible.json      # 圖上可見裝備（濾替代款用）
│   ├── mirapri_reconstructed.json# 空殼重建結果
│   └── review_decisions.json     # 人工對異常配裝的移除／保留決定
│
├── scripts/                  # 所有 Python 腳本（見上方「所有腳本一覽」）
│   ├── update_all.py         # 總控（.bat 呼叫的對象）
│   ├── pipeline.py / compress_mirapri.py / make_thumbs.py
│   ├── ocr_check.py / reocr_originals.py / apply_dyes.py
│   ├── reconstruct_empty.py / resolve_ocr.py / itemdb.py
│   ├── build_site.py / build_review.py
│   ├── maindb.py / check_maindb.py
│   └── health_check.py / verify_data.py / ab_resolution.py
│
├── 配裝圖片/                 # 套裝圖片
│   ├── mirapri/             # 社群投稿圖（已壓縮）
│   └── 縮圖/                 # 卡片縮圖（自動產生）
│
└──（沒有 資料來源/）           # 道具資料庫改讀 repo 主庫：
                              #   ../../data/{items,item-categories,recipes,dungeons,monsters}.json
                              #   ../../out_data/{obtainable-methods,npcs,places,ja-items,en-items}.msgpack
                              #   一律經由 scripts/maindb.py 存取
```

---

## 取得方式 Emoji 對照

| Emoji | 來源類型 |
|-------|---------|
| 🗡️ | 副本（迷宮挑戰、討伐殲滅戰等） |
| 🔶 | 巧手橙票 |
| 🟣 | 製作紫票 |
| 🛒 | NPC 商店 |
| 📋 | 任務獎勵 |
| 🔨 | 製作 |
| 🎲 | 金碟遊樂園 MGP |
| ⚔️ | PvP |
| 💎 | Mog Station（付費） |
| 🗓️ | 季節活動 |
| 🪙 | 其他代幣 |

---

## 前置需求

- Python 3.9 以上（指令為 `py`）
- `py -m pip install pillow msgpack requests --break-system-packages`
- OCR 功能另需 [Ollama](https://ollama.com/) + `ollama pull qwen2.5vl:7b`
  （`qwen2.5:7b-instruct` 是純文字版，**不能**讀圖；要 `qwen2.5vl`）
