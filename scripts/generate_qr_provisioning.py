"""
Générateur de QR Code Android Enterprise pour Samsung Galaxy A34 5G
Permet d'enrôler directement les téléphones sortis d'usine sans brancher de câble USB :
1. Allumer le Galaxy A34 (écran de premier démarrage "Bienvenue").
2. Tapoter 6 ou 7 fois sur un espace vide de l'écran.
3. Le lecteur QR Code s'ouvre : scanner le QR généré par ce script.
"""

import json
import os
import sys
import qrcode

def generate_provisioning_payload(
    apk_download_url: str = "http://192.168.100.30:8000/download/app-release.apk",
    apk_sha256_checksum: str = "J4LMCIeac8vKo3aGsa_S-VH5FBYGxyRvm9yaPU4_jVQ",
    server_api_url: str = "http://192.168.100.30:8000/api/v1",
    support_phone: str = "+2290191521518"
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
    return json.dumps(payload, separators=(',', ':'))


def create_qr_image(output_path: str = "enrollment_qr.png"):
    qr_data = generate_provisioning_payload()
    
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output_path)
    print(f"[OK] Fichier image du QR Code généré à : {os.path.abspath(output_path)}")
    return output_path


if __name__ == "__main__":
    out_img = os.path.join(os.path.dirname(__file__), "enrollment_qr.png")
    create_qr_image(out_img)
