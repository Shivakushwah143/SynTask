@echo off
echo.
echo ========================================
echo   DEPLOYING CLIENTS PAGE FIX
echo ========================================
echo.

cd /d "C:\Users\Administrator\Documents\task management\frontend"

echo Step 1: Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo.

echo Step 2: Copying to production...
xcopy /E /I /Y dist "C:\apps\task-management\frontend\dist"
if %errorlevel% neq 0 (
    echo ERROR: Copy failed!
    pause
    exit /b 1
)
echo.

echo Step 3: Restarting frontend...
cd /d C:\apps\task-management
pm2 restart task-management-frontend
echo.

echo ========================================
echo   DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Next steps:
echo 1. Hard refresh browser (Ctrl+Shift+R)
echo 2. Go to Clients page
echo 3. "Add Client" button will be visible!
echo.
pause

