from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, ConfigDict

from app.core.database import get_db
from app.core.auth import verify_admin_api_key
from app.models.payment_schedule import PaymentScheduleRule
from app.models.driver import Driver

router = APIRouter(prefix="/rules", tags=["Règles & Échéanciers"])


class RuleCreate(BaseModel):
    title: Optional[str] = "Nouvel Échéancier"
    due_date_str: str  # Ex: "25/11/2026" ou "Chaque 25 du mois"
    due_day: Optional[int] = None
    due_month: Optional[int] = None
    due_year: Optional[int] = None
    amount_xof: int = 5000
    payment_method: Optional[str] = "MTN Mobile Money (*133#) & Moov Money (*880#)"
    payment_instructions: Optional[str] = "Payer par Mobile Money MTN (*133#) ou Moov (*880#). Déblocage automatique instantané."
    grace_period_days: Optional[int] = 3
    driver_id: Optional[int] = None


class RuleOut(BaseModel):
    id: int
    title: str
    due_date_str: str
    due_day: Optional[int] = None
    due_month: Optional[int] = None
    due_year: Optional[int] = None
    amount_xof: int
    payment_method: str
    payment_instructions: Optional[str] = None
    grace_period_days: int
    driver_id: Optional[int] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[RuleOut])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Récupère la liste des règles d'échéancier (jour/mois/an et modalités de paiement).
    Protégé par clé d'administration.
    """
    res = await db.execute(select(PaymentScheduleRule).order_by(PaymentScheduleRule.id.desc()))
    rules = res.scalars().all()

    # Si aucune règle, initialiser l'échéancier journalier par défaut Bénin
    if not rules:
        default_rule = PaymentScheduleRule(
            title="Échéancier Journalier Flotte",
            due_date_str="Tous les soirs avant 22h00",
            due_day=None,
            amount_xof=5000,
            payment_method="🟡 MTN Mobile Money (*133#) & 🔵 Moov Money (*880#)",
            payment_instructions="Taper *133# (MTN) ou *880# (Moov) -> Paiement marchand LockER. Déverrouillage automatique sous 30s.",
            grace_period_days=3,
            is_active=True
        )
        db.add(default_rule)
        await db.commit()
        await db.refresh(default_rule)
        return [default_rule]

    return rules


@router.post("", response_model=RuleOut)
async def create_rule(
    payload: RuleCreate,
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Crée une nouvelle règle d'échéancier de versement.
    Protégé par clé d'administration.
    """
    rule = PaymentScheduleRule(
        title=payload.title or "Échéancier de Versement",
        due_date_str=payload.due_date_str,
        due_day=payload.due_day,
        due_month=payload.due_month,
        due_year=payload.due_year,
        amount_xof=payload.amount_xof,
        payment_method=payload.payment_method or "MTN Mobile Money (*133#) & Moov Money (*880#)",
        payment_instructions=payload.payment_instructions or "Paiement via Mobile Money Bénin (*133# ou *880#).",
        grace_period_days=payload.grace_period_days or 3,
        driver_id=payload.driver_id,
        is_active=True
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Supprime une règle d'échéancier.
    Protégé par clé d'administration.
    """
    res = await db.execute(select(PaymentScheduleRule).where(PaymentScheduleRule.id == rule_id))
    rule = res.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable.")
    await db.delete(rule)
    await db.commit()
    return {"status": "deleted", "rule_id": rule_id}
