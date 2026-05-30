import uuid
import json
from sqlalchemy import text
from app.api.deps import get_db

def run_role_seeder():
    db_gen = get_db()
    db = next(db_gen)

    roles = {
        "SUPER_ADMIN": ["*"],
        "MANUFACTURER": [
            "products.read", "manufacturing.read", "manufacturing.write", "manufacturing.release", "inventory.read",
            "warehouses.read" # <--- FIXED: Manufacturer can now see the destination warehouse!
        ],
        "WAREHOUSE_OFFICER": [
            "products.read", "warehouses.read", "warehouse.receipts.write", "manufacturing.read_all", 
            "manufacturing.read", "inventory.read", "hubs.read", "distribution.requests.read", 
            "distribution.requests.review", "dispatches.read", "dispatches.write"
        ],
        "DISTRIBUTION_TEAM": [
            "products.read", "inventory.read", "distribution.requests.read", "distribution.requests.write", "hubs.read"
        ],
        "MANAGER": [
            "products.read", "warehouses.read", "hubs.read", "distribution.requests.read", 
            "manufacturing.read_all", "manufacturing.read", "inventory.read", "dispatches.read"
            # Managers get read-only access to all tracking!
        ],
        "HUB_OFFICER": [
            "products.read", "hubs.read", "inventory.read", "dispatches.read", "hub.receipts.write"
        ],
        "AGENT": [
            "products.read", "inventory.read"
        ]
    }

    try:
        print("🚀 Injecting System Roles...")
        for code, perms in roles.items():
            db.execute(text("""
                INSERT INTO roles (id, code, name, description, permissions, created_at, updated_at)
                VALUES (:id, :code, :name, 'System Role', :perms, now(), now())
                ON CONFLICT (code) DO UPDATE SET permissions = EXCLUDED.permissions
            """), {
                "id": str(uuid.uuid4()), 
                "code": code, 
                "name": code.replace("_", " ").title(), 
                "perms": json.dumps(perms)
            })
            print(f"  -> Processed {code}")
            
        db.commit()
        print("\n✅ All System Roles successfully injected into the database!")

    except Exception as e:
        db.rollback()
        print(f"❌ Execution Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_role_seeder()