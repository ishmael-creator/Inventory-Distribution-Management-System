import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.core.enums import RoleCode


class RoleRead(BaseModel):
    id: uuid.UUID
    code: RoleCode
    name: str
    permissions: list[str]

    model_config = {"from_attributes": True}


class UserRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: RoleRead
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

