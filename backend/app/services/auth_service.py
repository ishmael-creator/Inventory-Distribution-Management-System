import uuid
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload
from app.core.security import create_access_token, verify_password, hash_password
from app.models.user import User, Role
from app.core.enums import RoleCode
from app.schemas.auth import RegisterRequest

class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def authenticate(self, email: str, password: str) -> str:
        user = self.db.scalar(
            select(User).options(joinedload(User.role)).where(User.email == email.lower())
        )
        if user is None or not user.is_active or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        return create_access_token(str(user.id), {"role": user.role.code, "permissions": user.role.permissions})

    def register(self, payload: RegisterRequest) -> User:
        existing = self.db.scalar(select(User).where(User.email == payload.email.lower()))
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        # Automatically provision the Super Admin role for the system owner
        role = self.db.scalar(select(Role).where(Role.code == RoleCode.SUPER_ADMIN))
        if not role:
            role = Role(
                id=uuid.uuid4(),
                code=RoleCode.SUPER_ADMIN,
                name="Super Admin",
                description="System Administrator",
                permissions=["*"]
            )
            self.db.add(role)
            self.db.flush()

        new_user = User(
            id=uuid.uuid4(),
            email=payload.email.lower(),
            full_name=payload.full_name,
            hashed_password=hash_password(payload.password),
            role_id=role.id,
            is_active=True
        )
        self.db.add(new_user)
        self.db.commit()
        self.db.refresh(new_user)
        return new_user