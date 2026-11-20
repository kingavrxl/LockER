"""
Générateur de QR Code Android Enterprise pour Samsung Galaxy A34 5G
Permet d'enrôler directement les téléphones sortis d'usine sans brancher de câble USB :
1. Allumer le Galaxy A34 (écran de premier démarrage "Bienvenue").
2. Tapoter 6 fois sur un espace vide de l'écran.
3. Le lecteur QR Code s'ouvre : scanner le QR généré par ce script.
"""

import json
import hashlib
import sys

def generate_provisioning_payload(
    apk_download_url: str,
    apk_sha256_checksum: str,
    server_api_url: str = "https://api.votre-domaine.bj/api/v1",
    support_phone: str = "+22997000000"
) -> str:
    payload = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.locker.agent/.receiver.LockerDeviceAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": apk_download_url,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM": apk_sha256_checksum,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": True,
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
            "server_url": server_api_url,
            "support_phone": support_phone,
            "country": "Bénin"
        }
    }
    return json.dumps(payload, indent=2)


if __name__ == "__main__":
    url = "https://downloads.votre-domaine.bj/agent-v1.0.0.apk"
    checksum = "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890" # Remplacer par le hash sha256 réel du fichier APK
    
    qr_data = generate_provisioning_payload(url, checksum)
    print("Données de provisionnement Android Enterprise (JSON) :")
    print(qr_data)
    print("\nAstuce : Vous pouvez copier ce JSON sur un générateur de QR code (ex: qrcode-monkey.com) ou utiliser la librairie 'qrcode' python pour générer l'image PNG.")
