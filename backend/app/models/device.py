from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), unique=True, nullable=True)
    imei = Column(String(50), unique=True, index=True, nullable=False)
    serial_number = Column(String(100), unique=True, nullable=True)
    model = Column(String(100), default="Smartphone Android")
    auth_token = Column(String(128), unique=True, index=True, nullable=True)

    # État du verrouillage Kiosk
    is_locked = Column(Boolean, default=False)
    lock_reason = Column(String(255), nullable=True)
    locked_at = Column(DateTime, nullable=True)
    unlocked_at = Column(DateTime, nullable=True)

    # Télémétrie & Localisation en direct (GPS Matériel Réel)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    ip_address = Column(String(50), nullable=True)
    mac_address = Column(String(50), nullable=True)
    network_operator = Column(String(100), nullable=True)
    wifi_ssid = Column(String(100), nullable=True)
    battery_level = Column(Integer, nullable=True, default=100)

    # Heartbeat & Licence hors-ligne
    last_heartbeat = Column(DateTime, default=_utcnow)
    lease_expires_at = Column(DateTime, nullable=True)  # Jeton de validité locale
    app_version = Column(String(50), default="1.0.0")

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relations
    driver = relationship("Driver", back_populates="device")
