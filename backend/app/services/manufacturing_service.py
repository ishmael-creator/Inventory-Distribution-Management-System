import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import BatchStatus, LocationType, TransactionType
from app.models.product import Product, ProductBatch
from app.schemas.manufacturing import ProductBatchCreate
from app.services.audit_service import AuditService
from app.services.inventory_service import InventoryService


class ManufacturingService:
    def __init__(self, db: Session):
        self.db = db

    def create_batch(self, payload: ProductBatchCreate, manufacturer_id: uuid.UUID) -> ProductBatch:
        if self.db.get(Product, payload.product_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        batch = ProductBatch(**payload.model_dump(), manufacturer_id=manufacturer_id)
        self.db.add(batch)
        self.db.flush()
        InventoryService(self.db).record_movement(
            product_id=batch.product_id,
            quantity=batch.quantity,
            transaction_type=TransactionType.PRODUCTION,
            created_by=manufacturer_id,
            to_location_type=LocationType.MANUFACTURER,
            to_location_id=manufacturer_id,
            reference_id=batch.id,
            reference_type="product_batch",
            notes=f"Production batch {batch.batch_number} created",
        )
        AuditService(self.db).log(
            user_id=manufacturer_id,
            action="product_batch.created",
            resource_type="product_batch",
            resource_id=batch.id,
            new_values={"batch_number": batch.batch_number, "quantity": batch.quantity},
        )
        self.db.commit()
        self.db.refresh(batch)
        return batch

    def release_to_warehouse(self, batch_id: uuid.UUID, user_id: uuid.UUID) -> ProductBatch:
        batch = self.db.scalar(select(ProductBatch).where(ProductBatch.id == batch_id).with_for_update())
        if batch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
        if batch.status != BatchStatus.DRAFT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Batch is not releasable")
        batch.status = BatchStatus.RELEASED_TO_WAREHOUSE
        batch.released_at = datetime.now(UTC)
        AuditService(self.db).log(
            user_id=user_id,
            action="product_batch.released_to_warehouse",
            resource_type="product_batch",
            resource_id=batch.id,
        )
        self.db.commit()
        self.db.refresh(batch)
        return batch

