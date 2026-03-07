"""add pgvector extension and embedding column

Revision ID: 203969d8fd14
Revises: 2f6b0f87907a
Create Date: 2026-03-07 14:25:40.349636

"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "203969d8fd14"
down_revision: str | Sequence[str] | None = "2f6b0f87907a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.add_column(
        "products",
        sa.Column(
            "embedding",
            Vector(1024),
            nullable=True,
            comment="Wine semantic embedding (multilingual-e5-large, 1024d)",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("products", "embedding")
    op.execute("DROP EXTENSION IF EXISTS vector")
