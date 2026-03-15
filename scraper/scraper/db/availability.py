from loguru import logger
from sqlalchemy import bindparam, select, update
from sqlalchemy.exc import SQLAlchemyError

from core.db.models import Product, UserStorePreference, Watch

from .session import SessionLocal

_BULK_CHUNK_SIZE = 1000


async def bulk_update_availability(
    updates: dict[str, tuple[bool, list[str]]],
) -> int:
    """Batch-update online_availability and store_availability for multiple SKUs.

    Uses Core-level UPDATE with bindparam, chunked to avoid oversized statements.
    """
    if not updates:
        return 0
    all_params = [
        {"_sku": sku, "online": online, "stores": stores or None}  # [] → NULL
        for sku, (online, stores) in updates.items()
    ]
    table = Product.__table__
    stmt = (
        update(table)
        .where(table.c.sku == bindparam("_sku"))
        .values(online_availability=bindparam("online"), store_availability=bindparam("stores"))
    )
    async with SessionLocal() as session:
        try:
            for i in range(0, len(all_params), _BULK_CHUNK_SIZE):
                chunk = all_params[i : i + _BULK_CHUNK_SIZE]
                await session.execute(stmt, chunk)
            await session.commit()
        except SQLAlchemyError as exc:
            await session.rollback()
            logger.opt(exception=exc).error(
                "Failed to bulk-update availability for {} SKUs", len(updates)
            )
            raise
    return len(updates)


async def reset_stale_availability(exclude_skus: set[str]) -> int:
    """Reset availability for non-delisted products absent from Adobe results.

    Sets online_availability=False and store_availability=NULL for all
    non-delisted products whose SKU is not in exclude_skus.
    """
    if not exclude_skus:
        logger.warning(
            "No SKUs to exclude — skipping stale reset to avoid clearing all availability"
        )
        return 0
    table = Product.__table__
    stmt = (
        update(table)
        .where(table.c.delisted_at.is_(None))
        .where(table.c.sku.not_in(exclude_skus))
        .where((table.c.online_availability.is_(True)) | (table.c.store_availability.is_not(None)))
        .values(online_availability=False, store_availability=None)
    )
    async with SessionLocal() as session:
        try:
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount  # type: ignore[return-value]
        except SQLAlchemyError as exc:
            await session.rollback()
            logger.opt(exception=exc).error("Failed to clear stale availability")
            raise


async def get_watched_product_availability() -> dict[str, tuple[bool | None, list[str] | None]]:
    """Load current availability for all watched, non-delisted products.

    Returns {sku: (online_availability, store_availability)}.
    """
    async with SessionLocal() as session:
        stmt = (
            select(Product.sku, Product.online_availability, Product.store_availability)
            .join(Watch, Product.sku == Watch.sku)
            .where(Product.delisted_at.is_(None))
            .distinct()
        )
        result = await session.execute(stmt)
        return {row[0]: (row[1], row[2]) for row in result.all()}


async def get_preferred_store_ids() -> dict[str, set[str]]:
    """Load user store preferences grouped by SKU.

    Returns {sku: {store_id, ...}} — only for watched, non-delisted products.
    """
    async with SessionLocal() as session:
        stmt = (
            select(Watch.sku, UserStorePreference.saq_store_id)
            .join(Product, Watch.sku == Product.sku)
            .join(UserStorePreference, Watch.user_id == UserStorePreference.user_id)
            .where(Product.delisted_at.is_(None))
        )
        result = await session.execute(stmt)
        prefs: dict[str, set[str]] = {}
        for sku, store_id in result.all():
            prefs.setdefault(sku, set()).add(store_id)
        return prefs
