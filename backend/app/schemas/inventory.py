import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.enums import LocationType, TransactionType


class InventoryBalanceRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    location_type: LocationType
    location_id: uuid.UUID
    quantity: int
    reserved_quantity: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class InventoryTransactionRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    transaction_type: TransactionType
    quantity: int
    from_location_type: LocationType | None
    from_location_id: uuid.UUID | None
    to_location_type: LocationType | None
    to_location_id: uuid.UUID | None
    reference_id: uuid.UUID | None
    reference_type: str | None
    notes: str | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}

