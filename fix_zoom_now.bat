@echo off
echo ========================================
echo FIXING ZOOM CREDENTIALS - PRODUCTION
echo ========================================
echo.

cd /d C:\apps\task-management\backend

echo Checking for existing Zoom credentials...
findstr /C:"ZOOM_CLIENT_ID" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo Zoom credentials already exist. Skipping...
) else (
    echo Adding Zoom credentials to PRODUCTION .env...
    echo. >> .env
    echo # Zoom Integration >> .env
    echo ZOOM_CLIENT_ID=pFPqe49pQu2raq4mdHqEPA >> .env
    echo ZOOM_CLIENT_SECRET=2IoLel2vpHs6NiXd6Jw3VQIaviUnGDXq >> .env
    echo ZOOM_ACCOUNT_ID=zajGYUUUS-OZ3PYeI5zxfA >> .env
    echo.
    echo SUCCESS! Credentials added.
)

echo.
echo Verifying credentials...
type .env | findstr ZOOM
echo.

echo ========================================
echo RESTARTING BACKEND...
echo ========================================
cd /d C:\apps\task-management
pm2 restart task-management-backend --update-env
pm2 info task-management-backend

echo.
echo ========================================
echo DONE!
echo ========================================
echo.
echo Next steps:
echo 1. Hard refresh browser (Ctrl+Shift+R)
echo 2. Delete ALL old meetings
echo 3. Create NEW meeting
echo 4. Join Meeting button will appear!
echo.
pause

