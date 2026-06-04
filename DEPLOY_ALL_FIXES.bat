@echo off
cls
echo.
echo ╔════════════════════════════════════════════════════╗
echo ║  DEPLOYING ALL ROLE FIX - COMPLETE PROJECT SCAN   ║
echo ╚════════════════════════════════════════════════════╝
echo.

REM ===== FRONTEND =====
echo ════════════════════════════════════════════════════
echo   FRONTEND DEPLOYMENT
echo ════════════════════════════════════════════════════
echo.

echo [1/6] Building Frontend...
cd /d "C:\Users\Administrator\Documents\task management\frontend"
call npm run build
if %errorlevel% neq 0 (
    echo ✗ BUILD FAILED!
    pause
    exit /b 1
)
echo ✓ Frontend build successful!
echo.

echo [2/6] Copying Frontend to Production...
robocopy "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist" /E /IS /IT /NFL /NDL /NJH /NJS
echo ✓ Frontend files copied!
echo.

echo [3/6] Restarting Frontend...
cd /d C:\apps\task-management
call pm2 restart task-management-frontend
timeout /t 2 /nobreak >nul
echo ✓ Frontend restarted!
echo.

REM ===== BACKEND =====
echo ════════════════════════════════════════════════════
echo   BACKEND DEPLOYMENT
echo ════════════════════════════════════════════════════
echo.

echo [4/6] Copying Backend Files...
copy /Y "C:\Users\Administrator\Documents\task management\backend\app\core\email.py" "C:\apps\task-management\backend\app\core\email.py" >nul
copy /Y "C:\Users\Administrator\Documents\task management\backend\app\api\v1\endpoints\companies.py" "C:\apps\task-management\backend\app\api\v1\endpoints\companies.py" >nul
echo ✓ Backend files copied!
echo.

echo [5/6] Restarting Backend...
call pm2 restart task-management-backend
timeout /t 3 /nobreak >nul
echo ✓ Backend restarted!
echo.

REM ===== SUMMARY =====
echo [6/6] Deployment Summary...
echo.
echo ════════════════════════════════════════════════════
echo   DEPLOYMENT COMPLETE!
echo ════════════════════════════════════════════════════
echo.
echo ✓ FIXED FILES:
echo.
echo FRONTEND (13 files):
echo   - Dashboard.jsx
echo   - Tasks.jsx
echo   - Tickets.jsx
echo   - Calendar.jsx
echo   - MyTimesheet.jsx
echo   - Ledger.jsx
echo   - Clients.jsx (already fixed)
echo   - Invoices.jsx (already fixed)
echo   - MSA.jsx (already fixed)
echo   - ProjectBoard.jsx
echo   - Users.jsx
echo   - ManageTeamMembers.jsx
echo   - TaskDetailModal.jsx
echo.
echo BACKEND (3 files):
echo   - email.py
echo   - companies.py
echo   - clients.py (already fixed)
echo.
echo ════════════════════════════════════════════════════
echo   ACTION REQUIRED: CLEAR BROWSER CACHE
echo ════════════════════════════════════════════════════
echo.
echo 1. Press: Ctrl + Shift + Delete
echo 2. Select: "Cached images and files"
echo 3. Click: "Clear data"
echo 4. Press: Ctrl + Shift + R (Hard Refresh)
echo.
echo ════════════════════════════════════════════════════
echo   TEST ALL PAGES
echo ════════════════════════════════════════════════════
echo.
echo Check these pages for "+ New" buttons:
echo   ✓ Clients
echo   ✓ Invoices
echo   ✓ MSA
echo   ✓ Ledger
echo   ✓ Meetings
echo   ✓ Tasks
echo   ✓ Tickets
echo.
echo All should work for Admin/Manager roles!
echo.
pause

