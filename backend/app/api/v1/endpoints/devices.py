import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import verify_admin_api_key, verify_enrollment_key
from app.models.device import Device
from app.models.driver import Driver, PaymentStatusEnum
from app.models.payment import Payment
from app.models.audit_log import AuditLog
from app.schemas.device import DeviceRegisterRequest, DeviceHeartbeatRequest, DeviceOut
from app.core.config import settings

router = APIRouter(prefix="/devices", tags=["Devices"])


class DeviceTelemetryUpdate(BaseModel):
    latitude: float
    longitude: float
    battery_level: Optional[int] = 100
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    network_operator: Optional[str] = None
    wifi_ssid: Optional[str] = None
    device_token: Optional[str] = None


class DevicePairingSimulate(BaseModel):
    imei: str
    model: Optional[str] = "Smartphone Android"
    full_name: Optional[str] = "Conducteur"
    phone_number: Optional[str] = "+229 01 00 00 00 00"
    vehicle_plate: Optional[str] = "RB-0001-Benin"
    daily_rate_xof: Optional[int] = 5000
    latitude: Optional[float] = 6.3654
    longitude: Optional[float] = 2.4183
    ip_address: Optional[str] = "197.234.221.42"
    mac_address: Optional[str] = "38:F9:D3:5B:2A:10"
    network_operator: Optional[str] = "MTN Bénin"
    battery_level: Optional[int] = 95


async def resolve_target_device(
    db: AsyncSession,
    imei: str,
    android_id: Optional[str] = None,
    serial_number: Optional[str] = None
) -> Optional[Device]:
    """
    Résolution stricte du terminal matériel.
    JAMAIS de repli vers le premier élément de la base (élimination formelle de la faille SEC-04).
    """
    candidates = [i.strip() for i in [imei, android_id, serial_number] if i and i.strip()]
    for cand in candidates:
        # Correspondance exacte IMEI
        res = await db.execute(select(Device).where(Device.imei == cand))
        dev = res.scalars().first()
        if dev:
            return dev
        # Correspondance exacte numéro de série
        res = await db.execute(select(Device).where(Device.serial_number == cand))
        dev = res.scalars().first()
        if dev:
            return dev

    return None


