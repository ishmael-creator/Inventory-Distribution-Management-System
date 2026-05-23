import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import Page
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services.audit_service import AuditService
from app.services.product_service import ProductService

router = APIRouter()


@router.get("", response_model=Page[ProductRead])
def list_products(
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_permissions("products.read")),
    db: Session = Depends(get_db),
) -> Page[ProductRead]:
    return ProductService(db).list_products(search=search, limit=limit, offset=offset)


@router.post("", response_model=ProductRead, status_code=201)
def create_product(
    payload: ProductCreate,
    current_user: User = Depends(require_permissions("products.write")),
    db: Session = Depends(get_db),
) -> ProductRead:
    product = ProductService(db).create_product(payload)
    AuditService(db).log(
        user_id=current_user.id,
        action="product.created",
        resource_type="product",
        resource_id=product.id,
        new_values=payload.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(product)
    return product


@router.patch("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    current_user: User = Depends(require_permissions("products.write")),
    db: Session = Depends(get_db),
) -> ProductRead:
    product = ProductService(db).update_product(product_id, payload)
    AuditService(db).log(
        user_id=current_user.id,
        action="product.updated",
        resource_type="product",
        resource_id=product.id,
        new_values=payload.model_dump(mode="json", exclude_unset=True),
    )
    db.commit()
    db.refresh(product)
    return product

