from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_active_user
from backend.config import MAX_SKU_LENGTH
from backend.db import get_db
from backend.schemas.cellar import CellarEntryIn, CellarEntryOut, CellarQuantityIn
from backend.services.cellar import add_bottle, list_cellar, remove, set_quantity
from core.db.models import User

# JWT-only: get_current_active_user rejects bot-secret callers (no Bearer token → 401)
router = APIRouter(prefix="/cellar", tags=["cellar"])


@router.post("", response_model=CellarEntryOut, status_code=status.HTTP_201_CREATED)
async def post_cellar_entry(
    body: CellarEntryIn,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> CellarEntryOut:
    """Add one bottle to the user's cellar. Re-adding a SKU increments its quantity."""
    return await add_bottle(db, user.id, body.sku)


@router.get("", response_model=list[CellarEntryOut])
async def get_cellar(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[CellarEntryOut]:
    """List the user's cellar entries with product details, most recently added first."""
    return await list_cellar(db, user.id)


@router.patch(
    "/{sku}",
    response_model=CellarEntryOut,
    responses={status.HTTP_204_NO_CONTENT: {"description": "quantity=0 — entry removed"}},
)
async def patch_cellar_entry(
    body: CellarQuantityIn,
    sku: str = Path(max_length=MAX_SKU_LENGTH),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> CellarEntryOut | Response:
    """Set the bottle count for a SKU. quantity=0 removes the entry (204)."""
    entry = await set_quantity(db, user.id, sku, body.quantity)
    if entry is None:
        # FastAPI skips response_model validation when a Response is returned directly
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return entry


@router.delete("/{sku}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cellar_entry(
    sku: str = Path(max_length=MAX_SKU_LENGTH),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a SKU from the cellar, whatever its quantity."""
    await remove(db, user.id, sku)
