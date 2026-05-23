import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.core.enums import LocationType
from app.db.session import get_db
from app.models.inventory import InventoryBalance, InventoryTransaction
from app.models.user import User
from app.schemas.inventory import InventoryBalanceRead, InventoryTransactionRead

router = APIRouter()


@router.get("/balances", response_model=list[InventoryBalanceRead])
def list_balances(
    product_id: uuid.UUID | None = None,
    location_type: LocationType | None = None,
    location_id: uuid.UUID | None = None,
    _: User = Depends(require_permissions("inventory.read")),
    db: Session = Depends(get_db),
) -> list[InventoryBalance]:
    query = select(InventoryBalance).order_by(InventoryBalance.updated_at.desc())
    if product_id:
        query = query.where(InventoryBalance.product_id == product_id)
    if location_type:
        query = query.where(InventoryBalance.location_type == location_type)
    if location_id:
        query = query.where(InventoryBalance.location_id == location_id)
    return list(db.scalars(query.limit(200)).all())


@router.get("/transactions", response_model=list[InventoryTransactionRead])
def list_transactions(
    product_id: uuid.UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(require_permissions("inventory.read")),
    db: Session = Depends(get_db),
) -> list[InventoryTransaction]:
    query = select(InventoryTransaction).order_by(InventoryTransaction.created_at.desc())
    if product_id:
        query = query.where(InventoryTransaction.product_id == product_id)
    return list(db.scalars(query.limit(limit)).all())

