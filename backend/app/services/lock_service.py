import logging
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.driver import Driver, PaymentStatusEnum
from app.models.device import Device
from app.models.audit_log import AuditLog
from app.services.fcm_service import FCMService
from app.core.config import settings

logger = logging.getLogger(__name__)


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
        1. Marque le statut en base
        2. Envoie la commande FCM haute priorité à l'agent Android
        3. Enregistre une trace d'audit conforme
        """
        result = await db.execute(select(Driver).where(Driver.id == driver_id))
        driver = result.scalars().first()
        if not driver:
            logger.error(f"Conducteur ID {driver_id} introuvable pour le verrouillage.")
            return False

        device_res = await db.execute(select(Device).where(Device.driver_id == driver_id))
        device = device_res.scalars().first()

        # Mise à jour de l'état du conducteur et de l'appareil
        driver.current_status = PaymentStatusEnum.LOCKED
        success_fcm = False

        if device:
            device.is_locked = True
            device.lock_reason = reason
            device.locked_at = datetime.utcnow()
            device.lease_expires_at = datetime.utcnow()  # Révocation immédiate de la validité locale

            if device.fcm_token:
                payload = {
                    "reason": reason,
                    "support_phone": settings.SUPPORT_PHONE_NUMBER,
                    "driver_name": driver.full_name,
                    "driver_phone": driver.phone_number
                }
                success_fcm = FCMService.send_device_command(
                    fcm_token=device.fcm_token,
                    action="LOCK",
                    payload_data=payload
                )

        # Journal d'audit légal (Code du numérique du Bénin)
        audit = AuditLog(
            driver_id=driver.id,
            device_imei=device.imei if device else None,
            action="LOCK_DEVICE",
            performed_by=performed_by,
            details=f"Motif: {reason} | FCM envoyé: {success_fcm}"
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
        3. Envoie la commande FCM UNLOCK
        """
        result = await db.execute(select(Driver).where(Driver.id == driver_id))
        driver = result.scalars().first()
        if not driver:
            return False

        device_res = await db.execute(select(Device).where(Device.driver_id == driver_id))
        device = device_res.scalars().first()

        driver.current_status = PaymentStatusEnum.UP_TO_DATE
        driver.consecutive_overdue_days = 0
        success_fcm = False

        if device:
            device.is_locked = False
            device.lock_reason = None
            device.unlocked_at = datetime.utcnow()
            # Renouvellement du bail hors-ligne pour 72 heures
            new_lease = datetime.utcnow() + timedelta(hours=settings.OFFLINE_GRACE_PERIOD_HOURS)
            device.lease_expires_at = new_lease

            if device.fcm_token:
                payload = {
                    "reason": reason,
                    "lease_expires_at": new_lease.isoformat()
                }
                success_fcm = FCMService.send_device_command(
                    fcm_token=device.fcm_token,
                    action="UNLOCK",
                    payload_data=payload
                )

        audit = AuditLog(
            driver_id=driver.id,
            device_imei=device.imei if device else None,
            action="UNLOCK_DEVICE",
            performed_by=performed_by,
            details=f"Motif: {reason} | FCM envoyé: {success_fcm}"
        )
        db.add(audit)
        await db.commit()
        return True
