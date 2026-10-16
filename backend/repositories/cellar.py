from sqlalchemy import Select, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.db.models import CellarEntry, Product


def _with_product(user_id: int) -> Select[CellarEntry, Product]:
    """Caller's entries joined to their products — INNER join, delisted products included."""
    return (
        select(CellarEntry, Product)
        .join(Product, CellarEntry.sku == Product.sku)
        .where(CellarEntry.user_id == user_id)
    )


async def upsert(
    db: AsyncSession, user_id: int, sku: str, quantity: int
) -> tuple[CellarEntry, Product]:
    """Insert the entry, or add `quantity` to the existing row (atomic, keeps added_at).

    Raises IntegrityError on an unknown SKU (FK violation).
    """
    stmt = pg_insert(CellarEntry).values(user_id=user_id, sku=sku, quantity=quantity)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_cellar_entries_user_sku",
        set_={"quantity": CellarEntry.quantity + stmt.excluded.quantity},
    )
    await db.execute(stmt)
    # populate_existing: the upsert bypasses the ORM, so refresh any identity-mapped entry
    result = await db.execute(
        _with_product(user_id)
        .where(CellarEntry.sku == sku)
        .execution_options(populate_existing=True)
    )
    entry, product = result.one()
    return entry, product


async def find_by_user(db: AsyncSession, user_id: int) -> list[tuple[CellarEntry, Product]]:
    """Return all of a user's entries with their products, newest first."""
    result = await db.execute(_with_product(user_id).order_by(CellarEntry.added_at.desc()))
    return list(result.all())


async def find_one(db: AsyncSession, user_id: int, sku: str) -> tuple[CellarEntry, Product] | None:
    """Return a single entry with its product by user_id + sku, or None."""
    result = await db.execute(_with_product(user_id).where(CellarEntry.sku == sku))
    row = result.one_or_none()
    return (row[0], row[1]) if row else None


async def update(db: AsyncSession, entry: CellarEntry, quantity: int) -> None:
    """Set an entry's quantity (must be > 0)."""
    entry.quantity = quantity
    await db.flush()


async def delete(db: AsyncSession, entry: CellarEntry) -> None:
    """Delete an entry."""
    await db.delete(entry)
    await db.flush()
