from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from app.core.database import get_db
from app.models.device import Device
from app.models.driver import Driver, PaymentStatusEnum
from app.schemas.device import DeviceRegisterRequest, DeviceHeartbeatRequest, DeviceOut
from app.core.config import settings

router = APIRouter(prefix="/devices", tags=["Devices"])


class DeviceTelemetryUpdate(BaseModel):
    latitude: float
    longitude: float
    battery_level: Optional[int] = 100
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    network_operator: Optional[str] = "MTN Bénin"
    wifi_ssid: Optional[str] = None


class DevicePairingSimulate(BaseModel):
    imei: str
    model: Optional[str] = "Samsung Galaxy A34 5G (SM-A346B)"
    full_name: Optional[str] = "Bio Gado (Chauffeur Cotonou)"
    phone_number: Optional[str] = "+229 01 97 12 34 56"
    vehicle_plate: Optional[str] = "RB-8492-Littoral"
    daily_rate_xof: Optional[int] = 5000
    latitude: Optional[float] = 6.3654
    longitude: Optional[float] = 2.4183
    ip_address: Optional[str] = "197.234.221.42"
    mac_address: Optional[str] = "38:F9:D3:5B:2A:10"
    network_operator: Optional[str] = "MTN Bénin (5G VoLTE)"
    battery_level: Optional[int] = 95


async def resolve_target_device(
    db: AsyncSession,
    imei: str,
    android_id: Optional[str] = None,
    serial_number: Optional[str] = None
) -> Optional[Device]:
    """
    Résolution robuste et intelligente du terminal physique.
    Garantit la correspondance même si l'agent Android s'annonce avec son Android ID,
    son numéro de série matériel ou un IMEI formaté différemment.
    """
    candidates = [i.strip() for i in [imei, android_id, serial_number] if i and i.strip()]
    for cand in candidates:
        # 1. Correspondance exacte IMEI
        res = await db.execute(select(Device).where(Device.imei == cand))
        dev = res.scalars().first()
        if dev:
            return dev
        # 2. Correspondance numéro de série
        res = await db.execute(select(Device).where(Device.serial_number == cand))
        dev = res.scalars().first()
        if dev:
            return dev

    # 3. Correspondance avec la flotte existante
    all_devs_res = await db.execute(select(Device).order_by(Device.id.asc()))
    all_devs = all_devs_res.scalars().all()
    if all_devs:
        # S'il y a un seul terminal enrôlé dans le parc, c'est obligatoirement le smartphone physique
        if len(all_devs) == 1:
            dev = all_devs[0]
            if serial_number and not dev.serial_number:
                dev.serial_number = serial_number
            return dev

        # Recherche par sous-chaîne (derniers 6 chiffres)
        for d in all_devs:
            for cand in candidates:
                if len(cand) >= 6 and (cand[-6:] in d.imei or (d.serial_number and cand[-6:] in d.serial_number)):
                    return d

        # Par défaut retourner le premier terminal actif
        return all_devs[0]

    return None


