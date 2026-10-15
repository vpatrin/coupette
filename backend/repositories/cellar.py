from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import Insert, insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import MAX_CELLAR_QUANTITY
from core.db.models import CellarEntry, Product


def add_bottle_stmt(user_id: int, sku: str) -> Insert:
    """INSERT one bottle, or +1 on the existing (user_id, sku) row — atomic, never a conflict."""
    # quantity and added_at passed explicitly: the table has no server defaults
    stmt = insert(CellarEntry).values(
        user_id=user_id, sku=sku, quantity=1, added_at=datetime.now(UTC)
    )
    return stmt.on_conflict_do_update(
        constraint="uq_cellar_entries_user_sku",
        set_={"quantity": func.least(CellarEntry.quantity + 1, MAX_CELLAR_QUANTITY)},
    ).returning(CellarEntry)


async def add_bottle(db: AsyncSession, user_id: int, sku: str) -> CellarEntry:
    """Caller must handle IntegrityError for an unknown SKU (FK violation)."""
    stmt = add_bottle_stmt(user_id, sku).execution_options(populate_existing=True)
    result = await db.execute(stmt)
    return result.scalar_one()


async def find_by_user(db: AsyncSession, user_id: int) -> list[tuple[CellarEntry, Product | None]]:
    """Return all cellar entries for a user, with their product data (LEFT JOIN)."""
    stmt = (
        select(CellarEntry, Product)
        .outerjoin(Product, CellarEntry.sku == Product.sku)
        .where(CellarEntry.user_id == user_id)
        .order_by(CellarEntry.added_at.desc(), CellarEntry.id.desc())
    )
    result = await db.execute(stmt)
    return list(result.all())


async def find_one(
    db: AsyncSession, user_id: int, sku: str
) -> tuple[CellarEntry, Product | None] | None:
    """Return one entry + its product, or None if the user doesn't hold this SKU."""
    stmt = (
        select(CellarEntry, Product)
        .outerjoin(Product, CellarEntry.sku == Product.sku)
        .where(CellarEntry.user_id == user_id, CellarEntry.sku == sku)
    )
    result = await db.execute(stmt)
    return result.one_or_none()


async def set_quantity(db: AsyncSession, entry: CellarEntry, quantity: int) -> CellarEntry:
    entry.quantity = quantity
    await db.flush()
    return entry


async def delete(db: AsyncSession, entry: CellarEntry) -> None:
    await db.delete(entry)
    await db.flush()
