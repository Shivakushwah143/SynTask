@echo off
echo ========================================
echo   DEPLOYING ZOOM FIX TO PRODUCTION
echo ========================================
echo.

echo Step 1: Copying updated zoom.py to production...
copy /Y "C:\Users\Administrator\Documents\task management\backend\app\core\zoom.py" "C:\apps\task-management\backend\app\core\zoom.py"
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy zoom.py
    pause
    exit /b 1
)
echo SUCCESS: zoom.py copied!
echo.

echo Step 2: Verifying the fix...
findstr /C:"users/me/meetings" "C:\apps\task-management\backend\app\core\zoom.py" >nul
if %errorlevel% equ 0 (
    echo SUCCESS: Fix verified - using "me" endpoint!
) else (
    echo WARNING: Fix not found in production file!
    pause
)
echo.

echo Step 3: Restarting backend...
cd /d C:\apps\task-management
pm2 restart task-management-backend --update-env
echo.

echo Step 4: Waiting for backend to start...
timeout /t 5 /nobreak >nul
echo.

echo Step 5: Showing recent logs...
pm2 logs task-management-backend --lines 30 --nostream
echo.

echo ========================================
echo   DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Next steps:
echo 1. Hard refresh browser (Ctrl+Shift+R)
echo 2. Create NEW meeting
echo 3. Check for "Join Meeting" button!
echo.
pause

