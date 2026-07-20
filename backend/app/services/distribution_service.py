import uuid
from typing import Optional
from fastapi import HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select, or_

from app.models.inventory import AllocationRequest, DispatchOrder, InventoryBalance, InventoryTransaction, AgentAllocation, AgentSale
from app.models.user import Hub, User, Role, Agent
from app.models.product import Product
from app.core.enums import RoleCode
from app.schemas.distribution import AgentReturnCreate, HubCreate, AllocationRequestCreate, AllocationRequestReview, HubReceiptCreate, AgentCreate, AgentAllocationCreate, AgentSaleCreate
from app.utils.push_notifier import create_system_notification


class DistributionService:
    def __init__(self, db: Session):
        self.db = db

    def _notify_role(self, role_code: str, title: str, message: str, ref_id: str, ref_type: str, background_tasks: BackgroundTasks = None):
        users = self.db.scalars(
            select(User).join(Role).where(Role.code == role_code, User.is_active == True)
        ).all()
        for user in users:
            if background_tasks:
                background_tasks.add_task(
                    create_system_notification,
                    db=self.db, user_id=user.id, title=title, message=message, reference_id=ref_id, reference_type=ref_type,
                    url="/distribution" if role_code == RoleCode.DISTRIBUTION_TEAM else "/"
                )
            else:
                create_system_notification(
                    db=self.db, user_id=user.id, title=title, message=message, reference_id=ref_id, reference_type=ref_type,
                    url="/distribution" if role_code == RoleCode.DISTRIBUTION_TEAM else "/"
                )

    def create_hub(self, payload: HubCreate, user_id: uuid.UUID):
        hub = Hub(
            id=uuid.uuid4(),
            name=payload.name,
            location=payload.location,
            warehouse_id=payload.warehouse_id,
            manager_id=payload.manager_id,
            is_active=True
        )
        self.db.add(hub)
        self.db.commit()
        self.db.refresh(hub)
        return hub

    def delete_hub(self, hub_id: uuid.UUID, user_id: uuid.UUID):
        hub = self.db.query(Hub).filter_by(id=hub_id).first()
        if not hub: raise HTTPException(404, "Hub not found")
        
        # Soft delete the Hub
        hub.is_active = False
        
        # Also soft-delete any Hub Officers assigned exclusively to this hub to revoke their access
        officers = self.db.query(User).filter_by(assigned_hub_id=hub.id).all()
        for officer in officers:
            officer.is_active = False

        self.db.commit()
        return {"status": "success", "message": "Hub deleted successfully"}

    def create_request(self, payload: AllocationRequestCreate, user_id: uuid.UUID, background_tasks: BackgroundTasks = None):
        req = AllocationRequest(
            id=uuid.uuid4(),
            hub_id=payload.hub_id,
            warehouse_id=payload.warehouse_id,
            product_id=payload.product_id,
            quantity=getattr(payload, 'requested_quantity', getattr(payload, 'quantity', 0)),
            status="PENDING",
            requested_by=user_id
        )
        self.db.add(req)

        product = self.db.get(Product, req.product_id)
        product_name = product.name if product else "Unknown Product"
        hub = self.db.get(Hub, req.hub_id)
        hub_name = hub.name if hub else "a Hub"

        self._notify_role(
            RoleCode.WAREHOUSE_OFFICER,
            "New Allocation Request",
            f"The Distribution Team has requested {req.quantity} units of {product_name} for {hub_name}.",
            str(req.id),
            "allocation_request",
            background_tasks=background_tasks
        )

        self.db.commit()
        self.db.refresh(req)
        return req

    def approve_request(self, request_id: uuid.UUID, payload: AllocationRequestReview, user_id: uuid.UUID, background_tasks: BackgroundTasks = None):
        req = self.db.query(AllocationRequest).filter_by(id=request_id).first()
        if not req: raise HTTPException(404, "Request not found")

        req.status = "APPROVED"
        approved_qty = payload.approved_quantity if getattr(payload, 'approved_quantity', None) is not None else req.quantity
        req.approved_quantity = approved_qty
        req.notes = getattr(payload, 'notes', None)
        req.reviewed_by = user_id

        product = self.db.get(Product, req.product_id)
        product_name = product.name if product else "Unknown Product"

        self._notify_role(
            RoleCode.DISTRIBUTION_TEAM,
            "Request Approved",
            f"The Warehouse has approved your allocation request for {approved_qty} units of {product_name}.",
            str(req.id),
            "allocation_request",
            background_tasks=background_tasks
        )

        self.db.commit()
        self.db.refresh(req)
        return req

    def reject_request(self, request_id: uuid.UUID, payload: AllocationRequestReview, user_id: uuid.UUID, background_tasks: BackgroundTasks = None):
        req = self.db.query(AllocationRequest).filter_by(id=request_id).first()
        if not req: raise HTTPException(404, "Request not found")

        req.status = "REJECTED"
        req.notes = getattr(payload, 'notes', None)
        req.reviewed_by = user_id

        product = self.db.get(Product, req.product_id)
        product_name = product.name if product else "Unknown Product"

        self._notify_role(
            RoleCode.DISTRIBUTION_TEAM,
            "Request Rejected",
            f"The Warehouse has rejected your allocation request for {req.quantity} units of {product_name}. Reason: {req.notes}",
            str(req.id),
            "allocation_request",
            background_tasks=background_tasks
        )

        self.db.commit()
        self.db.refresh(req)
        return req

    def dispatch_request(self, request_id: uuid.UUID, user_id: uuid.UUID, background_tasks: BackgroundTasks = None):
        req = self.db.query(AllocationRequest).filter_by(id=request_id).first()
        if not req: raise HTTPException(404, "Request not found")
        if req.status != "APPROVED": raise HTTPException(400, "Request must be approved before dispatch")

        qty = req.approved_quantity if req.approved_quantity is not None else req.quantity
        warehouse_bal = self.db.query(InventoryBalance).filter_by(
            location_id=req.warehouse_id, product_id=req.product_id
        ).first()

        if not warehouse_bal or warehouse_bal.quantity < qty:
            raise HTTPException(400, "Insufficient stock in warehouse to dispatch.")

        warehouse_bal.quantity -= qty

        dispatch = DispatchOrder(
            id=uuid.uuid4(),
            allocation_request_id=req.id,
            product_id=req.product_id,
            dispatched_by=user_id,
            from_location_type="WAREHOUSE",
            from_location_id=req.warehouse_id,
            to_location_type="HUB",
            to_location_id=req.hub_id,
            quantity=qty,
            status="DISPATCHED"
        )
        self.db.add(dispatch)
        
        req.status = "FULFILLED"
        
        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=req.product_id,
            transaction_type="DISPATCH",
            from_location_type="WAREHOUSE",
            from_location_id=req.warehouse_id,
            to_location_type=None,
            to_location_id=None,
            quantity=qty,
            created_by=user_id,
            notes="Dispatched to Hub. In transit."
        )
        self.db.add(tx)

        product = self.db.get(Product, req.product_id)
        product_name = product.name if product else "Unknown Product"
        hub = self.db.get(Hub, req.hub_id)
        hub_name = hub.name if hub else "the Hub"

        # 1. Broad Push to Distribution Team
        self._notify_role(
            RoleCode.DISTRIBUTION_TEAM,
            "Stock Dispatched",
            f"{qty} units of {product_name} have been dispatched from the Central Warehouse and are en route to {hub_name}.",
            str(dispatch.id),
            "dispatch_order",
            background_tasks=background_tasks
        )

        # 2. Targeted Push exclusively to Officers assigned to this specific Hub
        hub_officers = self.db.scalars(select(User).where(User.assigned_hub_id == req.hub_id, User.is_active == True)).all()
        for officer in hub_officers:
            if background_tasks:
                background_tasks.add_task(
                    create_system_notification,
                    db=self.db,
                    user_id=officer.id,
                    title="Incoming Dispatch",
                    message=f"Heads up: {qty} units of {product_name} have just been dispatched from the Central Warehouse and are en route to your location ({hub_name}).",
                    reference_id=str(dispatch.id),
                    reference_type="dispatch_order",
                    url="/hubs"
                )
            else:
                create_system_notification(
                    db=self.db,
                    user_id=officer.id,
                    title="Incoming Dispatch",
                    message=f"Heads up: {qty} units of {product_name} have just been dispatched from the Central Warehouse and are en route to your location ({hub_name}).",
                    reference_id=str(dispatch.id),
                    reference_type="dispatch_order",
                    url="/hubs"
                )

        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch

    def receive_dispatch(self, payload: HubReceiptCreate, user_id: uuid.UUID):
        dispatch = self.db.query(DispatchOrder).filter_by(id=payload.dispatch_order_id).first()
        if not dispatch: raise HTTPException(404, "Dispatch not found")
        if dispatch.status == "RECEIVED": raise HTTPException(400, "Dispatch already received")

        dispatch.status = "RECEIVED"

        req = self.db.query(AllocationRequest).filter_by(id=dispatch.allocation_request_id).first()
        if req: req.status = "FULFILLED"

        hub_bal = self.db.query(InventoryBalance).filter_by(
            location_id=dispatch.to_location_id, product_id=dispatch.product_id
        ).first()

        if not hub_bal:
            hub_bal = InventoryBalance(
                id=uuid.uuid4(),
                product_id=dispatch.product_id,
                location_type="HUB",
                location_id=dispatch.to_location_id,
                quantity=payload.quantity_received
            )
            self.db.add(hub_bal)
        else:
            hub_bal.quantity += payload.quantity_received

        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=dispatch.product_id,
            transaction_type="RECEIPT",
            from_location_type=None,
            from_location_id=None,
            to_location_type="HUB",
            to_location_id=dispatch.to_location_id,
            quantity=payload.quantity_received,
            created_by=user_id,
            notes=getattr(payload, 'notes', "Confirmed receipt at Hub.")
        )
        self.db.add(tx)

        product = self.db.get(Product, dispatch.product_id)
        product_name = product.name if product else "Unknown Product"
        hub = self.db.get(Hub, dispatch.to_location_id)
        hub_name = hub.name if hub else "The Hub"

        # Broad Push back to Distribution
        self._notify_role(
            RoleCode.DISTRIBUTION_TEAM,
            "Stock Received at Hub",
            f"{hub_name} has successfully received and confirmed {payload.quantity_received} units of {product_name}.",
            str(dispatch.id),
            "dispatch_order"
        )

        # Notify the Warehouse Team that their truck arrived safely
        self._notify_role(
            RoleCode.WAREHOUSE_OFFICER,
            "Stock Received at Hub",
            f"{hub_name} has successfully received and confirmed {payload.quantity_received} units of {product_name}.",
            str(dispatch.id),
            "dispatch_order"
        )

        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch
    
    def create_agent(self, payload: AgentCreate, admin_user_id: uuid.UUID):
        agent_code = f"AGT-{uuid.uuid4().hex[:6].upper()}"
        
        # 1. Fetch the AGENT role from the database
        agent_role = self.db.query(Role).filter_by(code=RoleCode.AGENT).first()
        if not agent_role:
            raise HTTPException(500, "System AGENT role is missing. Cannot create agent.")
            
        # 2. Create a 'Shadow User' to satisfy the strict 1-to-1 database constraint
        # This gives them a real system identity without granting them actual login access
        shadow_user = User(
            id=uuid.uuid4(),
            email=f"{agent_code.lower()}@upenergy.local",
            full_name=payload.name,
            hashed_password="no_login_allowed_yet",
            role_id=agent_role.id,
            is_active=True
        )
        self.db.add(shadow_user)
        self.db.flush() # Locks in the shadow_user.id without fully committing yet
        
        # 3. Create the actual Agent Profile
        agent = Agent(
            id=uuid.uuid4(),
            name=payload.name,
            hub_id=payload.hub_id,
            agent_code=agent_code,
            user_id=shadow_user.id,
            region=payload.region,
            phone=payload.phone,
            territory=None
        )
        self.db.add(agent)
        self.db.commit()
        self.db.refresh(agent)
        return agent
    
    def get_agents(self, hub_id: Optional[uuid.UUID] = None, current_user: User = None):
        query = self.db.query(Agent).filter(Agent.is_active == True)
        if hub_id: query = query.filter(Agent.hub_id == hub_id)

        # THE CLAIMED VS UNCLAIMED LOGIC
        if current_user and current_user.role.code == RoleCode.REGIONAL_MANAGER:
            my_region = current_user.assigned_region
            
            # 1. Find all active regional managers and their regions (excluding myself)
            other_rms = self.db.query(User).join(Role).filter(
                Role.code == RoleCode.REGIONAL_MANAGER,
                User.is_active == True,
                User.id != current_user.id,
                User.assigned_region.isnot(None)
            ).all()
            
            claimed_regions = [rm.assigned_region for rm in other_rms]

            # 2. Filter: Show agents in MY region OR agents in UNCLAIMED regions
            if claimed_regions:
                query = query.filter(
                    or_(
                        Agent.region == my_region,
                        ~Agent.region.in_(claimed_regions),
                        Agent.region.is_(None)
                    )
                )

        return query.all()
    
    def delete_agent(self, agent_id: uuid.UUID, user_id: uuid.UUID):
        agent = self.db.query(Agent).filter_by(id=agent_id).first()
        if not agent: raise HTTPException(404, "Agent not found")

        # Soft delete the Agent profile
        agent.is_active = False

        # Soft delete their underlying Shadow User to fully lock their system footprint
        shadow_user = self.db.query(User).filter_by(id=agent.user_id).first()
        if shadow_user:
            shadow_user.is_active = False

        self.db.commit()
        return {"status": "success", "message": "Agent deleted successfully"}

    def get_agent_allocations(self, hub_id: Optional[uuid.UUID] = None):
        query = self.db.query(AgentAllocation)
        if hub_id:
            # Join the Agent table so we can filter by the Agent's Hub ID
            query = query.join(Agent).filter(Agent.hub_id == hub_id)
        return query.order_by(AgentAllocation.created_at.desc()).all()

    def allocate_to_agent(self, payload: AgentAllocationCreate, user_id: uuid.UUID, background_tasks: BackgroundTasks = None):
        agent = self.db.query(Agent).filter_by(id=payload.agent_id).first()
        if not agent: raise HTTPException(404, "Agent not found")

        # Dynamically reassign the roaming agent to the target pickup hub
        agent.hub_id = payload.hub_id

        # Fail Fast if the target Hub doesn't have the physical stock
        hub_bal = self.db.query(InventoryBalance).filter_by(
            location_id=payload.hub_id,
            product_id=payload.product_id
        ).first()
        
        available_qty = hub_bal.quantity if hub_bal else 0
        if available_qty < payload.quantity:
            product = self.db.get(Product, payload.product_id)
            raise HTTPException(
                400,
                f"Cannot allocate. The requested Hub only has {available_qty} units of {product.name if product else 'this product'} available."
            )

        # If they have the stock, proceed normally
        allocation = AgentAllocation(
            id=uuid.uuid4(), agent_id=agent.id, product_id=payload.product_id,
            quantity=payload.quantity, status="PENDING", allocated_by=user_id
        )
        self.db.add(allocation)
        
        product = self.db.get(Product, payload.product_id)

        # Notify exclusively the officers assigned to the target pickup hub
        hub_officers = self.db.scalars(select(User).where(User.assigned_hub_id == payload.hub_id, User.is_active == True)).all()
        for officer in hub_officers:
            if background_tasks:
                background_tasks.add_task(
                    create_system_notification,
                    db=self.db,
                    user_id=officer.id,
                    title="New Agent Allocation",
                    message=f"Distribution has allocated {payload.quantity} units of {product.name if product else 'Product'} to Agent {agent.name} for pickup at your Hub.",
                    reference_id=str(allocation.id),
                    reference_type="agent_allocation",
                    url="/hubs"
                )
            else:
                create_system_notification(
                    db=self.db,
                    user_id=officer.id,
                    title="New Agent Allocation",
                    message=f"Distribution has allocated {payload.quantity} units of {product.name if product else 'Product'} to Agent {agent.name} for pickup at your Hub.",
                    reference_id=str(allocation.id),
                    reference_type="agent_allocation",
                    url="/hubs"
                )

        self.db.commit()
        self.db.refresh(allocation)
        return allocation

    def confirm_agent_handover(self, allocation_id: uuid.UUID, user_id: uuid.UUID):
        allocation = self.db.query(AgentAllocation).filter_by(id=allocation_id).first()
        if not allocation or allocation.status != "PENDING": raise HTTPException(400, "Invalid allocation.")
            
        agent = self.db.query(Agent).filter_by(id=allocation.agent_id).first()
        
        hub_bal = self.db.query(InventoryBalance).filter_by(location_id=agent.hub_id, product_id=allocation.product_id).with_for_update().first()
        if not hub_bal or hub_bal.quantity < allocation.quantity: raise HTTPException(400, "Insufficient Hub stock.")
        hub_bal.quantity -= allocation.quantity

        agent_bal = self.db.query(InventoryBalance).filter_by(location_id=agent.id, product_id=allocation.product_id).first()
        if not agent_bal:
            agent_bal = InventoryBalance(product_id=allocation.product_id, location_type="AGENT", location_id=agent.id, quantity=allocation.quantity)
            self.db.add(agent_bal)
        else:
            agent_bal.quantity += allocation.quantity

        allocation.status = "HANDED_OVER"
        allocation.handed_over_by = user_id
        
        tx = InventoryTransaction(
            product_id=allocation.product_id, transaction_type="TRANSFER",
            from_location_type="HUB", from_location_id=agent.hub_id,
            to_location_type="AGENT", to_location_id=agent.id,
            quantity=allocation.quantity, created_by=user_id, notes=f"Handed to {agent.name}"
        )
        self.db.add(tx)
        self.db.commit()
        self.db.refresh(allocation)
        return allocation

    def record_agent_sale(self, payload: AgentSaleCreate, user_id: uuid.UUID):
        agent = self.db.query(Agent).filter_by(id=payload.agent_id).first()
        if not agent: raise HTTPException(404, "Agent not found")
        
        agent_bal = self.db.query(InventoryBalance).filter_by(location_id=agent.id, product_id=payload.product_id).with_for_update().first()
        if not agent_bal or agent_bal.quantity < payload.quantity: raise HTTPException(400, "Agent lacks sufficient stock.")
        agent_bal.quantity -= payload.quantity
        
        sale = AgentSale(agent_id=agent.id, product_id=payload.product_id, quantity=payload.quantity, recorded_by=user_id)
        self.db.add(sale)
        
        tx = InventoryTransaction(
            product_id=payload.product_id, transaction_type="DISPATCH",
            from_location_type="AGENT", from_location_id=agent.id,
            to_location_type=None, to_location_id=None,
            quantity=payload.quantity, created_by=user_id, notes=f"Sale by {agent.name}"
        )
        self.db.add(tx)
        self.db.commit()
        return sale

    def return_agent_stock(self, payload: AgentReturnCreate, user_id: uuid.UUID):
        # 1. Global Walk-In Search: Find agent by their unique CODE
        agent = self.db.query(Agent).filter(Agent.agent_code == payload.agent_code).first()
        if not agent: raise HTTPException(404, "Agent not found. Please verify the Agent Code.")

        # 2. Deduct from Agent's Backpack
        agent_bal = self.db.query(InventoryBalance).filter_by(
            location_type="AGENT", location_id=agent.id, product_id=payload.product_id
        ).with_for_update().first()
        
        if not agent_bal or agent_bal.quantity < payload.quantity: 
            raise HTTPException(400, f"Agent {agent.name} does not have enough of this stock in their backpack to return.")
        
        agent_bal.quantity -= payload.quantity

        # 3. Add back to the TARGET Hub (Where they walked in)
        hub_bal = self.db.query(InventoryBalance).filter_by(
            location_type="HUB", location_id=payload.target_hub_id, product_id=payload.product_id
        ).first()
        
        if not hub_bal:
            hub_bal = InventoryBalance(id=uuid.uuid4(), product_id=payload.product_id, location_type="HUB", location_id=payload.target_hub_id, quantity=payload.quantity)
            self.db.add(hub_bal)
        else:
            hub_bal.quantity += payload.quantity

        # 4. Log the Return Transaction
        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=payload.product_id, transaction_type="TRANSFER",
            from_location_type="AGENT", from_location_id=agent.id,
            to_location_type="HUB", to_location_id=payload.target_hub_id,
            quantity=payload.quantity, created_by=user_id, notes=f"Walk-in return processed for {agent.name}"
        )
        self.db.add(tx)
        self.db.commit()
        return tx