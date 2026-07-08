param(
    [switch]$Production
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

function Ensure-EnvFile {
    param(
        [string]$ExamplePath,
        [string]$TargetPath
    )

    if (-not (Test-Path $TargetPath)) {
        Copy-Item -Path $ExamplePath -Destination $TargetPath
        Write-Host "Created $TargetPath from $ExamplePath"
    }
}

Ensure-EnvFile -ExamplePath "backend/.env.example" -TargetPath "backend/.env"
Ensure-EnvFile -ExamplePath "frontend/.env.example" -TargetPath "frontend/.env"

if ($Production) {
    docker compose -f docker-compose.prod.yml config | Out-Null
} else {
    docker compose -f docker-compose.dev.yml config | Out-Null
}

if ($Production) {
    docker compose -f docker-compose.prod.yml up --build -d
    Write-Host "Production stack started."
    Write-Host "Public URL: http://localhost"
    Write-Host "Backend health: http://localhost/health (proxied through Nginx)"
} else {
    docker compose -f docker-compose.dev.yml up --build -d
    Write-Host "Development stack started."
    Write-Host "Frontend: http://localhost:3000"
    Write-Host "Backend: http://localhost:8000"
}

Write-Host "Use 'make logs' or 'docker compose -f docker-compose.dev.yml logs -f' to follow logs."
