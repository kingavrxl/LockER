from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class DeviceRegisterRequest(BaseModel):
    imei: str
    serial_number: Optional[str] = None
    model: Optional[str] = "Samsung Galaxy A34 5G"
    fcm_token: str
    app_version: Optional[str] = "1.0.0"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    network_operator: Optional[str] = None
    wifi_ssid: Optional[str] = None
    battery_level: Optional[int] = None


class DeviceHeartbeatRequest(BaseModel):
    imei: str
    fcm_token: Optional[str] = None
    battery_level: Optional[int] = None
    is_network_connected: Optional[bool] = True
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    ip_address: Optional[str] = None
    network_operator: Optional[str] = None
    wifi_ssid: Optional[str] = None


class DeviceOut(BaseModel):
    id: int
    driver_id: Optional[int] = None
    imei: str
    model: str
    is_locked: bool
    lock_reason: Optional[str] = None
    latitude: Optional[float] = 6.3654
    longitude: Optional[float] = 2.4183
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    network_operator: Optional[str] = "MTN Bénin"
    wifi_ssid: Optional[str] = None
    battery_level: Optional[int] = 100
    last_heartbeat: Optional[datetime] = None
    lease_expires_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
