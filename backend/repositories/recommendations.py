from core.categories import expand_family
from core.db.models import Product
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import DEFAULT_RECOMMENDATION_LIMIT
from backend.schemas.recommendation import IntentResult

# Default to wine categories when intent has no category filter
_WINE_PREFIXES: list[str] = expand_family("vins", None)


async def find_similar(
    db: AsyncSession,
    intent: IntentResult,
    query_embedding: list[float],
    *,
    limit: int = DEFAULT_RECOMMENDATION_LIMIT,
) -> list[Product]:
    """Return products matching structured filters, ranked by embedding similarity."""
    stmt = select(Product).where(Product.delisted_at.is_(None)).where(Product.embedding.isnot(None))

    if intent.categories:
        stmt = stmt.where(Product.category.in_(intent.categories))
    else:
        # No category from intent → default to wines (same as product list scope=wine)
        stmt = stmt.where(or_(*(Product.category.startswith(p) for p in _WINE_PREFIXES)))
    if intent.country is not None:
        stmt = stmt.where(Product.country == intent.country)
    if intent.min_price is not None:
        stmt = stmt.where(Product.price >= intent.min_price)
    if intent.max_price is not None:
        stmt = stmt.where(Product.price <= intent.max_price)
    if intent.available_only:
        stmt = stmt.where(Product.online_availability.is_(True))

    # Similarity ranking
    stmt = stmt.order_by(Product.embedding.cosine_distance(query_embedding)).limit(limit)

    result = await db.execute(stmt)
    return list(result.scalars().all())
