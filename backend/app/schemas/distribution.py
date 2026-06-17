import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.core.enums import DispatchStatus, LocationType, RequestStatus


class HubCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    location: str | None = Field(default=None, max_length=255)
    warehouse_id: uuid.UUID
    manager_id: uuid.UUID | None = None


class HubRead(BaseModel):
    id: uuid.UUID
    name: str
    location: str | None
    warehouse_id: uuid.UUID
    manager_id: uuid.UUID | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AllocationRequestCreate(BaseModel):
    product_id: uuid.UUID
    warehouse_id: uuid.UUID
    hub_id: uuid.UUID
    quantity: int = Field(gt=0)
    notes: str | None = None


class AllocationRequestReview(BaseModel):
    approved_quantity: int | None = Field(default=None, gt=0)
    review_notes: str | None = None


class AllocationRequestRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    requested_by: uuid.UUID
    approved_by: uuid.UUID | None
    warehouse_id: uuid.UUID | None
    hub_id: uuid.UUID | None
    quantity: int
    approved_quantity: int | None
    reviewed_by: uuid.UUID | None
    review_notes: str | None
    reviewed_at: datetime | None
    status: RequestStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DispatchOrderRead(BaseModel):
    id: uuid.UUID
    allocation_request_id: uuid.UUID | None
    product_id: uuid.UUID
    dispatched_by: uuid.UUID | None
    quantity: int
    status: DispatchStatus
    from_location_type: LocationType
    from_location_id: uuid.UUID
    to_location_type: LocationType
    to_location_id: uuid.UUID
    dispatched_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HubReceiptCreate(BaseModel):
    dispatch_order_id: uuid.UUID
    quantity_received: int = Field(gt=0)
    notes: str | None = None

class HubUpdate(BaseModel):
    manager_id: Optional[uuid.UUID] = None


class AgentCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    hub_id: uuid.UUID


class AgentAllocationCreate(BaseModel):
    agent_id: uuid.UUID
    product_id: uuid.UUID
    quantity: int


class AgentSaleCreate(BaseModel):
    agent_id: uuid.UUID
    product_id: uuid.UUID
    quantity: int