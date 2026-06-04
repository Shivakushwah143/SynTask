@echo off
echo.
echo ════════════════════════════════════════
echo   FIXING CLIENT CREATION 500 ERROR
echo ════════════════════════════════════════
echo.

echo Step 1: Copying updated clients.py...
copy /Y "C:\Users\Administrator\Documents\task management\backend\app\api\v1\endpoints\clients.py" "C:\apps\task-management\backend\app\api\v1\endpoints\clients.py"
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
echo  - Line 64: UserRole.COMPANY_ADMIN → UserRole.ADMIN
echo  - Added UserRole.MANAGER support
echo  - Clients can now be assigned to Admins/Managers/Leads
echo.
echo NOW TEST:
echo  1. Go to Clients page
echo  2. Click "Add Client"
echo  3. Fill form and Save
echo  4. Should work without 500 error!
echo.
pause

