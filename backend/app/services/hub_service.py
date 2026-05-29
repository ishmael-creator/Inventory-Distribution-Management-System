# app/services/hub_service.py
import uuid
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.inventory import InventoryBalance, InventoryTransaction
from app.schemas.hub import AgentSaleCreate
from app.core.enums import LocationType, TransactionType
from app.models.user import Agent


def allocate_stock_to_agent(db: Session, user_id: str, sale_data: AgentSaleCreate):
    # 1. Lock and retrieve the Hub's inventory balance for this product
    hub_balance = db.query(InventoryBalance).filter(
        InventoryBalance.location_type == LocationType.HUB,
        InventoryBalance.location_id == sale_data.hub_id,
        InventoryBalance.product_id == sale_data.product_id
    ).with_for_update().first()

    if not hub_balance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No inventory record found for this product at the specified hub."
        )

    # 2. Check if Hub has enough available stock (Total Qty - Reserved Qty)
    available_qty = hub_balance.quantity - hub_balance.reserved_quantity
    if available_qty < sale_data.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock. Hub has {available_qty} available, but {sale_data.quantity} was requested."
        )

    # 3. Get or Create the Agent record
    agent = db.query(Agent).filter(Agent.name == sale_data.agent_name).first()
    if not agent:
        # Explicitly assigning attributes to completely bypass any kwargs/init swallowing
        agent = Agent()
        agent.name = sale_data.agent_name
        agent.hub_id = hub_balance.location_id
        agent.agent_code = f"AGT-{uuid.uuid4().hex[:6].upper()}"
        agent.user_id = user_id
        
        db.add(agent)
        db.flush()

    # 4. Deduct stock from the Hub
    hub_balance.quantity -= sale_data.quantity

    # 5. Add stock to the Agent's balance
    agent_balance = db.query(InventoryBalance).filter(
        InventoryBalance.location_type == LocationType.AGENT,
        InventoryBalance.location_id == agent.id,
        InventoryBalance.product_id == sale_data.product_id
    ).with_for_update().first()

    if not agent_balance:
        agent_balance = InventoryBalance(
            product_id=sale_data.product_id,
            location_type=LocationType.AGENT,
            location_id=agent.id,
            quantity=sale_data.quantity,
            reserved_quantity=0
        )
        db.add(agent_balance)
    else:
        agent_balance.quantity += sale_data.quantity

    # 6. Generate the immutable Inventory Transaction Ledger Record
    transaction = InventoryTransaction(
        product_id=sale_data.product_id,
        transaction_type=TransactionType.ALLOCATION,
        quantity=sale_data.quantity,
        from_location_type=LocationType.HUB,
        from_location_id=sale_data.hub_id,
        to_location_type=LocationType.AGENT,
        to_location_id=agent.id,
        reference_type="AGENT_MANUAL_ALLOCATION",
        created_by=user_id
    )
    db.add(transaction)

    # 7. Commit the entire transaction atomically
    try:
        db.commit()
        db.refresh(transaction)
        return transaction
    except Exception as e:
        db.rollback()
        # Exposes the exact database constraint error to the UI if it fails
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"A database error occurred during stock allocation: {str(e)}"
        )