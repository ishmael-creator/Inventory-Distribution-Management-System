import uuid
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.inventory import AllocationRequest, DispatchOrder, InventoryBalance, InventoryTransaction
from app.models.user import Hub, User, Role
from app.models.product import Product
from app.core.enums import RoleCode
from app.schemas.distribution import HubCreate, AllocationRequestCreate, AllocationRequestReview, HubReceiptCreate

# 🔥 THE FIX: Import the Universal Push Engine
from app.utils.push_notifier import create_system_notification


class DistributionService:
    def __init__(self, db: Session):
        self.db = db

    def _notify_role(self, role_code: str, title: str, message: str, ref_id: str, ref_type: str):
        """Helper to broadcast a notification AND Web Push to all active users of a specific role."""
        users = self.db.scalars(
            select(User).join(Role).where(Role.code == role_code, User.is_active == True)
        ).all()
        
        for user in users:
            create_system_notification(
                db=self.db,
                user_id=user.id,
                title=title,
                message=message,
                reference_id=ref_id,
                reference_type=ref_type,
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

    def create_request(self, payload: AllocationRequestCreate, user_id: uuid.UUID):
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
            "allocation_request"
        )

        self.db.commit()
        self.db.refresh(req)
        return req

    def approve_request(self, request_id: uuid.UUID, payload: AllocationRequestReview, user_id: uuid.UUID):
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
            "allocation_request"
        )

        self.db.commit()
        self.db.refresh(req)
        return req

    def reject_request(self, request_id: uuid.UUID, payload: AllocationRequestReview, user_id: uuid.UUID):
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
            "allocation_request"
        )

        self.db.commit()
        self.db.refresh(req)
        return req

    def dispatch_request(self, request_id: uuid.UUID, user_id: uuid.UUID):
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
            "dispatch_order"
        )

        # 2. Targeted Push to Hub Manager
        if hub and hub.manager_id:
            create_system_notification(
                db=self.db,
                user_id=hub.manager_id,
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


        # 🔥 THE FIX: Notify the Warehouse Team that their truck arrived safely
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