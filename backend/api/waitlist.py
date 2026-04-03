from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_db
from backend.repositories import waitlist as waitlist_repo
from backend.schemas.waitlist import WaitlistIn

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


@router.post("", status_code=200)
async def request_access(body: WaitlistIn, db: AsyncSession = Depends(get_db)) -> None:
    """Submit a waitlist request. Always returns 200 — no enumeration of existing emails."""
    await waitlist_repo.create(db, email=str(body.email).lower())
