@echo off
color 0E
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║   RESTORE PREVIOUS VERSION                ║
echo ╚════════════════════════════════════════════╝
echo.

cd /d C:\apps\task-management\frontend

if exist "dist.backup" (
    echo Backup found! Restoring...
    
    echo [1/3] Removing current dist...
    rd /s /q "dist" 2>nul
    
    echo [2/3] Restoring backup...
    move "dist.backup" "dist"
    
    echo [3/3] Restarting frontend...
    cd /d C:\apps\task-management
    pm2 restart task-management-frontend
    
    echo.
    color 0A
    echo ✓ Backup restored!
    echo.
    echo Try accessing the site now.
) else (
    color 0C
    echo ✗ No backup found!
    echo Cannot restore previous version.
)
echo.
pause

