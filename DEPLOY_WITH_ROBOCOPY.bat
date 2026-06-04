@echo off
title Task Detail UI Deployment (Robocopy)
color 0B
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║   TASK DETAIL UI - DEPLOYMENT             ║
echo ╚════════════════════════════════════════════╝
echo.

echo [1/3] Building Frontend
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

echo [2/3] Copying Files with Robocopy
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Using robocopy (handles permissions better)...
robocopy "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist" /E /PURGE /MT:8 /R:2 /W:1
if %errorlevel% geq 8 (
    color 0C
    echo Robocopy failed with error %errorlevel%!
    pause
    exit /b 1
)
echo Files copied!
echo.

echo [3/3] Restarting Frontend
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cd /d C:\apps\task-management
pm2 restart task-management-frontend
echo Frontend restarted!
timeout /t 3 /nobreak >nul
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

