from app.db.session import engine
from sqlalchemy import text

def fix():
    with engine.begin() as conn:
        print("🛠️ Patching 'users' table...")
        # 1. Add the missing password reset flag
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;"))
        # 2. Add the missing Hub assignment link
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_hub_id UUID REFERENCES hubs(id);"))
        print("✅ Database successfully patched!")

if __name__ == "__main__":
    fix()