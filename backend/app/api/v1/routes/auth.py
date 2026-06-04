from typing import Optional
import uuid
from pydantic import BaseModel
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.core.enums import RoleCode
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserRead
from app.services.auth_service import AuthService

router = APIRouter()

# --- NEW SCHEMAS FOR ADMIN CREATION & PASSWORD RESET ---
class CreateUserRequest(BaseModel):
    email: str
    full_name: str
    role_code: RoleCode
    hub_id: Optional[uuid.UUID] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
# --------------------------------------------------------

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    token = AuthService(db).authenticate(payload.email, payload.password)
    return TokenResponse(access_token=token)

@router.post("/create-user", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: CreateUserRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Safeguard: Only SUPER_ADMIN can create users
    if current_user.role.code != RoleCode.SUPER_ADMIN:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not authorized to create users")
        
    return AuthService(db).admin_create_user(
        email=payload.email,
        full_name=payload.full_name,
        role_code=payload.role_code,
        hub_id=payload.hub_id
    )

@router.post("/change-password", response_model=TokenResponse)
def change_password(payload: ChangePasswordRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Returns a fresh token with must_change_password set to False
    new_token = AuthService(db).change_password(current_user.id, payload.old_password, payload.new_password)
    return TokenResponse(access_token=new_token)

@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user