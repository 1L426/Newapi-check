@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "LOG_DIR=data\logs"
set "BACK_PID_FILE=%LOG_DIR%\backend.pid"
set "FRONT_PID_FILE=%LOG_DIR%\frontend.pid"

set "STOPPED_ANY=0"

if exist "%BACK_PID_FILE%" (
  set /p BACK_PID=<"%BACK_PID_FILE%"
  if not "!BACK_PID!"=="" (
    taskkill /PID !BACK_PID! /T /F >nul 2>nul
    echo [INFO] Stopped backend process ^(PID !BACK_PID!^).
    set "STOPPED_ANY=1"
  )
  del "%BACK_PID_FILE%" >nul 2>nul
)

if exist "%FRONT_PID_FILE%" (
  set /p FRONT_PID=<"%FRONT_PID_FILE%"
  if not "!FRONT_PID!"=="" (
    taskkill /PID !FRONT_PID! /T /F >nul 2>nul
    echo [INFO] Stopped frontend process ^(PID !FRONT_PID!^).
    set "STOPPED_ANY=1"
  )
  del "%FRONT_PID_FILE%" >nul 2>nul
)

echo [INFO] Cleaning processes on ports 3210 and 3211...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3211 .*LISTENING"') do (
  taskkill /PID %%p /T /F >nul 2>nul
  echo [INFO] Killed process on port 3211 ^(PID %%p^).
  set "STOPPED_ANY=1"
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3210 .*LISTENING"') do (
  taskkill /PID %%p /T /F >nul 2>nul
  echo [INFO] Killed process on port 3210 ^(PID %%p^).
  set "STOPPED_ANY=1"
)

if "!STOPPED_ANY!"=="0" (
  echo [INFO] No running backend/frontend process found.
) else (
  echo [OK] Stop completed.
)

exit /b 0
