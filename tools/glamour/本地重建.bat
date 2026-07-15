@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [本地重建] 重建網頁資料中...
py scripts\update_all.py local
pause
