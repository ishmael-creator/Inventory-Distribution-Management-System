import uuid
from datetime import datetime
from pydantic import BaseModel, Field

class WarehouseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    location: str | None = Field(default=None, max_length=255)
    manager_id: uuid.UUID | None = None

class WarehouseRead(BaseModel):
    id: uuid.UUID
    name: str
    location: str | None
    manager_id: uuid.UUID | None
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class WarehouseReceiptCreate(BaseModel):
    batch_id: uuid.UUID
    warehouse_id: uuid.UUID
    quantity_received: int = Field(gt=0)
    notes: str | None = None

# NEW: Schema for Direct External Imports
class DirectImportCreate(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(gt=0)
    notes: str | None = None