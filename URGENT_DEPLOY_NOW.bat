@echo off
cls
echo.
echo ╔════════════════════════════════════════╗
echo ║  URGENT: DEPLOYING CLIENTS FIX NOW     ║
echo ╚════════════════════════════════════════╝
echo.

REM Step 1: Build Frontend
echo [1/4] Building Frontend...
cd /d "C:\Users\Administrator\Documents\task management\frontend"
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ✗ BUILD FAILED!
    pause
    exit /b 1
)
echo ✓ Build successful!
echo.

REM Step 2: Copy to Production
echo [2/4] Copying to Production...
robocopy "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist" /E /IS /IT
echo ✓ Files copied!
echo.

REM Step 3: Restart Frontend
echo [3/4] Restarting Frontend...
cd /d C:\apps\task-management
call pm2 restart task-management-frontend
timeout /t 3 /nobreak >nul
echo ✓ Frontend restarted!
echo.

REM Step 4: Clear Browser Cache Instructions
echo [4/4] MANUAL ACTION REQUIRED:
echo.
echo ╔════════════════════════════════════════╗
echo ║         CLEAR BROWSER CACHE            ║
echo ╚════════════════════════════════════════╝
echo.
echo 1. Press: Ctrl + Shift + Delete
echo 2. Select: "Cached images and files"
echo 3. Click: "Clear data"
echo 4. Press: Ctrl + Shift + R (Hard Refresh)
echo 5. Go to: Clients page
echo 6. "Add Client" button will appear!
echo.
echo ════════════════════════════════════════
echo   DEPLOYMENT COMPLETE!
echo ════════════════════════════════════════
echo.
pause

