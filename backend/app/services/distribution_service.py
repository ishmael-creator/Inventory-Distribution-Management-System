import uuid
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.inventory import AllocationRequest, DispatchOrder, InventoryBalance, InventoryTransaction
from app.models.user import Hub
from app.schemas.distribution import HubCreate, AllocationRequestCreate, AllocationRequestReview, HubReceiptCreate

class DistributionService:
    def __init__(self, db: Session):
        self.db = db

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
        self.db.commit()
        self.db.refresh(req)
        return req

    def approve_request(self, request_id: uuid.UUID, payload: AllocationRequestReview, user_id: uuid.UUID):
        req = self.db.query(AllocationRequest).filter_by(id=request_id).first()
        if not req: raise HTTPException(404, "Request not found")
        req.status = "APPROVED"
        
        req.approved_quantity = getattr(payload, 'approved_quantity', getattr(payload, 'quantity', req.quantity))
        req.notes = getattr(payload, 'notes', None)
        req.reviewed_by = user_id
        self.db.commit()
        self.db.refresh(req)
        return req

    def reject_request(self, request_id: uuid.UUID, payload: AllocationRequestReview, user_id: uuid.UUID):
        req = self.db.query(AllocationRequest).filter_by(id=request_id).first()
        if not req: raise HTTPException(404, "Request not found")
        req.status = "REJECTED"
        req.notes = getattr(payload, 'notes', None)
        req.reviewed_by = user_id
        self.db.commit()
        self.db.refresh(req)
        return req

    def dispatch_request(self, request_id: uuid.UUID, user_id: uuid.UUID):
        req = self.db.query(AllocationRequest).filter_by(id=request_id).first()
        if not req: raise HTTPException(404, "Request not found")
        if req.status != "APPROVED": raise HTTPException(400, "Request must be approved before dispatch")

        qty = req.approved_quantity or req.quantity

        # 1. Deduct from Sender (Warehouse)
        warehouse_bal = self.db.query(InventoryBalance).filter_by(
            location_id=req.warehouse_id, product_id=req.product_id
        ).first()
        
        if not warehouse_bal or warehouse_bal.quantity < qty:
            raise HTTPException(400, "Insufficient stock in warehouse to dispatch.")
        
        warehouse_bal.quantity -= qty

        # Create Dispatch Order
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

        # 2. Log Outbound Transaction ONLY (In-Transit)
        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=req.product_id,
            transaction_type="DISPATCH",
            from_location_type="WAREHOUSE",
            from_location_id=req.warehouse_id,
            to_location_type=None,  # THE FIX: Changed from "IN_TRANSIT" to None
            to_location_id=None,
            quantity=qty,
            created_by=user_id,
            notes="Dispatched to Hub. In transit."
        )
        self.db.add(tx)
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

        # 1. Now we finally Add to Receiver (Hub)
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

        # 2. Log Inbound Transaction ONLY
        tx = InventoryTransaction(
            id=uuid.uuid4(),
            product_id=dispatch.product_id,
            transaction_type="RECEIPT",
            from_location_type=None, # THE FIX: Changed from "IN_TRANSIT" to None
            from_location_id=None,
            to_location_type="HUB",
            to_location_id=dispatch.to_location_id,
            quantity=payload.quantity_received,
            created_by=user_id,
            notes=getattr(payload, 'notes', "Confirmed receipt at Hub.")
        )
        self.db.add(tx)
        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch