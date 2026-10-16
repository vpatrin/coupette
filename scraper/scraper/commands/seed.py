import json
from decimal import Decimal
from pathlib import Path

from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from core.config.settings import settings as core_settings

from ..constants import EXIT_FATAL, EXIT_OK
from ..db.seed import count_products, insert_seed_catalog

# Synthetic catalog: made-up products and stores, no data copied from the live site
_FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "dev_catalog.json"


def load_dev_catalog() -> tuple[list[dict], list[dict]]:
    data = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    products = [
        {**p, "price": Decimal(p["price"]) if p.get("price") is not None else None}
        for p in data["products"]
    ]
    return data["stores"], products


async def seed_dev_data() -> int:
    """Load the synthetic dev catalog into an empty DB. Returns exit code."""
    if core_settings.ENVIRONMENT == "production":
        logger.error("Refusing to seed synthetic data with ENVIRONMENT=production")
        return EXIT_FATAL

    try:
        existing = await count_products()
        if existing:
            logger.info("Products table has {} rows — skipping seed", existing)
            return EXIT_OK

        stores, products = load_dev_catalog()
        await insert_seed_catalog(stores, products)
    except SQLAlchemyError as exc:
        logger.error("Seed failed: {} — has `make migrate` run?", exc)
        return EXIT_FATAL

    logger.info("Seeded {} stores and {} products", len(stores), len(products))
    return EXIT_OK
