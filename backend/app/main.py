"""
AcquisitionOS — FastAPI Application Entry Point
Production-grade with middleware, error handling, health checks, and security
"""

import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import check_database_health, close_database
from app.redis_client import check_redis_health, close_redis

# Configure structured logging
logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("acquisitionos")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown events."""
    # Startup
    logger.info(f"AcquisitionOS starting in {settings.ENVIRONMENT} mode")

    # Health checks on startup
    db_health = await check_database_health()
    redis_health = await check_redis_health()

    if db_health["status"] != "healthy":
        logger.warning(f"Database health check: {db_health}")
    else:
        logger.info("Database connected successfully")

    if redis_health["status"] != "healthy":
        logger.warning(f"Redis health check: {redis_health}")
    else:
        logger.info("Redis connected successfully")

    yield

    # Shutdown
    logger.info("AcquisitionOS shutting down...")
    await close_database()
    await close_redis()
    logger.info("All connections closed")


# Create FastAPI app
app = FastAPI(
    title="AcquisitionOS API",
    description="AI-Powered Business Acquisition Platform",
    version="2.0.0",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    lifespan=lifespan,
)

# ═══════════════════════════════════════════════════════════════════
# CORS Middleware — Restrictive by default
# ═══════════════════════════════════════════════════════════════════
allowed_origins = [
    origin.strip()
    for origin in settings.ALLOWED_ORIGINS.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


# ═══════════════════════════════════════════════════════════════════
# Security Headers Middleware
# ═══════════════════════════════════════════════════════════════════
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Add security headers to all responses."""
    start_time = time.time()

    # Generate request ID for tracing
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

    response = await call_next(request)

    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Request-ID"] = request_id

    if settings.is_production:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

    # Log request timing
    duration_ms = int((time.time() - start_time) * 1000)
    logger.info(
        f"{request.method} {request.url.path} | "
        f"{response.status_code} | {duration_ms}ms | "
        f"req={request_id}"
    )

    return response


# ═══════════════════════════════════════════════════════════════════
# Exception Handlers
# ═══════════════════════════════════════════════════════════════════
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler for unhandled errors."""
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred. Please try again later.",
            "request_id": request.headers.get("X-Request-ID", "unknown"),
        },
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Handle validation errors."""
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "message": str(exc),
            "request_id": request.headers.get("X-Request-ID", "unknown"),
        },
    )


# ═══════════════════════════════════════════════════════════════════
# Health & Monitoring Endpoints
# ═══════════════════════════════════════════════════════════════════
@app.get("/health", tags=["Health"])
async def health_check():
    """Liveness probe: Is the application running?"""
    return {
        "status": "healthy",
        "service": "acquisitionos-api",
        "version": "2.0.0",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/health/ready", tags=["Health"])
async def readiness_check():
    """Readiness probe: Is the application ready to serve traffic?
    Checks database and Redis connectivity.
    """
    db_health = await check_database_health()
    redis_health = await check_redis_health()

    all_healthy = (
        db_health["status"] == "healthy"
        and redis_health["status"] == "healthy"
    )

    status_code = 200 if all_healthy else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_healthy else "not_ready",
            "checks": {
                "database": db_health,
                "redis": redis_health,
            },
        },
    )


@app.get("/health/live", tags=["Health"])
async def liveness_check():
    """Liveness probe for Kubernetes/Docker: simple in-process check."""
    return {"status": "alive"}


# ═══════════════════════════════════════════════════════════════════
# API v1 Base Route
# ═══════════════════════════════════════════════════════════════════
@app.get("/api/v1", tags=["API"])
async def api_root():
    """API v1 root — returns available endpoints."""
    return {
        "service": "AcquisitionOS API v2",
        "version": "2.0.0",
        "endpoints": {
            "auth": "/api/v1/auth",
            "leads": "/api/v1/leads",
            "pipeline": "/api/v1/pipeline",
            "outreach": "/api/v1/outreach",
            "payments": "/api/v1/payments",
            "integrations": "/api/v1/integrations",
            "analytics": "/api/v1/analytics",
            "notifications": "/api/v1/notifications",
            "workflows": "/api/v1/workflows",
            "competitor": "/api/v1/competitor",
            "developer": "/api/v1/developer",
            "gdpr": "/api/v1/gdpr",
            "admin": "/api/v1/admin",
        },
    }
