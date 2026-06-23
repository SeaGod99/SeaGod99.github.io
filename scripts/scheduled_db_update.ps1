# scheduled_db_update.ps1 —— 給 Windows 工作排程器每週執行。
# 流程：update_db.py --check → 有新版(exit 10)就自動 --apply + reconstruct + build_site → 通知。
# 註冊方式見檔尾註解，或 README。

$ErrorActionPreference = "Stop"
$proj = Split-Path -Parent $PSScriptRoot          # 專案根目錄
Set-Location $proj
$log = Join-Path $proj "data\db_update.log"
$enc = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Tee-Object -FilePath $log -Append }

function Notify($title, $msg) {
  try {
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $t = $tpl.GetElementsByTagName("text")
    $t.Item(0).AppendChild($tpl.CreateTextNode($title)) | Out-Null
    $t.Item(1).AppendChild($tpl.CreateTextNode($msg)) | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($tpl)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("FF14配裝").Show($toast)
  } catch { Log "（toast 通知失敗：$_）" }
}

Log "=== 檢查繁中 DB 更新 ==="
py scripts\update_db.py --check 2>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE

if ($code -eq 10) {
  Log "偵測到新版 → 自動更新中…"
  py scripts\update_db.py --apply 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { Log "✗ update_db --apply 失敗"; Notify "FF14 配裝" "DB 更新失敗，請看 db_update.log"; exit 1 }
  py scripts\reconstruct_empty.py 2>&1 | Tee-Object -FilePath $log -Append
  py scripts\build_site.py 2>&1 | Tee-Object -FilePath $log -Append
  Log "✓ 自動更新 + 重建完成"
  Notify "FF14 配裝" "繁中 DB 已更新並重建完成，請開網站／檢視待核清單。"
}
elseif ($code -eq 0) {
  Log "無新版，結束。"
}
else {
  Log "✗ 檢查失敗（exit $code）"
  Notify "FF14 配裝" "繁中 DB 檢查失敗（網路？），請看 db_update.log"
}

# ── 一次性註冊（PowerShell，視窗不需系統管理員；每週一 10:00）──
#   schtasks /Create /TN "FF14繁中DB週檢" /SC WEEKLY /D MON /ST 10:00 /F `
#     /TR "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$proj\scripts\scheduled_db_update.ps1`""
#   移除： schtasks /Delete /TN "FF14繁中DB週檢" /F
#   手動測： schtasks /Run /TN "FF14繁中DB週檢"
