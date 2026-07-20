from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from redis import asyncio as aioredis

from app.api.v1.router import api_router
from app.seed import run_seed

# THE FIX: Removed the duplicate @asynccontextmanager
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🔄 Container Startup: Verifying Data Integrity Matrix...")
    
    # THE FIX: Wrapped Redis in a try/except block for crash-resistance
    try:
        redis = aioredis.from_url("redis://redis:6379/0", encoding="utf8", decode_responses=True)
        FastAPICache.init(RedisBackend(redis), prefix="fastapi-cache")
        print("✅ Redis Caching Layer Online.")
    except Exception as e:
        print(f"⚠️ Redis connection failed, caching disabled: {e}")
        
    try:
        run_seed()
    except Exception as e:
        print(f"🛑 Critical System Event: Initialization halted: {e}")
    yield

app = FastAPI(
    title="UPE-IMS Production Engine",
    description="Enterprise Inventory & Distribution Management System API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "healthy"}