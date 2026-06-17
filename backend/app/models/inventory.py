import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import DispatchStatus, LocationType, RequestStatus, TransactionType
from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class InventoryBalance(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "inventory_balances"
    __table_args__ = (
        CheckConstraint("quantity >= 0"),
        CheckConstraint("reserved_quantity >= 0"),
        CheckConstraint("reserved_quantity <= quantity"),
        UniqueConstraint("product_id", "location_type", "location_id", name="uq_inventory_balances_product_location"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), index=True)
    location_type: Mapped[LocationType] = mapped_column(Enum(LocationType, name="location_type"), index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    reserved_quantity: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InventoryTransaction(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "inventory_transactions"
    __table_args__ = (CheckConstraint("quantity > 0"),)

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), index=True)
    transaction_type: Mapped[TransactionType] = mapped_column(Enum(TransactionType, name="transaction_type"))
    quantity: Mapped[int] = mapped_column(Integer)
    from_location_type: Mapped[LocationType | None] = mapped_column(Enum(LocationType, name="location_type"))
    from_location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    to_location_type: Mapped[LocationType | None] = mapped_column(Enum(LocationType, name="location_type"))
    to_location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    reference_type: Mapped[str | None] = mapped_column(String(80), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class StockMovement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stock_movements"
    __table_args__ = (CheckConstraint("quantity > 0"),)

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    from_location_type: Mapped[LocationType | None] = mapped_column(Enum(LocationType, name="location_type"))
    from_location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    to_location_type: Mapped[LocationType] = mapped_column(Enum(LocationType, name="location_type"))
    to_location_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String(40), default="PENDING")
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    reference_type: Mapped[str | None] = mapped_column(String(80))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AllocationRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "allocation_requests"
    __table_args__ = (CheckConstraint("quantity > 0"),)

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), index=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    warehouse_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("warehouses.id"), index=True)
    hub_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("hubs.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    approved_quantity: Mapped[int | None] = mapped_column(Integer)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    review_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status"),
        default=RequestStatus.PENDING,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text)


class DispatchOrder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "dispatch_orders"
    __table_args__ = (CheckConstraint("quantity > 0"),)

    allocation_request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("allocation_requests.id"))
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"))
    dispatched_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[DispatchStatus] = mapped_column(
        Enum(DispatchStatus, name="dispatch_status"),
        default=DispatchStatus.DRAFT,
    )
    from_location_type: Mapped[LocationType] = mapped_column(Enum(LocationType, name="location_type"))
    from_location_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    to_location_type: Mapped[LocationType] = mapped_column(Enum(LocationType, name="location_type"))
    to_location_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Receipt(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "receipts"
    __table_args__ = (CheckConstraint("quantity_received > 0"),)

    dispatch_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("dispatch_orders.id"))
    product_batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("product_batches.id"))
    received_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    quantity_received: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgentAllocation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agent_allocations"
    
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default="PENDING")
    allocated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    handed_over_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

class AgentSale(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agent_sales"
    
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    recorded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))