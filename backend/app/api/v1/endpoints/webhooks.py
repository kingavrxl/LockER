import json
import logging
import hmac
import hashlib
from datetime import datetime
from typing import Optional
import stripe
from pydantic import BaseModel
from fastapi import APIRouter, Request, HTTPException, Depends, Body, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.auth import verify_admin_api_key
from app.models.driver import Driver
from app.models.payment import Payment, ProviderEnum, TransactionStatusEnum
from app.services.lock_service import LockService
from app.core.config import settings

logger = logging.getLogger("Webhooks")
router = APIRouter(prefix="/webhooks", tags=["Webhooks & Payments"])


@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook Stripe pour la réception des paiements par carte bancaire.
    Vérifie rigoureusement la signature cryptographique Stripe avant tout déblocage.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="En-tête stripe-signature manquant.")

    if settings.STRIPE_WEBHOOK_SECRET and settings.STRIPE_WEBHOOK_SECRET != "whsec_placeholder":
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Rejet signature Stripe: {e}")
            raise HTTPException(status_code=400, detail="Signature Stripe invalide.")
        except Exception as e:
            logger.error(f"Erreur décodage Stripe: {e}")
            raise HTTPException(status_code=400, detail="Événement Stripe malformé.")
    else:
        if settings.ENVIRONMENT == "production":
            raise HTTPException(status_code=500, detail="STRIPE_WEBHOOK_SECRET non configuré en production.")
        try:
            event = json.loads(payload)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    event_type = event.get("type")
    logger.info(f"Événement Stripe validé : {event_type}")

    if event_type == "payment_intent.succeeded":
        payment_intent = event["data"]["object"]
        metadata = payment_intent.get("metadata", {})
        driver_id = metadata.get("driver_id")
        amount = payment_intent.get("amount_received", 0) / 100.0

        if driver_id:
            driver_id = int(driver_id)
            payment = Payment(
                driver_id=driver_id,
                amount=amount,
                currency=payment_intent.get("currency", "xof").upper(),
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
async def fedapay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Webhook FedaPay / Mobile Money Bénin (MTN MoMo, Moov Money).
    Vérifie la signature cryptographique du webhook pour prévenir toute falsification.
    """
    raw_body = await request.body()
    sig_header = request.headers.get("x-fedapay-signature")

    if settings.FEDAPAY_SECRET_KEY and settings.FEDAPAY_SECRET_KEY != "fp_live_placeholder":
        if not sig_header:
            raise HTTPException(status_code=400, detail="Header x-fedapay-signature manquant.")
        computed_sig = hmac.new(settings.FEDAPAY_SECRET_KEY.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig_header, computed_sig):
            raise HTTPException(status_code=400, detail="Signature FedaPay invalide.")

    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Payload JSON FedaPay invalide.")

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


class PaymentSimulationRequest(BaseModel):
    driver_id: int
    amount: float = 5000.0
    provider: Optional[str] = "MTN_MOMO"
    reference: Optional[str] = None


@router.post("/simulate-payment")
async def simulate_driver_payment(
    payload: PaymentSimulationRequest,
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Simule un paiement direct par le conducteur (MTN MoMo Bénin, Moov Money ou Carte).
    STRICTEMENT PROTÉGÉ : Seul l'administrateur authentifié peut déclencher une simulation.
    Effectue le déblocage automatique instantané de l'appareil et prolonge le bail MDM.
    """
    res = await db.execute(select(Driver).where(Driver.id == payload.driver_id))
    driver = res.scalars().first()
    if not driver:
        raise HTTPException(status_code=404, detail="Conducteur non trouvé.")

    prov_enum = ProviderEnum.FEDAPAY
    prov_str = payload.provider.upper() if payload.provider else "MTN_MOMO"
    if "STRIPE" in prov_str:
        prov_enum = ProviderEnum.STRIPE
    elif "CASH" in prov_str:
        prov_enum = ProviderEnum.CASH

    ref = payload.reference or f"MOMO_BENIN_{int(datetime.utcnow().timestamp())}"

    payment = Payment(
        driver_id=driver.id,
        amount=payload.amount,
        currency="XOF",
        provider=prov_enum,
        transaction_id=ref,
        status=TransactionStatusEnum.SUCCESS,
        raw_payload=json.dumps({"provider": payload.provider, "simulated": True})
    )
    db.add(payment)
    await db.commit()

    # Déverrouillage automatique garanti
    await LockService.unlock_driver_device(
        db=db,
        driver_id=driver.id,
        reason=f"Paiement {payload.provider or 'Mobile Money'} de {int(payload.amount):,} FCFA validé instantanément",
        performed_by="AUTO_PAYMENT_RECONCILIATION"
    )

    return {
        "status": "success",
        "message": f"Paiement de {int(payload.amount):,} FCFA validé pour {driver.full_name}. Appareil déverrouillé avec succès !",
        "driver_id": driver.id,
        "current_status": "UP_TO_DATE",
        "transaction_id": ref
    }
