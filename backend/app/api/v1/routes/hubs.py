# app/api/v1/routers/hubs.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import require_permissions, get_current_user
from app.models.user import User
from app.schemas.hub import AgentSaleCreate, AgentSaleResponse
from app.services import hub_service

router = APIRouter()

@router.post("/sales", response_model=AgentSaleResponse)
def allocate_to_agent(
    sale_data: AgentSaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(["hubs.write", "inventory.write"]))
):
    """
    Allocates inventory from a Hub to a Sales Agent.
    Strictly deducts from hub balances, adds to agent balances, and creates an immutable ledger entry.
    """
    transaction = hub_service.allocate_stock_to_agent(
        db=db, 
        user_id=current_user.id, 
        sale_data=sale_data
    )
    
    return AgentSaleResponse(
        transaction_id=transaction.id,
        agent_id=transaction.to_location_id,
        quantity_allocated=transaction.quantity,
        status="ALLOCATED_TO_AGENT"
    )