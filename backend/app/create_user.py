import uuid
from app.api.deps import get_db
from app.db.session import engine
from app.db.base import Base
from app.models.user import User

# 1. Import your system's Enum definitions
try:
    from app.core.enums import RoleCode
except ImportError:
    # If your enum class is named differently (e.g. UserRole), fallback to string 
    RoleCode = None

try:
    from app.models.user import Role
except ImportError:
    try:
        from app.models.role import Role
    except ImportError:
        Role = None

try:
    from app.core.security import get_password_hash
except ImportError:
    try:
        from app.core.auth import get_password_hash
    except ImportError:
        def get_password_hash(password: str) -> str:
            return password

def create_admin_user():
    db_gen = get_db()
    db = next(db_gen)
    
    email = "admin@example.com"
    raw_password = "ChangeMe123!"
    
    try:
        # Determine the correct enum value for the database assignment
        # If your enum values are lowercase (e.g. RoleCode.admin), change this to .admin or .ADMIN accordingly
        admin_code_value = "admin"
        if RoleCode is not None:
            if hasattr(RoleCode, "ADMIN"):
                admin_code_value = RoleCode.ADMIN
            elif hasattr(RoleCode, "admin"):
                admin_code_value = RoleCode.admin
            elif hasattr(RoleCode, "SUPERADMIN"):
                admin_code_value = RoleCode.SUPERADMIN

        # 2. Handle Role Generation
        role_id = None
        if Role is not None:
            admin_role = db.query(Role).filter(Role.name.ilike("%admin%")).first()
            if not admin_role:
                admin_role = Role(
                    id=uuid.uuid4(), 
                    name="Admin", 
                    code=admin_code_value,  # Passes the database Enum type
                    description="System Administrator",
                    permissions=[]
                )
                db.add(admin_role)
                db.flush()  
            role_id = admin_role.id

        # 3. Check for existing User
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            print(f"User {email} already exists.")
            return

        # 4. Build User
        hashed_password = get_password_hash(raw_password)
        new_user = User(
            id=uuid.uuid4(),
            email=email,
            full_name="Admin User",
            hashed_password=hashed_password,
            is_active=True,
            role_id=role_id
        )
        
        db.add(new_user)
        db.commit()
        print("User successfully created.")
        print(f"Email: {email} | Password: {raw_password}")
        
    except Exception as e:
        db.rollback()
        print(f"Execution Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    create_admin_user()