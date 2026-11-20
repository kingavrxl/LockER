# Script d'assistance et de compilation pour l'APK LockER Agent
# Emplacement de sortie cible : android\app\build\outputs\apk\release\app-release.apk

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "      LockER - Compilation de l'APK Agent MDM            " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Vérification de Java (JDK 17+)
$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if (-not $javaCmd) {
    Write-Host "[INFO] Java n'est pas encore installé ou n'est pas dans le PATH." -ForegroundColor Yellow
    Write-Host "Pour installer OpenJDK 17 via winget :" -ForegroundColor Cyan
    Write-Host "  winget install Microsoft.OpenJDK.17" -ForegroundColor White
    Write-Host "Ou installez Android Studio (inclut JDK 17 et le SDK Android)." -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "[OK] Environnement Java détecté." -ForegroundColor Green
}

# 2. Vérification du SDK Android
$androidSdk = $env:ANDROID_HOME
if (-not $androidSdk) {
    $androidSdk = $env:ANDROID_SDK_ROOT
}
if (-not $androidSdk) {
    $potentialPath = "$env:LOCALAPPDATA\Android\Sdk"
    if (Test-Path $potentialPath) {
        $androidSdk = $potentialPath
        $env:ANDROID_HOME = $androidSdk
    }
}

if ($androidSdk -and (Test-Path $androidSdk)) {
    Write-Host "[OK] SDK Android détecté à : $androidSdk" -ForegroundColor Green
} else {
    Write-Host "[INFO] SDK Android non détecté dans les variables d'environnement." -ForegroundColor Yellow
    Write-Host "Emplacement standard : %LOCALAPPDATA%\Android\Sdk" -ForegroundColor Gray
}

# 3. Procédure de compilation
Write-Host ""
Write-Host "Commandes de compilation recommandées :" -ForegroundColor Cyan
Write-Host "  Option A (Android Studio) : Ouvrir le dossier 'android' dans Android Studio > Build > Build APK(s)" -ForegroundColor White
Write-Host "  Option B (Ligne de commande) :" -ForegroundColor White
Write-Host "    cd android" -ForegroundColor Gray
Write-Host "    gradle assembleRelease (ou ./gradlew assembleRelease)" -ForegroundColor Gray
Write-Host ""
Write-Host "L'APK compilé sera automatiquement utilisé par scripts/enroll_adb.ps1 pour l'enrôlement direct." -ForegroundColor Green
