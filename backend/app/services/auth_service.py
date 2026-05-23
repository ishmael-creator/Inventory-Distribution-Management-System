from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import create_access_token, verify_password
from app.models.user import User


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

