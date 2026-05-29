import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.core.enums import BatchStatus, LocationType, TransactionType
from app.models.inventory import InventoryBalance, InventoryTransaction
from app.db.session import get_db
from app.models.product import ProductBatch
from app.models.user import User
# Added BatchReleaseRequest here
from app.schemas.manufacturing import ProductBatchCreate, ProductBatchRead, BatchReleaseRequest
from app.services.manufacturing_service import ManufacturingService

router = APIRouter()

@router.get("/batches", response_model=list[ProductBatchRead])
def list_batches(
    current_user: User = Depends(require_permissions("manufacturing.read")),
    db: Session = Depends(get_db),
) -> list[ProductBatch]:
    query = select(ProductBatch).order_by(ProductBatch.created_at.desc()).limit(100)
    if "manufacturing.read_all" not in current_user.role.permissions and "*" not in current_user.role.permissions:
        query = query.where(ProductBatch.manufacturer_id == current_user.id)
    return list(db.scalars(query).all())

@router.post("/batches", response_model=ProductBatchRead, status_code=201)
def create_batch(
    payload: ProductBatchCreate,
    current_user: User = Depends(require_permissions("manufacturing.write")),
    db: Session = Depends(get_db),
) -> ProductBatch:
    return ManufacturingService(db).create_batch(payload, current_user.id)

# Added payload: BatchReleaseRequest here
@router.post("/batches/{batch_id}/release", response_model=ProductBatchRead)
def release_batch(
    batch_id: uuid.UUID,
    payload: BatchReleaseRequest,
    current_user: User = Depends(require_permissions("manufacturing.release")),
    db: Session = Depends(get_db),
) -> ProductBatch:
    return ManufacturingService(db).release_to_warehouse(batch_id, payload.destination_id, current_user.id)

@router.post("/batches/{batch_id}/receive")
def receive_batch_at_warehouse(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    batch = db.query(ProductBatch).filter(ProductBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
        
    if batch.status != BatchStatus.RELEASED_TO_WAREHOUSE:
        raise HTTPException(status_code=400, detail="Batch is not en route to warehouse!")
        
    batch.status = BatchStatus.RECEIVED_AT_WAREHOUSE
    
    balance = db.query(InventoryBalance).filter(
        InventoryBalance.location_type == LocationType.WAREHOUSE,
        InventoryBalance.location_id == batch.destination_id, # Safely routing to intended warehouse
        InventoryBalance.product_id == batch.product_id
    ).first()
    
    if balance:
        balance.quantity += batch.quantity
    else:
        new_balance = InventoryBalance(
            product_id=batch.product_id,
            location_type=LocationType.WAREHOUSE,
            location_id=batch.destination_id or current_user.id, 
            quantity=batch.quantity
        )
        db.add(new_balance)
        
    tx = InventoryTransaction(
        product_id=batch.product_id,
        transaction_type=TransactionType.RECEIPT,
        quantity=batch.quantity,
        from_location_type=LocationType.MANUFACTURER,
        from_location_id=batch.manufacturer_id,
        to_location_type=LocationType.WAREHOUSE,
        to_location_id=batch.destination_id or current_user.id,
        reference_type="BATCH_RECEPTION",
        created_by=current_user.id
    )
    db.add(tx)
    db.commit()
    return {"status": "success", "message": "Batch officially received into Warehouse!"}