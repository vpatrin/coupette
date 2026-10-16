from datetime import UTC, datetime

from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError

from core.db.models import Product, Store

from .session import SessionLocal


async def count_products() -> int:
    async with SessionLocal() as session:
        return await session.scalar(select(func.count()).select_from(Product))


async def insert_seed_catalog(stores: list[dict], products: list[dict]) -> None:
    """Insert the dev catalog in one transaction.

    One commit, so a crash never leaves a half-seeded DB that the emptiness check would skip.
    """
    now = datetime.now(UTC)
    async with SessionLocal() as session:
        try:
            # Stores may already exist from a real store sync — keep those rows
            await session.execute(
                pg_insert(Store)
                .values([{**s, "created_at": now} for s in stores])
                .on_conflict_do_nothing()
            )
            await session.execute(
                pg_insert(Product)
                .values([{**p, "created_at": now, "updated_at": now} for p in products])
                .on_conflict_do_nothing()
            )
            await session.commit()
        except SQLAlchemyError as exc:
            await session.rollback()
            logger.opt(exception=exc).error("DB error inserting the dev seed catalog")
            raise
