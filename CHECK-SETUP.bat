@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== CHECK FILES =====
echo Folder: %~dp0
echo.
if exist "SETUP-DISCORD.bat" (echo [OK] SETUP-DISCORD.bat) else (echo [X] SETUP-DISCORD.bat)
if exist "setup-discord.js" (echo [OK] setup-discord.js) else (echo [X] setup-discord.js)
if exist "server.js" (echo [OK] server.js) else (echo [!] server.js ไม่พบในโฟลเดอร์นี้)
if exist "package.json" (echo [OK] package.json) else (echo [!] package.json ไม่พบในโฟลเดอร์นี้)
where node >nul 2>nul && (echo [OK] Node.js) || (echo [X] Node.js)
echo.
dir /b "setup-discord*"
echo.
pause
