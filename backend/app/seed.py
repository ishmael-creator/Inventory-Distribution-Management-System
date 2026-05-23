from sqlalchemy import select

from app.core.enums import RoleCode
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.product import Product
from app.models.user import Role, User

ROLE_PERMISSIONS: dict[RoleCode, list[str]] = {
    RoleCode.SUPER_ADMIN: ["*"],
    RoleCode.MANUFACTURER: [
        "products.read",
        "manufacturing.read",
        "manufacturing.write",
        "manufacturing.release",
        "inventory.read",
    ],
    RoleCode.WAREHOUSE_OFFICER: [
        "products.read",
        "warehouses.read",
        "warehouse.receipts.write",
        "manufacturing.read_all",
        "manufacturing.read",
        "inventory.read",
        "hubs.read",
        "distribution.requests.read",
        "distribution.requests.review",
        "dispatches.read",
        "dispatches.write",
    ],
    RoleCode.DISTRIBUTION_TEAM: ["products.read", "inventory.read"],
    RoleCode.MANAGER: [
        "products.read",
        "products.write",
        "warehouses.read",
        "warehouses.write",
        "hubs.read",
        "hubs.write",
        "distribution.requests.read",
        "distribution.requests.write",
        "manufacturing.read_all",
        "manufacturing.read",
        "inventory.read",
    ],
    RoleCode.HUB_OFFICER: ["products.read", "hubs.read", "inventory.read", "dispatches.read", "hub.receipts.write"],
    RoleCode.AGENT: ["products.read", "inventory.read"],
}

STARTER_PRODUCTS = [
    {"name": "ICS Klik", "sku": "ICS-KLIK", "unit": "unit", "low_stock_threshold": 100},
    {"name": "ICS Singapore", "sku": "ICS-SINGAPORE", "unit": "unit", "low_stock_threshold": 100},
    {"name": "EPC", "sku": "EPC", "unit": "unit", "low_stock_threshold": 100},
]


def run() -> None:
    with SessionLocal() as db:
        for code, permissions in ROLE_PERMISSIONS.items():
            role = db.scalar(select(Role).where(Role.code == code))
            if role is None:
                role = Role(code=code, name=code.value.replace("_", " ").title(), permissions=permissions)
                db.add(role)
            else:
                role.permissions = permissions

        db.flush()
        super_admin_role = db.scalar(select(Role).where(Role.code == RoleCode.SUPER_ADMIN))
        admin = db.scalar(select(User).where(User.email == "admin@example.com"))
        if admin is None and super_admin_role is not None:
            db.add(
                User(
                    email="admin@example.com",
                    full_name="System Administrator",
                    hashed_password=hash_password("ChangeMe123!"),
                    role_id=super_admin_role.id,
                )
            )

        for product_data in STARTER_PRODUCTS:
            product = db.scalar(select(Product).where(Product.sku == product_data["sku"]))
            if product is None:
                db.add(Product(**product_data))

        db.commit()


if __name__ == "__main__":
    run()
