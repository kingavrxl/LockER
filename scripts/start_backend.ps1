# Script de lancement rapide du Backend FastAPI en local

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "           LockER - Démarrage du Backend API              " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$backendDir = Split-Path -Parent $PSScriptRoot | Join-Path -ChildPath "backend"
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "[ERREUR] Environnement virtuel introuvable à $venvPython" -ForegroundColor Red
    Write-Host "Créez le venv avec : python -m venv backend/venv && backend/venv/Scripts/pip install -r backend/requirements.txt" -ForegroundColor Yellow
    Exit 1
}

Set-Location $backendDir
Write-Host "[OK] Lancement de l'API FastAPI sur http://localhost:8000 (Documentation Swagger : http://localhost:8000/docs)..." -ForegroundColor Green
& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
