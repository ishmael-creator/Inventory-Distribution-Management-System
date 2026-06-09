import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permissions, get_current_user
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
    HubUpdate, # <-- Added this import! (Make sure you put the schema in this file)
)
from app.services.distribution_service import DistributionService

router = APIRouter()

@router.get("/hubs", response_model=list[HubRead])
def list_hubs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = select(Hub)
    
    # STRICT ISOLATION: If they are a Hub Officer, they only get to see their own Hub
    if current_user.role.code == "HUB_OFFICER" and current_user.assigned_hub_id:
        query = query.where(Hub.id == current_user.assigned_hub_id)
        
    return list(db.scalars(query.order_by(Hub.name)).all())


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

@router.patch("/hubs/{hub_id}")
def assign_hub_manager(
    hub_id: uuid.UUID,
    hub_data: HubUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Assign a manager to a specific hub. Only accessible by Admins/Super Admins.
    """
    # 1. Security Check: Only let Super Admins or Admins do this
    if current_user.role.code not in ["SUPER_ADMIN", "ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Not authorized to assign hub managers"
        )

    # 2. Find the Hub
    hub = db.query(Hub).filter(Hub.id == hub_id).first()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")

    # 3. Verify the new manager exists
    if hub_data.manager_id:
        manager = db.query(User).filter(User.id == hub_data.manager_id).first()
        if not manager:
            raise HTTPException(status_code=404, detail="Selected manager user not found")

    # 4. Update and Save
    hub.manager_id = hub_data.manager_id
    db.commit()
    db.refresh(hub)

    return hub