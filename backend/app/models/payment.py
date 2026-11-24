import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Enum, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class ProviderEnum(str, enum.Enum):
    STRIPE = "STRIPE"
    FEDAPAY = "FEDAPAY"
    KKIAPAY = "KKIAPAY"
    CASH = "CASH"


class TransactionStatusEnum(str, enum.Enum):
    SUCCESS = "SUCCESS"
    PENDING = "PENDING"
    FAILED = "FAILED"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(10), default="XOF")
    provider = Column(Enum(ProviderEnum), nullable=False)
    transaction_id = Column(String(150), unique=True, index=True, nullable=False)
    status = Column(Enum(TransactionStatusEnum), default=TransactionStatusEnum.SUCCESS, nullable=False)
    raw_payload = Column(Text, nullable=True)
    
    payment_date = Column(DateTime, default=_utcnow)
    created_at = Column(DateTime, default=_utcnow)

    # Relations
    driver = relationship("Driver", back_populates="payments")
