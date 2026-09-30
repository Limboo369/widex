@echo off
rem Beam as a Windows app (no browser). Builds Beam.exe the first time.
chcp 65001 >nul
title Beam
cd /d "%~dp0web-desktop"

if exist "dist\Beam-win32-x64\Beam.exe" goto run

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  Node.js is not installed.
    echo  Download the LTS version from https://nodejs.org and run this file again.
    echo.
    pause
    exit /b 1
)

echo Building the Beam app, only the first time (downloads about 100 MB)...
call npm install
if errorlevel 1 goto failed
call npm run package-win
if errorlevel 1 goto failed

:run
start "" "dist\Beam-win32-x64\Beam.exe"
exit /b 0

:failed
echo.
echo  Building the app failed. Use "Beam (browser).bat".
echo.
pause
exit /b 1
