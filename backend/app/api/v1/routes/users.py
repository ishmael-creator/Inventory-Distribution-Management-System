import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.user import User, Role
from app.schemas.user import UserRead
from app.core.security import hash_password

router = APIRouter()

class UserCreatePayload(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role_code: str
    assigned_hub_id: uuid.UUID | None = None

class PasswordResetPayload(BaseModel):
    new_password: str

# THE FIX: Changed require_permissions("*") to explicit "users.read" and "users.write"

@router.get("", response_model=list[UserRead])
def list_users(_: User = Depends(require_permissions("users.read")), db: Session = Depends(get_db)):
    return list(db.scalars(select(User).order_by(User.created_at.desc())).all())

@router.post("", response_model=UserRead)
def create_user(payload: UserCreatePayload, _: User = Depends(require_permissions("users.write")), db: Session = Depends(get_db)):
    role = db.scalar(select(Role).where(Role.code == payload.role_code))
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role code.")
    
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")
        
    new_user = User(
        id=uuid.uuid4(),
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role_id=role.id,
        assigned_hub_id=payload.assigned_hub_id,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.patch("/{user_id}/toggle", response_model=UserRead)
def toggle_user_access(user_id: uuid.UUID, _: User = Depends(require_permissions("users.write")), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    if user.role.code == "SUPER_ADMIN" and user.email == "ishmael@upenergygroup.com":
        raise HTTPException(status_code=400, detail="Cannot disable the master admin account.")
        
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}")
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("users.write"))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent deleting yourself
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # The Fix: Soft Delete instead of Hard Delete
    user.is_active = False 
    db.commit()
    
    return {"message": "User successfully deactivated"}

@router.post("/{user_id}/reset-password")
def reset_password(user_id: uuid.UUID, payload: PasswordResetPayload, _: User = Depends(require_permissions("users.write")), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.") 
        
    user.hashed_password = hash_password(payload.new_password)
    
    # THE FIX: Force them into the penalty box so they MUST change this temporary password!
    user.must_change_password = True 
    
    db.commit()
    return {"status": "success", "message": "Password updated securely and user forced to reset."}