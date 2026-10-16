from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_active_user
from backend.config import MAX_SKU_LENGTH
from backend.db import get_db
from backend.schemas.cellar import CellarEntryIn, CellarEntryOut, CellarEntryUpdateIn
from backend.services.cellar import add_entry, list_entries, remove_entry, set_quantity
from core.db.models import User

router = APIRouter(prefix="/cellar", tags=["cellar"])


@router.post("", response_model=CellarEntryOut, status_code=status.HTTP_201_CREATED)
async def post_cellar_entry(
    body: CellarEntryIn,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> CellarEntryOut:
    """Add bottles to the cellar; adds to the quantity if the SKU is already there."""
    return await add_entry(db, user.id, body.sku, body.quantity)


@router.get("", response_model=list[CellarEntryOut])
async def get_cellar(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[CellarEntryOut]:
    """List the authenticated user's cellar with product details, newest first."""
    return await list_entries(db, user.id)


@router.patch(
    "/{sku}",
    response_model=CellarEntryOut,
    responses={status.HTTP_204_NO_CONTENT: {"description": "Quantity set to 0, entry removed"}},
)
async def patch_cellar_entry(
    body: CellarEntryUpdateIn,
    sku: str = Path(max_length=MAX_SKU_LENGTH),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> CellarEntryOut | Response:
    """Set the quantity of a cellar entry. Quantity 0 removes it (204, no body)."""
    entry = await set_quantity(db, user.id, sku, body.quantity)
    if entry is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return entry


@router.delete("/{sku}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cellar_entry(
    sku: str = Path(max_length=MAX_SKU_LENGTH),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a cellar entry whatever its quantity."""
    await remove_entry(db, user.id, sku)
