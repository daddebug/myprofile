@echo off
setlocal EnableExtensions

if /i "%~1"=="--server" goto :run_server

title OPEN PORTFOLIO - localhost 5173
color 0A

set "PORTFOLIO_URL=http://localhost:5173/zh"
set "PORTFOLIO_DIR=D:\myprofilegit\myprofile"
set "CHROME_EXE="

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

call :check_server
if not errorlevel 1 goto :open_site

start "Portfolio Server - KEEP THIS OPEN" cmd.exe /k call "%~f0" --server
for /L %%I in (1,1,120) do (
  call :check_server
  if not errorlevel 1 goto :open_site
  >nul 2>&1 ping 127.0.0.1 -n 2
)

echo ERROR: localhost:5173 did not respond within 120 seconds.
pause
exit /b 1

:open_site
if defined CHROME_EXE (
  start "" "%CHROME_EXE%" "%PORTFOLIO_URL%"
) else (
  start "" "%PORTFOLIO_URL%"
)
exit /b 0

:check_server
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%PORTFOLIO_URL%' -TimeoutSec 1; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:run_server
title Portfolio Server - KEEP THIS OPEN
color 0A
cd /d "%PORTFOLIO_DIR%"
call npm run portfolio:start
exit /b
