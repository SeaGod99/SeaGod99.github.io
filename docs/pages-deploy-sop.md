# 網站部署改用 GitHub Actions（SOP）

> 第二輪路線圖 `pages-deploy-via-actions`（§7-2）。2026-10-03 建好，**啟用要站主在 GitHub 設定頁按兩下**——
> 那是 repo 的管理設定，工作流程本身的權限改不到。沒啟用之前一切照舊（從 main 分支整包發佈）。

## 為什麼要換

| | 現在（從 main 分支發佈） | 改用 Actions 部署 |
|---|---|---|
| 發佈範圍 | git 追蹤的**全部**檔（約 795MB） | `scripts/build-pages-artifact.mjs` 挑出來的（約 706MB） |
| 1GB 上限的餘裕 | 約 230MB | 約 320MB（省下 89MB） |
| 機器人推送會不會部署 | 不一定（`GITHUB_TOKEN` 推送不保證觸發，週更才要補打 `pages/builds`） | 週更推送後主動 dispatch，**一定會跑** |
| 部署後確認 | 只有時尚品鑑週更會到線上看 | **每次**部署都比對線上 `build.json` 的 commit sha，對不上就開 issue |
| Jekyll | 會跑（所以需要 `.nojekyll`） | 不跑（`.nojekyll` 照樣留著，無害；切回來時還用得到） |

被排除的路徑與理由寫在 `scripts/build-pages-artifact.mjs` 的 `EXCLUDE`（`out_data/`、`scripts/`、`docs/`、
`tools/glamour/data/`、`tools/glamour/scripts/`、`*.md`、`*.bat`…）。那支有四道閘門，任何一道不過就中止、不會發佈半套網站：
必備檔都在（含底線開頭的 `_index.json`，§4.94）、`nav.js` 登記的每一頁都在、前端寫死的 `data/…json` 都在、
被排除的路徑沒有任何前端字串指向它。

## 啟用（兩步，順序不拘，兩步都做完才會開始部署）

1. **Settings → Pages → Build and deployment → Source** 改成 **GitHub Actions**。
2. **Settings → Secrets and variables → Actions → Variables 分頁 → New repository variable**：
   名稱 `PAGES_VIA_ACTIONS`、值 `true`。

做完之後：

- 到 **Actions → 部署網站（GitHub Pages）→ Run workflow** 手動跑一次，看三個 job（build／deploy／verify）都綠。
- verify 會印「✓ 線上 build.json 已是 <sha>」。打開 `https://seagod99.github.io/build.json` 也看得到。
- 之後每次推到 main 都會自動部署；時尚品鑑週更推送後會自己叫這支。

## 回復舊方式

1. Source 改回 **Deploy from a branch**，分支 `main`、資料夾 `/ (root)`。
2. 刪掉 `PAGES_VIA_ACTIONS` 變數（或改成 `false`）。

兩步都做完就回到原狀；`pages.yml` 會變回每次推送「略過」，週更也會改回補打 `pages/builds`。

## 出事時

- 部署或線上確認失敗 → 會開一張標籤 `pages-deploy-bot` 的 issue（同一件事只開一張，之後改成留言）。
  **網站這時多半停在上一版**，不會壞成白頁——Pages 只有部署成功才換版。
- 常見原因：
  - **build 失敗**：多半是閘門擋下來的（例如新頁面忘了 commit、或前端開始讀一個被排除的路徑）。照錯誤訊息改
    `EXCLUDE` 或補檔。**不要為了讓它過就把閘門拿掉**。
  - **verify 逾時**：Pages 的 CDN 偶爾很慢。到 Actions 頁再 Run workflow 一次；連續失敗就先照上面回復舊方式。
- 本機想先驗「發佈檔能不能用」：
  ```
  node scripts/build-pages-artifact.mjs --out <暫存目錄>
  MSYS_NO_PATHCONV=1 node scripts/validate-pages.mjs --serve <暫存目錄>
  ```
  第二支會用真瀏覽器開每一頁，被排除而其實要用的檔會出現在「404」清單裡。

## 新增前端會讀的檔時

- 放在既有的前端目錄（`data/`、`assets/`、`tools/<頁>/`…）就會自動被發佈，不用改任何東西。
- 如果放進了 `EXCLUDE` 裡的路徑（例如 `tools/glamour/data/`），閘門④會擋下來——那時把檔搬到前端目錄，
  而不是把整個目錄從 `EXCLUDE` 拿掉。
