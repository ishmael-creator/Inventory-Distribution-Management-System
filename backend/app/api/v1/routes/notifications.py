from typing import List
from pydantic import BaseModel, ConfigDict
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.notification import Notification

router = APIRouter()

# --- Schemas ---
class NotificationRead(BaseModel):
    id: uuid.UUID
    title: str
    message: str
    is_read: bool
    created_at: datetime
    reference_id: str | None = None
    reference_type: str | None = None
    
    model_config = ConfigDict(from_attributes=True)

# --- Routes ---
@router.get("", response_model=List[NotificationRead])
def get_my_notifications(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    unread_only: bool = False
):
    query = select(Notification).where(Notification.user_id == current_user.id).order_by(Notification.created_at.desc())
    if unread_only:
        query = query.where(Notification.is_read == False)
        
    return list(db.scalars(query).all())

@router.patch("/{notification_id}/read", status_code=status.HTTP_200_OK)
def mark_as_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == current_user.id)
        .values(is_read=True)
    )
    db.commit()
    return {"message": "Notification marked as read"}

@router.post("/read-all", status_code=status.HTTP_200_OK)
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    db.commit()
    return {"message": "All notifications marked as read"}