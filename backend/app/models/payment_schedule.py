from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from app.core.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class PaymentScheduleRule(Base):
    """
    Règle d'échéancier de paiement pour la flotte LockER.
    Définit les échéances (jour/mois/an), le montant attendu et le mode de règlement (comment payer).
    Le non-respect de cet échéancier après le délai de grâce (3 jours) déclenche le verrouillage Kiosk automatique.
    """
    __tablename__ = "payment_schedule_rules"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True) # None = règle générale pour toute la flotte
    title = Column(String(150), nullable=False, default="Échéance de Versement Flotte")
    
    # Échéance (Jour / Mois / An)
    due_date_str = Column(String(50), nullable=False) # Ex: "25/11/2026", "Chaque 25 du mois", "Journalier (Tous les soirs)"
    due_day = Column(Integer, nullable=True)
    due_month = Column(Integer, nullable=True)
    due_year = Column(Integer, nullable=True)
    
    # Montant et mode de règlement (Comment payer)
    amount_xof = Column(Integer, nullable=False, default=5000)
    payment_method = Column(String(150), nullable=False, default="MTN Mobile Money (*133#) & Moov Money (*880#)")
    payment_instructions = Column(Text, nullable=True, default="Payer par Mobile Money MTN (*133#) ou Moov (*880#) vers le compte flotte LockER. Déblocage automatique en sub-30s.")
    
    grace_period_days = Column(Integer, default=3) # 3 jours avant verrouillage automatique
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
