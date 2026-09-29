@echo off
rem Wi-Dex: pokrece server i otvara Wi-Dex u podrazumevanom browseru (Chrome/Edge).
chcp 65001 >nul
title Wi-Dex
cd /d "%~dp0web-desktop"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  Node.js nije instaliran.
    echo  Preuzmi LTS verziju sa https://nodejs.org i pokreni ovaj fajl ponovo.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\ws" (
    echo Instaliram potrebne pakete, samo prvi put...
    call npm install --omit=dev
)

echo.
echo  Wi-Dex radi dok je ovaj prozor otvoren. Zatvori ga kada zavrsis sa igranjem.
echo.
node server.js --open
pause
