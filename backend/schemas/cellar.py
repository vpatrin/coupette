from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.config import MAX_CELLAR_QUANTITY, MAX_SKU_LENGTH
from backend.schemas.product import ProductOut


class CellarEntryIn(BaseModel):
    sku: str = Field(min_length=1, max_length=MAX_SKU_LENGTH)


class CellarQuantityIn(BaseModel):
    # 0 removes the entry
    quantity: int = Field(ge=0, le=MAX_CELLAR_QUANTITY)


class CellarEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    quantity: int
    added_at: datetime
    product: ProductOut | None = None
