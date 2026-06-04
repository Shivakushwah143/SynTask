@echo off
cls
echo.
echo ╔════════════════════════════════════════╗
echo ║  FIXING INVOICES + MSA BUTTONS         ║
echo ╚════════════════════════════════════════╝
echo.

REM Build Frontend
echo [1/3] Building Frontend...
cd /d "C:\Users\Administrator\Documents\task management\frontend"
call npm run build
if %errorlevel% neq 0 (
    echo ✗ BUILD FAILED!
    pause
    exit /b 1
)
echo ✓ Build successful!
echo.

REM Copy to Production
echo [2/3] Copying to Production...
robocopy "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist" /E /IS /IT
echo ✓ Files copied!
echo.

REM Restart Frontend
echo [3/3] Restarting Frontend...
cd /d C:\apps\task-management
call pm2 restart task-management-frontend
timeout /t 3 /nobreak >nul
echo ✓ Frontend restarted!
echo.

echo ╔════════════════════════════════════════╗
echo ║         FIXES APPLIED                  ║
echo ╚════════════════════════════════════════╝
echo.
echo INVOICES PAGE:
echo  - Role check: company_admin → admin
echo  - Added Manager support
echo  - Create Invoice button visible for Admin/Manager
echo.
echo MSA PAGE:
echo  - Role check: company_admin → admin
echo  - Added Manager support
echo  - Create MSA button visible for Admin/Manager
echo.
echo ════════════════════════════════════════
echo   CLEAR BROWSER CACHE & TEST
echo ════════════════════════════════════════
echo.
echo 1. Press: Ctrl + Shift + Delete
echo 2. Clear: "Cached images and files"
echo 3. Press: Ctrl + Shift + R (Hard Refresh)
echo 4. Test: Invoices page - "+ New Invoice" button
echo 5. Test: MSA page - "+ New MSA" button
echo.
pause

