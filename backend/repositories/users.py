from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import ROLE_ADMIN
from core.db.models import (
    RecommendationLog,
    TastingNote,
    User,
    UserStorePreference,
    Watch,
)


async def find_by_id(db: AsyncSession, user_id: int) -> User | None:
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def find_by_email(db: AsyncSession, email: str) -> User | None:
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def find_by_telegram_id(db: AsyncSession, telegram_id: int) -> User | None:
    stmt = select(User).where(User.telegram_id == telegram_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def find_active_admin(db: AsyncSession, email: str) -> User | None:
    stmt = select(User).where(
        User.email == email, User.role == ROLE_ADMIN, User.is_active.is_(True)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_all(db: AsyncSession) -> list[User]:
    stmt = select(User).order_by(User.created_at)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_oauth_user(
    db: AsyncSession,
    *,
    email: str,
    display_name: str | None,
) -> User:
    user = User(email=email, display_name=display_name)
    db.add(user)
    await db.flush()
    return user


async def link_telegram(db: AsyncSession, user: User, telegram_id: int) -> None:
    user.telegram_id = telegram_id
    await db.flush()


async def unlink_telegram(db: AsyncSession, user: User) -> None:
    user.telegram_id = None
    await db.flush()


async def set_active(db: AsyncSession, user: User, *, active: bool) -> User:
    """Set is_active flag on an already-loaded user."""
    user.is_active = active
    await db.flush()
    return user


async def hard_delete(db: AsyncSession, user: User) -> None:
    # String-keyed tables have no FK — delete explicitly
    caller_id = f"user:{user.id}"
    await db.execute(delete(Watch).where(Watch.user_id == caller_id))
    await db.execute(delete(UserStorePreference).where(UserStorePreference.user_id == caller_id))
    await db.execute(delete(TastingNote).where(TastingNote.user_id == caller_id))
    await db.execute(delete(RecommendationLog).where(RecommendationLog.user_id == caller_id))
    await db.delete(user)
    await db.flush()
