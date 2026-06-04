@echo off
echo.
echo ========================================
echo   RESTARTING BACKEND WITH ZOOM FIX
echo ========================================
echo.

cd /d C:\apps\task-management

echo Restarting backend...
pm2 restart task-management-backend

echo.
echo Waiting 5 seconds for startup...
timeout /t 5 /nobreak

echo.
echo ========================================
echo   CHECKING LOGS FOR SUCCESS
echo ========================================
echo.

pm2 logs task-management-backend --lines 50 --nostream | findstr /C:"Application startup" /C:"Creating Zoom" /C:"Zoom API error"

echo.
echo ========================================
echo   NEXT STEPS
echo ========================================
echo.
echo 1. Hard refresh browser (Ctrl+Shift+R)
echo 2. Create NEW meeting
echo 3. Look for "Creating Zoom meeting using 'me' endpoint" in logs
echo 4. NO "404 error" should appear!
echo 5. "Join Meeting" button WILL appear!
echo.
pause

