@echo off
color 0B
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║   SYSTEM STATUS CHECK                     ║
echo ╚════════════════════════════════════════════╝
echo.

cd /d C:\apps\task-management

echo [1] PM2 Process List
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pm2 list
echo.

echo [2] Backend Status
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pm2 describe task-management-backend | findstr "status uptime"
echo.

echo [3] Frontend Status
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pm2 describe task-management-frontend | findstr "status uptime"
echo.

echo [4] Checking if ports are listening
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Checking port 8000 (backend):
netstat -ano | findstr ":8000" | findstr "LISTENING"
if %errorlevel% equ 0 (echo   ✓ Backend port 8000 is listening) else (echo   ✗ Backend NOT listening on 8000!)
echo.
echo Checking port 3000 (frontend):
netstat -ano | findstr ":3000" | findstr "LISTENING"
if %errorlevel% equ 0 (echo   ✓ Frontend port 3000 is listening) else (echo   ✗ Frontend NOT listening on 3000!)
echo.

echo [5] Testing local access
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Testing backend...
curl -s http://localhost:8000/api/v1/docs >nul 2>&1
if %errorlevel% equ 0 (echo   ✓ Backend responding) else (echo   ✗ Backend NOT responding!)

echo Testing frontend...
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (echo   ✓ Frontend responding) else (echo   ✗ Frontend NOT responding!)
echo.

echo [6] Recent Errors
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Backend errors:
pm2 logs task-management-backend --err --lines 5 --nostream 2>nul
echo.
echo Frontend errors:
pm2 logs task-management-frontend --err --lines 5 --nostream 2>nul
echo.

echo [7] Dist folder check
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if exist "C:\apps\task-management\frontend\dist\index.html" (
    echo   ✓ Frontend dist/index.html exists
    for %%I in ("C:\apps\task-management\frontend\dist\index.html") do echo   Modified: %%~tI
) else (
    echo   ✗ Frontend dist/index.html MISSING!
)
echo.

echo ════════════════════════════════════════════
echo    STATUS CHECK COMPLETE
echo ════════════════════════════════════════════
echo.
pause

