from loguru import logger
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.exceptions import NotFoundError
from backend.repositories import cellar as repo
from backend.repositories import products as products_repo
from backend.schemas.cellar import CellarEntryOut
from backend.schemas.product import ProductOut
from core.db.models import CellarEntry, Product

# Postgres default name for the unnamed FK cellar_entries.sku → products.sku
_SKU_FK = "cellar_entries_sku_fkey"


def _to_out(entry: CellarEntry, product: Product | None) -> CellarEntryOut:
    return CellarEntryOut.model_validate(entry).model_copy(
        update={"product": ProductOut.model_validate(product) if product else None}
    )


async def _get_entry(
    db: AsyncSession, user_id: int, sku: str
) -> tuple[CellarEntry, Product | None]:
    row = await repo.find_one(db, user_id, sku)
    if row is None:
        raise NotFoundError("CellarEntry", sku)
    return row


async def add_bottle(db: AsyncSession, user_id: int, sku: str) -> CellarEntryOut:
    """Add one bottle — creates the entry or increments its quantity. NotFoundError on bad SKU."""
    try:
        entry = await repo.add_bottle(db, user_id, sku)
    except IntegrityError as exc:
        await db.rollback()
        error_msg = str(exc.orig) if exc.orig else str(exc)
        if _SKU_FK not in error_msg:
            logger.warning("IntegrityError on cellar add (sku={}): {}", sku, error_msg)
            raise
        raise NotFoundError("Product", sku) from exc
    product = await products_repo.find_by_sku(db, sku)
    return _to_out(entry, product)


async def list_cellar(db: AsyncSession, user_id: int) -> list[CellarEntryOut]:
    rows = await repo.find_by_user(db, user_id)
    return [_to_out(entry, product) for entry, product in rows]


async def set_quantity(
    db: AsyncSession, user_id: int, sku: str, quantity: int
) -> CellarEntryOut | None:
    """Set the bottle count. quantity=0 deletes the entry and returns None."""
    entry, product = await _get_entry(db, user_id, sku)
    if quantity == 0:
        await repo.delete(db, entry)
        return None
    updated = await repo.set_quantity(db, entry, quantity)
    return _to_out(updated, product)


async def remove(db: AsyncSession, user_id: int, sku: str) -> None:
    entry, _ = await _get_entry(db, user_id, sku)
    await repo.delete(db, entry)
