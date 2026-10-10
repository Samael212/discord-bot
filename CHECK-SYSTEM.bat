@echo off
chcp 65001 >nul
setlocal
title SHADOW BASILISK - CHECK SYSTEM
cd /d "%~dp0"

echo ==========================================
echo       SHADOW BASILISK SYSTEM CHECK
echo ==========================================
echo.

where node >nul 2>nul && (echo [OK] Node.js) || (echo [X] Node.js)
where npm >nul 2>nul && (echo [OK] npm) || (echo [X] npm)

if exist "server.js" (echo [OK] server.js) else (echo [X] server.js)
if exist "package.json" (echo [OK] package.json) else (echo [X] package.json)
if exist "setup-discord.js" (echo [OK] setup-discord.js) else (echo [X] setup-discord.js)
if exist "SETUP-DISCORD.bat" (echo [OK] SETUP-DISCORD.bat) else (echo [X] SETUP-DISCORD.bat)
if exist "public\index.html" (echo [OK] public\index.html) else (echo [X] public\index.html)
if exist "public\js\app.js" (echo [OK] public\js\app.js) else (echo [X] public\js\app.js)
if exist "public\css\style.css" (echo [OK] public\css\style.css) else (echo [X] public\css\style.css)

echo.
if exist ".env" (
  echo [OK] .env
  findstr /b "DISCORD_CLIENT_ID=" .env >nul && echo [OK] DISCORD_CLIENT_ID line || echo [X] DISCORD_CLIENT_ID
  findstr /b "DISCORD_CLIENT_SECRET=" .env >nul && echo [OK] DISCORD_CLIENT_SECRET line || echo [X] DISCORD_CLIENT_SECRET
  findstr /b "DISCORD_REDIRECT_URI=" .env >nul && echo [OK] DISCORD_REDIRECT_URI line || echo [X] DISCORD_REDIRECT_URI
  findstr /b "SESSION_SECRET=" .env >nul && echo [OK] SESSION_SECRET line || echo [X] SESSION_SECRET
  findstr /b "DISCORD_BOT_TOKEN=" .env >nul && echo [OK] DISCORD_BOT_TOKEN line || echo [X] DISCORD_BOT_TOKEN
  findstr /b "DISCORD_GUILD_ID=" .env >nul && echo [OK] DISCORD_GUILD_ID line || echo [X] DISCORD_GUILD_ID
  findstr /b "DISCORD_VERIFY_ROLE_ID=" .env >nul && echo [OK] DISCORD_VERIFY_ROLE_ID line || echo [X] DISCORD_VERIFY_ROLE_ID
  findstr /b "DISCORD_LOGIN_LOG_CHANNEL_ID=" .env >nul && echo [OK] DISCORD_LOGIN_LOG_CHANNEL_ID line || echo [X] DISCORD_LOGIN_LOG_CHANNEL_ID
  findstr /b "DISCORD_VERIFY_LOG_CHANNEL_ID=" .env >nul && echo [OK] DISCORD_VERIFY_LOG_CHANNEL_ID line || echo [X] DISCORD_VERIFY_LOG_CHANNEL_ID
  findstr /b "DISCORD_RESET_LOG_CHANNEL_ID=" .env >nul && echo [OK] DISCORD_RESET_LOG_CHANNEL_ID line || echo [X] DISCORD_RESET_LOG_CHANNEL_ID
  findstr /b "DISCORD_ADMIN_ROLE_ID=" .env >nul && echo [OK] DISCORD_ADMIN_ROLE_ID line || echo [!] DISCORD_ADMIN_ROLE_ID optional
  findstr /b "ADMIN_DISCORD_IDS=" .env >nul && echo [OK] ADMIN_DISCORD_IDS line || echo [!] ADMIN_DISCORD_IDS optional
) else (
  echo [X]  .env
  echo      SETUP-DISCORD.bat
)

echo.
echo : CHECK  ""  .env
echo 
echo.
pause
endlocal
