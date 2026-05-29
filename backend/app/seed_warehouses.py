import uuid
from app.api.deps import get_db
# Import your Base metadata wrapper so SQLAlchemy knows what tables to create
from app.db.base import Base 
# Import the engine directly so we can run the creation statement
# Note: Adjust this import path if your engine lives in app.db.session or app.db.config
from app.db.session import engine 

# Make sure the file containing your Warehouse model is explicitly imported here
# so SQLAlchemy's Base knows it exists!
from app.models.user import Warehouse  # <--- Change to app.models.inventory if that's where it is!

def run_seed():
    print("🛠️ Force-creating missing database tables...")
    # This single line forces Postgres to build the 'warehouses' table instantly
    Base.metadata.create_all(bind=engine)
    
    db_gen = get_db()
    db = next(db_gen)
    
    warehouses_to_create = [
        {"name": "Adenta-1", "location": "Adenta"},
        {"name": "Adenta-2", "location": "Adenta"},
        {"name": "Pankrono", "location": "Kumasi"},
        {"name": "Nsawam", "location": "Eastern Region"},
        {"name": "Cape Coast", "location": "Central Region"}
    ]
    
    try:
        for wh_data in warehouses_to_create:
            existing = db.query(Warehouse).filter(Warehouse.name == wh_data["name"]).first()
            
            if not existing:
                # We dynamically pass both name and location to satisfy your model parameters
                new_wh = Warehouse(
                    name=wh_data["name"], 
                    location=wh_data["location"],
                    manager_id=None # Keeping manager null since we cleared users
                ) 
                db.add(new_wh)
                print(f"✅ Created physical table row for: {wh_data['name']}")
            else:
                print(f"⚡ Already exists: {wh_data['name']}")
                
        db.commit()
        print("\n🎉 All 5 warehouses successfully constructed and seeded in Postgres!")
        
    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()