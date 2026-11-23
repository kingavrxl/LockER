"""
Générateur de QR Code d'installation directe pour smartphones Android
Permet d'installer directement l'application LockER sans brancher de câble USB :
Scannez simplement ce QR Code avec l'appareil photo de n'importe quel smartphone.
"""

import os
import qrcode

def create_qr_image(
    url: str = "https://locker-2nuk.onrender.com/download/app-release.apk",
    output_path: str = "enrollment_qr.png"
):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output_path)
    print(f"[OK] Fichier image du QR Code généré à : {os.path.abspath(output_path)}")
    return output_path


if __name__ == "__main__":
    out_scripts = os.path.join(os.path.dirname(__file__), "enrollment_qr.png")
    out_frontend = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "enrollment_qr.png")
    create_qr_image(output_path=out_scripts)
    create_qr_image(output_path=out_frontend)
