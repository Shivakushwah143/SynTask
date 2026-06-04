@echo off
cls
echo.
echo ╔════════════════════════════════════════════════════╗
echo ║   DEPLOYING TASK STATUS/COMMENTS/SUBTASKS FIX     ║
echo ╚════════════════════════════════════════════════════╝
echo.

echo [1/3] Copying updated tasks.py with new endpoints...
copy /Y "C:\Users\Administrator\Documents\task management\backend\app\api\v1\endpoints\tasks.py" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py"
if %errorlevel% neq 0 (
    echo ✗ Copy failed!
    pause
    exit /b 1
)
echo ✓ tasks.py copied!
echo.

echo [2/3] Verifying new endpoints exist...
echo Checking for status endpoint...
findstr /C:"@router.patch(\"/{task_id}/status\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul
if %errorlevel% equ 0 (echo ✓ Status endpoint found) else (echo ✗ Status endpoint NOT found!)

echo Checking for comments endpoint...
findstr /C:"@router.get(\"/{task_id}/comments\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul
if %errorlevel% equ 0 (echo ✓ Comments endpoint found) else (echo ✗ Comments endpoint NOT found!)

echo Checking for subtasks endpoint...
findstr /C:"@router.get(\"/{task_id}/subtasks\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul
if %errorlevel% equ 0 (echo ✓ Subtasks endpoint found) else (echo ✗ Subtasks endpoint NOT found!)
echo.

echo [3/3] Restarting backend...
cd /d C:\apps\task-management
pm2 restart task-management-backend
timeout /t 5 /nobreak >nul
echo ✓ Backend restarted!
echo.

echo ════════════════════════════════════════════════════
echo   NEW ENDPOINTS DEPLOYED!
echo ════════════════════════════════════════════════════
echo.
echo FIXED ENDPOINTS:
echo  ✓ GET    /api/v1/tasks/{task_id}
echo  ✓ PATCH  /api/v1/tasks/{task_id}/status
echo  ✓ GET    /api/v1/tasks/{task_id}/comments
echo  ✓ POST   /api/v1/tasks/{task_id}/comments
echo  ✓ GET    /api/v1/tasks/{task_id}/subtasks
echo.
echo WHAT WAS FIXED:
echo  1. Task status update (dropdown in task detail)
echo  2. Task comments (view and add comments)
echo  3. Task subtasks (view subtasks)
echo.
echo NOW TEST:
echo  1. Hard refresh browser (Ctrl + Shift + R)
echo  2. Click on any task to open detail page
echo  3. Try changing task status dropdown
echo  4. Try adding a comment
echo  5. No more 404 errors in console!
echo.
echo If still errors:
echo  - Check backend logs: pm2 logs task-management-backend
echo  - Verify backend is running: pm2 status
echo.
pause

