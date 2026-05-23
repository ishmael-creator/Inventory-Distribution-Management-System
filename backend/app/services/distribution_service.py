import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import DispatchStatus, LocationType, RequestStatus, TransactionType
from app.models.inventory import AllocationRequest, DispatchOrder, Receipt
from app.models.product import Product
from app.models.user import Hub, Warehouse
from app.schemas.distribution import AllocationRequestCreate, AllocationRequestReview, HubCreate, HubReceiptCreate
from app.services.audit_service import AuditService
from app.services.inventory_service import InventoryService


class DistributionService:
    def __init__(self, db: Session):
        self.db = db

    def create_hub(self, payload: HubCreate, user_id: uuid.UUID) -> Hub:
        if self.db.get(Warehouse, payload.warehouse_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found")
        hub = Hub(**payload.model_dump())
        self.db.add(hub)
        self.db.flush()
        AuditService(self.db).log(
            user_id=user_id,
            action="hub.created",
            resource_type="hub",
            resource_id=hub.id,
            new_values=payload.model_dump(mode="json"),
        )
        self.db.commit()
        self.db.refresh(hub)
        return hub

    def create_request(self, payload: AllocationRequestCreate, user_id: uuid.UUID) -> AllocationRequest:
        if self.db.get(Product, payload.product_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        if self.db.get(Warehouse, payload.warehouse_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found")
        hub = self.db.get(Hub, payload.hub_id)
        if hub is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hub not found")
        if hub.warehouse_id != payload.warehouse_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Hub does not belong to selected warehouse")

        request = AllocationRequest(**payload.model_dump(), requested_by=user_id)
        self.db.add(request)
        self.db.flush()
        AuditService(self.db).log(
            user_id=user_id,
            action="allocation_request.created",
            resource_type="allocation_request",
            resource_id=request.id,
            new_values=payload.model_dump(mode="json"),
        )
        self.db.commit()
        self.db.refresh(request)
        return request

    def approve_request(
        self,
        request_id: uuid.UUID,
        payload: AllocationRequestReview,
        user_id: uuid.UUID,
    ) -> AllocationRequest:
        request = self._get_pending_request_for_update(request_id)
        approved_quantity = payload.approved_quantity or request.quantity
        if approved_quantity > request.quantity:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Approved quantity cannot exceed requested quantity")

        request.status = RequestStatus.APPROVED
        request.approved_quantity = approved_quantity
        request.approved_by = user_id
        request.reviewed_by = user_id
        request.review_notes = payload.review_notes
        request.reviewed_at = datetime.now(UTC)
        AuditService(self.db).log(
            user_id=user_id,
            action="allocation_request.approved",
            resource_type="allocation_request",
            resource_id=request.id,
            new_values={"approved_quantity": approved_quantity, "review_notes": payload.review_notes},
        )
        self.db.commit()
        self.db.refresh(request)
        return request

    def reject_request(
        self,
        request_id: uuid.UUID,
        payload: AllocationRequestReview,
        user_id: uuid.UUID,
    ) -> AllocationRequest:
        request = self._get_pending_request_for_update(request_id)
        request.status = RequestStatus.REJECTED
        request.reviewed_by = user_id
        request.review_notes = payload.review_notes or "Warehouse cannot fulfill this request."
        request.reviewed_at = datetime.now(UTC)
        AuditService(self.db).log(
            user_id=user_id,
            action="allocation_request.rejected",
            resource_type="allocation_request",
            resource_id=request.id,
            new_values={"review_notes": request.review_notes},
        )
        self.db.commit()
        self.db.refresh(request)
        return request

    def dispatch_request(self, request_id: uuid.UUID, user_id: uuid.UUID) -> DispatchOrder:
        request = self.db.scalar(select(AllocationRequest).where(AllocationRequest.id == request_id).with_for_update())
        if request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
        if request.status != RequestStatus.APPROVED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only approved requests can be dispatched")
        if request.warehouse_id is None or request.hub_id is None or request.approved_quantity is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request is missing dispatch details")

        dispatch = DispatchOrder(
            allocation_request_id=request.id,
            product_id=request.product_id,
            dispatched_by=user_id,
            quantity=request.approved_quantity,
            status=DispatchStatus.DISPATCHED,
            from_location_type=LocationType.WAREHOUSE,
            from_location_id=request.warehouse_id,
            to_location_type=LocationType.HUB,
            to_location_id=request.hub_id,
            dispatched_at=datetime.now(UTC),
        )
        self.db.add(dispatch)
        self.db.flush()
        InventoryService(self.db).record_movement(
            product_id=request.product_id,
            quantity=request.approved_quantity,
            transaction_type=TransactionType.DISPATCH,
            created_by=user_id,
            from_location_type=LocationType.WAREHOUSE,
            from_location_id=request.warehouse_id,
            to_location_type=LocationType.HUB,
            to_location_id=request.hub_id,
            reference_id=dispatch.id,
            reference_type="dispatch_order",
            notes="Warehouse dispatched approved request to hub",
        )
        AuditService(self.db).log(
            user_id=user_id,
            action="dispatch_order.dispatched",
            resource_type="dispatch_order",
            resource_id=dispatch.id,
            new_values={"allocation_request_id": str(request.id), "quantity": request.approved_quantity},
        )
        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch

    def receive_dispatch(self, payload: HubReceiptCreate, user_id: uuid.UUID) -> DispatchOrder:
        dispatch = self.db.scalar(select(DispatchOrder).where(DispatchOrder.id == payload.dispatch_order_id).with_for_update())
        if dispatch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispatch order not found")
        if dispatch.status != DispatchStatus.DISPATCHED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dispatch is not awaiting hub receipt")
        if payload.quantity_received != dispatch.quantity:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partial hub receipt is not enabled in Phase 2")

        receipt = Receipt(
            dispatch_order_id=dispatch.id,
            received_by=user_id,
            quantity_received=payload.quantity_received,
            notes=payload.notes,
        )
        self.db.add(receipt)
        dispatch.status = DispatchStatus.RECEIVED

        if dispatch.allocation_request_id:
            request = self.db.get(AllocationRequest, dispatch.allocation_request_id)
            if request:
                request.status = RequestStatus.FULFILLED

        AuditService(self.db).log(
            user_id=user_id,
            action="hub.dispatch_received",
            resource_type="dispatch_order",
            resource_id=dispatch.id,
            new_values={"quantity_received": payload.quantity_received},
        )
        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch

    def _get_pending_request_for_update(self, request_id: uuid.UUID) -> AllocationRequest:
        request = self.db.scalar(select(AllocationRequest).where(AllocationRequest.id == request_id).with_for_update())
        if request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
        if request.status != RequestStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending requests can be reviewed")
        return request

