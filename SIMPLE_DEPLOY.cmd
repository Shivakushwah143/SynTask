@echo off
echo.
echo ===== DEPLOYING TASK DETAIL UI FIX =====
echo.

echo Step 1: Building frontend...
cd /d "C:\Users\Administrator\Documents\task management\frontend"
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo Build complete!
echo.

echo Step 2: Copying to production...
rd /s /q "C:\apps\task-management\frontend\dist" 2>nul
xcopy /E /I /Y "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist"
echo Files copied!
echo.

echo Step 3: Restarting frontend...
cd /d C:\apps\task-management
pm2 restart task-management-frontend
echo Frontend restarted!
echo.

echo Step 4: Checking status...
timeout /t 3 /nobreak >nul
pm2 list
echo.

echo ===== DEPLOYMENT COMPLETE =====
echo.
echo IMPORTANT:
echo 1. Clear browser cache: Ctrl + Shift + Delete
echo 2. Go to: https://task.synzent.ai/
echo 3. Click on a task to see improvements
echo.
pause

