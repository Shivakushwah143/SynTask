"""
Main Application Entry Point
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import logging
import time
from pathlib import Path

from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.redis_client import close_redis, get_redis
from app.api.v1.router import api_router
from app.events.subscribers.knowledge import register_knowledge_subscribers
from app.middleware.rate_limiter import (
    RateLimitExceeded,
    _rate_limit_exceeded_handler,
    limiter,
)

# Optional semantic imports - gracefully handle missing dependencies
try:
    from app.semantic.worker import register_semantic_subscribers
    SEMANTIC_AVAILABLE = True
except (ImportError, ModuleNotFoundError) as e:
    logger.warning(f"Semantic module not available: {e}")
    SEMANTIC_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Task Management & Ticketing SaaS Platform",
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/api/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Middleware
cors_origins = settings.ALLOWED_ORIGINS 
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    expose_headers=["Content-Type", "Authorization"],
    max_age=600,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    # Allow cross-origin access to uploaded files (images, documents)
    if request.url.path.startswith("/uploads/") or request.url.path.startswith("/api/v1/files/"):
        response.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
    else:
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    return response

# Trusted Host Middleware (Security)
if settings.ENVIRONMENT == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.ALLOWED_HOSTS
    )

# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    limit = request.query_params.get("limit")
    if limit is not None:
        try:
            if int(limit) > settings.MAX_PAGE_SIZE:
                return JSONResponse(
                    status_code=422,
                    content={
                        "detail": [
                            {
                                "loc": ["query", "limit"],
                                "msg": f"Input should be less than or equal to {settings.MAX_PAGE_SIZE}",
                                "type": "less_than_equal",
                            }
                        ]
                    },
                )
        except ValueError:
            return JSONResponse(
                status_code=422,
                content={
                    "detail": [
                        {
                            "loc": ["query", "limit"],
                            "msg": "Input should be a valid integer",
                            "type": "int_parsing",
                        }
                    ]
                },
            )

    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error"}
    )

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    if settings.ENVIRONMENT == "production":
        assert len(settings.SECRET_KEY) >= 32, "SECRET_KEY too short for production"
        assert "changeme" not in settings.SECRET_KEY.lower(), "SECRET_KEY is default value"
        assert "changeme" not in settings.SUPER_ADMIN_PASSWORD.lower(), "SUPER_ADMIN_PASSWORD is default"

    await init_db()
    logger.info("Database initialized successfully")
    register_knowledge_subscribers()
    logger.info("Knowledge subscribers registered")
    if SEMANTIC_AVAILABLE:
        register_semantic_subscribers()
        logger.info("Semantic subscribers registered")
    else:
        logger.info("Semantic subscribers skipped (dependencies not available)")
    await get_redis()
    
    # Start background task for deadline checking
    import asyncio
    from app.core.deadline_checker import run_deadline_checker
    asyncio.create_task(run_deadline_checker())
    logger.info("Deadline checker background task started")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down application")
    await close_redis()
    await close_db()
    logger.info("Database connections closed")

# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }


# Debug endpoint: confirm backend is running new code (user-provided project_id)
@app.get("/debug", tags=["Health"])
async def debug_backend():
    """Call this to confirm the backend returns user-provided project_id (no auto-generated ID as project_id)."""
    if settings.ENVIRONMENT == "production":
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    return {
        "status": "ok",
        "version": settings.VERSION,
        "project_id": "user_provided",
        "message": "Create project returns your project_id (e.g. ak-001), not MongoDB _id. If you see this, the new backend is live."
    }

# Include API router
app.include_router(api_router, prefix="/api/v1")

# Serve static files (uploads)
uploads_dir = Path("uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "company": "SynTask",
        "copyright": "© 2025 SynTask. All Rights Reserved."
    }
