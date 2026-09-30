@echo off
rem Beam: starts the server and opens Beam in the default browser (Chrome/Edge).
chcp 65001 >nul
title Beam
cd /d "%~dp0web-desktop"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  Node.js is not installed.
    echo  Download the LTS version from https://nodejs.org and run this file again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\ws" (
    echo Installing the required packages, only the first time...
    call npm install --omit=dev
)

echo.
echo  Beam runs while this window is open. Close it when you are done playing.
echo.
node server.js --open
pause
