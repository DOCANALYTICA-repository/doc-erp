import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.observability import CorrelationIdMiddleware, unhandled_exception_handler
from app.api.v1.api import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

APP_VERSION = "1.0.0"

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=APP_VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Rate limiting. Keyed on the remote address, which behind a proxy is the
# proxy unless the deployment also terminates X-Forwarded-For — see the note
# in .env.production.example. Without that, every caller shares one bucket.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Every unhandled exception gets a correlation id and a stable shape rather
# than a blank console line.
app.add_exception_handler(Exception, unhandled_exception_handler)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Version 1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root_endpoint():
    return {
        "status": "online",
        "service": "DOC Unified Digital Platform API",
        "version": APP_VERSION,
    }


@app.get("/health")
def health_check():
    """Liveness probe. Deliberately does not touch the database — a health
    check that fails when the DB is slow takes the API out of rotation for a
    problem restarting it cannot fix."""
    return {"status": "ok", "version": APP_VERSION}
