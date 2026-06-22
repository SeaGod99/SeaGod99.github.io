# FF14 時尚配裝網站

Final Fantasy XIV（繁中版）的精選幻化配裝展示網站，同時整合來自 [Mirapri](https://mirapri.com/) 的社群投稿。

## 快速開始

雙擊下列 .bat 檔案即可執行，不需要輸入任何指令：

| 檔案 | 用途 | 執行時間 |
|------|------|---------|
| `本地重建.bat` | 編輯精選套裝後重建網頁資料 | 數秒 |
| `完整更新.bat` | 抓取 Mirapri 新投稿並完整重建 | 1～10 分鐘（需網路） |

完成後直接開啟（或重新整理）`index.html` 即可看到最新內容。

---

## 所有執行檔與執行順序

平常只要雙擊兩個 `.bat`（見上方「快速開始」）就夠了——它們背後會自動依正確順序呼叫下面的 Python 腳本。想手動執行或了解流程時，參考本節。

> Windows 的 `python` 是假捷徑，請一律用 **`py`**。

### 一、主要執行檔（平常用這兩個就好）

| 執行檔 | 功能 | 怎麼執行 |
|--------|------|---------|
| `本地重建.bat` | 改完 `data/curated_outfits.json` 後，重建網頁資料 + 健檢（數秒） | 雙擊　或　`py scripts\update_all.py local` |
| `完整更新.bat` | 抓 Mirapri 新投稿 → 壓圖 → 縮圖 → 重建 → 健檢（需網路，1～10 分） | 雙擊　或　`py scripts\update_all.py full` |

`update_all.py` 是總控腳本；不帶參數執行（`py scripts\update_all.py`）會跳選單讓你選「完整／本地」。

### 二、總控背後的子步驟（通常不用單獨跑）

「完整更新」會**依序**自動執行下列 5 步；「本地重建」只跑第 4、5 步：

| 順序 | 腳本 | 功能 |
|:----:|------|------|
| 1 | `pipeline.py` | 從 Mirapri 抓新投稿、下載圖，補繁中名稱／部位／取得方式 |
| 2 | `compress_mirapri.py` | 壓縮新下載的圖（壓過的自動跳過） |
| 3 | `make_thumbs.py` | 產生卡片縮圖（已有的自動跳過） |
| 4 | `build_site.py` | `data/*.json` → `curated_outfits.js`／`mirapri_outfits.js`（並併入染色） |
| 5 | `health_check.py` | 健檢：缺圖、缺繁中、重複編號、資料是否同步 |

> 任一步若出錯可單獨重跑，例如 `py scripts\build_site.py`。

### 三、OCR 染色流程（選用，需 Ollama）

用視覺模型讀配裝圖上的裝備名與染色，驗證抓取、補染色。需先裝 [Ollama](https://ollama.com/) 並 `ollama pull qwen2.5vl:7b`。**依序**跑：

| 順序 | 執行 | 功能 / 產出 |
|:----:|------|------|
| 1 | `py scripts\ocr_check.py` | OCR 比對裝備名、抽染色、找抓漏（跳選單；吃快取可隨時中斷續跑）。產出 `data\OCR檢查報告.md`、`data\ocr_check_result.json` |
| 2 | `py scripts\apply_dyes.py` | 由 OCR 結果產出兩份：`data\mirapri_dyes.json`（每套繁中染色）、`data\mirapri_visible.json`（每套圖上實際可見的裝備） |
| 3 | `py scripts\build_site.py` | 重建網頁資料：併入染色，並**濾掉圖上沒畫的替代裝備**，讓清單與圖片一致 |

跑完重整 `index.html`，社群套裝彈窗就會顯示「使用染色」，且裝備清單只剩圖上實際穿的。
（Mirapri 投稿常附「替代裝備」，所以原始清單會比圖片多；此流程用 OCR 判斷實際穿了哪些。）

### 四、隨時可單獨跑的檢查

| 執行 | 功能 / 產出 |
|------|------|
| `py scripts\verify_data.py` | 檢查精選套裝資料正確性（名稱／等級／職業／取得方式 vs 資料庫），輸出 `data\驗證報告.md` |

### 我該跑哪個？（情境對照）

| 你做了什麼 | 該執行 |
|------------|--------|
| 改了精選套裝 `data/curated_outfits.json` | `本地重建.bat` |
| 想抓 Mirapri 新投稿 | `完整更新.bat` |
| 想用 OCR 驗證裝備名 / 補染色 | `ocr_check.py` → `apply_dyes.py` → `build_site.py` |
| 想檢查精選資料對不對 | `verify_data.py` |

---

## 新增精選套裝

1. 將套裝圖片放入 `配裝圖片/`，命名為 `{編號}-{套裝名稱}.jpe`（例：`38-星月旅人.jpe`）
2. 編輯 `data/curated_outfits.json`，仿照現有格式在陣列末尾加入新套裝物件
3. 雙擊 **`本地重建.bat`**

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
├── curated_outfits.js      # 精選套裝資料（由 build_site.py 產生）
├── mirapri_outfits.js      # 社群套裝資料（由 build_site.py 產生）
├── 本地重建.bat             # ★ 改完 JSON 後執行
├── 完整更新.bat             # ★ 抓新 Mirapri 資料時執行
│
├── data/
│   └── curated_outfits.json  # ★ 精選套裝唯一資料來源（直接編輯這份）
│
├── scripts/                  # 所有 Python 腳本
│   ├── update_all.py         # 總控腳本（.bat 呼叫的對象）
│   ├── pipeline.py           # Mirapri 抓取 + 資料補全
│   ├── build_site.py         # JSON → JS 轉換
│   ├── health_check.py       # 資料健檢
│   ├── make_thumbs.py        # 產生卡片縮圖
│   ├── compress_mirapri.py   # 壓縮 Mirapri 原圖
│   ├── ocr_check.py          # OCR 驗證裝備名稱（需 Ollama）
│   ├── apply_dyes.py         # OCR 染色資料寫回
│   └── verify_data.py        # 精選套裝資料正確性驗證
│
├── 配裝圖片/                 # 精選套裝圖片
│   └── 縮圖/                 # 卡片縮圖（自動產生）
│
└── 資料來源/                 # FF14 道具資料庫（唯讀）
    ├── items.json            # 繁中道具名稱
    ├── en-items.msgpack      # 英文道具名稱
    ├── ja-items.msgpack      # 日文道具名稱
    ├── sources.json          # 取得來源
    └── recipes.json          # 製作配方
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
- `pip install pillow msgpack --break-system-packages`
- OCR 功能另需 [Ollama](https://ollama.com/) + `ollama pull qwen2.5vl:7b`
