import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.product import ProductBatch
from app.models.user import User
from app.schemas.manufacturing import ProductBatchCreate, ProductBatchRead
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


@router.post("/batches/{batch_id}/release", response_model=ProductBatchRead)
def release_batch(
    batch_id: uuid.UUID,
    current_user: User = Depends(require_permissions("manufacturing.release")),
    db: Session = Depends(get_db),
) -> ProductBatch:
    return ManufacturingService(db).release_to_warehouse(batch_id, current_user.id)

