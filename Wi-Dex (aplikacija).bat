@echo off
rem Wi-Dex kao Windows aplikacija (bez browsera). Prvi put napravi Wi-Dex.exe.
chcp 65001 >nul
title Wi-Dex
cd /d "%~dp0web-desktop"

if exist "dist\Wi-Dex-win32-x64\Wi-Dex.exe" goto run

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  Node.js nije instaliran.
    echo  Preuzmi LTS verziju sa https://nodejs.org i pokreni ovaj fajl ponovo.
    echo.
    pause
    exit /b 1
)

echo Pravim Wi-Dex aplikaciju, samo prvi put (preuzima se oko 100 MB)...
call npm install
if errorlevel 1 goto failed
call npm run package-win
if errorlevel 1 goto failed

:run
start "" "dist\Wi-Dex-win32-x64\Wi-Dex.exe"
exit /b 0

:failed
echo.
echo  Pravljenje aplikacije nije uspelo. Koristi "Wi-Dex (browser).bat".
echo.
pause
exit /b 1
