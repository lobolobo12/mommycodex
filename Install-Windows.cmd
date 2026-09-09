@echo off
setlocal
title Install MommyCodex
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows.ps1"
if errorlevel 1 (
  echo.
  echo Setup stopped. Please read the message above, then run this file again.
  pause
  exit /b 1
)
exit /b 0
