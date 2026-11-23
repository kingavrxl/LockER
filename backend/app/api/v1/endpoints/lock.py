from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.driver import Driver, PaymentStatusEnum
from app.services.lock_service import LockService

router = APIRouter(prefix="", tags=["Lock Operations"])


@router.post("/block/{driver_id}")
async def block_driver(
    driver_id: int,
    reason: str = Body("Blocage manuel administratif", embed=True),
    db: AsyncSession = Depends(get_db)
):
    """
    Verrouille manuellement ou automatiquement le téléphone d'un conducteur.
    Envoie le signal haute priorité et active le mode Kiosk d'impayé.
    """
    success = await LockService.lock_driver_device(
        db=db,
        driver_id=driver_id,
        reason=reason,
        performed_by="ADMIN"
    )
    if not success:
        raise HTTPException(status_code=404, detail="Conducteur introuvable ou erreur de traitement.")
    return {"status": "success", "message": f"Appareil du conducteur {driver_id} verrouillé."}


@router.post("/unblock/{driver_id}")
async def unblock_driver(
    driver_id: int,
    reason: str = Body("Déblocage administratif", embed=True),
    db: AsyncSession = Depends(get_db)
):
    """
    Déverrouille manuellement ou suite à un paiement l'appareil du conducteur.
    Restaure les fonctionnalités normales du smartphone Android.
    """
    success = await LockService.unlock_driver_device(
        db=db,
        driver_id=driver_id,
        reason=reason,
        performed_by="ADMIN"
    )
    if not success:
        raise HTTPException(status_code=404, detail="Conducteur introuvable ou erreur de traitement.")
    return {"status": "success", "message": f"Appareil du conducteur {driver_id} déverrouillé."}


@router.post("/lock/enforce-overdue")
async def enforce_overdue_locks(db: AsyncSession = Depends(get_db)):
    """
    Déclencheur d'audit d'échéance automatique :
    Scanne tous les conducteurs ayant 3 jours ou plus de retard de versement
    et verrouille automatiquement leurs terminaux.
    """
    locked_ids = await LockService.enforce_overdue_locks(db)
    return {
        "status": "success",
        "message": f"Contrôle automatique exécuté. {len(locked_ids)} terminal(aux) verrouillé(s).",
        "locked_driver_ids": locked_ids
    }


@router.post("/lock/simulate-overdue/{driver_id}")
async def simulate_overdue_and_lock(
    driver_id: int,
    overdue_days: int = Body(3, embed=True),
    db: AsyncSession = Depends(get_db)
):
    """
    Simule le passage d'un conducteur en impayé (ex: 3 jours de retard)
    et déclenche immédiatement le verrouillage automatique de sécurité.
    """
    res = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = res.scalars().first()
    if not driver:
        raise HTTPException(status_code=404, detail="Conducteur non trouvé.")

    driver.consecutive_overdue_days = overdue_days
    if overdue_days == 1:
        driver.current_status = PaymentStatusEnum.OVERDUE_1
    elif overdue_days == 2:
        driver.current_status = PaymentStatusEnum.OVERDUE_2
    else:
        driver.current_status = PaymentStatusEnum.LOCKED

    await db.commit()

    if overdue_days >= 3:
        await LockService.lock_driver_device(
            db=db,
            driver_id=driver_id,
            reason=f"Verrouillage automatique : impayé consécutif de {overdue_days} jours",
            performed_by="LOCKY_AUTOLOCK_ENGINE"
        )

    return {
        "status": "success",
        "driver_id": driver_id,
        "consecutive_overdue_days": driver.consecutive_overdue_days,
        "current_status": driver.current_status.value
    }
