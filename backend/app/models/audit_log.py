from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    device_imei = Column(String(50), nullable=True)
    action = Column(String(100), nullable=False)  # LOCK_COMMAND, UNLOCK_COMMAND, HEARTBEAT, PAYMENT_APPLIED
    performed_by = Column(String(100), default="SYSTEM")  # SYSTEM, ADMIN, WEBHOOK, DRIVER
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    # Relations
    driver = relationship("Driver", back_populates="audit_logs")
