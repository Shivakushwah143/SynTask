@echo off
echo.
echo ════════════════════════════════════════
echo   FIXING TASK 404 ERROR
echo ════════════════════════════════════════
echo.

echo Step 1: Copying updated tasks.py...
copy /Y "C:\Users\Administrator\Documents\task management\backend\app\api\v1\endpoints\tasks.py" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py"
if %errorlevel% neq 0 (
    echo ERROR: Copy failed!
    pause
    exit /b 1
)
echo ✓ File copied!
echo.

echo Step 2: Restarting backend...
cd /d C:\apps\task-management
pm2 restart task-management-backend
timeout /t 3 /nobreak >nul
echo ✓ Backend restarted!
echo.

echo ════════════════════════════════════════
echo   FIX APPLIED!
echo ════════════════════════════════════════
echo.
echo WHAT WAS FIXED:
echo  - Added missing GET /tasks/{task_id} endpoint
echo  - Now task details can be fetched
echo  - 404 error should be resolved
echo.
echo NEXT ISSUE TO FIX:
echo  - Tasks only creating in TO DO column
echo  - Need to check frontend "status" parameter
echo.
echo NOW TEST:
echo  1. Click on any task card
echo  2. Task detail should load (no 404 error)
echo  3. Task modal should open successfully
echo.
pause

