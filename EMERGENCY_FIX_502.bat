@echo off
color 0C
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║   EMERGENCY FIX - 502 ERROR               ║
echo ╚════════════════════════════════════════════╝
echo.

cd /d C:\apps\task-management

echo [1/6] Checking PM2 status...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pm2 list
echo.

echo [2/6] Stopping all PM2 processes...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pm2 stop all
timeout /t 2 /nobreak >nul
echo.

echo [3/6] Starting backend...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pm2 start task-management-backend
timeout /t 5 /nobreak >nul
echo Backend started!
echo.

echo [4/6] Starting frontend...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pm2 start task-management-frontend
timeout /t 5 /nobreak >nul
echo Frontend started!
echo.

echo [5/6] Checking status...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pm2 list
echo.

echo [6/6] Showing recent logs...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo BACKEND LOGS:
pm2 logs task-management-backend --lines 10 --nostream
echo.
echo FRONTEND LOGS:
pm2 logs task-management-frontend --lines 10 --nostream
echo.

color 0A
echo ════════════════════════════════════════════
echo    RESTART COMPLETE
echo ════════════════════════════════════════════
echo.
echo Now try:
echo 1. Wait 10 seconds
echo 2. Go to: https://task.synzent.ai/
echo 3. Hard refresh: Ctrl + Shift + R
echo.
echo If still 502:
echo - Check logs above for errors
echo - Try: pm2 restart all
echo - Check Caddy status
echo.
pause

