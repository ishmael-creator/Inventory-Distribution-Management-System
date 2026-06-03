import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import RoleCode
from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Role(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    code: Mapped[RoleCode] = mapped_column(Enum(RoleCode, name="role_code"), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    permissions: Mapped[list[str]] = mapped_column(JSONB, default=list)

    users: Mapped[list["User"]] = relationship(back_populates="role")


# ADDED: TimestampMixin so created_at exists!
class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # THE FIX: Added the security flag for forced password resets
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"))
    
    # Link Hub Officers to a specific Hub
    assigned_hub_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("hubs.id"), nullable=True)

    role: Mapped["Role"] = relationship("Role", lazy="joined")


class Warehouse(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "warehouses"

    name: Mapped[str] = mapped_column(String(160))
    location: Mapped[str | None] = mapped_column(String(255))
    manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Hub(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "hubs"

    name: Mapped[str] = mapped_column(String(160))
    location: Mapped[str | None] = mapped_column(String(255))
    warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("warehouses.id"))
    manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Agent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agents"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    hub_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("hubs.id"))
    
    name: Mapped[str] = mapped_column(String(150), index=True) 
    
    agent_code: Mapped[str] = mapped_column(String(80), unique=True)
    territory: Mapped[str | None] = mapped_column(String(160))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)