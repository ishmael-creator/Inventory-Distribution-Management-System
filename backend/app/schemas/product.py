import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    sku: str = Field(min_length=2, max_length=80)
    description: str | None = None
    unit: str = Field(default="unit", min_length=1, max_length=40)
    low_stock_threshold: int = Field(default=0, ge=0)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = None
    unit: str | None = Field(default=None, min_length=1, max_length=40)
    low_stock_threshold: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ProductRead(BaseModel):
    id: uuid.UUID
    name: str
    sku: str
    description: str | None
    unit: str
    low_stock_threshold: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

