@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "LOG_DIR=data\logs"
set "BACK_PID_FILE=%LOG_DIR%\backend.pid"
set "FRONT_PID_FILE=%LOG_DIR%\frontend.pid"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] node_modules not found. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    exit /b 1
  )
)

if exist "%BACK_PID_FILE%" (
  set /p OLD_BACK_PID=<"%BACK_PID_FILE%"
  if not "!OLD_BACK_PID!"=="" (
    taskkill /PID !OLD_BACK_PID! /T /F >nul 2>nul
    echo [INFO] Stopped previous backend process ^(PID !OLD_BACK_PID!^).
  )
  del "%BACK_PID_FILE%" >nul 2>nul
)

if exist "%FRONT_PID_FILE%" (
  set /p OLD_FRONT_PID=<"%FRONT_PID_FILE%"
  if not "!OLD_FRONT_PID!"=="" (
    taskkill /PID !OLD_FRONT_PID! /T /F >nul 2>nul
    echo [INFO] Stopped previous frontend process ^(PID !OLD_FRONT_PID!^).
  )
  del "%FRONT_PID_FILE%" >nul 2>nul
)

echo [INFO] Starting backend on port 3211...
for /f %%i in ('powershell -NoProfile -Command "$p = Start-Process -FilePath 'node' -ArgumentList @('server/index.js') -WorkingDirectory (Get-Location).Path -PassThru; $p.Id"') do set "BACK_PID=%%i"
if not defined BACK_PID (
  echo [ERROR] Failed to start backend process.
  exit /b 1
)
> "%BACK_PID_FILE%" echo !BACK_PID!

echo [INFO] Starting frontend on port 3210...
for /f %%i in ('powershell -NoProfile -Command "$p = Start-Process -FilePath 'node' -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3210') -WorkingDirectory (Get-Location).Path -PassThru; $p.Id"') do set "FRONT_PID=%%i"
if not defined FRONT_PID (
  echo [ERROR] Failed to start frontend process.
  call stop.bat >nul 2>nul
  exit /b 1
)
> "%FRONT_PID_FILE%" echo !FRONT_PID!

echo [INFO] Waiting for services to become ready...
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(20); do { $ports = Get-NetTCPConnection -State Listen -LocalPort 3210,3211 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique; if (($ports -contains 3210) -and ($ports -contains 3211)) { exit 0 }; Start-Sleep -Milliseconds 400 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo [WARN] Services started but readiness check timed out.
) else (
  echo [OK] Services are running.
)

echo.
echo Frontend: http://127.0.0.1:3210
echo Backend : http://127.0.0.1:3211
echo Backend PID : !BACK_PID!
echo Frontend PID: !FRONT_PID!
echo.
echo Use stop.bat to stop both services.
exit /b 0
