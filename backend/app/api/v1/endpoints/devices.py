from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.device import Device
from app.models.driver import Driver, PaymentStatusEnum
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

        # S'il n'a pas encore de conducteur lié, création automatique
        if not device.driver_id:
            driver_count_res = await db.execute(select(Driver))
            num = len(driver_count_res.scalars().all()) + 1
            new_driver = Driver(
                full_name=f"Conducteur {num} ({payload.model or 'Samsung'})",
                phone_number=f"+229 01 {payload.imei[-8:-4]} {payload.imei[-4:]}",
                vehicle_plate=f"RB-{payload.imei[-4:]}-Benin",
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
            phone_number=f"+229 01 {payload.imei[-8:-4]} {payload.imei[-4:]}",
            vehicle_plate=f"RB-{payload.imei[-4:]}-Benin",
            daily_rate_xof=settings.DAILY_PAYMENT_AMOUNT_XOF,
            current_status=PaymentStatusEnum.UP_TO_DATE,
            consecutive_overdue_days=0
        )
        db.add(new_driver)
        await db.flush()

        device = Device(
            driver_id=new_driver.id,
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
        "lock_reason": device.lock_reason,
        "lease_expires_at": device.lease_expires_at.isoformat() if device.lease_expires_at else None
    }


@router.get("", response_model=List[DeviceOut])
async def list_devices(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Device).order_by(Device.id.desc()))
    return res.scalars().all()
