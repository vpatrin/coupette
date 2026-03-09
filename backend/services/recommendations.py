from core.embedding_client import embed_query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import backend_settings
from backend.repositories.recommendations import find_similar
from backend.schemas.product import ProductOut
from backend.schemas.recommendation import (
    RecommendationOut,
    RecommendationProductOut,
)
from backend.services.curation import explain_recommendations
from backend.services.intent import parse_intent


async def recommend(
    db: AsyncSession,
    query: str,
    *,
    available_only: bool | None = None,
) -> RecommendationOut:
    """Full recommendation pipeline: parse intent → embed → retrieve → explain."""
    intent = parse_intent(query)
    if available_only is not None:
        intent.available_only = available_only
    vector = embed_query(intent.semantic_query, api_key=backend_settings.OPENAI_API_KEY)
    products = await find_similar(db, intent, vector)

    explanation = explain_recommendations(query, intent, products)

    return RecommendationOut(
        products=[
            RecommendationProductOut(
                product=ProductOut.model_validate(p),
                reason=explanation.reasons[i],
            )
            for i, p in enumerate(products)
        ],
        intent=intent,
        summary=explanation.summary,
    )
