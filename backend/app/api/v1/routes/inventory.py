from pydantic import BaseModel, Field
from http.client import HTTPException
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.core.enums import LocationType, TransactionType
from app.db.session import get_db
from app.models.inventory import InventoryBalance, InventoryTransaction
from app.models.user import User, Agent
from app.schemas.inventory import InventoryBalanceRead, InventoryTransactionRead
# Make sure you have your dependencies imported (Session, get_db, get_current_user, etc.)

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


@router.get("/agent/balances", response_model=list[InventoryBalanceRead])
def get_agent_inventory_balances(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user) # Adjust this to match your actual auth dependency!
):
    # 1. Find the agent profile linked to the logged-in user
    agent = db.query(Agent).filter(Agent.user_id == current_user.id).first()
    
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="No Agent profile found for this user."
        )

    # 2. Fetch only the inventory balances belonging to this specific Agent
    balances = db.query(InventoryBalance).filter(
        InventoryBalance.location_type == LocationType.AGENT,
        InventoryBalance.location_id == agent.id,
        InventoryBalance.quantity > 0 # Optional: Only show products they actually have in stock
    ).all()

    return balances


# 1. The Schema (Tells FastAPI what data to expect from the frontend)
class CustomerSaleRequest(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(gt=0)

# 2. The Route
@router.post("/agent/sales")
def record_agent_sale(
    sale_data: CustomerSaleRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user) 
):
    # Find the logged-in Agent
    agent = db.query(Agent).filter(Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent profile not found.")

    # Find their specific inventory balance for this product and lock it
    balance = db.query(InventoryBalance).filter(
        InventoryBalance.location_type == LocationType.AGENT,
        InventoryBalance.location_id == agent.id,
        InventoryBalance.product_id == sale_data.product_id
    ).with_for_update().first()

    # Make sure they aren't trying to sell ghost inventory
    if not balance or balance.quantity < sale_data.quantity:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient stock. You only have {balance.quantity if balance else 0} available."
        )

    # Deduct the stock
    balance.quantity -= sale_data.quantity

    # Record the immutable ledger transaction
    transaction = InventoryTransaction(
        product_id=sale_data.product_id,
        transaction_type=TransactionType.DISPATCH, # We use DISPATCH because it is leaving the system
        quantity=sale_data.quantity,
        from_location_type=LocationType.AGENT,
        from_location_id=agent.id,
        to_location_type=None, # None, because the customer isn't a physical Hub/Agent in our database
        to_location_id=None, 
        reference_type="END_CUSTOMER_SALE",
        created_by=current_user.id
    )
    db.add(transaction)
    
    try:
        db.commit()
        return {"status": "success", "message": f"Successfully sold {sale_data.quantity} units!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
