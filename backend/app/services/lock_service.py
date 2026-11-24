import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.driver import Driver, PaymentStatusEnum
from app.models.device import Device
from app.models.audit_log import AuditLog
from app.services.cloud_push_hub import CloudPushHub
from app.core.config import settings

logger = logging.getLogger("LockService")


class LockService:
    @staticmethod
    async def lock_driver_device(
        db: AsyncSession,
        driver_id: int,
        reason: str = "Paiement en retard de plus de 3 jours",
        performed_by: str = "SYSTEM"
    ) -> bool:
        """
        Verrouille l'appareil du conducteur :
        1. Marque le statut en base (LOCKED)
        2. Révocation immédiate de la validité locale
        3. Envoie la commande Cloud Directe (sub-50ms via WebSocket)
        4. Enregistre une trace d'audit conforme
        """
        result = await db.execute(select(Driver).where(Driver.id == driver_id))
        driver = result.scalars().first()
        if not driver:
            logger.error(f"Conducteur ID {driver_id} introuvable pour le verrouillage.")
            return False

        device_res = await db.execute(select(Device).where(Device.driver_id == driver_id))
        device = device_res.scalars().first()

        driver.current_status = PaymentStatusEnum.LOCKED
        now = datetime.now(timezone.utc)
        push_sent = False

        if device:
            device.is_locked = True
            device.lock_reason = reason
            device.locked_at = now
            device.lease_expires_at = now  # Révocation immédiate du bail hors-ligne local

            payload = {
                "reason": reason,
                "support_phone": settings.SUPPORT_PHONE_NUMBER,
                "driver_name": driver.full_name,
                "driver_phone": driver.phone_number
            }
            # Diffusion Cloud-Native directe (100% Hors Firebase)
            push_sent = await CloudPushHub.send_command_to_device(device.imei, "LOCK", payload)

        audit = AuditLog(
            driver_id=driver.id,
            device_imei=device.imei if device else None,
            action="LOCK_DEVICE",
            performed_by=performed_by,
            details=f"Motif: {reason} | CloudPush Direct envoyé: {push_sent}"
        )
        db.add(audit)
        await db.commit()
        return True

    @staticmethod
    async def unlock_driver_device(
        db: AsyncSession,
        driver_id: int,
        reason: str = "Paiement reçu avec succès",
        performed_by: str = "SYSTEM"
    ) -> bool:
        """
        Déverrouille immédiatement l'appareil :
        1. Rétablit le statut UP_TO_DATE
        2. Prolonge le bail de validité locale (72h)
        3. Envoie la commande Cloud Directe UNLOCK (sub-50ms via WebSocket)
        """
        result = await db.execute(select(Driver).where(Driver.id == driver_id))
        driver = result.scalars().first()
        if not driver:
            logger.error(f"Conducteur ID {driver_id} introuvable pour le déverrouillage.")
            return False

        device_res = await db.execute(select(Device).where(Device.driver_id == driver_id))
        device = device_res.scalars().first()

        driver.current_status = PaymentStatusEnum.UP_TO_DATE
        driver.consecutive_overdue_days = 0
        now = datetime.now(timezone.utc)
        push_sent = False

        if device:
            device.is_locked = False
            device.lock_reason = None
            device.unlocked_at = now
            # Renouvellement du bail hors-ligne pour 72 heures
            new_lease = now + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)
            device.lease_expires_at = new_lease

            payload = {
                "reason": reason,
                "lease_expires_at": new_lease.isoformat()
            }
            # Diffusion Cloud-Native directe (100% Hors Firebase)
            push_sent = await CloudPushHub.send_command_to_device(device.imei, "UNLOCK", payload)

        audit = AuditLog(
            driver_id=driver.id,
            device_imei=device.imei if device else None,
            action="UNLOCK_DEVICE",
            performed_by=performed_by,
            details=f"Motif: {reason} | CloudPush Direct envoyé: {push_sent}"
        )
        db.add(audit)
        await db.commit()
        return True

    @staticmethod
    async def enforce_overdue_locks(db: AsyncSession) -> list[int]:
        """
        Contrôle d'audit automatique des impayés :
        Verrouille automatiquement tout terminal dont le retard est >= 3 jours.
        """
        result = await db.execute(
            select(Driver).where(
                Driver.consecutive_overdue_days >= settings.OVERDUE_DAYS_BEFORE_LOCK,
                Driver.current_status != PaymentStatusEnum.LOCKED
            )
        )
        overdue_drivers = result.scalars().all()
        locked_ids = []

        for drv in overdue_drivers:
            success = await LockService.lock_driver_device(
                db=db,
                driver_id=drv.id,
                reason=f"Verrouillage automatique : impayé de {drv.consecutive_overdue_days} jours consécutifs",
                performed_by="AUTO_LOCK_ENGINE"
            )
            if success:
                locked_ids.append(drv.id)

        return locked_ids
