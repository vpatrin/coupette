from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_db
from backend.schemas.auth import TelegramLoginIn, TokenOut
from backend.services.auth import authenticate_telegram

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/telegram", response_model=TokenOut)
async def login_telegram(
    body: TelegramLoginIn,
    db: AsyncSession = Depends(get_db),
) -> TokenOut:
    """Authenticate via Telegram Login Widget and receive a JWT."""
    try:
        return await authenticate_telegram(db, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
