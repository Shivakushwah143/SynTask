@echo off
cls
echo.
echo ╔════════════════════════════════════════════════════╗
echo ║     FIXING TASK CLICK - ADDING GET ENDPOINT       ║
echo ╚════════════════════════════════════════════════════╝
echo.

echo [1/4] Copying updated tasks.py...
copy /Y "C:\Users\Administrator\Documents\task management\backend\app\api\v1\endpoints\tasks.py" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py"
if %errorlevel% neq 0 (
    echo ✗ Copy failed!
    pause
    exit /b 1
)
echo ✓ tasks.py copied successfully!
echo.

echo [2/4] Verifying GET endpoint exists...
findstr /C:"@router.get(\"/{task_id}\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul
if %errorlevel% equ 0 (
    echo ✓ GET endpoint found in file!
) else (
    echo ✗ WARNING: GET endpoint NOT found!
    echo    File might not have been updated correctly.
)
echo.

echo [3/4] Restarting backend...
cd /d C:\apps\task-management
pm2 restart task-management-backend
timeout /t 5 /nobreak >nul
echo ✓ Backend restarted!
echo.

echo [4/4] Checking backend status...
pm2 info task-management-backend
echo.

echo ════════════════════════════════════════════════════
echo   DEPLOYMENT COMPLETE!
echo ════════════════════════════════════════════════════
echo.
echo WHAT WAS FIXED:
echo  ✓ Added GET /tasks/{task_id} endpoint
echo  ✓ File copied to production
echo  ✓ Backend restarted
echo.
echo NOW TEST:
echo  1. Hard refresh browser (Ctrl + Shift + R)
echo  2. Go to project board
echo  3. Click on any task card
echo  4. Task detail should open!
echo.
echo If still not working:
echo  - Check browser console for errors
echo  - Check backend logs: pm2 logs task-management-backend
echo  - Verify endpoint: curl http://localhost:8000/api/v1/tasks/TASK_ID
echo.
pause

