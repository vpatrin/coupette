from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.exceptions import NotFoundError
from backend.repositories import cellar as repo
from backend.schemas.cellar import CellarEntryOut
from backend.schemas.product import ProductOut
from core.db.models import CellarEntry, Product


def _to_out(entry: CellarEntry, product: Product) -> CellarEntryOut:
    return CellarEntryOut(
        sku=entry.sku,
        quantity=entry.quantity,
        added_at=entry.added_at,
        product=ProductOut.model_validate(product),
    )


async def add_entry(db: AsyncSession, user_id: int, sku: str, quantity: int) -> CellarEntryOut:
    """Add bottles to the cellar. Raises NotFoundError if the SKU doesn't exist."""
    try:
        entry, product = await repo.upsert(db, user_id, sku, quantity)
    except IntegrityError as exc:
        await db.rollback()
        raise NotFoundError("Product", sku) from exc
    return _to_out(entry, product)


async def list_entries(db: AsyncSession, user_id: int) -> list[CellarEntryOut]:
    """Return the user's cellar, newest first."""
    rows = await repo.find_by_user(db, user_id)
    return [_to_out(entry, product) for entry, product in rows]


async def set_quantity(
    db: AsyncSession, user_id: int, sku: str, quantity: int
) -> CellarEntryOut | None:
    """Set an entry's quantity; 0 deletes it and returns None. Raises NotFoundError if absent."""
    row = await repo.find_one(db, user_id, sku)
    if row is None:
        raise NotFoundError("CellarEntry", sku)
    entry, product = row
    if quantity == 0:
        await repo.delete(db, entry)
        return None
    await repo.update(db, entry, quantity)
    return _to_out(entry, product)


async def remove_entry(db: AsyncSession, user_id: int, sku: str) -> None:
    """Delete an entry whatever its quantity. Raises NotFoundError if absent."""
    row = await repo.find_one(db, user_id, sku)
    if row is None:
        raise NotFoundError("CellarEntry", sku)
    await repo.delete(db, row[0])
