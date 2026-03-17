from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from backend.config import MAX_SEARCH_LENGTH
from backend.schemas.product import ProductOut

IntentType = Literal["recommendation", "wine_chat", "off_topic"]


class IntentResult(BaseModel):
    """Structured filters extracted from a natural language wine query."""

    intent_type: IntentType = "recommendation"
    categories: list[str] = []
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    country: str | None = None
    semantic_query: str = ""
    exclude_grapes: list[str] = []


class RecommendationIn(BaseModel):
    query: str = Field(min_length=1, max_length=MAX_SEARCH_LENGTH)
    user_id: str | None = None
    available_online: bool = True
    in_store: str | None = None


class RecommendationProductOut(BaseModel):
    product: ProductOut
    reason: str


class RecommendationOut(BaseModel):
    products: list[RecommendationProductOut]
    intent: IntentResult
    summary: str
    log_id: int | None = None
