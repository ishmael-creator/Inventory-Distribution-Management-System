# Inventory & Distribution Management System Architecture

## 1. Purpose

This system manages the full inventory lifecycle for manufacturing, warehousing, hub distribution, and agent allocation. Inventory balances are derived from controlled movement workflows and ledger transactions. Users cannot manually edit stock quantities.

Core flow:

```text
Manufacturer -> Warehouse -> Hub -> Agent
```

Every stock-changing action must:

- create an immutable inventory transaction;
- update the calculated inventory balance inside the same database transaction;
- create an audit log entry;
- preserve a traceable reference to the source workflow record.

## 2. High-Level Architecture

```text
Next.js Admin Dashboard
  - React + TypeScript
  - Tailwind CSS
  - React Query
  - Zustand
  - Axios
        |
        | HTTPS / REST / JWT
        v
FastAPI Backend
  - API routers
  - service layer
  - repository layer
  - SQLAlchemy models
  - Pydantic schemas
  - RBAC dependencies
  - audit middleware/helpers
        |
        v
PostgreSQL
  - normalized transactional schema
  - UUID primary keys
  - status enums
  - foreign keys and indexes
  - append-only inventory ledger
```

## 3. Backend Module Boundaries

| Module | Responsibility |
| --- | --- |
| Auth | Login, JWT issuing, password hashing, current-user lookup |
| Users & Roles | User administration, role assignment, permission checks |
| Products | Product catalog for ICS Klik, ICS Singapore, EPC, and future products |
| Manufacturing | Production batch creation and release to warehouse |
| Warehousing | Warehouse receipts and warehouse stock visibility |
| Inventory Ledger | Stock movements, transaction log, balance updates |
| Distribution Requests | Stock requests by distribution team |
| Allocations | Manager approval and allocation workflows |
| Dispatch & Receipts | Confirmed transfers between warehouse, hubs, and agents |
| Reporting | Stock, movement, aging, approval, dispatch, and receipt reports |
| Notifications | User-facing alerts and low-stock notifications |
| Audit | Important user and system action history |

## 4. Inventory Model

Inventory is represented by two related concepts:

1. `inventory_transactions` is the immutable ledger.
2. `inventory_balances` is a query-optimized current balance table maintained by services.

Balances are never directly edited from UI or ordinary APIs. Balance mutation is only allowed through the inventory service, which writes ledger rows and updates balances atomically.

Location model:

```text
location_type: MANUFACTURER | WAREHOUSE | HUB | AGENT
location_id: UUID of the matching location owner/entity
```

Phase 1 treats a manufacturer as a user with role `MANUFACTURER`; warehouses are explicit entities. Later phases add full hub and agent flows.

## 5. Security Model

Authentication uses JWT bearer tokens. Authorization uses RBAC:

- roles contain named permissions;
- route dependencies enforce required permissions;
- service methods still validate workflow rules and ownership;
- sensitive actions create audit logs.

Default roles:

- `SUPER_ADMIN`
- `MANUFACTURER`
- `WAREHOUSE_OFFICER`
- `DISTRIBUTION_TEAM`
- `MANAGER`
- `HUB_OFFICER`
- `AGENT`

## 6. Phase Plan

### Phase 1

- Authentication
- Roles and permissions
- Product management
- Manufacturing batches
- Warehouse receipt
- Inventory ledger

### Phase 2

- Manager, as Head of Distribution, requests stock from warehouse for hubs
- Warehouse reviews each request and can approve, reduce quantity, reject, or explain inability to deliver
- Warehouse dispatches approved stock to hubs
- Hub officers confirm receipt
- Warehouse and hub balances update through ledger transactions only

### Phase 3

- Agent allocation
- Reporting
- Notifications
- Dashboard analytics

### Phase 4

- Barcode/QR support
- Mobile optimization
- Offline sync
- Forecasting

## 7. Production Concerns

- Use PostgreSQL row locks for balance updates.
- Keep ledger writes and balance updates in a single database transaction.
- Use Alembic migrations for all schema changes.
- Use strict Pydantic validation at API boundaries.
- Keep secrets in environment variables.
- Run backend and frontend with Docker Compose for local and deployment parity.
- Add structured logging and request IDs before production rollout.
- Add background workers for notification fanout and heavy exports when volume grows.
