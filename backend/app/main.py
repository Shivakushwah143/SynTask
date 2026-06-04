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
from app.api.v1.router import api_router

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

# CORS Middleware
# CORS: allow all in dev to avoid browser blocks during local testing
cors_origins = settings.ALLOWED_ORIGINS or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if settings.ENVIRONMENT != "development" else ["*"],
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dev helper middleware to always stamp CORS headers (covers error responses)
@app.middleware("http")
async def add_dev_cors_headers(request: Request, call_next):
    response = await call_next(request)
    if settings.ENVIRONMENT == "development":
        origin = request.headers.get("origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Credentials"] = "true"
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
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "error": str(exc) if settings.ENVIRONMENT != "production" else "An error occurred"
        }
    )

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    await init_db()
    logger.info("Database initialized successfully")
    
    # Start background task for deadline checking
    import asyncio
    from app.core.deadline_checker import run_deadline_checker
    asyncio.create_task(run_deadline_checker())
    logger.info("Deadline checker background task started")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down application")
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
    return {
        "status": "ok",
        "version": settings.VERSION,
        "project_id": "user_provided",
        "message": "Create project returns your project_id (e.g. ak-001), not MongoDB _id. If you see this, the new backend is live."
    }

# Include API router
app.include_router(api_router, prefix="/api/v1")

# Serve static files (uploads)
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

