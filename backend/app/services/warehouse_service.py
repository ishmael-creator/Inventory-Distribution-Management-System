import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import BatchStatus, LocationType, TransactionType
from app.models.product import ProductBatch
from app.models.user import Warehouse
from app.schemas.warehouse import WarehouseCreate, WarehouseReceiptCreate
from app.services.audit_service import AuditService
from app.services.inventory_service import InventoryService


class WarehouseService:
    def __init__(self, db: Session):
        self.db = db

    def create_warehouse(self, payload: WarehouseCreate, user_id: uuid.UUID) -> Warehouse:
        warehouse = Warehouse(**payload.model_dump())
        self.db.add(warehouse)
        self.db.flush()
        AuditService(self.db).log(
            user_id=user_id,
            action="warehouse.created",
            resource_type="warehouse",
            resource_id=warehouse.id,
            new_values=payload.model_dump(mode="json"),
        )
        self.db.commit()
        self.db.refresh(warehouse)
        return warehouse

    def receive_batch(self, payload: WarehouseReceiptCreate, user_id: uuid.UUID) -> ProductBatch:
        batch = self.db.scalar(select(ProductBatch).where(ProductBatch.id == payload.batch_id).with_for_update())
        if batch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
        if batch.status != BatchStatus.RELEASED_TO_WAREHOUSE:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Batch is not awaiting warehouse receipt")
        if payload.quantity_received != batch.quantity:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partial batch receipt is not enabled in Phase 1")
        if self.db.get(Warehouse, payload.warehouse_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found")

        InventoryService(self.db).record_movement(
            product_id=batch.product_id,
            quantity=payload.quantity_received,
            transaction_type=TransactionType.WAREHOUSE_RECEIPT,
            created_by=user_id,
            from_location_type=LocationType.MANUFACTURER,
            from_location_id=batch.manufacturer_id,
            to_location_type=LocationType.WAREHOUSE,
            to_location_id=payload.warehouse_id,
            reference_id=batch.id,
            reference_type="product_batch",
            notes=payload.notes,
        )
        batch.status = BatchStatus.RECEIVED_AT_WAREHOUSE
        batch.received_at = datetime.now(UTC)
        AuditService(self.db).log(
            user_id=user_id,
            action="warehouse.batch_received",
            resource_type="product_batch",
            resource_id=batch.id,
            new_values={"warehouse_id": str(payload.warehouse_id), "quantity_received": payload.quantity_received},
        )
        self.db.commit()
        self.db.refresh(batch)
        return batch

