from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class DeviceRegisterRequest(BaseModel):
    imei: str
    serial_number: Optional[str] = None
    model: Optional[str] = "Samsung Galaxy A34 5G"
    fcm_token: str
    app_version: Optional[str] = "1.0.0"


class DeviceHeartbeatRequest(BaseModel):
    imei: str
    fcm_token: Optional[str] = None
    battery_level: Optional[int] = None
    is_network_connected: Optional[bool] = True


class DeviceOut(BaseModel):
    id: int
    driver_id: Optional[int] = None
    imei: str
    model: str
    is_locked: bool
    lock_reason: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    lease_expires_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
