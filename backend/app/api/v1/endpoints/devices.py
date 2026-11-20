from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.device import Device
from app.schemas.device import DeviceRegisterRequest, DeviceHeartbeatRequest, DeviceOut
from app.core.config import settings

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.post("/register", response_model=DeviceOut)
async def register_device(payload: DeviceRegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Enregistre ou met à jour le token FCM et l'IMEI de l'appareil Samsung Galaxy A34.
    Appelé automatiquement au démarrage de l'agent Android.
    """
    res = await db.execute(select(Device).where(Device.imei == payload.imei))
    device = res.scalars().first()

    now = datetime.utcnow()
    default_lease = now + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)

    if device:
        device.fcm_token = payload.fcm_token
        device.model = payload.model
        device.app_version = payload.app_version
        device.last_heartbeat = now
        if not device.lease_expires_at:
            device.lease_expires_at = default_lease
    else:
        device = Device(
            imei=payload.imei,
            serial_number=payload.serial_number,
            model=payload.model,
            fcm_token=payload.fcm_token,
            app_version=payload.app_version,
            is_locked=False,
            last_heartbeat=now,
            lease_expires_at=default_lease
        )
        db.add(device)

    await db.commit()
    await db.refresh(device)
    return device


@router.post("/heartbeat")
async def device_heartbeat(payload: DeviceHeartbeatRequest, db: AsyncSession = Depends(get_db)):
    """
    Heartbeat périodique envoyé par l'agent Android.
    Permet de renouveler le bail de déverrouillage local si le compte est en règle.
    """
    res = await db.execute(select(Device).where(Device.imei == payload.imei))
    device = res.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Appareil non enregistré.")

    device.last_heartbeat = datetime.utcnow()
    if payload.fcm_token:
        device.fcm_token = payload.fcm_token

    await db.commit()
    return {
        "status": "ok",
        "is_locked": device.is_locked,
        "lease_expires_at": device.lease_expires_at.isoformat() if device.lease_expires_at else None
    }


@router.get("", response_model=List[DeviceOut])
async def list_devices(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Device).order_by(Device.id.desc()))
    return res.scalars().all()
