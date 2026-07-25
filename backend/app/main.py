from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

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
        "version": "1.0.0-skeleton"
    }
