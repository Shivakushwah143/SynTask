# Task Detail UI Deployment Script
Write-Host "`n=== TASK DETAIL UI DEPLOYMENT ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build
Write-Host "[1/5] Building frontend..." -ForegroundColor Yellow
Set-Location "C:\Users\Administrator\Documents\task management\frontend"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Build complete!" -ForegroundColor Green
Write-Host ""

# Step 2: Copy
Write-Host "[2/5] Copying to production..." -ForegroundColor Yellow
$source = "C:\Users\Administrator\Documents\task management\frontend\dist\*"
$dest = "C:\apps\task-management\frontend\dist\"

# Remove old dist
if (Test-Path $dest) {
    Remove-Item -Path $dest -Recurse -Force
    Write-Host "  Removed old dist" -ForegroundColor Gray
}

# Copy new dist
Copy-Item -Path $source -Destination $dest -Recurse -Force
Write-Host "✓ Files copied!" -ForegroundColor Green
Write-Host ""

# Step 3: Verify
Write-Host "[3/5] Verifying files..." -ForegroundColor Yellow
if (Test-Path "C:\apps\task-management\frontend\dist\index.html") {
    Write-Host "✓ index.html found" -ForegroundColor Green
} else {
    Write-Host "✗ index.html missing!" -ForegroundColor Red
    exit 1
}

$jsFiles = Get-ChildItem "C:\apps\task-management\frontend\dist\assets\*.js" -ErrorAction SilentlyContinue
Write-Host "✓ Found $($jsFiles.Count) JS files" -ForegroundColor Green
Write-Host ""

# Step 4: Restart
Write-Host "[4/5] Restarting frontend..." -ForegroundColor Yellow
Set-Location "C:\apps\task-management"
pm2 restart task-management-frontend
Write-Host "✓ Frontend restarted!" -ForegroundColor Green
Write-Host ""

# Step 5: Status
Write-Host "[5/5] Checking status..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
pm2 list
Write-Host ""

Write-Host "=== DEPLOYMENT COMPLETE ===" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Clear browser cache!" -ForegroundColor Yellow
Write-Host "1. Press Ctrl + Shift + Delete" -ForegroundColor White
Write-Host "2. Select 'Cached images and files'" -ForegroundColor White
Write-Host "3. Click 'Clear data'" -ForegroundColor White
Write-Host ""
Write-Host "Then go to: https://task.synzent.ai/" -ForegroundColor Cyan
Write-Host "Click on any task to see the improvements!" -ForegroundColor Cyan
Write-Host ""

