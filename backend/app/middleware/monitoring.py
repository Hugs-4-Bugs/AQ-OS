"""
AcquisitionOS — FastAPI Monitoring Middleware

Provides request duration tracking, error rate tracking, request counts by endpoint,
and Prometheus metrics export endpoint (/metrics).

Usage:
    from app.middleware.monitoring import MonitoringMiddleware, metrics
    
    app = FastAPI()
    app.add_middleware(MonitoringMiddleware)
    
    # Mount metrics endpoint
    @app.get("/metrics")
    async def metrics_endpoint():
        return metrics.generate()
"""

import time
import logging
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

logger = logging.getLogger("acquisitionos.monitoring")


# ═══════════════════════════════════════════════════════════════════
# Prometheus-style Metrics Collector
# ═══════════════════════════════════════════════════════════════════

class PrometheusMetrics:
    """
    Lightweight Prometheus-compatible metrics collector.
    
    Collects:
    - http_requests_total (counter) — Total HTTP requests by method, path, status
    - http_request_duration_seconds (histogram) — Request duration buckets
    - http_requests_in_progress (gauge) — Currently in-flight requests
    """
    
    def __init__(self):
        # Counters: {key: count}
        self._request_count: dict[str, int] = {}
        
        # Histograms: {key: {bucket: count, sum: float, count: int}}
        self._request_duration: dict[str, dict] = {}
        
        # Gauge: current in-progress requests
        self._requests_in_progress: dict[str, int] = {}
        
        # Histogram buckets (in seconds)
        self._duration_buckets = [
            0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0
        ]
    
    def _get_label_key(self, method: str, path: str, status: str = "") -> str:
        """Create a label key for grouping metrics."""
        if status:
            return f'method="{method}",path="{path}",status="{status}"'
        return f'method="{method}",path="{path}"'
    
    def increment_request_count(self, method: str, path: str, status: int) -> None:
        """Increment the request counter for a given method/path/status."""
        key = self._get_label_key(method, path, str(status))
        self._request_count[key] = self._request_count.get(key, 0) + 1
    
    def observe_request_duration(self, method: str, path: str, duration: float) -> None:
        """Record a request duration observation."""
        key = self._get_label_key(method, path)
        
        if key not in self._request_duration:
            self._request_duration[key] = {
                "buckets": {b: 0 for b in self._duration_buckets},
                "sum": 0.0,
                "count": 0,
            }
        
        entry = self._request_duration[key]
        entry["sum"] += duration
        entry["count"] += 1
        
        # Increment all buckets that this observation falls into
        for bucket in self._duration_buckets:
            if duration <= bucket:
                entry["buckets"][bucket] += 1
    
    def increment_in_progress(self, method: str, path: str) -> None:
        """Increment in-progress request gauge."""
        key = self._get_label_key(method, path)
        self._requests_in_progress[key] = self._requests_in_progress.get(key, 0) + 1
    
    def decrement_in_progress(self, method: str, path: str) -> None:
        """Decrement in-progress request gauge."""
        key = self._get_label_key(method, path)
        current = self._requests_in_progress.get(key, 0)
        self._requests_in_progress[key] = max(0, current - 1)
    
    def generate(self) -> str:
        """Generate Prometheus-compatible metrics text output."""
        lines = []
        
        # ── HTTP Requests Total ──────────────────────────────────────
        lines.append("# HELP http_requests_total Total HTTP requests")
        lines.append("# TYPE http_requests_total counter")
        for key, count in sorted(self._request_count.items()):
            lines.append(f"http_requests_total{{{key}}} {count}")
        
        # ── HTTP Request Duration ────────────────────────────────────
        lines.append("")
        lines.append("# HELP http_request_duration_seconds HTTP request duration in seconds")
        lines.append("# TYPE http_request_duration_seconds histogram")
        for key, entry in sorted(self._request_duration.items()):
            # Bucket counts (cumulative)
            cumulative = 0
            for bucket in self._duration_buckets:
                cumulative += entry["buckets"].get(bucket, 0)
                le_value = f"{bucket}"
                lines.append(
                    f'http_request_duration_seconds_bucket{{le="{le_value}",{key}}} {cumulative}'
                )
            # +Inf bucket
            lines.append(
                f'http_request_duration_seconds_bucket{{le="+Inf",{key}}} {entry["count"]}'
            )
            # Sum
            lines.append(f'http_request_duration_seconds_sum{{{key}}} {entry["sum"]:.6f}')
            # Count
            lines.append(f'http_request_duration_seconds_count{{{key}}} {entry["count"]}')
        
        # ── HTTP Requests In Progress ────────────────────────────────
        lines.append("")
        lines.append("# HELP http_requests_in_progress Currently in-flight HTTP requests")
        lines.append("# TYPE http_requests_in_progress gauge")
        for key, count in sorted(self._requests_in_progress.items()):
            lines.append(f"http_requests_in_progress{{{key}}} {count}")
        
        return "\n".join(lines) + "\n"


