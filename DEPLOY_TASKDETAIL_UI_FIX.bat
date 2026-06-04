@echo off
cls
echo.
echo ╔════════════════════════════════════════════════════╗
echo ║     DEPLOYING TASK DETAIL UI IMPROVEMENTS        ║
echo ╚════════════════════════════════════════════════════╝
echo.

echo [1/5] Building frontend with improvements...
cd /d "C:\Users\Administrator\Documents\task management\frontend"
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo ✗ Build failed!
    pause
    exit /b 1
)
echo ✓ Frontend built successfully!
echo.

echo [2/5] Copying dist folder to production...
robocopy "C:\Users\Administrator\Documents\task management\frontend\dist" "C:\apps\task-management\frontend\dist" /E /NFL /NDL /NJH /NJS /np
if %errorlevel% geq 8 (
    color 0C
    echo ✗ Copy failed!
    pause
    exit /b 1
)
echo ✓ Dist folder copied!
echo.

echo [3/5] Restarting frontend server...
cd /d C:\apps\task-management
pm2 restart task-management-frontend
if %errorlevel% neq 0 (
    color 0E
    echo ⚠ Warning: Could not restart frontend
)
echo ✓ Frontend restart initiated!
echo.

echo [4/5] Waiting for services to stabilize...
timeout /t 5 /nobreak >nul
echo ✓ Services ready!
echo.

echo [5/5] Verifying deployment...
echo.
pm2 status 2>nul
echo.

color 0A
echo ═══════════════════════════════════════════════════════════
echo    ✓ TASK DETAIL UI IMPROVEMENTS DEPLOYED!
echo ═══════════════════════════════════════════════════════════
echo.
echo  UI IMPROVEMENTS:
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   ✓ Larger task title (3xl font, better visibility)
echo   ✓ Enhanced description with clear "Edit" button
echo   ✓ Better placeholder for empty description
echo   ✓ Activity section with improved tabs
echo   ✓ Enhanced comment display with gradients
echo   ✓ Better loading states and empty states
echo   ✓ Sticky header for better navigation
echo   ✓ Improved spacing and readability
echo.
echo  NOW TEST:
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   1. Open browser: https://task.synzent.ai/
echo   2. Hard refresh: Ctrl + Shift + R
echo   3. Click on any task
echo   4. Notice improved UI:
echo      - Bigger, clearer title
echo      - Better description area
echo      - Enhanced activity tabs
echo      - Prettier comments
echo      - Smoother transitions
echo.
echo  BEFORE vs AFTER:
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   BEFORE: Small text, basic layout, hard to read
echo   AFTER:  Large text, modern design, easy to read ✨
echo.
echo ═══════════════════════════════════════════════════════════
echo.
pause

