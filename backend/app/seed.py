import os
import uuid
from app.db.session import engine, SessionLocal
from app.models.user import Base, User, Role, Warehouse
from app.core.security import hash_password

def run_seed():
    print("🔄 Ensuring all production database tables exist...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    roles = {
        "SUPER_ADMIN": [
            "products.read", "products.write",
            "manufacturing.read", "manufacturing.read_all", "manufacturing.write", "manufacturing.release",
            "warehouses.read", "warehouses.write", "warehouse.receipts.write",
            "inventory.read", "inventory.write",
            "hubs.read", "hubs.write", "hub.receipts.write",
            "distribution.requests.read", "distribution.requests.write", "distribution.requests.review",
            "dispatches.read", "dispatches.write",
            "users.read", "users.write"
        ],
        "MANUFACTURER": [
            "products.read", "products.write", "manufacturing.read", "manufacturing.write", "manufacturing.release", "inventory.read", "warehouses.read"
        ],
        "WAREHOUSE_OFFICER": [
            "products.read", "warehouses.read", "warehouse.receipts.write", "manufacturing.read_all", 
            "manufacturing.read", "inventory.read", "hubs.read", "distribution.requests.read", 
            "distribution.requests.review", "dispatches.read", "dispatches.write"
        ],
        "DISTRIBUTION_TEAM": [
            "products.read", 
            "inventory.read", 
            "warehouses.read", 
            "hubs.read", "hubs.write", "hub.receipts.write",
            "distribution.requests.read", "distribution.requests.write", 
            "dispatches.read", "dispatches.write"
        ],
        "MANAGER": [
            "products.read", "warehouses.read", "hubs.read", "distribution.requests.read", 
            "manufacturing.read_all", "manufacturing.read", "inventory.read", "dispatches.read"
        ],
        "HUB_OFFICER": [
            "products.read", "hubs.read", "inventory.read", "dispatches.read", "hub.receipts.write"
        ],
        "AGENT": [
            "products.read", "inventory.read"
        ]
    }

    try:
        # Pure ORM injection, preventing JSONB corruption
        for code_str, perms in roles.items():
            role = db.query(Role).filter(Role.code == code_str).first()
            if not role:
                role = Role(
                    id=uuid.uuid4(), 
                    code=code_str, 
                    name=code_str.replace("_", " ").title(), 
                    permissions=perms
                )
                db.add(role)
            else:
                role.permissions = perms
        
        db.commit()

        # Provision Production Super Admin
        admin_role = db.query(Role).filter(Role.code == "SUPER_ADMIN").first()
        prod_admin_email = "ishmael@upenergygroup.com"
        raw_password = os.getenv("SUPER_ADMIN_PASSWORD", "UpEnergyAdmin2026!")
        
        admin_user = db.query(User).filter(User.email == prod_admin_email).first()
        if not admin_user:
            admin_user = User(
                id=uuid.uuid4(),
                email=prod_admin_email,
                full_name="Ishmael - Super Admin",
                hashed_password=hash_password(raw_password),
                role_id=admin_role.id,
                is_active=True
            )
            db.add(admin_user)
            print(f"✅ Production Super Admin account provisioned: {prod_admin_email}")
        else:
            admin_user.role_id = admin_role.id
            admin_user.is_active = True
        
        # Provision Central Warehouse
        central_wh = db.query(Warehouse).filter(Warehouse.name == "Central Warehouse").first()
        if not central_wh:
            central_wh = Warehouse(
                id=uuid.uuid4(),
                name="Central Warehouse",
                location="Central Distribution Hub",
                is_active=True
            )
            db.add(central_wh)

        db.commit()
        print("✅ Production database constraints and assets verified.")

    except Exception as e:
        db.rollback()
        print(f"❌ Automation Initialization Failed: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()