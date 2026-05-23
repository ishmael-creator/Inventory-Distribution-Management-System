import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import LocationType, TransactionType
from app.models.inventory import InventoryBalance, InventoryTransaction


class InventoryService:
    def __init__(self, db: Session):
        self.db = db

    def record_movement(
        self,
        *,
        product_id: uuid.UUID,
        quantity: int,
        transaction_type: TransactionType,
        created_by: uuid.UUID,
        from_location_type: LocationType | None = None,
        from_location_id: uuid.UUID | None = None,
        to_location_type: LocationType | None = None,
        to_location_id: uuid.UUID | None = None,
        reference_id: uuid.UUID | None = None,
        reference_type: str | None = None,
        notes: str | None = None,
    ) -> InventoryTransaction:
        if quantity <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Quantity must be positive")

        if from_location_type and from_location_id:
            self._decrease_balance(product_id, from_location_type, from_location_id, quantity)

        if to_location_type and to_location_id:
            self._increase_balance(product_id, to_location_type, to_location_id, quantity)

        transaction = InventoryTransaction(
            product_id=product_id,
            transaction_type=transaction_type,
            quantity=quantity,
            from_location_type=from_location_type,
            from_location_id=from_location_id,
            to_location_type=to_location_type,
            to_location_id=to_location_id,
            reference_id=reference_id,
            reference_type=reference_type,
            notes=notes,
            created_by=created_by,
        )
        self.db.add(transaction)
        return transaction

    def _get_balance_for_update(
        self,
        product_id: uuid.UUID,
        location_type: LocationType,
        location_id: uuid.UUID,
    ) -> InventoryBalance | None:
        return self.db.scalar(
            select(InventoryBalance)
            .where(
                InventoryBalance.product_id == product_id,
                InventoryBalance.location_type == location_type,
                InventoryBalance.location_id == location_id,
            )
            .with_for_update()
        )

    def _increase_balance(
        self,
        product_id: uuid.UUID,
        location_type: LocationType,
        location_id: uuid.UUID,
        quantity: int,
    ) -> InventoryBalance:
        balance = self._get_balance_for_update(product_id, location_type, location_id)
        if balance is None:
            balance = InventoryBalance(
                product_id=product_id,
                location_type=location_type,
                location_id=location_id,
                quantity=0,
                reserved_quantity=0,
            )
            self.db.add(balance)
            self.db.flush()
        balance.quantity += quantity
        return balance

    def _decrease_balance(
        self,
        product_id: uuid.UUID,
        location_type: LocationType,
        location_id: uuid.UUID,
        quantity: int,
    ) -> InventoryBalance:
        balance = self._get_balance_for_update(product_id, location_type, location_id)
        if balance is None or balance.quantity - balance.reserved_quantity < quantity:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Insufficient available inventory")
        balance.quantity -= quantity
        return balance

