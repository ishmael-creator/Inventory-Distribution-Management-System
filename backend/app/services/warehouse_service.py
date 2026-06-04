import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

# THE FIX: Added RoleCode to imports
from app.core.enums import BatchStatus, LocationType, TransactionType, RoleCode
from app.models.product import ProductBatch
# THE FIX: Added User, Role, and Notification to imports
from app.models.user import Warehouse, User, Role
from app.models.notification import Notification
from app.schemas.warehouse import WarehouseCreate, WarehouseReceiptCreate
from app.services.audit_service import AuditService
from app.services.inventory_service import InventoryService


class WarehouseService:
    def __init__(self, db: Session):
        self.db = db

    # THE FIX: Helper function to broadcast to roles
    def _notify_role(self, role_code: str, title: str, message: str, ref_id: str, ref_type: str):
        users = self.db.scalars(
            select(User).join(Role).where(Role.code == role_code, User.is_active == True)
        ).all()
        for user in users:
            notif = Notification(
                id=uuid.uuid4(),
                user_id=user.id,
                title=title,
                message=message,
                reference_id=ref_id,
                reference_type=ref_type
            )
            self.db.add(notif)

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

        # THE FIX: 1. Target the specific manufacturer who made this batch
        notif_manu = Notification(
            id=uuid.uuid4(),
            user_id=batch.manufacturer_id,
            title="Batch Received at Warehouse",
            message=f"Your batch {batch.batch_number} ({payload.quantity_received} units) has been successfully received at the central warehouse.",
            reference_id=str(batch.id),
            reference_type="product_batch"
        )
        self.db.add(notif_manu)

        # THE FIX: 2. Broadcast to the Distribution Team so they know stock is available
        self._notify_role(
            RoleCode.DISTRIBUTION_TEAM,
            "New Stock Available",
            f"Batch {batch.batch_number} ({payload.quantity_received} units) has arrived at the central warehouse and is ready for distribution.",
            str(batch.id),
            "product_batch"
        )

        self.db.commit()
        self.db.refresh(batch)
        return batch