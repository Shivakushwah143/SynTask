@echo off
setlocal enabledelayedexpansion
cls
color 0E
echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║   COMPLETE FRONTEND DEPLOYMENT - TASK DETAIL FIX      ║
echo ╚════════════════════════════════════════════════════════╝
echo.

echo ────────────────────────────────────────────────────────────
echo  STEP 1: BUILD FRONTEND
echo ────────────────────────────────────────────────────────────
cd /d "C:\Users\Administrator\Documents\task management\frontend"
echo Building...
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo ✗ Build failed!
    echo.
    echo Please check for errors above and fix them.
    pause
    exit /b 1
)
echo ✓ Build successful!
echo.

echo ────────────────────────────────────────────────────────────
echo  STEP 2: BACKUP OLD PRODUCTION BUILD
echo ────────────────────────────────────────────────────────────
if exist "C:\apps\task-management\frontend\dist.backup" (
    echo Removing old backup...
    rd /s /q "C:\apps\task-management\frontend\dist.backup"
)

if exist "C:\apps\task-management\frontend\dist" (
    echo Creating backup...
    move "C:\apps\task-management\frontend\dist" "C:\apps\task-management\frontend\dist.backup" >nul
    echo ✓ Backup created!
) else (
    echo ⚠ No existing dist folder to backup
)
echo.

echo ────────────────────────────────────────────────────────────
echo  STEP 3: COPY NEW BUILD TO PRODUCTION
echo ────────────────────────────────────────────────────────────
echo Copying dist folder...
xcopy /E /I /Y "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist"
if %errorlevel% neq 0 (
    color 0C
    echo ✗ Copy failed!
    
    REM Restore backup
    if exist "C:\apps\task-management\frontend\dist.backup" (
        echo Restoring backup...
        move "C:\apps\task-management\frontend\dist.backup" "C:\apps\task-management\frontend\dist" >nul
    )
    
    pause
    exit /b 1
)
echo ✓ Files copied successfully!
echo.

echo ────────────────────────────────────────────────────────────
echo  STEP 4: VERIFY FILES
echo ────────────────────────────────────────────────────────────
if exist "C:\apps\task-management\frontend\dist\index.html" (
    echo ✓ index.html found
) else (
    color 0C
    echo ✗ index.html NOT found!
    pause
    exit /b 1
)

if exist "C:\apps\task-management\frontend\dist\assets" (
    echo ✓ assets folder found
    dir /b "C:\apps\task-management\frontend\dist\assets\*.js" | find /c ".js" > temp.txt
    set /p JS_COUNT=<temp.txt
    del temp.txt
    echo   Found !JS_COUNT! JavaScript files
) else (
    color 0C
    echo ✗ assets folder NOT found!
    pause
    exit /b 1
)
echo.

echo ────────────────────────────────────────────────────────────
echo  STEP 5: RESTART FRONTEND SERVER
echo ────────────────────────────────────────────────────────────
cd /d C:\apps\task-management
echo Restarting PM2 frontend...
pm2 restart task-management-frontend
if %errorlevel% neq 0 (
    color 0E
    echo ⚠ PM2 restart had issues, trying to start...
    pm2 start ecosystem.config.js --only task-management-frontend
)
echo ✓ Frontend server restarted!
echo.

echo ────────────────────────────────────────────────────────────
echo  STEP 6: WAIT FOR SERVER STABILIZATION
echo ────────────────────────────────────────────────────────────
echo Waiting 5 seconds...
timeout /t 5 /nobreak >nul
echo ✓ Server should be stable now!
echo.

echo ────────────────────────────────────────────────────────────
echo  STEP 7: CHECK PM2 STATUS
echo ────────────────────────────────────────────────────────────
pm2 list
echo.

color 0A
echo ════════════════════════════════════════════════════════════
echo    ✓✓✓ DEPLOYMENT SUCCESSFUL ✓✓✓
echo ════════════════════════════════════════════════════════════
echo.
echo  WHAT WAS DEPLOYED:
echo  ───────────────────────────────────────────────────────────
echo   ✓ Enhanced TaskDetail UI with larger fonts
echo   ✓ Better description section with edit button
echo   ✓ Modern activity tabs with borders
echo   ✓ Gradient comment avatars
echo   ✓ Improved spacing and layouts
echo.
echo  CRITICAL: CLEAR YOUR BROWSER CACHE!
echo  ───────────────────────────────────────────────────────────
echo   1. Open your browser
echo   2. Press Ctrl + Shift + Delete
echo   3. Select "Cached images and files"
echo   4. Click "Clear data"
echo.
echo   OR use Incognito/Private window:
echo   - Chrome: Ctrl + Shift + N
echo   - Edge: Ctrl + Shift + P
echo.
echo  TESTING STEPS:
echo  ───────────────────────────────────────────────────────────
echo   1. Go to: https://task.synzent.ai/
echo   2. Login if needed
echo   3. Go to any project board
echo   4. Click on a task
echo   5. YOU SHOULD SEE:
echo      ✓ Larger task title
echo      ✓ "Description" heading with Edit button
echo      ✓ Modern activity tabs
echo      ✓ Colorful gradient avatars
echo      ✓ Better spacing everywhere
echo.
echo  IF STILL SHOWING OLD UI:
echo  ───────────────────────────────────────────────────────────
echo   - Try incognito/private window first
echo   - Clear browser cache completely
echo   - Check PM2 logs: pm2 logs task-management-frontend
echo   - Verify Caddy is running (if used)
echo   - Check browser console for errors (F12)
echo.
echo ════════════════════════════════════════════════════════════
echo.
pause

