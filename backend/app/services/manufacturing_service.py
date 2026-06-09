import uuid
from datetime import UTC, datetime
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.utils.push_notifier import create_system_notification
# THE FIX: Added RoleCode to imports
from app.core.enums import BatchStatus, LocationType, TransactionType, RoleCode
from app.models.product import Product, ProductBatch
# THE FIX: Added User and Role to imports
from app.models.user import Warehouse, User, Role
from app.models.notification import Notification  
from app.schemas.manufacturing import ProductBatchCreate
from app.services.audit_service import AuditService
from app.services.inventory_service import InventoryService

class ManufacturingService:
    def __init__(self, db: Session):
        self.db = db

    def create_batch(self, payload: ProductBatchCreate, manufacturer_id: uuid.UUID) -> ProductBatch:
        if self.db.get(Product, payload.product_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

        date_part = datetime.now(UTC).strftime("%Y%m%d")
        random_part = uuid.uuid4().hex[:6].upper()
        auto_batch_number = f"BAT-{date_part}-{random_part}"
        
        batch = ProductBatch(
            **payload.model_dump(),
            manufacturer_id=manufacturer_id,
            batch_number=auto_batch_number 
        )

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

    def release_to_warehouse(self, batch_id: uuid.UUID, destination_id: uuid.UUID, user_id: uuid.UUID) -> ProductBatch:
        batch = self.db.scalar(select(ProductBatch).where(ProductBatch.id == batch_id).with_for_update())
        
        if batch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
        
        if batch.status != BatchStatus.AWAITING_RELEASE:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Batch is not awaiting release")

        warehouse = self.db.get(Warehouse, destination_id)
        if not warehouse:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination warehouse not found")

        batch.status = BatchStatus.RELEASED_TO_WAREHOUSE
        batch.released_at = datetime.now(UTC)
        batch.destination_id = destination_id 

        InventoryService(self.db).record_movement(
            product_id=batch.product_id,
            quantity=batch.quantity,
            transaction_type=TransactionType.TRANSFER,
            created_by=user_id,
            from_location_type=LocationType.MANUFACTURER,
            from_location_id=batch.manufacturer_id,
            to_location_type=None, 
            to_location_id=None,
            reference_id=batch.id,
            reference_type="product_batch",
            notes=f"Released batch {batch.batch_number} to warehouse",
        )

        AuditService(self.db).log(
            user_id=user_id,
            action="product_batch.released_to_warehouse",
            resource_type="product_batch",
            resource_id=batch.id,
            new_values={"destination_id": str(destination_id)}
        )

        # THE FIX: Find ALL users who are Warehouse Officers and notify them
        warehouse_officers = self.db.scalars(
            select(User)
            .join(Role)
            .where(Role.code == RoleCode.WAREHOUSE_OFFICER, User.is_active == True)
        ).all()

        for officer in warehouse_officers:
            create_system_notification(
                db=self.db,
                user_id=officer.id,
                title="Incoming Stock Delivery",
                message=f"Batch {batch.batch_number} ({batch.quantity} units) has been released by the manufacturer and is en route to {warehouse.name}.",
                reference_id=str(batch.id),
                reference_type="product_batch",
                url="/warehouse"
            )

        self.db.commit()
        self.db.refresh(batch)
        return batch