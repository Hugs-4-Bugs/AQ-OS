"""
AcquisitionOS — Async Database Configuration
SQLAlchemy 2.0 async engine with session management
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy import text

from app.config import settings

logger = logging.getLogger(__name__)

# Create async engine with production-ready settings
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.is_development,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True,
)

# Session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides a database session.
    Automatically handles commit/rollback/close.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for database sessions in non-FastAPI contexts
    (e.g., Celery tasks, background jobs).
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_database_health() -> dict:
    """Check database connectivity for health endpoints."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(text("SELECT 1"))
            row = result.scalar()
            if row == 1:
                return {"status": "healthy", "database": "connected"}
            return {"status": "unhealthy", "database": "unexpected_response"}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


async def close_database():
    """Close the database engine. Call on application shutdown."""
    await engine.dispose()
    logger.info("Database engine disposed")
