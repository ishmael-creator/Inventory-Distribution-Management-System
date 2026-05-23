"""Initial inventory distribution schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


role_code = postgresql.ENUM(
    "SUPER_ADMIN",
    "MANUFACTURER",
    "WAREHOUSE_OFFICER",
    "DISTRIBUTION_TEAM",
    "MANAGER",
    "HUB_OFFICER",
    "AGENT",
    name="role_code",
    create_type=False,
)

batch_status = postgresql.ENUM(
    "DRAFT",
    "RELEASED_TO_WAREHOUSE",
    "RECEIVED_AT_WAREHOUSE",
    "CANCELLED",
    name="batch_status",
    create_type=False,
)

location_type = postgresql.ENUM(
    "MANUFACTURER",
    "WAREHOUSE",
    "HUB",
    "AGENT",
    name="location_type",
    create_type=False,
)

transaction_type = postgresql.ENUM(
    "PRODUCTION",
    "WAREHOUSE_RECEIPT",
    "ALLOCATION",
    "DISPATCH",
    "RECEIPT",
    "TRANSFER",
    "ADJUSTMENT_REVERSAL",
    name="transaction_type",
    create_type=False,
)

movement_status = postgresql.ENUM(
    "PENDING",
    "IN_TRANSIT",
    "COMPLETED",
    "CANCELLED",
    name="movement_status",
    create_type=False,
)

request_status = postgresql.ENUM(
    "PENDING",
    "APPROVED",
    "REJECTED",
    "FULFILLED",
    "CANCELLED",
    name="request_status",
    create_type=False,
)

dispatch_status = postgresql.ENUM(
    "DRAFT",
    "DISPATCHED",
    "PARTIALLY_RECEIVED",
    "RECEIVED",
    "CANCELLED",
    name="dispatch_status",
    create_type=False,
)

notification_type = postgresql.ENUM(
    "INFO",
    "APPROVAL",
    "LOW_STOCK",
    "DISPATCH",
    "RECEIPT",
    "SYSTEM",
    name="notification_type",
    create_type=False,
)


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    for enum in [
        role_code,
        batch_status,
        location_type,
        transaction_type,
        movement_status,
        request_status,
        dispatch_status,
        notification_type,
    ]:
        enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", role_code, nullable=False, unique=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(length=180), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_role_id", "users", ["role_id"])

    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("sku", sa.String(length=80), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(length=40), nullable=False, server_default="unit"),
        sa.Column("low_stock_threshold", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("low_stock_threshold >= 0", name="ck_products_low_stock_threshold_nonnegative"),
    )
    op.create_index("ix_products_sku", "products", ["sku"])

    op.create_table(
        "warehouses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("manager_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_warehouses_manager_id", "warehouses", ["manager_id"])

    op.create_table(
        "hubs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("warehouse_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("manager_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_hubs_warehouse_id", "hubs", ["warehouse_id"])

    op.create_table(
        "agents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("hub_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hubs.id"), nullable=True),
        sa.Column("agent_code", sa.String(length=80), nullable=False, unique=True),
        sa.Column("territory", sa.String(length=160), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "product_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("manufacturer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("batch_number", sa.String(length=100), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", batch_status, nullable=False, server_default="DRAFT"),
        sa.Column("produced_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity > 0", name="ck_product_batches_quantity_positive"),
        sa.UniqueConstraint("product_id", "batch_number", name="uq_product_batches_product_batch_number"),
    )
    op.create_index("ix_product_batches_product_id", "product_batches", ["product_id"])
    op.create_index("ix_product_batches_manufacturer_id", "product_batches", ["manufacturer_id"])
    op.create_index("ix_product_batches_status", "product_batches", ["status"])

    op.create_table(
        "inventory_balances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("location_type", location_type, nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reserved_quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity >= 0", name="ck_inventory_balances_quantity_nonnegative"),
        sa.CheckConstraint("reserved_quantity >= 0", name="ck_inventory_balances_reserved_nonnegative"),
        sa.CheckConstraint("reserved_quantity <= quantity", name="ck_inventory_balances_reserved_lte_quantity"),
        sa.UniqueConstraint("product_id", "location_type", "location_id", name="uq_inventory_balances_product_location"),
    )
    op.create_index("ix_inventory_balances_product_id", "inventory_balances", ["product_id"])
    op.create_index("ix_inventory_balances_location", "inventory_balances", ["location_type", "location_id"])

    op.create_table(
        "inventory_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("transaction_type", transaction_type, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("from_location_type", location_type, nullable=True),
        sa.Column("from_location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("to_location_type", location_type, nullable=True),
        sa.Column("to_location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reference_type", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity > 0", name="ck_inventory_transactions_quantity_positive"),
    )
    op.create_index("ix_inventory_transactions_product_id", "inventory_transactions", ["product_id"])
    op.create_index("ix_inventory_transactions_created_at", "inventory_transactions", ["created_at"])
    op.create_index("ix_inventory_transactions_reference", "inventory_transactions", ["reference_type", "reference_id"])
    op.create_index("ix_inventory_transactions_from_location", "inventory_transactions", ["from_location_type", "from_location_id"])
    op.create_index("ix_inventory_transactions_to_location", "inventory_transactions", ["to_location_type", "to_location_id"])

    op.create_table(
        "stock_movements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("from_location_type", location_type, nullable=True),
        sa.Column("from_location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("to_location_type", location_type, nullable=False),
        sa.Column("to_location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", movement_status, nullable=False, server_default="PENDING"),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reference_type", sa.String(length=80), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity > 0", name="ck_stock_movements_quantity_positive"),
    )

    op.create_table(
        "allocation_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", request_status, nullable=False, server_default="PENDING"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity > 0", name="ck_allocation_requests_quantity_positive"),
    )

    op.create_table(
        "dispatch_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("allocation_request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("allocation_requests.id"), nullable=True),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("dispatched_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", dispatch_status, nullable=False, server_default="DRAFT"),
        sa.Column("from_location_type", location_type, nullable=False),
        sa.Column("from_location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_location_type", location_type, nullable=False),
        sa.Column("to_location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity > 0", name="ck_dispatch_orders_quantity_positive"),
    )

    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("dispatch_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dispatch_orders.id"), nullable=True),
        sa.Column("product_batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("product_batches.id"), nullable=True),
        sa.Column("received_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("quantity_received", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity_received > 0", name="ck_receipts_quantity_received_positive"),
        sa.CheckConstraint(
            "(dispatch_order_id IS NOT NULL) OR (product_batch_id IS NOT NULL)",
            name="ck_receipts_has_source",
        ),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("resource_type", sa.String(length=80), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("old_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_resource", "audit_logs", ["resource_type", "resource_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("type", notification_type, nullable=False, server_default="INFO"),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_user_read", "notifications", ["user_id", "is_read"])


def downgrade() -> None:
    for table_name in [
        "notifications",
        "audit_logs",
        "receipts",
        "dispatch_orders",
        "allocation_requests",
        "stock_movements",
        "inventory_transactions",
        "inventory_balances",
        "product_batches",
        "agents",
        "hubs",
        "warehouses",
        "products",
        "users",
        "roles",
    ]:
        op.drop_table(table_name)

    for enum in [
        notification_type,
        dispatch_status,
        request_status,
        movement_status,
        transaction_type,
        location_type,
        batch_status,
        role_code,
    ]:
        enum.drop(op.get_bind(), checkfirst=True)
