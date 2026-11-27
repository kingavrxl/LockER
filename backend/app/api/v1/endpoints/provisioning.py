from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from app.core.config import settings
from app.services.provisioning_qr import (
    build_provisioning_payload,
    compute_apk_info,
    find_apk_path,
    normalize_server_base_url,
    render_provisioning_qr_png,
    serialize_provisioning_payload,
)

router = APIRouter(prefix="/provisioning", tags=["Android Enterprise Provisioning"])


def _resolve_server_url(request: Request, server_url: Optional[str]) -> str:
    if server_url and server_url.strip():
        clean = normalize_server_base_url(server_url)
        parsed = urlparse(clean)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise HTTPException(status_code=400, detail="URL serveur invalide (http/https requis).")
        return clean

    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if forwarded_host:
        scheme = forwarded_proto.split(",")[0].strip() if forwarded_proto else request.url.scheme
        return f"{scheme}://{forwarded_host}".rstrip("/")

    return normalize_server_base_url(str(request.base_url))


@router.get("/payload")
async def get_provisioning_payload(
    request: Request,
    server_url: Optional[str] = Query(None, description="URL racine du serveur LockER (ex: https://locker-2nuk.onrender.com)"),
    wifi_ssid: Optional[str] = Query(None, description="Nom du réseau Wi-Fi à préconfigurer (optionnel)"),
    wifi_password: Optional[str] = Query(None, description="Mot de passe Wi-Fi (optionnel)"),
    wifi_security: Optional[str] = Query(None, description="Type de sécurité Wi-Fi : WPA, WEP, NONE, EAP"),
    wifi_hidden: bool = Query(False, description="Réseau Wi-Fi caché"),
):
    """
    Retourne le payload JSON officiel Android Enterprise (6/7-tap QR provisioning)
    avec le checksum SHA-256 URL-safe exact de l'APK hébergé sur /download/app-release.apk.
    """
    apk_path = find_apk_path()
    if not apk_path:
        raise HTTPException(status_code=404, detail="L'APK LockER (app-release.apk) est introuvable sur le serveur.")

    apk_info = compute_apk_info(apk_path)
    resolved_url = _resolve_server_url(request, server_url)
    payload = build_provisioning_payload(
        server_url=resolved_url,
        apk_checksum_b64url=apk_info["sha256_b64url"],
        support_phone=settings.SUPPORT_PHONE_NUMBER,
        wifi_ssid=wifi_ssid,
        wifi_password=wifi_password,
        wifi_security=wifi_security,
        wifi_hidden=wifi_hidden,
    )
    return {
        "mode": "ANDROID_ENTERPRISE_FULLY_MANAGED",
        "tap_count_hint": "6-7",
        "server_url": resolved_url,
        "apk_filename": apk_info["filename"],
        "apk_size_bytes": apk_info["size_bytes"],
        "apk_checksum_sha256_b64url": apk_info["sha256_b64url"],
        "apk_checksum_sha256_hex": apk_info["sha256_hex"],
        "payload": payload,
        "payload_json": serialize_provisioning_payload(payload),
    }


@router.api_route("/qr.png", methods=["GET", "HEAD"])
async def get_provisioning_qr_png(
    request: Request,
    server_url: Optional[str] = Query(None),
    wifi_ssid: Optional[str] = Query(None),
    wifi_password: Optional[str] = Query(None),
    wifi_security: Optional[str] = Query(None),
    wifi_hidden: bool = Query(False),
):
    """
    Génère dynamiquement l'image PNG du QR Code Android Enterprise 7-tap
    à scanner directement depuis l'écran de démarrage d'un téléphone neuf ou réinitialisé.
    """
    apk_path = find_apk_path()
    if not apk_path:
        raise HTTPException(status_code=404, detail="L'APK LockER (app-release.apk) est introuvable sur le serveur.")

    apk_info = compute_apk_info(apk_path)
    resolved_url = _resolve_server_url(request, server_url)
    payload = build_provisioning_payload(
        server_url=resolved_url,
        apk_checksum_b64url=apk_info["sha256_b64url"],
        support_phone=settings.SUPPORT_PHONE_NUMBER,
        wifi_ssid=wifi_ssid,
        wifi_password=wifi_password,
        wifi_security=wifi_security,
        wifi_hidden=wifi_hidden,
    )
    png_bytes = render_provisioning_qr_png(serialize_provisioning_payload(payload))
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Cache-Control": "no-store, max-age=0"},
    )