@router.post("/register", response_model=DeviceOut)
async def register_device(
    payload: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Enregistre ou met à jour un terminal Android physique.
    Génère un auth_token cryptographique pour sécuriser la liaison WebSocket et les Heartbeats.
    """
    clean_imei = payload.imei.strip()
    if not clean_imei or len(clean_imei) < 4:
        raise HTTPException(status_code=400, detail="Identifiant matériel ou IMEI invalide.")

    device = await resolve_target_device(db, clean_imei, payload.android_id, payload.serial_number)

    now = datetime.now(timezone.utc)
    default_lease = now + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)

    if device:
        # Si l'appareil a déjà un auth_token, exiger sa correspondance ou autoriser la clé d'enrôlement
        if device.auth_token and payload.device_token:
            if not secrets.compare_digest(payload.device_token, device.auth_token) and not secrets.compare_digest(payload.device_token, settings.ADMIN_SECRET_KEY):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Jeton d'authentification matériel invalide.")

        if not device.auth_token:
            device.auth_token = secrets.token_hex(32)

        # Si l'appareil s'est initialement enregistré avant Device Owner avec un fallback (android_id / DEV_)
        # et qu'il renvoie maintenant son véritable IMEI matériel (14-16 chiffres), mettre à jour proprement.
        if (
            clean_imei != device.imei
            and clean_imei.isdigit()
            and 14 <= len(clean_imei) <= 16
            and not device.imei.isdigit()
        ):
            existing_imei_res = await db.execute(select(Device).where(Device.imei == clean_imei))
            if not existing_imei_res.scalars().first():
                device.imei = clean_imei

        if payload.serial_number and (not device.serial_number or device.serial_number.startswith("SN_")):
            device.serial_number = payload.serial_number

        device.model = payload.model or device.model
        device.app_version = payload.app_version or device.app_version
        device.last_heartbeat = now
        if payload.latitude is not None:
            device.latitude = payload.latitude
        if payload.longitude is not None:
            device.longitude = payload.longitude
        if payload.ip_address:
            device.ip_address = payload.ip_address
        if payload.mac_address:
            device.mac_address = payload.mac_address
        if payload.network_operator:
            device.network_operator = payload.network_operator
        if payload.wifi_ssid:
            device.wifi_ssid = payload.wifi_ssid
        if payload.battery_level is not None:
            device.battery_level = payload.battery_level
        if not device.lease_expires_at:
            device.lease_expires_at = default_lease
    else:
        # Nouveau terminal enrôlé : création du conducteur et attribution d'un auth_token
        driver_count_res = await db.execute(select(Driver))
        num = len(driver_count_res.scalars().all()) + 1
        new_driver = Driver(
            full_name=f"Conducteur {num}",
            phone_number=f"+229 01 {clean_imei[-8:-4] if len(clean_imei)>=8 else '9700'} {clean_imei[-4:] if len(clean_imei)>=4 else '0000'}",
            vehicle_plate=f"RB-{clean_imei[-4:] if len(clean_imei)>=4 else '0000'}-Benin",
            daily_rate_xof=settings.DAILY_PAYMENT_AMOUNT_XOF,
            current_status=PaymentStatusEnum.UP_TO_DATE,
            consecutive_overdue_days=0
        )
        db.add(new_driver)
        await db.flush()

        device = Device(
            driver_id=new_driver.id,
            imei=clean_imei,
            serial_number=payload.serial_number or payload.android_id or f"SN_{clean_imei[-6:] if len(clean_imei)>=6 else '000000'}",
            model=payload.model or "Smartphone Android",
            auth_token=secrets.token_hex(32),
            app_version=payload.app_version or "1.0.0",
            is_locked=False,
            last_heartbeat=now,
            lease_expires_at=default_lease,
            latitude=payload.latitude,
            longitude=payload.longitude,
            ip_address=payload.ip_address,
            mac_address=payload.mac_address,
            network_operator=payload.network_operator,
            wifi_ssid=payload.wifi_ssid,
            battery_level=payload.battery_level if payload.battery_level is not None else 100
        )
        db.add(device)

    await db.commit()
    await db.refresh(device)
    return device


@router.post("/heartbeat")
async def device_heartbeat(
    payload: DeviceHeartbeatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Heartbeat périodique envoyé par l'agent Android.
    Vérifie l'authenticité de l'appareil et met à jour le bail et la télémétrie.
    """
    clean_imei = payload.imei.strip()
    device = await resolve_target_device(db, clean_imei, payload.android_id, payload.serial_number)
    now = datetime.now(timezone.utc)
    default_lease = now + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Terminal non enregistré ou supprimé. Enregistrement via /register requis.",
        )
    else:
        # Vérification d'authentification sur appareil existant
        if device.auth_token and payload.device_token:
            if not secrets.compare_digest(payload.device_token, device.auth_token) and not secrets.compare_digest(payload.device_token, settings.ADMIN_SECRET_KEY):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Jeton de heartbeat matériel invalide.")

    device.last_heartbeat = now
    if payload.latitude is not None:
        device.latitude = payload.latitude
    if payload.longitude is not None:
        device.longitude = payload.longitude
    if payload.battery_level is not None:
        device.battery_level = payload.battery_level
    if payload.ip_address:
        device.ip_address = payload.ip_address
    if payload.network_operator:
        device.network_operator = payload.network_operator
    if payload.wifi_ssid:
        device.wifi_ssid = payload.wifi_ssid

    await db.commit()
    return {
        "status": "ok",
        "is_locked": device.is_locked,
        "lock_reason": device.lock_reason or "Échéance journalière dépassée (≥ 3 jours)",
        "support_phone": settings.SUPPORT_PHONE_NUMBER,
        "lease_expires_at": device.lease_expires_at.isoformat() if device.lease_expires_at else None,
        "latitude": device.latitude,
        "longitude": device.longitude,
        "imei": device.imei,
        "auth_token": device.auth_token
    }


