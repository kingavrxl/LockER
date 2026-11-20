# Script de lancement rapide du Dashboard Web React

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       LockER - Démarrage du Tableau de Bord Web          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$frontendDir = Split-Path -Parent $PSScriptRoot | Join-Path -ChildPath "frontend"
Set-Location $frontendDir

Write-Host "[OK] Lancement du serveur Vite sur http://localhost:3000..." -ForegroundColor Green
npm run dev
