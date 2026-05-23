import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.user import User, Warehouse
from app.schemas.manufacturing import ProductBatchRead
from app.schemas.warehouse import WarehouseCreate, WarehouseRead, WarehouseReceiptCreate
from app.services.warehouse_service import WarehouseService

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

