import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class PaymentStatusEnum(str, enum.Enum):
    UP_TO_DATE = "UP_TO_DATE"
    OVERDUE_1 = "OVERDUE_1"
    OVERDUE_2 = "OVERDUE_2"
    OVERDUE_3 = "OVERDUE_3"
    LOCKED = "LOCKED"


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    phone_number = Column(String(50), unique=True, index=True, nullable=False)
    national_id = Column(String(100), unique=True, nullable=True)  # CIP / NPI Bénin
    vehicle_plate = Column(String(50), nullable=True)
    daily_rate_xof = Column(Integer, default=5000)
    current_status = Column(Enum(PaymentStatusEnum), default=PaymentStatusEnum.UP_TO_DATE, nullable=False)
    consecutive_overdue_days = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relations
    device = relationship("Device", back_populates="driver", uselist=False)
    payments = relationship("Payment", back_populates="driver")
    audit_logs = relationship("AuditLog", back_populates="driver")
