# Script d'enrôlement rapide Device Owner via ADB pour Samsung Galaxy A34 5G
# Prérequis :
# 1. Le téléphone doit être sorti d'usine (Factory Reset) OU ne posséder AUCUN compte Google configuré.
# 2. Le débogage USB doit être activé dans les options pour développeurs.

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   LockER - Enrôlement Device Owner (Samsung Galaxy A34)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Vérification de la présence d'un appareil connecté
$devices = adb devices | Select-String "device$"
if (-not $devices) {
    Write-Host "[ERREUR] Aucun appareil Android détecté via ADB." -ForegroundColor Red
    Write-Host "Veuillez connecter le Samsung A34 5G et autoriser le débogage USB." -ForegroundColor Yellow
    Exit 1
}

Write-Host "[OK] Appareil Samsung détecté." -ForegroundColor Green

# 1. Installation de l'APK Agent
$apkPath = "..\android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkPath)) {
    $apkPath = "app-release.apk"
}

if (Test-Path $apkPath) {
    Write-Host "[1/3] Installation de l'APK AgentVerrouillage..." -ForegroundColor Yellow
    adb install -r -t $apkPath
} else {
    Write-Host "[INFO] APK non trouvé à $apkPath. Assurez-vous que l'application est déjà installée sur l'appareil." -ForegroundColor Yellow
}

# 2. Définition du statut Device Owner
Write-Host "[2/3] Attribution du statut Device Owner à LockER..." -ForegroundColor Yellow
$dpmOutput = adb shell dpm set-device-owner com.locker.agent/.receiver.LockerDeviceAdminReceiver 2>&1

if ($dpmOutput -match "Success") {
    Write-Host "[SUCCÈS] L'application LockER est désormais Device Owner officiel !" -ForegroundColor Green
} else {
    Write-Host "[AVERTISSEMENT] Sortie ADB : $dpmOutput" -ForegroundColor Yellow
    if ($dpmOutput -match "already have accounts") {
        Write-Host "[ERREUR] Des comptes (Google, Samsung, WhatsApp) existent déjà sur le téléphone." -ForegroundColor Red
        Write-Host "Le téléphone DOIT être réinitialisé (Paramètres -> Gestion globale -> Réinitialisation)." -ForegroundColor Red
        Exit 1
    }
}

# 3. Octroi automatique des permissions critiques (Éviter les popups à l'écran)
Write-Host "[3/3] Configuration des permissions d'arrière-plan..." -ForegroundColor Yellow
adb shell pm grant com.locker.agent android.permission.CALL_PHONE
adb shell pm grant com.locker.agent android.permission.READ_PHONE_STATE

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   Enrôlement terminé avec succès pour le terminal !       " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
