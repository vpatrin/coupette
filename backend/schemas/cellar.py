from datetime import datetime

from pydantic import BaseModel, Field

from backend.config import MAX_CELLAR_QUANTITY, MAX_SKU_LENGTH
from backend.schemas.product import ProductOut


# input validation for POST /cellar — quantity is the number of bottles to add
class CellarEntryIn(BaseModel):
    sku: str = Field(min_length=1, max_length=MAX_SKU_LENGTH)
    quantity: int = Field(default=1, ge=1, le=MAX_CELLAR_QUANTITY)


# input validation for PATCH /cellar/{sku} — 0 removes the entry
class CellarEntryUpdateIn(BaseModel):
    quantity: int = Field(ge=0, le=MAX_CELLAR_QUANTITY)


# Output resource for a cellar entry, with its joined product
class CellarEntryOut(BaseModel):
    sku: str
    quantity: int
    added_at: datetime
    product: ProductOut
