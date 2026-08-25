@echo off
cd /d "%~dp0"
echo.
echo EmbrioGestor Mobile/PWA v2.1
echo Abrindo em http://localhost:8765
echo.
start "" http://localhost:8765
py -m http.server 8765 2>nul || python -m http.server 8765
pause