@router.post("/{imei}/telemetry")
async def update_device_telemetry(
    imei: str,
    payload: DeviceTelemetryUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Envoi continu des coordonnées GPS et de l'état de l'appareil.
    """
    clean_imei = imei.strip()
    res = await db.execute(select(Device).where(Device.imei == clean_imei))
    device = res.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Appareil non trouvé.")

    if device.auth_token and payload.device_token:
        if not secrets.compare_digest(payload.device_token, device.auth_token) and not secrets.compare_digest(payload.device_token, settings.ADMIN_SECRET_KEY):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Jeton télémétrie invalide.")

    device.latitude = payload.latitude
    device.longitude = payload.longitude
    device.last_heartbeat = datetime.now(timezone.utc)
    if payload.battery_level is not None:
        device.battery_level = payload.battery_level
    if payload.ip_address:
        device.ip_address = payload.ip_address
    if payload.mac_address:
        device.mac_address = payload.mac_address
    if payload.network_operator:
        device.network_operator = payload.network_operator
    if payload.wifi_ssid:
        device.wifi_ssid = payload.wifi_ssid

    await db.commit()
    return {"status": "telemetry_updated", "imei": clean_imei, "latitude": device.latitude, "longitude": device.longitude}


@router.post("/pairing/simulate")
async def simulate_device_pairing(
    payload: DevicePairingSimulate,
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Enrôlement de test pour le processus d'ajout (Wizard).
    Protégé par clé d'administration.
    """
    clean_imei = payload.imei.strip()
    res = await db.execute(select(Device).where(Device.imei == clean_imei))
    device = res.scalars().first()

    now = datetime.now(timezone.utc)
    default_lease = now + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)

    # Conducteur
    drv_res = await db.execute(select(Driver).where(Driver.phone_number == payload.phone_number))
    driver = drv_res.scalars().first()
    if not driver:
        driver = Driver(
            full_name=payload.full_name or "Conducteur",
            phone_number=payload.phone_number,
            vehicle_plate=payload.vehicle_plate or "RB-0001-Benin",
            daily_rate_xof=payload.daily_rate_xof or 5000,
            current_status=PaymentStatusEnum.UP_TO_DATE,
            consecutive_overdue_days=0
        )
        db.add(driver)
        await db.flush()

    if not device:
        device = Device(
            driver_id=driver.id,
            imei=clean_imei,
            serial_number=f"SN_{clean_imei[-6:]}",
            model=payload.model or "Smartphone Android",
            auth_token=secrets.token_hex(32),
            app_version="1.2.0",
            is_locked=False,
            last_heartbeat=now,
            lease_expires_at=default_lease,
            latitude=payload.latitude,
            longitude=payload.longitude,
            ip_address=payload.ip_address,
            mac_address=payload.mac_address,
            network_operator=payload.network_operator,
            wifi_ssid=payload.wifi_ssid,
            battery_level=payload.battery_level
        )
        db.add(device)
    else:
        device.driver_id = driver.id
        device.last_heartbeat = now
        device.latitude = payload.latitude
        device.longitude = payload.longitude
        device.ip_address = payload.ip_address
        device.mac_address = payload.mac_address
        device.network_operator = payload.network_operator
        device.battery_level = payload.battery_level

    await db.commit()
    await db.refresh(device)
    return {
        "status": "paired_successfully",
        "device": {
            "id": device.id,
            "imei": device.imei,
            "serial_number": device.serial_number,
            "model": device.model,
            "auth_token": device.auth_token,
            "ip_address": device.ip_address,
            "mac_address": device.mac_address,
            "network_operator": device.network_operator,
            "wifi_ssid": device.wifi_ssid,
            "battery_level": device.battery_level,
            "latitude": device.latitude,
            "longitude": device.longitude,
            "is_locked": device.is_locked
        },
        "driver": {
            "id": driver.id,
            "full_name": driver.full_name,
            "phone_number": driver.phone_number,
            "vehicle_plate": driver.vehicle_plate,
            "daily_rate_xof": driver.daily_rate_xof
        }
    }


@router.get("", response_model=List[DeviceOut])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Liste de tous les terminaux de la flotte.
    Protégé par clé d'administration.
    """
    res = await db.execute(select(Device).order_by(Device.id.desc()))
    return res.scalars().all()


@router.delete("/purge-all")
async def purge_all_enrollments(
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Supprime tous les enregistrements préalables (journaux d'audit, paiements, terminaux et conducteurs).
    Protégé par clé d'administration.
    """
    deleted_audits = (await db.execute(delete(AuditLog))).rowcount or 0
    deleted_payments = (await db.execute(delete(Payment))).rowcount or 0
    deleted_devices = (await db.execute(delete(Device))).rowcount or 0
    deleted_drivers = (await db.execute(delete(Driver))).rowcount or 0
    await db.commit()
    return {
        "status": "purged",
        "deleted": {
            "audit_logs": deleted_audits,
            "payments": deleted_payments,
            "devices": deleted_devices,
            "drivers": deleted_drivers,
        },
    }


@router.get("/{imei}", response_model=DeviceOut)
async def get_device_by_imei(
    imei: str,
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Détail d'un terminal par IMEI.
    Protégé par clé d'administration.
    """
    res = await db.execute(select(Device).where(Device.imei == imei.strip()))
    device = res.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Appareil introuvable.")
    return device
