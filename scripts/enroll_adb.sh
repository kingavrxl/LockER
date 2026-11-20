#!/usr/bin/env bash
# Script d'enrôlement rapide Device Owner via ADB sous Linux/macOS
set -e

echo "=== LockER : Enrôlement Device Owner Samsung Galaxy A34 5G ==="

if ! command -v adb &> /dev/null; then
    echo "[ERREUR] ADB n'est pas installé ou n'est pas dans le PATH."
    exit 1
fi

DEVICE_COUNT=$(adb devices | grep -w "device" | wc -l)
if [ "$DEVICE_COUNT" -eq 0 ]; then
    echo "[ERREUR] Aucun appareil connecté en mode débogage USB."
    exit 1
fi

echo "[1/2] Configuration du composant Device Owner..."
adb shell dpm set-device-owner com.locker.agent/.receiver.LockerDeviceAdminReceiver

echo "[2/2] Octroi des permissions téléphonie..."
adb shell pm grant com.locker.agent android.permission.CALL_PHONE
adb shell pm grant com.locker.agent android.permission.READ_PHONE_STATE

echo "=== Enrôlement terminé avec succès ! ==="
