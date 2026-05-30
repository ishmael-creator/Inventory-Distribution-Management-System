import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.user import User, Warehouse
from app.schemas.manufacturing import ProductBatchRead
from app.schemas.warehouse import WarehouseCreate, WarehouseRead, WarehouseReceiptCreate, DirectImportCreate
from app.services.warehouse_service import WarehouseService

# Imports for Direct Import
from app.services.inventory_service import InventoryService
from app.core.enums import LocationType, TransactionType

router = APIRouter()

@router.get("", response_model=list[WarehouseRead])
def list_warehouses(
    _: User = Depends(require_permissions("warehouses.read")),
    db: Session = Depends(get_db),
) -> list[Warehouse]:
    return list(db.scalars(select(Warehouse).order_by(Warehouse.name)).all())

@router.post("", response_model=WarehouseRead, status_code=201)
def create_warehouse(
    payload: WarehouseCreate,
    current_user: User = Depends(require_permissions("warehouses.write")),
    db: Session = Depends(get_db),
) -> Warehouse:
    return WarehouseService(db).create_warehouse(payload, current_user.id)

@router.post("/receipts", response_model=ProductBatchRead)
def receive_batch(
    payload: WarehouseReceiptCreate,
    current_user: User = Depends(require_permissions("warehouse.receipts.write")),
    db: Session = Depends(get_db),
):
    return WarehouseService(db).receive_batch(payload, current_user.id)

# NEW ENDPOINT: Handle external imports directly to the warehouse
@router.post("/{warehouse_id}/import")
def direct_import_to_warehouse(
    warehouse_id: uuid.UUID,
    payload: DirectImportCreate,
    current_user: User = Depends(require_permissions("warehouse.receipts.write")),
    db: Session = Depends(get_db)
):
    wh = db.get(Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    
    InventoryService(db).record_movement(
        product_id=payload.product_id,
        quantity=payload.quantity,
        transaction_type=TransactionType.WAREHOUSE_RECEIPT,
        created_by=current_user.id,
        to_location_type=LocationType.WAREHOUSE,
        to_location_id=warehouse_id,
        reference_type="EXTERNAL_IMPORT",
        notes=payload.notes or "Direct import from external supplier",
    )
    db.commit()
    return {"status": "success", "message": f"Successfully imported {payload.quantity} units to {wh.name}."}