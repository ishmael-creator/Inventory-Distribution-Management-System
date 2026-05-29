# app/schemas/hub.py
from pydantic import BaseModel, Field
from uuid import UUID

class AgentSaleCreate(BaseModel):
    hub_id: UUID
    product_id: UUID
    agent_name: str = Field(..., min_length=1, description="Name or ID of the receiving agent")
    quantity: int = Field(..., gt=0, description="Quantity must be greater than 0")

class AgentSaleResponse(BaseModel):
    transaction_id: UUID
    agent_id: UUID
    quantity_allocated: int
    status: str

    class Config:
        from_attributes = True