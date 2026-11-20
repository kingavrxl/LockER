from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from app.models.driver import PaymentStatusEnum


class DriverBase(BaseModel):
    full_name: str
    phone_number: str
    national_id: Optional[str] = None
    vehicle_plate: Optional[str] = None
    daily_rate_xof: Optional[int] = 5000


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    vehicle_plate: Optional[str] = None
    daily_rate_xof: Optional[int] = None
    current_status: Optional[PaymentStatusEnum] = None
    consecutive_overdue_days: Optional[int] = None


class DriverOut(DriverBase):
    id: int
    current_status: PaymentStatusEnum
    consecutive_overdue_days: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
