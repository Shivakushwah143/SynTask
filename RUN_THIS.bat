@echo off
title Task Detail UI Deployment
color 0B
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║   TASK DETAIL UI - DEPLOYMENT SCRIPT      ║
echo ╚════════════════════════════════════════════╝
echo.
echo This will:
echo  1. Build the frontend
echo  2. Copy files to production
echo  3. Restart the frontend server
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul
echo.

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo  [1/4] Building Frontend
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cd /d "C:\Users\Administrator\Documents\task management\frontend"
echo Building... (this takes 30-60 seconds)
call npm run build
if errorlevel 1 (
    color 0C
    echo.
    echo ✗ BUILD FAILED!
    echo Check the errors above.
    echo.
    pause
    exit /b 1
)
echo ✓ Build successful!
echo.

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo  [2/4] Removing Old Production Files
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if exist "C:\apps\task-management\frontend\dist" (
    rd /s /q "C:\apps\task-management\frontend\dist"
    echo ✓ Old files removed
) else (
    echo • No old files to remove
)
echo.

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo  [3/4] Copying New Files to Production
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
xcopy /E /I /Y /Q "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist"
if errorlevel 1 (
    color 0C
    echo ✗ COPY FAILED!
    pause
    exit /b 1
)
echo ✓ Files copied successfully!
echo.

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo  [4/4] Restarting Frontend Server
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cd /d C:\apps\task-management
pm2 restart task-management-frontend
echo ✓ Frontend server restarted!
echo.
echo Waiting 5 seconds for server to stabilize...
timeout /t 5 /nobreak >nul
echo.

color 0A
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║      ✓✓✓ DEPLOYMENT SUCCESSFUL ✓✓✓        ║
echo ╚════════════════════════════════════════════╝
echo.
echo  CRITICAL NEXT STEPS:
echo  ────────────────────────────────────────────
echo.
echo  1. CLEAR YOUR BROWSER CACHE:
echo     - Press: Ctrl + Shift + Delete
echo     - Select: "Cached images and files"
echo     - Time: "All time"
echo     - Click: "Clear data"
echo.
echo  2. OR USE INCOGNITO WINDOW (easier):
echo     - Chrome/Edge: Ctrl + Shift + N
echo     - Firefox: Ctrl + Shift + P
echo.
echo  3. GO TO YOUR WEBSITE:
echo     https://task.synzent.ai/
echo.
echo  4. TEST:
echo     - Click on any task
echo     - You should see LARGER title
echo     - Better description section
echo     - Modern activity tabs
echo     - Gradient avatars
echo.
echo  If still seeing old UI:
echo  ────────────────────────────────────────────
echo  - Make sure you cleared cache completely
echo  - Try incognito window first
echo  - Hard refresh: Ctrl + Shift + R
echo.
echo ════════════════════════════════════════════
echo.
pause

