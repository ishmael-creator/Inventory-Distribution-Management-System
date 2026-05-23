import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.schemas.common import Page
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate


class ProductService:
    def __init__(self, db: Session):
        self.db = db

    def list_products(self, *, search: str | None, limit: int, offset: int) -> Page[ProductRead]:
        query = select(Product)
        count_query = select(func.count()).select_from(Product)
        if search:
            pattern = f"%{search}%"
            query = query.where(Product.name.ilike(pattern) | Product.sku.ilike(pattern))
            count_query = count_query.where(Product.name.ilike(pattern) | Product.sku.ilike(pattern))
        total = self.db.scalar(count_query) or 0
        items = self.db.scalars(query.order_by(Product.name).limit(limit).offset(offset)).all()
        return Page(items=items, total=total, limit=limit, offset=offset)

    def create_product(self, payload: ProductCreate) -> Product:
        existing = self.db.scalar(select(Product).where(Product.sku == payload.sku.upper()))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product SKU already exists")
        product = Product(**payload.model_dump(exclude={"sku"}), sku=payload.sku.upper())
        self.db.add(product)
        self.db.flush()
        return product

    def update_product(self, product_id: uuid.UUID, payload: ProductUpdate) -> Product:
        product = self.db.get(Product, product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(product, key, value)
        self.db.flush()
        return product

