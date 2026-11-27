"""
Générateur de QR Code Android Enterprise (6/7 taps à l'allumage) pour LockER MDM.

Permet d'enrôler un nouveau smartphone Android (ou réinitialisé d'usine) dès l'écran de bienvenue :
1. Allumer le téléphone sur l'écran "Bienvenue" (sans compte Google configuré).
2. Tapoter 7 fois rapidement sur un espace vide de l'écran d'accueil.
3. Scanner ce QR Code : Android télécharge l'APK, vérifie son empreinte SHA-256,
   active automatiquement LockER comme Device Owner et configure le serveur Cloud.
"""

import argparse
import base64
import hashlib
import json
import os
import sys
from typing import Any, Dict, Optional

import qrcode

DEFAULT_SERVER_URL = "https://locker-2nuk.onrender.com"
DEFAULT_SUPPORT_PHONE = "+2290191521518"
DEFAULT_TIME_ZONE = "Africa/Porto-Novo"
DEVICE_ADMIN_COMPONENT = "com.locker.agent/com.locker.agent.receiver.LockerDeviceAdminReceiver"


def find_default_apk(repo_root: str) -> str:
    candidates = [
        os.path.join(repo_root, "backend", "static", "app-release.apk"),
        os.path.join(repo_root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
        os.path.join(repo_root, "scripts", "app-release.apk"),
    ]
    for candidate in candidates:
        if os.path.isfile(candidate):
            return os.path.abspath(candidate)
    raise FileNotFoundError(
        "Aucun APK app-release.apk trouvé. Compilez d'abord l'application Android ou placez l'APK dans backend/static/app-release.apk."
    )


def compute_package_checksum_b64url(apk_path: str) -> str:
    sha256 = hashlib.sha256()
    with open(apk_path, "rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            sha256.update(chunk)
    return base64.urlsafe_b64encode(sha256.digest()).decode("ascii").rstrip("=")


def normalize_server_url(server_url: str) -> str:
    clean = server_url.strip().rstrip("/")
    if clean.lower().endswith("/api/v1"):
        clean = clean[: -len("/api/v1")].rstrip("/")
    return clean


def generate_provisioning_payload(
    apk_checksum_b64url: str,
    server_url: str = DEFAULT_SERVER_URL,
    support_phone: str = DEFAULT_SUPPORT_PHONE,
    wifi_ssid: Optional[str] = None,
    wifi_password: Optional[str] = None,
    wifi_security: Optional[str] = None,
    wifi_hidden: bool = False,
    time_zone: str = DEFAULT_TIME_ZONE,
) -> Dict[str, Any]:
    clean_base = normalize_server_url(server_url)
    apk_download_url = f"{clean_base}/download/app-release.apk"

    payload: Dict[str, Any] = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": DEVICE_ADMIN_COMPONENT,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": apk_download_url,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM": apk_checksum_b64url,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": True,
        "android.app.extra.PROVISIONING_USE_MOBILE_DATA": True,
        "android.app.extra.PROVISIONING_TIME_ZONE": time_zone,
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
            "server_url": clean_base,
            "support_phone": support_phone,
            "country": "Benin",
        },
    }

    if wifi_ssid and wifi_ssid.strip():
        payload["android.app.extra.PROVISIONING_WIFI_SSID"] = wifi_ssid.strip()
        sec = (wifi_security or "").strip().upper()
        if sec in {"WPA", "WEP", "NONE", "EAP"}:
            payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = sec
        elif wifi_password:
            payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = "WPA"
        else:
            payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = "NONE"

        if wifi_password:
            payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = wifi_password
        if wifi_hidden:
            payload["android.app.extra.PROVISIONING_WIFI_HIDDEN"] = True

    return payload


def create_qr_image(payload_json: str, output_path: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(payload_json)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output_path)
    print(f"[OK] QR Code Android Enterprise généré : {os.path.abspath(output_path)}")
    return output_path


def main() -> int:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    parser = argparse.ArgumentParser(
        description="Génère le QR Code Android Enterprise (7 taps à l'allumage) pour LockER MDM."
    )
    parser.add_argument("--apk", help="Chemin vers app-release.apk (détecté automatiquement par défaut)")
    parser.add_argument("--server-url", default=DEFAULT_SERVER_URL, help="URL racine du serveur LockER")
    parser.add_argument("--support-phone", default=DEFAULT_SUPPORT_PHONE, help="Numéro de support flotte")
    parser.add_argument("--wifi-ssid", default=None, help="SSID Wi-Fi à préconfigurer (optionnel)")
    parser.add_argument("--wifi-password", default=None, help="Mot de passe Wi-Fi (optionnel)")
    parser.add_argument("--wifi-security", default=None, help="Sécurité Wi-Fi : WPA, WEP, NONE, EAP")
    parser.add_argument("--wifi-hidden", action="store_true", help="Marquer le réseau Wi-Fi comme caché")
    args = parser.parse_args()

    apk_path = os.path.abspath(args.apk) if args.apk else find_default_apk(repo_root)
    if not os.path.isfile(apk_path):
        print(f"[ERREUR] APK introuvable : {apk_path}", file=sys.stderr)
        return 1

    checksum = compute_package_checksum_b64url(apk_path)
    payload = generate_provisioning_payload(
        apk_checksum_b64url=checksum,
        server_url=args.server_url,
        support_phone=args.support_phone,
        wifi_ssid=args.wifi_ssid,
        wifi_password=args.wifi_password,
        wifi_security=args.wifi_security,
        wifi_hidden=args.wifi_hidden,
    )
    payload_json = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)

    print(f"[INFO] APK utilisé : {apk_path} ({os.path.getsize(apk_path)} octets)")
    print(f"[INFO] Checksum SHA-256 (URL-safe Base64) : {checksum}")
    print(f"[INFO] Payload JSON ({len(payload_json)} octets) :\n{payload_json}\n")

    outputs = [
        os.path.join(os.path.dirname(__file__), "enrollment_qr.png"),
        os.path.join(repo_root, "frontend", "public", "enrollment_qr.png"),
    ]
    dist_dir = os.path.join(repo_root, "backend", "static", "dist")
    if os.path.isdir(dist_dir):
        outputs.append(os.path.join(dist_dir, "enrollment_qr.png"))

    for out in outputs:
        create_qr_image(payload_json, out)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
