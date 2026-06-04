@echo off
:: Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo This script requires Administrator privileges.
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

title Task Detail UI Deployment [ADMIN]
color 0B
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║   TASK DETAIL UI - ADMIN DEPLOYMENT       ║
echo ╚════════════════════════════════════════════╝
echo.
echo Running with Administrator privileges...
echo.

echo [1/4] Building Frontend
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cd /d "C:\Users\Administrator\Documents\task management\frontend"
echo Building...
call npm run build
if errorlevel 1 (
    color 0C
    echo Build failed!
    pause
    exit /b 1
)
echo Build successful!
echo.

echo [2/4] Taking Ownership of Production Folder
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
takeown /F "C:\apps\task-management\frontend\dist" /R /D Y >nul 2>&1
icacls "C:\apps\task-management\frontend\dist" /grant %USERNAME%:F /T >nul 2>&1
echo Ownership granted!
echo.

echo [3/4] Removing Old Files
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if exist "C:\apps\task-management\frontend\dist" (
    rd /s /q "C:\apps\task-management\frontend\dist"
    echo Old files removed
)
echo.

echo [4/4] Copying New Files
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
xcopy /E /I /Y /Q "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist"
if errorlevel 1 (
    color 0C
    echo Copy failed!
    pause
    exit /b 1
)
echo Files copied!
echo.

echo [5/4] Restarting Frontend
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cd /d C:\apps\task-management
pm2 restart task-management-frontend
echo Frontend restarted!
echo.

color 0A
echo ════════════════════════════════════════════
echo    DEPLOYMENT SUCCESSFUL!
echo ════════════════════════════════════════════
echo.
echo Next steps:
echo 1. Clear browser cache: Ctrl + Shift + Delete
echo 2. Go to: https://task.synzent.ai/
echo 3. Click on a task
echo.
pause

