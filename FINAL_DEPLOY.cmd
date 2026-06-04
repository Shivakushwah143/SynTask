@echo off
setlocal enabledelayedexpansion

cls
color 0A
echo.
echo ═══════════════════════════════════════════════════════════
echo    TASK DETAIL FIX - FINAL DEPLOYMENT
echo ═══════════════════════════════════════════════════════════
echo.

REM Step 1: Copy file
echo [Step 1/4] Copying updated tasks.py to production...
copy /Y "C:\Users\Administrator\Documents\task management\backend\app\api\v1\endpoints\tasks.py" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul 2>&1

if errorlevel 1 (
    color 0C
    echo ✗ FAILED: Could not copy file
    echo.
    echo Source: C:\Users\Administrator\Documents\task management\backend\app\api\v1\endpoints\tasks.py
    echo Dest:   C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py
    echo.
    pause
    exit /b 1
) else (
    echo ✓ File copied successfully
)

REM Step 2: Verify endpoints exist
echo.
echo [Step 2/4] Verifying new endpoints in production file...

set FOUND=0
findstr /C:"@router.get(\"/{task_id}\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul 2>&1
if not errorlevel 1 (
    echo   ✓ GET /{task_id} endpoint found
    set /a FOUND+=1
)

findstr /C:"@router.patch(\"/{task_id}/status\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul 2>&1
if not errorlevel 1 (
    echo   ✓ PATCH /{task_id}/status endpoint found
    set /a FOUND+=1
)

findstr /C:"@router.get(\"/{task_id}/comments\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul 2>&1
if not errorlevel 1 (
    echo   ✓ GET /{task_id}/comments endpoint found
    set /a FOUND+=1
)

findstr /C:"@router.post(\"/{task_id}/comments\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul 2>&1
if not errorlevel 1 (
    echo   ✓ POST /{task_id}/comments endpoint found
    set /a FOUND+=1
)

findstr /C:"@router.get(\"/{task_id}/subtasks\")" "C:\apps\task-management\backend\app\api\v1\endpoints\tasks.py" >nul 2>&1
if not errorlevel 1 (
    echo   ✓ GET /{task_id}/subtasks endpoint found
    set /a FOUND+=1
)

echo.
echo   Found %FOUND%/5 endpoints

if %FOUND% NEQ 5 (
    color 0E
    echo   ⚠ WARNING: Not all endpoints found!
    echo.
)

REM Step 3: Restart backend
echo.
echo [Step 3/4] Restarting backend...
cd /d C:\apps\task-management
pm2 restart task-management-backend >nul 2>&1

if errorlevel 1 (
    color 0C
    echo ✗ FAILED: Could not restart backend
    echo.
    echo Try manually: cd C:\apps\task-management && pm2 restart task-management-backend
    echo.
    pause
    exit /b 1
) else (
    echo ✓ Backend restart initiated
)

REM Step 4: Wait for startup
echo.
echo [Step 4/4] Waiting for backend startup...
timeout /t 5 /nobreak >nul
echo ✓ Backend should be ready now

REM Success summary
color 0A
echo.
echo ═══════════════════════════════════════════════════════════
echo    ✓ DEPLOYMENT COMPLETE!
echo ═══════════════════════════════════════════════════════════
echo.
echo  FIXED ENDPOINTS:
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   1. GET    /api/v1/tasks/{task_id}           - Get task
echo   2. PATCH  /api/v1/tasks/{task_id}/status    - Update status
echo   3. GET    /api/v1/tasks/{task_id}/comments  - Load comments
echo   4. POST   /api/v1/tasks/{task_id}/comments  - Add comment
echo   5. GET    /api/v1/tasks/{task_id}/subtasks  - Load subtasks
echo.
echo  TESTING INSTRUCTIONS:
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   1. Open browser and go to: https://task.synzent.ai/
echo   2. Hard refresh: Ctrl + Shift + R
echo   3. Go to any project board
echo   4. Click on a task card
echo   5. Task detail should open without errors
echo   6. Try changing task status (dropdown)
echo   7. Try adding a comment
echo   8. Check browser console - NO 404 errors!
echo.
echo  VERIFICATION:
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   Backend status:  pm2 status
echo   Backend logs:    pm2 logs task-management-backend --lines 30
echo.
echo ═══════════════════════════════════════════════════════════
echo.

REM Show backend status
echo Current backend status:
pm2 status task-management-backend 2>nul
if errorlevel 1 (
    echo ⚠ Could not get PM2 status
)

echo.
echo Press any key to see recent logs...
pause >nul

REM Show recent logs
echo.
echo ═══════════════════════════════════════════════════════════
echo    RECENT BACKEND LOGS
echo ═══════════════════════════════════════════════════════════
pm2 logs task-management-backend --lines 20 --nostream 2>nul
if errorlevel 1 (
    echo ⚠ Could not retrieve logs
)

echo.
echo ═══════════════════════════════════════════════════════════
echo.
pause

