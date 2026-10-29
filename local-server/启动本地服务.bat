@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title campus-twin local server

rem ================================================================
rem  campus-twin local backend launcher
rem
rem  Why is this file plain ASCII / English?
rem    cmd.exe can NOT reliably parse a UTF-8 .bat file (multi-byte
rem    characters break its line parser), and GBK only works on a
rem    Chinese-locale Windows. Plain ASCII works on EVERY locale, so
rem    the launcher itself stays ASCII. All other project files
rem    (js / json / md / ps1) are UTF-8 as usual.
rem
rem  Usage:
rem    double-click                  -> DEMO mode (data reset on close)
rem    from cmd:  this bat + argument keep  -> KEEP mode (changes are saved)
rem
rem  1) make sure Node.js exists (auto-download a portable copy if not)
rem  2) seed demo data on first run
rem  3) run npm install only if package.json declares dependencies
rem  4) start the server and KEEP THIS WINDOW OPEN
rem ================================================================

rem default port 8080 (Windows may reserve some port ranges -> EACCES;
rem server.js also auto-falls-back and syncs config.js).
if not defined PORT set "PORT=8080"
set "RUNTIME=%~dp0.runtime"
set "NODE_VER=v20.18.0"
set "NODE_SUB=node-%NODE_VER%-win-x64"
set "NODE="

echo.
echo  ============================================
echo    campus-twin  local backend
echo  ============================================
echo.

rem ---- data mode: pass "keep" as an argument to save changes ----
if /i "%~1"=="keep" (
  set "KEEP_DATA=1"
  echo  Mode: KEEP  ^(everything you change this session is saved^)
) else (
  echo  Mode: DEMO  ^(closing this window resets data to the clean snapshot^)
  echo         to keep data instead:  this bat + argument keep
)
echo.

echo [1/4] Checking Node.js ...

rem ---- fast path: Node already available somewhere ----
call :detect_node
if defined NODE goto :node_ready

rem ---- not found: let the PowerShell helper build a portable copy ----
echo [!] Node.js was not found. Trying to set it up automatically...
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-node.ps1" -Version "%NODE_VER%" -RuntimeDir "%RUNTIME%"

call :detect_node
if not defined NODE (
  echo.
  echo [X] Node.js is not available and could not be installed automatically.
  echo     Please install Node.js 18+ from https://nodejs.org/en/download
  echo     then run this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

:node_ready
echo [OK] Node: %NODE%
"%NODE%" -v

rem ---- 2. seed demo data on first run ----
if not exist "data\db.json" (
  echo [2/4] First run - writing demo data ...
  "%NODE%" seed.js
) else (
  echo [2/4] data/db.json already exists - skip seed
)

rem ---- 3. optional npm dependencies ----
set "NPM="
set "NODEDIR="
if /i "%NODE%"=="node" (
  where npm >nul 2>nul
  if not errorlevel 1 set "NPM=npm"
) else (
  for %%i in ("%NODE%") do set "NODEDIR=%%~dpi"
  if exist "%NODEDIR%npm.cmd" set "NPM=%NODEDIR%npm.cmd"
)
findstr /c:"dependencies" "package.json" >nul 2>nul
if not errorlevel 1 (
  if not exist "node_modules" (
    if defined NPM (
      echo [3/4] Installing npm dependencies ...
      call "%NPM%" install --no-audit --no-fund
    ) else (
      echo [3/4] npm not found - skip install
    )
  ) else (
    echo [3/4] node_modules exists - skip npm install
  )
) else (
  echo [3/4] package.json has no dependencies - skip npm install
)

rem ---- 4. start the server ----
echo [4/4] Starting server on http://localhost:%PORT%
echo.
echo   ------------------------------------------------------------
echo    KEEP THIS WINDOW OPEN while using the mini program.
echo    Close this window (or press Ctrl+C) to stop the server.
echo   ------------------------------------------------------------
echo.
"%NODE%" server.js

echo.
echo [i] Server stopped.
pause
exit /b 0

rem =================== subroutines ===================
:detect_node
set "NODE="
where node >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%p in ('where node 2^>nul') do (
    set "NODE=%%p"
    goto :eof
  )
)
if exist "%RUNTIME%\%NODE_SUB%\node.exe" (
  set "NODE=%RUNTIME%\%NODE_SUB%\node.exe"
  goto :eof
)
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE=%ProgramFiles%\nodejs\node.exe"
  goto :eof
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
  set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"
  goto :eof
)
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
  set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
  goto :eof
)
for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
  if exist "%%d\node.exe" set "NODE=%%d\node.exe"
)
goto :eof
