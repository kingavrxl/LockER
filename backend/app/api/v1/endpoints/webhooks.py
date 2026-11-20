import json
import logging
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.driver import Driver
from app.models.payment import Payment, ProviderEnum, TransactionStatusEnum
from app.services.lock_service import LockService
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["Webhooks & Payments"])


@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook Stripe pour la réception des paiements par carte bancaire.
    Déclenche le déblocage instantané si l'appareil était verrouillé.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = json.loads(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("type")
    logger.info(f"Événement Stripe reçu : {event_type}")

    if event_type == "payment_intent.succeeded":
        payment_intent = event["data"]["object"]
        metadata = payment_intent.get("metadata", {})
        driver_id = metadata.get("driver_id")
        amount = payment_intent.get("amount_received", 0) / 100.0  # centimes

        if driver_id:
            driver_id = int(driver_id)
            # Enregistrer le paiement
            payment = Payment(
                driver_id=driver_id,
                amount=amount,
                currency=payment_intent.get("currency", "eur").upper(),
                provider=ProviderEnum.STRIPE,
                transaction_id=payment_intent.get("id"),
                status=TransactionStatusEnum.SUCCESS,
                raw_payload=json.dumps(event)
            )
            db.add(payment)
            await db.commit()

            # Déverrouiller automatiquement le conducteur
            await LockService.unlock_driver_device(
                db=db,
                driver_id=driver_id,
                reason="Paiement Stripe reçu avec succès",
                performed_by="WEBHOOK_STRIPE"
            )

    return {"status": "received"}


@router.post("/fedapay")
async def fedapay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook FedaPay / Mobile Money Bénin (MTN MoMo, Moov Money).
    Très répandu au Bénin pour les paiements conducteurs en Francs CFA (XOF).
    """
    payload = await request.json()
    event_name = payload.get("name")
    logger.info(f"Webhook FedaPay reçu : {event_name}")

    if event_name == "transaction.approved":
        transaction = payload.get("entity", {})
        custom_metadata = transaction.get("custom_metadata", {})
        driver_id = custom_metadata.get("driver_id") or transaction.get("customer", {}).get("external_id")
        amount = transaction.get("amount", 0)
        reference = transaction.get("reference")

        if driver_id:
            driver_id = int(driver_id)
            payment = Payment(
                driver_id=driver_id,
                amount=amount,
                currency="XOF",
                provider=ProviderEnum.FEDAPAY,
                transaction_id=reference or f"FEDA_{transaction.get('id')}",
                status=TransactionStatusEnum.SUCCESS,
                raw_payload=json.dumps(payload)
            )
            db.add(payment)
            await db.commit()

            # Déblocage immédiat
            await LockService.unlock_driver_device(
                db=db,
                driver_id=driver_id,
                reason="Paiement Mobile Money (FedaPay) validé",
                performed_by="WEBHOOK_FEDAPAY"
            )

    return {"status": "received"}
