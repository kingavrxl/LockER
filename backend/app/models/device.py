from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), unique=True, nullable=True)
    imei = Column(String(50), unique=True, index=True, nullable=False)
    serial_number = Column(String(100), unique=True, nullable=True)
    model = Column(String(100), default="Samsung Galaxy A34 5G")
    fcm_token = Column(Text, nullable=True)
    
    # État du verrouillage
    is_locked = Column(Boolean, default=False)
    lock_reason = Column(String(255), nullable=True)
    locked_at = Column(DateTime, nullable=True)
    unlocked_at = Column(DateTime, nullable=True)
    
    # Télémétrie & Localisation en direct (GPS Bénin)
    latitude = Column(Float, nullable=True, default=6.3654) # Défaut Cotonou
    longitude = Column(Float, nullable=True, default=2.4183)
    ip_address = Column(String(50), nullable=True)
    mac_address = Column(String(50), nullable=True)
    network_operator = Column(String(100), nullable=True, default="MTN Bénin")
    wifi_ssid = Column(String(100), nullable=True)
    battery_level = Column(Integer, nullable=True, default=100)

    # Heartbeat & Licence hors-ligne
    last_heartbeat = Column(DateTime, default=datetime.utcnow)
    lease_expires_at = Column(DateTime, nullable=True)  # Jeton de validité locale
    app_version = Column(String(50), default="1.0.0")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    driver = relationship("Driver", back_populates="device")
