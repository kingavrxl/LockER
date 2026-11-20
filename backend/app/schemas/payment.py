from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from app.models.payment import ProviderEnum, TransactionStatusEnum


class PaymentCreate(BaseModel):
    driver_id: int
    amount: float
    currency: Optional[str] = "XOF"
    provider: ProviderEnum
    transaction_id: str
    status: Optional[TransactionStatusEnum] = TransactionStatusEnum.SUCCESS
    raw_payload: Optional[str] = None


class PaymentOut(BaseModel):
    id: int
    driver_id: int
    amount: float
    currency: str
    provider: ProviderEnum
    transaction_id: str
    status: TransactionStatusEnum
    payment_date: datetime

    model_config = ConfigDict(from_attributes=True)
