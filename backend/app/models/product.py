import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import BatchStatus
from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Product(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (CheckConstraint("low_stock_threshold >= 0"),)

    name: Mapped[str] = mapped_column(String(160))
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(String(40), default="unit")
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ProductBatch(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "product_batches"
    __table_args__ = (
        CheckConstraint("quantity > 0"),
        UniqueConstraint("product_id", "batch_number", name="uq_product_batches_product_batch_number"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), index=True)
    manufacturer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    batch_number: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int] = mapped_column(Integer)
    
    # FIXED: Update default to AWAITING_RELEASE
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus, name="batch_status"),
        default=BatchStatus.AWAITING_RELEASE, 
        index=True,
    )
    produced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    
    # NEW FIELD: Where is this batch going?
    destination_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)