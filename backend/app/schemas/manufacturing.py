import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.enums import BatchStatus


class ProductBatchCreate(BaseModel):
    product_id: uuid.UUID
    batch_number: str = Field(min_length=2, max_length=100)
    quantity: int = Field(gt=0)
    produced_at: datetime


class ProductBatchRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    manufacturer_id: uuid.UUID
    batch_number: str
    quantity: int
    status: BatchStatus
    produced_at: datetime
    released_at: datetime | None
    received_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

