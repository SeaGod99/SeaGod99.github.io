@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [完整更新] 抓取 Mirapri + 重建中...
py scripts\update_all.py full
pause
