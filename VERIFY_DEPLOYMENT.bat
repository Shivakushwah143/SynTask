@echo off
cls
color 0B
echo.
echo ═══════════════════════════════════════════════════════════
echo    VERIFYING TASK DETAIL DEPLOYMENT
echo ═══════════════════════════════════════════════════════════
echo.

echo [1] Checking if frontend was built...
if exist "C:\Users\Administrator\Documents\task management\frontend\dist\index.html" (
    echo ✓ Build exists in development
    for %%I in ("C:\Users\Administrator\Documents\task management\frontend\dist\index.html") do echo   Last modified: %%~tI
) else (
    color 0C
    echo ✗ Build NOT found in development!
    echo   Run: cd frontend ^&^& npm run build
    pause
    exit /b 1
)
echo.

echo [2] Checking if copied to production...
if exist "C:\apps\task-management\frontend\dist\index.html" (
    echo ✓ Build exists in production
    for %%I in ("C:\apps\task-management\frontend\dist\index.html") do echo   Last modified: %%~tI
) else (
    color 0C
    echo ✗ Build NOT found in production!
    echo   Run: robocopy development\dist production\dist /E
    pause
    exit /b 1
)
echo.

echo [3] Checking TaskDetail.jsx changes...
findstr /C:"text-3xl" "C:\Users\Administrator\Documents\task management\frontend\src\pages\TaskDetail.jsx" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ TaskDetail.jsx has text-3xl ^(title improvement^)
) else (
    color 0E
    echo ⚠ TaskDetail.jsx missing text-3xl!
)

findstr /C:"Description" "C:\Users\Administrator\Documents\task management\frontend\src\pages\TaskDetail.jsx" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ TaskDetail.jsx has Description heading
) else (
    color 0E
    echo ⚠ TaskDetail.jsx missing Description heading!
)

findstr /C:"bg-gradient-to-br" "C:\Users\Administrator\Documents\task management\frontend\src\pages\TaskDetail.jsx" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ TaskDetail.jsx has gradient avatars
) else (
    color 0E
    echo ⚠ TaskDetail.jsx missing gradient avatars!
)
echo.

echo [4] Checking PM2 status...
pm2 list | findstr "task-management-frontend" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Frontend process running
    pm2 describe task-management-frontend | findstr "status"
) else (
    color 0C
    echo ✗ Frontend NOT running!
)
echo.

echo [5] Checking file sizes...
echo Development build:
dir /s "C:\Users\Administrator\Documents\task management\frontend\dist\assets\*.js" 2>nul | findstr "File(s)"
echo.
echo Production build:
dir /s "C:\apps\task-management\frontend\dist\assets\*.js" 2>nul | findstr "File(s)"
echo.

color 0A
echo ═══════════════════════════════════════════════════════════
echo    VERIFICATION COMPLETE
echo ═══════════════════════════════════════════════════════════
echo.
echo NEXT STEPS:
echo 1. Hard refresh browser: Ctrl + Shift + R
echo 2. Clear browser cache completely
echo 3. Open DevTools ^(F12^) -^> Network tab
echo 4. Click on a task
echo 5. Check if TaskDetail.jsx is loaded
echo.
echo If still showing old UI:
echo - Try incognito/private window
echo - Check Caddy is serving from correct directory
echo - Verify: pm2 logs task-management-frontend
echo.
pause

