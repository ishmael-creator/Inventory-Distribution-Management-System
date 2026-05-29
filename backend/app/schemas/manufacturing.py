import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.enums import BatchStatus


class ProductBatchCreate(BaseModel):
    product_id: uuid.UUID
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
    
    # NEW FIELD: Tells the frontend where the batch is going
    destination_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


# NEW SCHEMA: What the frontend sends when you click "Release"
class BatchReleaseRequest(BaseModel):
    destination_id: uuid.UUID