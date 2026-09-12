"""
AcquisitionOS — Redis Client Configuration
Production-grade async Redis with reconnection, health checks, and utilities
"""

import json
import logging
from typing import Optional, Any
from datetime import timedelta

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

# Redis connection pool
_redis_pool: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    """Get or create the Redis connection pool."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            settings.REDIS_URL,
            password=settings.REDIS_PASSWORD or None,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
            max_connections=50,
        )
    return _redis_pool


async def close_redis():
    """Close the Redis connection pool. Call on application shutdown."""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.close()
        _redis_pool = None
        logger.info("Redis connection pool closed")


async def check_redis_health() -> dict:
    """Check Redis connectivity for health endpoints."""
    try:
        redis = await get_redis()
        pong = await redis.ping()
        if pong:
            info = await redis.info("server")
            return {
                "status": "healthy",
                "redis": "connected",
                "version": info.get("redis_version", "unknown"),
            }
        return {"status": "unhealthy", "redis": "ping_failed"}
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {"status": "unhealthy", "redis": "disconnected", "error": str(e)}


# ═══════════════════════════════════════════════════════════════════
# Redis Utility Functions
# ═══════════════════════════════════════════════════════════════════

async def cache_get(key: str) -> Optional[str]:
    """Get a cached value by key."""
    try:
        redis = await get_redis()
        return await redis.get(key)
    except Exception as e:
        logger.error(f"Redis cache_get error for key '{key}': {e}")
        return None


async def cache_set(
    key: str,
    value: str,
    ttl_seconds: int = 3600,
) -> bool:
    """Set a cached value with optional TTL."""
    try:
        redis = await get_redis()
        await redis.set(key, value, ex=ttl_seconds)
        return True
    except Exception as e:
        logger.error(f"Redis cache_set error for key '{key}': {e}")
        return False


async def cache_delete(key: str) -> bool:
    """Delete a cached key."""
    try:
        redis = await get_redis()
        await redis.delete(key)
        return True
    except Exception as e:
        logger.error(f"Redis cache_delete error for key '{key}': {e}")
        return False


async def cache_get_json(key: str) -> Optional[Any]:
    """Get a JSON-decoded cached value."""
    value = await cache_get(key)
    if value is None:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


async def cache_set_json(
    key: str,
    value: Any,
    ttl_seconds: int = 3600,
) -> bool:
    """Set a JSON-encodable cached value."""
    try:
        serialized = json.dumps(value, default=str)
        return await cache_set(key, serialized, ttl_seconds)
    except (TypeError, ValueError) as e:
        logger.error(f"Redis cache_set_json serialization error: {e}")
        return False


# ── Session Blacklist ──────────────────────────────────────────────

async def blacklist_token(token: str, ttl_seconds: int) -> bool:
    """Add a token to the blacklist (e.g., on logout).
    TTL should be the remaining lifetime of the token.
    """
    return await cache_set(f"blacklist:{token}", "1", ttl_seconds)


async def is_token_blacklisted(token: str) -> bool:
    """Check if a token has been blacklisted."""
    value = await cache_get(f"blacklist:{token}")
    return value is not None


# ── OTP Storage ────────────────────────────────────────────────────

async def store_otp(key: str, otp: str, ttl_seconds: int = 300) -> bool:
    """Store an OTP with 5-minute default expiry."""
    return await cache_set(f"otp:{key}", otp, ttl_seconds)


async def verify_otp(key: str, otp: str) -> bool:
    """Verify an OTP and delete it (one-time use)."""
    stored = await cache_get(f"otp:{key}")
    if stored and stored == otp:
        await cache_delete(f"otp:{key}")
        return True
    return False


# ── Rate Limiting ──────────────────────────────────────────────────

async def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> dict:
    """Sliding window rate limiter.
    Returns { allowed: bool, remaining: int, reset_at: int }
    """
    try:
        redis = await get_redis()
        current = await redis.get(key)

        if current is None:
            await redis.set(key, "1", ex=window_seconds)
            return {
                "allowed": True,
                "remaining": max_requests - 1,
                "reset_at": window_seconds,
            }

        count = int(current)
        if count >= max_requests:
            ttl = await redis.ttl(key)
            return {
                "allowed": False,
                "remaining": 0,
                "reset_at": max(ttl, 0),
            }

        await redis.incr(key)
        ttl = await redis.ttl(key)
        return {
            "allowed": True,
            "remaining": max_requests - count - 1,
            "reset_at": max(ttl, 0),
        }
    except Exception as e:
        logger.error(f"Rate limit check error: {e}")
        # Fail open - allow the request if Redis is down
        return {"allowed": True, "remaining": max_requests, "reset_at": window_seconds}


# ── Idempotency Keys ──────────────────────────────────────────────

async def check_idempotency(event_id: str) -> bool:
    """Check if an event has already been processed (for webhook idempotency).
    Returns True if already processed, False if this is the first time.
    """
    key = f"idempotency:{event_id}"
    try:
        redis = await get_redis()
        result = await redis.set(key, "1", ex=86400 * 7, nx=True)  # 7-day TTL
        return result is None  # None means key already existed
    except Exception as e:
        logger.error(f"Idempotency check error: {e}")
        return False


# ── Login Attempts ─────────────────────────────────────────────────

async def record_login_attempt(email: str) -> int:
    """Record a failed login attempt. Returns the current count."""
    key = f"login_attempts:{email}"
    try:
        redis = await get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, settings.LOGIN_LOCKOUT_MINUTES * 60)
        return count
    except Exception as e:
        logger.error(f"Login attempt recording error: {e}")
        return 0


async def get_login_attempts(email: str) -> int:
    """Get the current login attempt count."""
    try:
        redis = await get_redis()
        count = await redis.get(f"login_attempts:{email}")
        return int(count) if count else 0
    except Exception as e:
        logger.error(f"Login attempts get error: {e}")
        return 0


async def clear_login_attempts(email: str) -> bool:
    """Clear login attempts on successful login."""
    return await cache_delete(f"login_attempts:{email}")


async def is_account_locked(email: str) -> bool:
    """Check if an account is locked due to too many failed attempts."""
    attempts = await get_login_attempts(email)
    return attempts >= settings.MAX_LOGIN_ATTEMPTS
