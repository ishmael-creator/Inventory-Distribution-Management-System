"""Phase 2 manager-to-warehouse distribution workflow.

Revision ID: 0002_phase2_dist
Revises: 0001_initial_schema
Create Date: 2026-05-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_phase2_dist"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("allocation_requests", sa.Column("warehouse_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("allocation_requests", sa.Column("hub_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("allocation_requests", sa.Column("approved_quantity", sa.Integer(), nullable=True))
    op.add_column("allocation_requests", sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("allocation_requests", sa.Column("review_notes", sa.Text(), nullable=True))
    op.add_column("allocation_requests", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))

    op.create_foreign_key(
        "fk_allocation_requests_warehouse_id_warehouses",
        "allocation_requests",
        "warehouses",
        ["warehouse_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_allocation_requests_hub_id_hubs",
        "allocation_requests",
        "hubs",
        ["hub_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_allocation_requests_reviewed_by_users",
        "allocation_requests",
        "users",
        ["reviewed_by"],
        ["id"],
    )
    op.create_index("ix_allocation_requests_warehouse_id", "allocation_requests", ["warehouse_id"])
    op.create_index("ix_allocation_requests_hub_id", "allocation_requests", ["hub_id"])
    op.create_index("ix_allocation_requests_status", "allocation_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_allocation_requests_status", table_name="allocation_requests")
    op.drop_index("ix_allocation_requests_hub_id", table_name="allocation_requests")
    op.drop_index("ix_allocation_requests_warehouse_id", table_name="allocation_requests")
    op.drop_constraint("fk_allocation_requests_reviewed_by_users", "allocation_requests", type_="foreignkey")
    op.drop_constraint("fk_allocation_requests_hub_id_hubs", "allocation_requests", type_="foreignkey")
    op.drop_constraint("fk_allocation_requests_warehouse_id_warehouses", "allocation_requests", type_="foreignkey")
    op.drop_column("allocation_requests", "reviewed_at")
    op.drop_column("allocation_requests", "review_notes")
    op.drop_column("allocation_requests", "reviewed_by")
    op.drop_column("allocation_requests", "approved_quantity")
    op.drop_column("allocation_requests", "hub_id")
    op.drop_column("allocation_requests", "warehouse_id")
