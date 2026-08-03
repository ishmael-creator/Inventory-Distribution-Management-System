import uuid
from datetime import datetime
from typing import Optional
from fastapi import HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select, or_

from app.models.inventory import AllocationRequest, DispatchOrder, InventoryBalance, InventoryTransaction, AgentAllocation, AgentSale, DeliveryDispute
from app.models.user import Hub, User, Role, Agent
from app.models.product import Product
from app.core.enums import RoleCode, LocationType, TransactionType
from app.schemas.distribution import (
    AgentReturnCreate, HubCreate, AllocationRequestCreate, AllocationRequestReview,
    HubReceiptCreate, AgentCreate, AgentAllocationCreate, AgentSaleCreate,
    HubTransferCreate, AgentReallocationCreate, ReverseDispatchCreate, ReverseReceiptCreate  # <-- Added the new schemas here
)
from app.utils.push_notifier import create_system_notification
from app.services.inventory_service import InventoryService


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
        if dispatch.status in ["RECEIVED", "PARTIALLY_RECEIVED"]:
            raise HTTPException(400, "Dispatch already processed")

        # Phase 2 mathematical verification
        total_reported = payload.quantity_received + payload.damaged_quantity + payload.missing_quantity
        if total_reported != dispatch.quantity:
            raise HTTPException(400, f"Accountability mismatch: Must account for exactly {dispatch.quantity} dispatched units.")

        if payload.damaged_quantity > 0 or payload.missing_quantity > 0:
            dispute = DeliveryDispute(
                id=uuid.uuid4(),
                dispatch_order_id=dispatch.id,
                product_id=dispatch.product_id,
                reported_by=user_id,
                missing_quantity=payload.missing_quantity,
                damaged_quantity=payload.damaged_quantity,
                notes=payload.notes
            )
            self.db.add(dispute)
            dispatch.status = "PARTIALLY_RECEIVED"

            self._notify_role(
                RoleCode.SUPER_ADMIN,
                "Hub Discrepancy Alert",
                f"Hub reported {payload.damaged_quantity} damaged and {payload.missing_quantity} missing units from a recent dispatch.",
                str(dispute.id),
                "delivery_dispute"
            )
        else:
            dispatch.status = "RECEIVED"

        req = self.db.query(AllocationRequest).filter_by(id=dispatch.allocation_request_id).first()
        if req: req.status = "FULFILLED"

        # Only give them credit for what they actually received in good condition
        if payload.quantity_received > 0:
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

            # THE FIX: We map the exact origin so the report logs accurately track Lateral Hub Transfers
            tx = InventoryTransaction(
                id=uuid.uuid4(),
                product_id=dispatch.product_id,
                transaction_type="RECEIPT",
                from_location_type=dispatch.from_location_type,
                from_location_id=dispatch.from_location_id,
                to_location_type="HUB",
                to_location_id=dispatch.to_location_id,
                quantity=payload.quantity_received,
                created_by=user_id,
                notes=getattr(payload, 'notes', "Confirmed partial/full receipt at Hub.")
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
            email=f"{agent_code.lower()}@upenergy.com",
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

        # 3. Add back to the TARGET Hub
        hub_bal = self.db.query(InventoryBalance).filter_by(
            location_type="HUB", location_id=payload.target_hub_id, product_id=payload.product_id
        ).first()

        if not hub_bal:
            hub_bal = InventoryBalance(
                id=uuid.uuid4(), product_id=payload.product_id, location_type="HUB",
                location_id=payload.target_hub_id, quantity=payload.quantity,
                reserved_quantity=payload.quantity if payload.condition == "DAMAGED" else 0
            )
            self.db.add(hub_bal)
        else:
            hub_bal.quantity += payload.quantity
            # If it's damaged, lock it in the reserved column so it cannot be sold
            if payload.condition == "DAMAGED":
                hub_bal.reserved_quantity += payload.quantity

        # 4. Log the Return Transaction
        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=payload.product_id, transaction_type=TransactionType.TRANSFER,
            from_location_type=LocationType.AGENT, from_location_id=agent.id,
            to_location_type=LocationType.HUB, to_location_id=payload.target_hub_id,
            quantity=payload.quantity, created_by=user_id,
            notes=f"Walk-in return ({payload.condition}). Reason: {payload.reason}"
        )
        self.db.add(tx)
        self.db.commit()
        return tx

    def get_all_disputes(self):
        disputes = self.db.query(DeliveryDispute).order_by(DeliveryDispute.created_at.desc()).all()
        # Attach the reporter's name to the object dynamically for the UI
        for d in disputes:
            reporter = self.db.query(User).filter(User.id == d.reported_by).first()
            d.reporter_name = reporter.full_name if reporter else "Unknown Officer"
        return disputes

    def resolve_dispute(self, dispute_id: uuid.UUID, action: str, notes: str | None, user_id: uuid.UUID):
        dispute = self.db.query(DeliveryDispute).filter_by(id=dispute_id).first()
        if not dispute:
            raise HTTPException(404, "Dispute not found")

        # 1. Initiate Investigation
        if action == "INVESTIGATE":
            dispute.status = "INVESTIGATING"

        # 2. Recover Missing Units to Inventory
        elif action == "MARK_FOUND":
            dispute.status = "RESOLVED_RECOVERED"
            if dispute.missing_quantity > 0:
                location_type = None
                location_id = None

                # Figure out where these units were supposed to go
                if dispute.dispatch_order_id:
                    dispatch = self.db.query(DispatchOrder).filter_by(id=dispute.dispatch_order_id).first()
                    location_type = LocationType.HUB
                    location_id = dispatch.to_location_id if dispatch else None
                elif dispute.product_batch_id:
                    txn = self.db.query(InventoryTransaction).filter(
                        InventoryTransaction.reference_id == dispute.product_batch_id,
                        InventoryTransaction.transaction_type == TransactionType.WAREHOUSE_RECEIPT
                    ).first()
                    location_type = LocationType.WAREHOUSE
                    location_id = txn.to_location_id if txn else None

                # Inject them back into the live ledger
                if location_type and location_id:
                    InventoryService(self.db).record_movement(
                        product_id=dispute.product_id,
                        quantity=dispute.missing_quantity,
                        transaction_type=TransactionType.ADJUSTMENT_REVERSAL,
                        created_by=user_id,
                        from_location_type=None,
                        from_location_id=None,
                        to_location_type=location_type,
                        to_location_id=location_id,
                        reference_id=dispute.id,
                        reference_type="dispute_recovery",
                        notes=f"Recovered {dispute.missing_quantity} missing units from investigation."
                    )

        # 3. Return Damaged Units to Factory
        elif action == "RETURN_FACTORY":
            dispute.status = "RESOLVED_RETURNED"

        # 4. Give up and formally write off the ledger
        elif action == "WRITE_OFF":
            dispute.status = "RESOLVED_LOST"

        # Append Admin's resolution notes to the existing notes for the audit trail
        if notes:
            dispute.notes = f"{dispute.notes} | Resolution: {notes}" if dispute.notes else f"Resolution: {notes}"

        self.db.commit()
        self.db.refresh(dispute)
        return dispute

    def initiate_hub_transfer(self, payload: HubTransferCreate, current_user: User):
        if payload.source_hub_id == payload.destination_hub_id:
            raise HTTPException(400, "Source and destination hubs cannot be the same.")

        source_hub = self.db.get(Hub, payload.source_hub_id)
        dest_hub = self.db.get(Hub, payload.destination_hub_id)
        product = self.db.get(Product, payload.product_id)

        if not source_hub or not dest_hub or not product:
            raise HTTPException(404, "Invalid Hub or Product IDs.")

        # 1. Verify Stock (Warning only, do not deduct yet)
        source_bal = self.db.query(InventoryBalance).filter_by(
            location_type=LocationType.HUB, location_id=payload.source_hub_id, product_id=payload.product_id
        ).with_for_update().first()

        if not source_bal or source_bal.quantity < payload.quantity:
            raise HTTPException(400, f"Insufficient stock. {source_hub.name} only has {source_bal.quantity if source_bal else 0} units available.")

        # 2. Create the Tracked Dispatch Order as DRAFT
        dispatch = DispatchOrder(
            id=uuid.uuid4(),
            allocation_request_id=None,
            product_id=payload.product_id,
            dispatched_by=current_user.id,
            quantity=payload.quantity,
            status="DRAFT", # <--- DRAFT STATUS
            from_location_type=LocationType.HUB,
            from_location_id=payload.source_hub_id,
            to_location_type=LocationType.HUB,
            to_location_id=payload.destination_hub_id
        )
        self.db.add(dispatch)

        # 3. Notify the Source Hub Officers that they have a pending dispatch
        source_officers = self.db.scalars(select(User).where(User.assigned_hub_id == payload.source_hub_id, User.is_active == True)).all()
        for officer in source_officers:
            create_system_notification(
                db=self.db,
                user_id=officer.id,
                title="Pending Outbound Transfer",
                message=f"Distribution initiated a transfer of {payload.quantity} {product.name} to {dest_hub.name}. Please dispatch the truck.",
                reference_id=str(dispatch.id),
                reference_type="dispatch_order",
                url="/hubs"
            )

        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch

    def execute_hub_transfer(self, dispatch_id: uuid.UUID, current_user: User):
        dispatch = self.db.get(DispatchOrder, dispatch_id)
        if not dispatch or dispatch.status != "DRAFT":
            raise HTTPException(404, "Valid pending transfer not found.")

        # 1. Lock and Verify Physical Stock again
        source_bal = self.db.query(InventoryBalance).filter_by(
            location_type=LocationType.HUB, location_id=dispatch.from_location_id, product_id=dispatch.product_id
        ).with_for_update().first()

        if not source_bal or source_bal.quantity < dispatch.quantity:
            raise HTTPException(400, "Insufficient stock at the source hub to physically dispatch this transfer.")

        # 2. Deduct from Source Hub
        source_bal.quantity -= dispatch.quantity
        dispatch.status = "DISPATCHED"

        product = self.db.get(Product, dispatch.product_id)
        source_hub = self.db.get(Hub, dispatch.from_location_id)
        dest_hub = self.db.get(Hub, dispatch.to_location_id)

        # 3. Write immutable log
        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=dispatch.product_id,
            transaction_type=TransactionType.DISPATCH,
            from_location_type=LocationType.HUB,
            from_location_id=dispatch.from_location_id,
            to_location_type=LocationType.HUB,
            to_location_id=dispatch.to_location_id,
            quantity=dispatch.quantity,
            created_by=current_user.id,
            notes=f"Lateral Hub Transfer: Dispatched {dispatch.quantity} units of {product.name if product else 'Product'} from {source_hub.name if source_hub else 'Source'} to {dest_hub.name if dest_hub else 'Destination'}."
        )
        self.db.add(tx)

        # 4. Notify Destination Hub that the truck is on the way
        dest_officers = self.db.scalars(select(User).where(User.assigned_hub_id == dispatch.to_location_id, User.is_active == True)).all()
        for officer in dest_officers:
            create_system_notification(
                db=self.db,
                user_id=officer.id,
                title="Incoming Hub Transfer",
                message=f"{source_hub.name if source_hub else 'A hub'} has dispatched {dispatch.quantity} units of {product.name if product else 'Product'} to your hub.",
                reference_id=str(dispatch.id),
                reference_type="dispatch_order",
                url="/hubs"
            )

        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch

    def reallocate_agent_stock(self, payload: AgentReallocationCreate, current_user: User):
        if payload.source_agent_id == payload.destination_agent_id:
            raise HTTPException(400, "Cannot reallocate stock to the same agent.")

        source_agent = self.db.get(Agent, payload.source_agent_id)
        dest_agent = self.db.get(Agent, payload.destination_agent_id)
        product = self.db.get(Product, payload.product_id)

        if not source_agent or not dest_agent or not product:
            raise HTTPException(404, "Invalid Agent or Product IDs.")

        # 1. Check Source Agent Stock
        source_bal = self.db.query(InventoryBalance).filter_by(
            location_type=LocationType.AGENT, location_id=payload.source_agent_id, product_id=payload.product_id
        ).with_for_update().first()

        if not source_bal or source_bal.quantity < payload.quantity:
            raise HTTPException(400, f"Agent {source_agent.name} does not have enough stock in their backpack to reallocate.")

        # 2. Perform the Instant Transfer
        source_bal.quantity -= payload.quantity

        dest_bal = self.db.query(InventoryBalance).filter_by(
            location_type=LocationType.AGENT, location_id=payload.destination_agent_id, product_id=payload.product_id
        ).first()

        if not dest_bal:
            dest_bal = InventoryBalance(
                id=uuid.uuid4(), product_id=payload.product_id, location_type=LocationType.AGENT,
                location_id=payload.destination_agent_id, quantity=payload.quantity
            )
            self.db.add(dest_bal)
        else:
            dest_bal.quantity += payload.quantity

        # 3. Generate Highly Descriptive Log
        descriptive_note = (
            f"Field Reallocation: {current_user.full_name} instantly reassigned {payload.quantity} units "
            f"of {product.name} from {source_agent.name} to {dest_agent.name}. "
            f"Justification: {payload.reason}"
        )

        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=payload.product_id,
            transaction_type=TransactionType.TRANSFER,
            from_location_type=LocationType.AGENT,
            from_location_id=payload.source_agent_id,
            to_location_type=LocationType.AGENT,
            to_location_id=payload.destination_agent_id,
            quantity=payload.quantity,
            created_by=current_user.id,
            notes=descriptive_note
        )
        self.db.add(tx)
        self.db.commit()
        return tx

    # --- Add these inside your DistributionService class ---

    def dispatch_reverse_stock(self, payload: ReverseDispatchCreate, current_user: User):
        # --- AUTO-ROUTE TO MANUFACTURER ---
        dest_id = payload.destination_location_id
        if payload.destination_location_type == LocationType.MANUFACTURER:
            manufacturer = self.db.query(User).join(Role).filter(Role.code == RoleCode.MANUFACTURER).first()
            if not manufacturer:
                raise HTTPException(400, "Cannot dispatch: No Manufacturer account exists in the system to receive this. Please create one.")
            dest_id = manufacturer.id

        # 1. Verify Source Stock (Prioritize pulling from RESERVED/DAMAGED stock first)
        source_bal = self.db.query(InventoryBalance).filter_by(
            location_type=payload.source_location_type,
            location_id=payload.source_location_id,
            product_id=payload.product_id
        ).with_for_update().first()

        if not source_bal or source_bal.quantity < payload.quantity:
            raise HTTPException(400, "Insufficient stock at the source location to initiate this return.")

        # 2. THE FIX: Universally deduct from Source (Drain the reserved damaged pile first, for BOTH Hubs and Warehouses)
        deduct_from_reserved = min(source_bal.reserved_quantity, payload.quantity)
        source_bal.reserved_quantity -= deduct_from_reserved
        source_bal.quantity -= payload.quantity

        # 3. Create the Tracked Dispatch Order
        dispatch = DispatchOrder(
            id=uuid.uuid4(),
            allocation_request_id=None,
            product_id=payload.product_id,
            dispatched_by=current_user.id,
            quantity=payload.quantity,
            status="DISPATCHED",
            from_location_type=payload.source_location_type,
            from_location_id=payload.source_location_id,
            to_location_type=payload.destination_location_type,
            to_location_id=dest_id  # <-- Uses the auto-resolved ID
        )
        self.db.add(dispatch)

        product = self.db.get(Product, payload.product_id)

        # 4. Generate Highly Descriptive Log
        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=payload.product_id,
            transaction_type=TransactionType.DISPATCH,
            from_location_type=payload.source_location_type,
            from_location_id=payload.source_location_id,
            to_location_type=payload.destination_location_type,
            to_location_id=dest_id,
            quantity=payload.quantity,
            created_by=current_user.id,
            notes=f"Reverse Logistics Dispatch: {payload.quantity} units of {product.name if product else 'Product'}. Reason: {payload.reason}"
        )
        self.db.add(tx)

        # 5. Notify the Target Destination
        target_role = RoleCode.WAREHOUSE_OFFICER if payload.destination_location_type == LocationType.WAREHOUSE else RoleCode.MANUFACTURER
        self._notify_role(
            target_role,
            "Incoming Reverse Logistics",
            f"A return shipment of {payload.quantity} units of {product.name if product else 'Product'} has been dispatched to your location.",
            str(dispatch.id),
            "dispatch_order"
        )

        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch


    def receive_reverse_stock(self, payload: ReverseReceiptCreate, current_user: User):
        dispatch = self.db.query(DispatchOrder).filter_by(id=payload.dispatch_order_id).first()
        if not dispatch: raise HTTPException(404, "Dispatch order not found.")
        if dispatch.status in ["RECEIVED", "PARTIALLY_RECEIVED"]:
            raise HTTPException(400, "This return shipment has already been processed.")

        if payload.quantity_received != dispatch.quantity:
            raise HTTPException(400, f"Accountability mismatch. Expected {dispatch.quantity} units.")

        dispatch.status = "RECEIVED"

        # 1. Add Stock to Destination
        dest_bal = self.db.query(InventoryBalance).filter_by(
            location_type=dispatch.to_location_type,
            location_id=dispatch.to_location_id,
            product_id=dispatch.product_id
        ).first()

        if not dest_bal:
            dest_bal = InventoryBalance(
                id=uuid.uuid4(), product_id=dispatch.product_id,
                location_type=dispatch.to_location_type, location_id=dispatch.to_location_id,
                quantity=payload.quantity_received,
                # If it goes to the warehouse, keep it quarantined in 'reserved' so they don't sell it!
                reserved_quantity=payload.quantity_received if dispatch.to_location_type == LocationType.WAREHOUSE else 0
            )
            self.db.add(dest_bal)
        else:
            dest_bal.quantity += payload.quantity_received
            if dispatch.to_location_type == LocationType.WAREHOUSE:
                dest_bal.reserved_quantity += payload.quantity_received

        # 2. Log the Receipt
        product = self.db.get(Product, dispatch.product_id)
        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=dispatch.product_id,
            transaction_type=TransactionType.RECEIPT,
            from_location_type=dispatch.from_location_type,
            from_location_id=dispatch.from_location_id,
            to_location_type=dispatch.to_location_type,
            to_location_id=dispatch.to_location_id,
            quantity=payload.quantity_received,
            created_by=current_user.id,
            notes=f"Reverse Logistics Received: Confirmed receipt of {payload.quantity_received} returned units of {product.name if product else 'Product'}. Notes: {payload.notes}"
        )
        self.db.add(tx)

        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch
