@echo off
setlocal
title SHADOW BASILISK WEBSITE
cd /d "%~dp0"

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PowerShell not found.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0START.ps1"
endlocal
