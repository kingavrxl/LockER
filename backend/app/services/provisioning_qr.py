import base64
import hashlib
import io
import json
import os
from typing import Any, Dict, Optional

import qrcode

from app.core.config import settings

DEVICE_ADMIN_COMPONENT_NAME = "com.locker.agent/.receiver.LockerDeviceAdminReceiver"
ALLOWED_WIFI_SECURITY = {"WPA", "WEP", "NONE", "EAP"}


def get_apk_candidate_paths() -> list[str]:
    base_app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    backend_dir = os.path.abspath(os.path.join(base_app_dir, ".."))
    repo_dir = os.path.abspath(os.path.join(backend_dir, ".."))
    return [
        os.path.join(backend_dir, "static", "app-release.apk"),
        os.path.join(repo_dir, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
        os.path.join(repo_dir, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
        os.path.join(repo_dir, "scripts", "app-release.apk"),
    ]


def find_apk_path() -> Optional[str]:
    for candidate in get_apk_candidate_paths():
        if os.path.isfile(candidate):
            return candidate
    return None


def compute_apk_info(apk_path: str) -> Dict[str, Any]:
    sha256 = hashlib.sha256()
    size_bytes = 0
    with open(apk_path, "rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            sha256.update(chunk)
            size_bytes += len(chunk)

    digest = sha256.digest()
    b64url_nopad = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return {
        "path": apk_path,
        "filename": os.path.basename(apk_path),
        "size_bytes": size_bytes,
        "sha256_hex": sha256.hexdigest(),
        "sha256_b64url": b64url_nopad,
    }


def normalize_server_base_url(server_url: str) -> str:
    clean = (server_url or "").strip().rstrip("/")
    if clean.lower().endswith("/api/v1"):
        clean = clean[: -len("/api/v1")].rstrip("/")
    return clean


def build_provisioning_payload(
    server_url: str,
    apk_checksum_b64url: str,
    support_phone: Optional[str] = None,
    wifi_ssid: Optional[str] = None,
    wifi_password: Optional[str] = None,
    wifi_security: Optional[str] = None,
    wifi_hidden: bool = False,
    time_zone: Optional[str] = None,
) -> Dict[str, Any]:
    clean_base = normalize_server_base_url(server_url)
    download_url = f"{clean_base}/download/app-release.apk"

    payload: Dict[str, Any] = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": DEVICE_ADMIN_COMPONENT_NAME,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": download_url,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM": apk_checksum_b64url,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": True,
        "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": True,
        "android.app.extra.PROVISIONING_SKIP_EDUCATION_SCREENS": True,
        "android.app.extra.PROVISIONING_USE_MOBILE_DATA": True,
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
            "server_url": clean_base,
            "support_phone": (support_phone or settings.SUPPORT_PHONE_NUMBER).strip(),
            "country": "Benin",
        },
    }

    if time_zone and time_zone.strip():
        payload["android.app.extra.PROVISIONING_TIME_ZONE"] = time_zone.strip()

    clean_ssid = (wifi_ssid or "").strip()
    if clean_ssid:
        payload["android.app.extra.PROVISIONING_WIFI_SSID"] = clean_ssid
        sec = (wifi_security or "").strip().upper()
        if sec in ALLOWED_WIFI_SECURITY:
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


def serialize_provisioning_payload(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def render_provisioning_qr_png(payload_json: str) -> bytes:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(payload_json)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()
