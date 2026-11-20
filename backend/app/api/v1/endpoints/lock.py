from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
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
    Envoie le signal FCM haute priorité et active le mode Kiosk d'impayé.
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
    Restaure les fonctionnalités normales du Samsung A34.
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
