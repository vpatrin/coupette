import secrets

from redis.asyncio import Redis

from backend.config import backend_settings

#! Exchange codes are single-use JWTs stored in Redis — TTL is intentionally short.
_EXCHANGE_CODE_TTL = 60  # seconds
_OAUTH_STATE_TTL = 600  # seconds — 10 min to complete the OAuth round-trip

_EXCHANGE_KEY = "oauth:exchange:{}"
_STATE_KEY = "oauth:state:{}"

# Module-level singleton — mirrors db.py's engine pattern.
# Created once at import, shared across all requests via get_redis().
redis_client: Redis = Redis.from_url(backend_settings.REDIS_URL, decode_responses=True)


async def get_redis() -> Redis:
    return redis_client


async def store_exchange_code(redis: Redis, jwt: str) -> str:
    """Store a JWT under a random code. Returns the code."""
    code = secrets.token_urlsafe(32)
    await redis.set(_EXCHANGE_KEY.format(code), jwt, ex=_EXCHANGE_CODE_TTL)
    return code


async def consume_exchange_code(redis: Redis, code: str) -> str | None:
    """Atomically read and delete an exchange code. Returns the JWT or None if expired/invalid."""
    return await redis.getdel(_EXCHANGE_KEY.format(code))


async def store_oauth_state(redis: Redis) -> str:
    """Generate a CSRF state token, store it in Redis. Returns the state value."""
    state = secrets.token_urlsafe(32)
    await redis.set(_STATE_KEY.format(state), "1", ex=_OAUTH_STATE_TTL)
    return state


async def consume_oauth_state(redis: Redis, state: str) -> bool:
    """Atomically validate and delete an OAuth state token. Returns True if valid."""
    deleted = await redis.delete(_STATE_KEY.format(state))
    return deleted == 1
