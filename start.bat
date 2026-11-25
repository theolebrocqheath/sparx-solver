@echo off
title Sparx Solver
cd /d "%~dp0"
cls

echo.
echo   ==============================
echo        Sparx Solver
echo   ==============================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo   Node.js is not installed.
  echo.
  echo   Install it from: https://nodejs.org
  echo   Download the LTS version, run the installer, then try again.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do echo   Node.js %%i found

:: Install dependencies if needed
if not exist "node_modules" (
  echo   Installing dependencies ^(first time only^)...
  call npm install --silent 2>nul
  echo   Dependencies installed
)

:: Install Playwright browser if needed
if not exist "%LOCALAPPDATA%\ms-playwright\chromium-*" (
  echo   Downloading browser ^(first time only, ~200MB^)...
  call npx playwright install chromium
  echo   Browser ready
)

echo.
echo   Starting server...
echo   Close this window to stop.
echo.

node server.js
pause
