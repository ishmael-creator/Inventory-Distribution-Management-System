import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.inventory import AllocationRequest, DispatchOrder
from app.models.user import Hub, User
from app.schemas.distribution import (
    AllocationRequestCreate,
    AllocationRequestRead,
    AllocationRequestReview,
    DispatchOrderRead,
    HubCreate,
    HubRead,
    HubReceiptCreate,
)
from app.services.distribution_service import DistributionService

router = APIRouter()


@router.get("/hubs", response_model=list[HubRead])
def list_hubs(
    _: User = Depends(require_permissions("hubs.read")),
    db: Session = Depends(get_db),
) -> list[Hub]:
    return list(db.scalars(select(Hub).order_by(Hub.name)).all())


@router.post("/hubs", response_model=HubRead, status_code=201)
def create_hub(
    payload: HubCreate,
    current_user: User = Depends(require_permissions("hubs.write")),
    db: Session = Depends(get_db),
) -> Hub:
    return DistributionService(db).create_hub(payload, current_user.id)


@router.get("/requests", response_model=list[AllocationRequestRead])
def list_requests(
    _: User = Depends(require_permissions("distribution.requests.read")),
    db: Session = Depends(get_db),
) -> list[AllocationRequest]:
    return list(db.scalars(select(AllocationRequest).order_by(AllocationRequest.created_at.desc())).all())


@router.post("/requests", response_model=AllocationRequestRead, status_code=201)
def create_request(
    payload: AllocationRequestCreate,
    current_user: User = Depends(require_permissions("distribution.requests.write")),
    db: Session = Depends(get_db),
) -> AllocationRequest:
    return DistributionService(db).create_request(payload, current_user.id)


@router.post("/requests/{request_id}/approve", response_model=AllocationRequestRead)
def approve_request(
    request_id: uuid.UUID,
    payload: AllocationRequestReview,
    current_user: User = Depends(require_permissions("distribution.requests.review")),
    db: Session = Depends(get_db),
) -> AllocationRequest:
    return DistributionService(db).approve_request(request_id, payload, current_user.id)


@router.post("/requests/{request_id}/reject", response_model=AllocationRequestRead)
def reject_request(
    request_id: uuid.UUID,
    payload: AllocationRequestReview,
    current_user: User = Depends(require_permissions("distribution.requests.review")),
    db: Session = Depends(get_db),
) -> AllocationRequest:
    return DistributionService(db).reject_request(request_id, payload, current_user.id)


@router.get("/dispatches", response_model=list[DispatchOrderRead])
def list_dispatches(
    _: User = Depends(require_permissions("dispatches.read")),
    db: Session = Depends(get_db),
) -> list[DispatchOrder]:
    return list(db.scalars(select(DispatchOrder).order_by(DispatchOrder.created_at.desc())).all())


@router.post("/requests/{request_id}/dispatch", response_model=DispatchOrderRead)
def dispatch_request(
    request_id: uuid.UUID,
    current_user: User = Depends(require_permissions("dispatches.write")),
    db: Session = Depends(get_db),
) -> DispatchOrder:
    return DistributionService(db).dispatch_request(request_id, current_user.id)


@router.post("/receipts", response_model=DispatchOrderRead)
def receive_dispatch(
    payload: HubReceiptCreate,
    current_user: User = Depends(require_permissions("hub.receipts.write")),
    db: Session = Depends(get_db),
) -> DispatchOrder:
    return DistributionService(db).receive_dispatch(payload, current_user.id)

