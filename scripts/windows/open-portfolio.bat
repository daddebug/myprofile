@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PORTFOLIO_URL=http://localhost:5173/zh"
set "PORTFOLIO_DIR=D:\myprofilegit\myprofile"
set "CHROME_EXE="

if /i "%~1"=="--server" goto :run_server

title OPEN PORTFOLIO - localhost 5173
color 0A

if not exist "%PORTFOLIO_DIR%\package.json" (
  echo ==============================================
  echo   PORTFOLIO DIRECTORY NOT FOUND
  echo ==============================================
  echo Expected:
  echo   %PORTFOLIO_DIR%
  echo.
  echo Nothing was started.
  pause
  exit /b 1
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

call :check_server
set "SERVER_STATE=%errorlevel%"
if "%SERVER_STATE%"=="0" goto :open_site
if "%SERVER_STATE%"=="2" goto :port_conflict

start "Portfolio Server - KEEP THIS OPEN" cmd.exe /k call "%~f0" --server
for /L %%I in (1,1,120) do (
  call :check_server
  if !errorlevel! equ 0 goto :open_site
  >nul 2>&1 ping 127.0.0.1 -n 2
)

echo ERROR: localhost:5173 did not respond within 120 seconds.
pause
exit /b 1

:port_conflict
echo ==============================================
echo   PORT 5173 IS ALREADY IN USE
echo ==============================================
echo The service on port 5173 is not this portfolio.
echo Stop that service, then run this launcher again.
echo Nothing else was started.
pause
exit /b 2

:open_site
if defined CHROME_EXE (
  start "" "%CHROME_EXE%" "%PORTFOLIO_URL%"
) else (
  start "" "%PORTFOLIO_URL%"
)
exit /b 0

:check_server
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%PORTFOLIO_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500 -and $response.Content -match '<title>Dilida Duman \| Playful Systems Portfolio</title>' -and $response.Content -match 'id=.root.') { exit 0 }; exit 2 } catch { $listeners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue); if ($listeners.Count -gt 0) { exit 2 }; exit 1 }" >nul 2>&1
exit /b %errorlevel%

:run_server
title Portfolio Server - KEEP THIS OPEN
color 0A
if not exist "%PORTFOLIO_DIR%\package.json" (
  echo ERROR: Official portfolio directory is missing:
  echo   %PORTFOLIO_DIR%
  echo.
  pause
  exit /b 1
)
cd /d "%PORTFOLIO_DIR%"
where node.exe >nul 2>&1
if errorlevel 1 if exist "C:\Users\95799\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "PATH=C:\Users\95799\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;!PATH!"
)
where pnpm.cmd >nul 2>&1
if not errorlevel 1 (
  echo Starting from %CD% with pnpm...
  call pnpm portfolio:start
) else (
  where npm.cmd >nul 2>&1
  if not errorlevel 1 (
    echo pnpm is unavailable. Starting from %CD% with npm...
    call npm run portfolio:start
  ) else if exist "C:\Users\95799\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" (
    echo pnpm and npm are not on PATH. Using the bundled pnpm runtime...
    set "PATH=C:\Users\95799\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;!PATH!"
    call "C:\Users\95799\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" portfolio:start
  ) else (
    echo ERROR: Neither pnpm nor npm is available.
    echo Install Node.js and pnpm, then try again.
    pause
    exit /b 1
  )
)
if errorlevel 1 (
  echo.
  echo ERROR: The portfolio server stopped with an error.
  echo The terminal will remain open so the message can be reviewed.
  pause
)
exit /b
