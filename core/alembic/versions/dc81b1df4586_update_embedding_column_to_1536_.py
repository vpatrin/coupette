"""update embedding column to 1536 dimensions

Revision ID: dc81b1df4586
Revises: aeebb2d09f16
Create Date: 2026-03-07 15:22:13.448459

"""

from collections.abc import Sequence

from pgvector.sqlalchemy import Vector

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "dc81b1df4586"
down_revision: str | Sequence[str] | None = "aeebb2d09f16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "products",
        "embedding",
        existing_type=Vector(1024),
        type_=Vector(1536),
        existing_nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "products",
        "embedding",
        existing_type=Vector(1536),
        type_=Vector(1024),
        existing_nullable=True,
    )
