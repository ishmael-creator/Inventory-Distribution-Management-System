# Inventory & Distribution Management System

Enterprise inventory movement tracking system for manufacturing, warehousing, hub distribution, and agent allocation.

## What Is Implemented First

Phase 1 foundation:

- architecture brief;
- PostgreSQL schema migration;
- FastAPI project structure;
- JWT authentication foundation;
- RBAC permissions;
- product management APIs;
- manufacturing batch APIs;
- warehouse receipt API;
- immutable inventory ledger and calculated balances.
- product management screen;
- manufacturing batch screen;
- warehouse receipt screen;
- inventory balances and ledger screen.

## Local Backend Run

From the repository root:

```powershell
docker compose up -d db
cd backend
python -m pip install -e .
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

API docs:

```text
http://localhost:8000/docs
```

Seeded admin:

```text
email: admin@example.com
password: ChangeMe123!
```

Change this password before any real deployment.

## Inventory Rule

Do not build APIs that directly edit `inventory_balances`. Stock must move through services that create `inventory_transactions` and update balances atomically.

## Phase 1 App Workflow

1. Sign in at `http://localhost:3000/login`.
2. Open `Products` and confirm or create products.
3. Open `Manufacturing` and create a production batch.
4. Click `Release` on a draft batch.
5. Open `Warehouse` and create a warehouse if none exists.
6. Select the released batch and confirm receipt.
7. Open `Inventory Ledger` to confirm the warehouse balance and transaction history.

Phase 1 covers the manufacturer-to-warehouse lifecycle. Hub distribution, agent allocation, notifications, and reporting depth belong to later phases.

## Phase 2 Distribution Workflow

The manager is the Head of Distribution. The manager requests stock from a warehouse for a specific hub. The warehouse reviews the request and can approve the full quantity, approve a lower quantity, or reject the request with a reason. Once approved, the warehouse dispatches stock to the hub. The hub then confirms receipt.

After pulling the latest Phase 2 files, apply the new migration and reseed permissions:

```powershell
docker compose restart api
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
```

App workflow:

1. Open `Distribution`.
2. Create a hub linked to a warehouse.
3. Submit a manager request for a product, warehouse, hub, and quantity.
4. In the warehouse review queue, approve the request as-is, reduce the approved quantity, or reject it with a reason.
5. Dispatch approved requests.
6. Confirm hub receipt.
7. Open `Inventory Ledger` to confirm warehouse-to-hub movements.
