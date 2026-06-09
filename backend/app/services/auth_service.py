import uuid
import secrets
import string
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload
from app.core.security import create_access_token, verify_password, hash_password
from app.models.user import User, Role, Hub
from app.core.enums import RoleCode
from app.utils.email import send_welcome_email

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
            
        # THE FIX: Inject must_change_password into the JWT token payload
        token_data = {
            "role": user.role.code, 
            "permissions": user.role.permissions,
            "must_change_password": user.must_change_password
        }
        return create_access_token(str(user.id), token_data)

    def admin_create_user(self, email: str, full_name: str, role_code: RoleCode, hub_id: uuid.UUID = None) -> User:
        existing = self.db.scalar(select(User).where(User.email == email.lower()))
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        role = self.db.scalar(select(Role).where(Role.code == role_code))
        if not role:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role code")

        # Generate a secure 12-character temporary password
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        temp_password = ''.join(secrets.choice(alphabet) for i in range(12))

        new_user = User(
            id=uuid.uuid4(),
            email=email.lower(),
            full_name=full_name,
            hashed_password=hash_password(temp_password),
            role_id=role.id,
            assigned_hub_id=hub_id,
            is_active=True,
            must_change_password=True # Flag for forced reset
        )
        self.db.add(new_user)
        
        # 🔥 THE FIX: Tell Postgres to temporarily save the user so they officially "exist"
        self.db.flush()
        
        # 🔥 THE NEW AUTOMATION 🔥
        # If they are a Hub Officer and assigned to a Hub, make them the Manager instantly!
        if hub_id and role_code == "HUB_OFFICER":
            hub = self.db.get(Hub, hub_id)
            if hub:
                hub.manager_id = new_user.id

        self.db.commit()
        self.db.refresh(new_user)

        # Trigger the email
        send_welcome_email(new_user.email, new_user.full_name, temp_password)

        return new_user

    def change_password(self, user_id: uuid.UUID, old_password: str, new_password: str):
        user = self.db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        if not verify_password(old_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect current password")
            
        user.hashed_password = hash_password(new_password)
        user.must_change_password = False # Remove the penalty flag
        self.db.commit()
        
        # Return a fresh token so they don't get logged out immediately after resetting
        token_data = {
            "role": user.role.code, 
            "permissions": user.role.permissions,
            "must_change_password": False
        }
        return create_access_token(str(user.id), token_data)