# Singleton metrics instance
metrics = PrometheusMetrics()


# ═══════════════════════════════════════════════════════════════════
# Monitoring Middleware
# ═══════════════════════════════════════════════════════════════════

class MonitoringMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware that tracks request duration, error rates,
    and request counts. Exposes /metrics endpoint for Prometheus scraping.
    """
    
    # Paths to exclude from metrics collection (health checks, etc.)
    EXCLUDED_PATHS = {"/metrics", "/docs", "/redoc", "/openapi.json"}
    
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip metrics collection for excluded paths
        path = request.url.path
        method = request.method
        
        if path in self.EXCLUDED_PATHS:
            return await call_next(request)
        
        # Normalize path for metrics (replace UUIDs and IDs)
        normalized_path = self._normalize_path(path)
        
        # Track in-progress requests
        metrics.increment_in_progress(method, normalized_path)
        
        start_time = time.perf_counter()
        
        try:
            response = await call_next(request)
            duration = time.perf_counter() - start_time
            
            # Record metrics
            status_code = response.status_code
            metrics.increment_request_count(method, normalized_path, status_code)
            metrics.observe_request_duration(method, normalized_path, duration)
            
            # Log slow requests
            if duration > 2.0:
                logger.warning(
                    f"Slow request: {method} {path} "
                    f"took {duration:.2f}s (status={status_code})"
                )
            elif duration > 1.0:
                logger.info(
                    f"Slow request: {method} {path} "
                    f"took {duration:.2f}s (status={status_code})"
                )
            
            return response
            
        except Exception as exc:
            duration = time.perf_counter() - start_time
            
            # Record 500 for unhandled exceptions
            metrics.increment_request_count(method, normalized_path, 500)
            metrics.observe_request_duration(method, normalized_path, duration)
            
            logger.error(
                f"Unhandled exception: {method} {path} "
                f"after {duration:.2f}s: {exc}"
            )
            raise
        
        finally:
            metrics.decrement_in_progress(method, normalized_path)
    
    @staticmethod
    def _normalize_path(path: str) -> str:
        """
        Normalize URL paths for metrics grouping.
        Replace dynamic segments (UUIDs, numeric IDs) with placeholders.
        
        Examples:
            /api/leads/clxyz123abc -> /api/leads/:id
            /api/leads/discover/status/clxyz123abc -> /api/leads/discover/status/:id
            /api/credits -> /api/credits
        """
        parts = path.strip("/").split("/")
        normalized = []
        
        for part in parts:
            if not part:
                continue
            # Replace UUID-like segments (cuid format: cl + alphanumeric)
            if len(part) > 16 and part[:2] in ("cl", "cm"):
                normalized.append(":id")
            # Replace numeric IDs
            elif part.isdigit():
                normalized.append(":id")
            else:
                normalized.append(part)
        
        return "/" + "/".join(normalized) if normalized else "/"


# ═══════════════════════════════════════════════════════════════════
# FastAPI Integration Helper
# ═══════════════════════════════════════════════════════════════════

def setup_monitoring(app) -> None:
    """
    Set up monitoring middleware and metrics endpoint on a FastAPI app.
    
    Usage:
        from app.middleware.monitoring import setup_monitoring
        app = FastAPI()
        setup_monitoring(app)
    """
    from fastapi.responses import Response
    
    # Add monitoring middleware
    app.add_middleware(MonitoringMiddleware)
    
    # Add /metrics endpoint
    @app.get("/metrics", tags=["Monitoring"], include_in_schema=False)
    async def metrics_endpoint():
        """Prometheus metrics endpoint."""
        content = metrics.generate()
        return Response(
            content=content,
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )
    
    logger.info("Monitoring middleware and /metrics endpoint configured")