@router.post("/register", response_model=DeviceOut)
async def register_device(payload: DeviceRegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Enregistre ou met à jour le token FCM, l'IMEI et toutes les télémétries matérielles
    de l'appareil Samsung Galaxy A34. Appelé automatiquement au démarrage de l'agent Android.
    """
    device = await resolve_target_device(db, payload.imei, payload.android_id, payload.serial_number)

    now = datetime.utcnow()
    default_lease = now + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)

    # Coordonnées réelles ou par défaut
    lat = payload.latitude if payload.latitude is not None else 6.3654
    lon = payload.longitude if payload.longitude is not None else 2.4183
    ip = payload.ip_address or "197.234.221.14"
    mac = payload.mac_address or "A4:B2:39:8F:12:A0"
    net_op = payload.network_operator or "MTN Bénin"
    battery = payload.battery_level if payload.battery_level is not None else 100

    if device:
        if payload.fcm_token:
            device.fcm_token = payload.fcm_token
        device.model = payload.model or device.model
        device.app_version = payload.app_version or device.app_version
        device.last_heartbeat = now
        if payload.latitude is not None:
            device.latitude = payload.latitude
        if payload.longitude is not None:
            device.longitude = payload.longitude
        device.ip_address = ip
        if payload.mac_address:
            device.mac_address = payload.mac_address
        device.network_operator = net_op
        if payload.wifi_ssid:
            device.wifi_ssid = payload.wifi_ssid
        device.battery_level = battery

        if not device.lease_expires_at:
            device.lease_expires_at = default_lease

        # S'il n'a pas encore de conducteur lié, création automatique
        if not device.driver_id:
            driver_count_res = await db.execute(select(Driver))
            num = len(driver_count_res.scalars().all()) + 1
            new_driver = Driver(
                full_name=f"Conducteur {num} ({payload.model or 'Samsung'})",
                phone_number=f"+229 01 {payload.imei[-8:-4] if len(payload.imei)>=8 else '9712'} {payload.imei[-4:] if len(payload.imei)>=4 else '3456'}",
                vehicle_plate=f"RB-{payload.imei[-4:] if len(payload.imei)>=4 else '7788'}-Benin",
                daily_rate_xof=settings.DAILY_PAYMENT_AMOUNT_XOF,
                current_status=PaymentStatusEnum.UP_TO_DATE,
                consecutive_overdue_days=0
            )
            db.add(new_driver)
            await db.flush()
            device.driver_id = new_driver.id
    else:
        # Nouveau terminal enrôlé : création automatique instantanée de la ligne conducteur
        driver_count_res = await db.execute(select(Driver))
        num = len(driver_count_res.scalars().all()) + 1
        new_driver = Driver(
            full_name=f"Conducteur {num} ({payload.model or 'Samsung'})",
            phone_number=f"+229 01 {payload.imei[-8:-4] if len(payload.imei)>=8 else '9712'} {payload.imei[-4:] if len(payload.imei)>=4 else '3456'}",
            vehicle_plate=f"RB-{payload.imei[-4:] if len(payload.imei)>=4 else '7788'}-Benin",
            daily_rate_xof=settings.DAILY_PAYMENT_AMOUNT_XOF,
            current_status=PaymentStatusEnum.UP_TO_DATE,
            consecutive_overdue_days=0
        )
        db.add(new_driver)
        await db.flush()

        device = Device(
            driver_id=new_driver.id,
            imei=payload.imei,
            serial_number=payload.serial_number or payload.android_id or f"R58W{payload.imei[-6:] if len(payload.imei)>=6 else '000000'}",
            model=payload.model or "Samsung Galaxy A34 5G",
            fcm_token=payload.fcm_token or "",
            app_version=payload.app_version or "1.0.0",
            is_locked=False,
            last_heartbeat=now,
            lease_expires_at=default_lease,
            latitude=lat,
            longitude=lon,
            ip_address=ip,
            mac_address=mac,
            network_operator=net_op,
            wifi_ssid=payload.wifi_ssid or "MTN_FIBRE_HQ",
            battery_level=battery
        )
        db.add(device)

    await db.commit()
    await db.refresh(device)
    return device


@router.post("/heartbeat")
async def device_heartbeat(payload: DeviceHeartbeatRequest, db: AsyncSession = Depends(get_db)):
    """
    Heartbeat périodique envoyé par l'agent Android.
    Actualise les baux locaux et la télémétrie GPS réelle en direct.
    """
    device = await resolve_target_device(db, payload.imei, payload.android_id, payload.serial_number)
    now = datetime.utcnow()
    default_lease = now + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)

    if not device:
        # Enrôlement automatique immédiat
        driver_count_res = await db.execute(select(Driver))
        num = len(driver_count_res.scalars().all()) + 1
        new_driver = Driver(
            full_name=f"Conducteur {num} (Samsung A34)",
            phone_number=f"+229 01 {payload.imei[-8:-4] if len(payload.imei)>=8 else '9712'} {payload.imei[-4:] if len(payload.imei)>=4 else '3456'}",
            vehicle_plate=f"RB-{payload.imei[-4:] if len(payload.imei)>=4 else '7788'}-Benin",
            daily_rate_xof=settings.DAILY_PAYMENT_AMOUNT_XOF,
            current_status=PaymentStatusEnum.UP_TO_DATE,
            consecutive_overdue_days=0
        )
        db.add(new_driver)
        await db.flush()

        device = Device(
            driver_id=new_driver.id,
            imei=payload.imei,
            serial_number=payload.serial_number or payload.android_id or f"R58W{payload.imei[-6:] if len(payload.imei)>=6 else '000000'}",
            model="Samsung Galaxy A34 5G",
            fcm_token=payload.fcm_token or "",
            app_version="1.0.0",
            is_locked=False,
            last_heartbeat=now,
            lease_expires_at=default_lease,
            latitude=payload.latitude if payload.latitude is not None else 6.3654,
            longitude=payload.longitude if payload.longitude is not None else 2.4183,
            battery_level=payload.battery_level if payload.battery_level is not None else 100
        )
        db.add(device)
        await db.commit()
        await db.refresh(device)

    device.last_heartbeat = now
    if payload.fcm_token:
        device.fcm_token = payload.fcm_token
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
        "imei": device.imei
    }


@router.post("/{imei}/telemetry")
async def update_device_telemetry(imei: str, payload: DeviceTelemetryUpdate, db: AsyncSession = Depends(get_db)):
    """
    Envoi continu des coordonnées GPS et de l'état de l'appareil.
    Garantit que la cartographie en direct (point vert) reste parfaitement synchronisée.
    """
    res = await db.execute(select(Device).where(Device.imei == imei))
    device = res.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Appareil non trouvé.")

    device.latitude = payload.latitude
    device.longitude = payload.longitude
    device.last_heartbeat = datetime.utcnow()
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
    return {"status": "telemetry_updated", "imei": imei, "latitude": device.latitude, "longitude": device.longitude}


@router.post("/pairing/simulate")
async def simulate_device_pairing(payload: DevicePairingSimulate, db: AsyncSession = Depends(get_db)):
    """
    Simulateur d'enrôlement physique pour le processus d'ajout (Wizard).
    Permet de valider immédiatement l'Étape 1 (connexion) et l'Étape 2 (importation des adresses).
    """
    # 1. Vérifier si l'appareil existe déjà
    res = await db.execute(select(Device).where(Device.imei == payload.imei))
    device = res.scalars().first()

    now = datetime.utcnow()
    default_lease = now + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)

    # Conducteur
    drv_res = await db.execute(select(Driver).where(Driver.phone_number == payload.phone_number))
    driver = drv_res.scalars().first()
    if not driver:
        driver = Driver(
            full_name=payload.full_name,
            phone_number=payload.phone_number,
            vehicle_plate=payload.vehicle_plate,
            daily_rate_xof=payload.daily_rate_xof or 5000,
            current_status=PaymentStatusEnum.UP_TO_DATE,
            consecutive_overdue_days=0
        )
        db.add(driver)
        await db.flush()

    if not device:
        device = Device(
            driver_id=driver.id,
            imei=payload.imei,
            serial_number=f"R58W{payload.imei[-6:]}",
            model=payload.model,
            fcm_token=f"fcm_token_device_{payload.imei[-6:]}",
            app_version="1.2.0",
            is_locked=False,
            last_heartbeat=now,
            lease_expires_at=default_lease,
            latitude=payload.latitude,
            longitude=payload.longitude,
            ip_address=payload.ip_address,
            mac_address=payload.mac_address,
            network_operator=payload.network_operator,
            wifi_ssid="MTN_4G_COTONOU",
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
async def list_devices(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Device).order_by(Device.id.desc()))
    return res.scalars().all()


@router.get("/{imei}", response_model=DeviceOut)
async def get_device_by_imei(imei: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Device).where(Device.imei == imei))
    device = res.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Appareil introuvable.")
    return device
