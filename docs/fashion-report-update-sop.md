# 時尚品鑑推薦 — 週更操作手冊（SOP）

> **2026-07-25 大改版**：整條管線已程式化，週更從「照著十個步驟手工跑＋人工挑推薦裝」變成**跑一支腳本**。
> 本文件只留「怎麼跑、跑出問題怎麼辦」。改版的動機、推薦標準與版型設計見 [fashion-report-spec.md](fashion-report-spec.md)；
> 首跑探索的原始記錄留在 [fashion-report-workflow.md](fashion-report-workflow.md)（歷史文件，流程已被本檔取代）。

---

## 0. 什麼時候跑

一週只有兩個時間點有意義（皆為台北時間；官方是 PST 12:00 a.m.，固定 UTC-8 不套夏令時，故全年不漂移）：

| 時刻 | 發生什麼 | 該做什麼 |
|------|---------|---------|
| **週二 16:00** | 上一週收榜＋新主題與 4 提示同時揭曉（中間沒有空窗） | 等來源站更新後跑腳本 → 產出 `predicted` 版 |
| **週五 16:00** | 評分開放，社群約 1～3 小時後產出驗證解 | 傍晚後重跑腳本 → 產出 `verified` 版 |

> **「過渡期」不是遊戲造成的，是資料落後造成的。** 遊戲端週二 16:00 一刀切換；但來源站 fashionreportxiv 要幾十分鐘到幾小時才會換週。
> 這段期間腳本會**主動拒跑**（見下方錯誤訊息），前端則自動顯示「第 N 週尚未收錄」＋本週主題＋外部來源，並把上週資料降級為存檔。**不需要人工介入。**

---

## 1. 跑就對了

```bash
node scripts/build-fashion-report.mjs        # 產出 data/fashion-report.json
node scripts/validate-data.mjs               # 資料驗收（必跑）
```

腳本會自己做完這些事，全部有驗收門檻，過不了就中止不出檔：

1. 抓 `fashionreportxiv.com/api/report-state`，**拿 API 週次比對本站時鐘**決定要不要動；`dyesFresh/easy80Fresh/easy100Fresh` 三旗標全 true 才標 `verified`
2. 抓四個部位的 `/api/hint`（間隔 1 秒禮貌延遲）
3. 英文名 →`en-items.msgpack`→ itemId →`items.json`台服名（對不到就報錯中止；台服無名者標為未開放、不顯示）
4. 提示分類與主題繁中化（XIVAPI 英文表對 row → 陸服 CSV 同 row → OpenCC；**簡轉繁、非台服官方譯名**，資料檔標 `hintSource/nameSource: "cn-hant"`）
5. XIVAPI 批次查 `DyeCount`／`EquipRestriction`（可否染色、性別種族限制）
6. 逐件解析取得方式、金幣價、販賣 NPC 與座標、貨幣與門檻（全離線，走 `scripts/lib/game-sources.mjs`）
7. 接上 `data/dyes.json` 得到每個指定色的取得方式、價格與門檻
8. **解最佳化**產出「拿滿 MGP」與「滿分」兩套完整配裝表（見 spec §2）
9. 拿來源站自家的 easy80／easy100 回頭**驗算計分公式**，對不上就中止

其他旗標：`--dry-run` 只印不寫、`--offline` 用 `out_data/cache/` 的上次回應（改邏輯時反覆測用）。

---

## 2. 會遇到的錯誤與處置

| 錯誤訊息 | 意思 | 處置 |
|---|---|---|
| `來源尚未換週：API week=443，本站時鐘 week=444` | 正常的換週真空期 | **什麼都不用做**，晚點再跑。前端已自動處理 |
| `英文名對不到物品 N 件` | 來源站出現本站 `en-items.msgpack` 沒有的新裝 | 重建 `en-items.msgpack`；急用可先人工確認該件是否台服未開放 |
| `染劑對不到 data/dyes.json：「X」` | 出現新染劑或台服未實裝的色 | 跑 `node scripts/build-dyes.mjs` 更新；仍對不到＝台服未實裝，需人工判斷 |
| `計分公式驗算失敗：easy100 依公式只有 N 分` | 本週有公式沒涵蓋的規則（例如罕見的 +9 提示） | **不要硬改資料**，先人工確認實際規則，再更新腳本的 `SCORING` 常數 |

---

## 3. 跨週不變、不用每週跑的資料

這三份跑一次就好，只有在遊戲改版或發現錯誤時才重建：

```bash
node scripts/build-dyes.mjs             # data/dyes.json     全 114 支染劑的顏色／取得／價格／門檻
node scripts/build-fashion-fillers.mjs  # data/fashion-fillers.json  每部位最便宜的可染填充裝
node scripts/build-fashion-themes.mjs   # data/fashion-themes.json   主題預查表（目前到 week 525）
```

---

## 4. 驗收

```bash
node scripts/validate-data.mjs          # 必跑
```

再開 `tools/fashion-report/index.html` 確認：週狀態列、兩套方案的成本摘要與門檻警示、染色表色票與取得方式、完整清單的篩選排序都正常，無 console error。

> 沒有瀏覽器可用時，可用 DOM stub 跑一次 render 回歸（做法見 spec §5「驗收」）。

---

## 5. 歷史：這支腳本取代了什麼

改版前每週要手動跑 9 個步驟，其中**步驟 8「挑推薦裝」是純人工判斷**，導致每週產出的形狀都不一樣（440 給 4 件、441～443 給 3 件＋一段人工散文）。
舊流程還有兩個實質錯誤，已由新標準修正：

- **染劑成本完全沒算**。week 443 舊頁寫「省事 80 分・全程 116 金幣」，實際上它要染的萄乾棕只有南薩納蘭的蜥蜴人族雜用商人賣（**需部族聲望**）；100 分方案要的東洲藍是**刻木匠製作限定且不可交易**。新標準把兩者都算進去後，同一週的最省解變成 **146 金幣、0 支染劑、0 門檻**（80 分線）與 **472 金幣、0 支染劑、0 門檻**（100 分線）。
- **取得方式改用站內離線資料，不再逐件打 Garland Tools**。國際服 7.5 已把單色染劑整併下架，Garland／XIVAPI／英文 wiki 現在都查不到那些染劑的取得方式，對停在 7.15 的台服而言等於失效來源（詳見 `scripts/lib/game-sources.mjs` 檔頭）。
