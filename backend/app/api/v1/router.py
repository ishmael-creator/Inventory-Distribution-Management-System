from fastapi import APIRouter
from app.api.v1.routes import auth, distribution, inventory, manufacturing, products, warehouses, hubs, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"]) # NEW
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(manufacturing.router, prefix="/manufacturing", tags=["manufacturing"])
api_router.include_router(warehouses.router, prefix="/warehouses", tags=["warehouses"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
api_router.include_router(distribution.router, prefix="/distribution", tags=["distribution"])
api_router.include_router(hubs.router, prefix="/hubs", tags=["hubs"])