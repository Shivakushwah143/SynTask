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

# Configure logging early so optional imports can report failures safely.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.database import init_db, close_db

def compute_work_type(total_seconds: float) -> dict:
    """Compute work type and overtime similar to attendance endpoint."""
    STANDARD_WORK_SECONDS = 8 * 3600
    if total_seconds >= STANDARD_WORK_SECONDS + 60:
        overtime = total_seconds - STANDARD_WORK_SECONDS
        return {"work_type": "Overtime", "overtime_seconds": overtime, "regular_seconds": STANDARD_WORK_SECONDS}
    elif total_seconds >= STANDARD_WORK_SECONDS - 60:
        return {"work_type": "Full Time", "overtime_seconds": 0, "regular_seconds": total_seconds}
    else:
        return {"work_type": "Under Time", "overtime_seconds": 0, "regular_seconds": total_seconds}

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

# CORS Middleware - Allow frontend origins
cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
# Merge with settings.ALLOWED_ORIGINS if it exists
if hasattr(settings, 'ALLOWED_ORIGINS') and settings.ALLOWED_ORIGINS:
    for origin in settings.ALLOWED_ORIGINS:
        if origin not in cors_origins:
            cors_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],  # Keep development and API client compatibility broad
    expose_headers=["*"],  # Surface response metadata to browser clients
    max_age=600,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(self), display-capture=(self), microphone=(), geolocation=(), payment=(), usb=()")
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
    # Skip limit validation for OPTIONS requests (CORS preflight)
    if request.method != "OPTIONS":
        limit = request.query_params.get("limit")
        if limit is not None:
            try:
                limit_int = int(limit)
                logger.info(f"Validating limit={limit_int}, MAX_PAGE_SIZE={settings.MAX_PAGE_SIZE}")
                if limit_int > settings.MAX_PAGE_SIZE:
                    logger.warning(f"Limit {limit_int} exceeds MAX_PAGE_SIZE {settings.MAX_PAGE_SIZE}")
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
                logger.warning(f"Invalid limit value: {limit}")
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
    
    # Log failed requests
    if response.status_code >= 400:
        logger.warning(f"{request.method} {request.url.path} - {response.status_code}")
    
    return response

# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error"}
    )


async def rebuild_all_ancestors():
    """Startup self-healing routine to fix missing hierarchy ancestors on existing users"""
    from app.models.user import User
    try:
        users = await User.find_all().to_list()
        user_dict = {str(u.id): u for u in users}
        for u in users:
            # Heal reports_to using lead_id if legacy field is set
            if not u.reports_to and getattr(u, "lead_id", None):
                u.reports_to = u.lead_id
            
            ancestors = []
            curr = u
            visited = set()
            while curr.reports_to and curr.reports_to in user_dict:
                parent_id = curr.reports_to
                if parent_id in visited:
                    break
                visited.add(parent_id)
                ancestors.insert(0, parent_id)
                curr = user_dict[parent_id]
            
            if u.ancestors != ancestors:
                u.ancestors = ancestors
                await u.save()
                logger.info(f"Self-healed hierarchy for {u.email}: reports_to={u.reports_to}, ancestors={ancestors}")
    except Exception as e:
        logger.error(f"Failed to rebuild hierarchy ancestors: {str(e)}")


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
    await rebuild_all_ancestors()
    register_knowledge_subscribers()
    logger.info("Knowledge subscribers registered")
    # Cleanup lingering manager Working sessions on server start to prevent auto-start after restart
    from datetime import datetime
    from app.models.user import User, UserRole
    from app.models.attendance import Attendance, AttendanceStatus
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    async for att in Attendance.find({"date": today_str, "status": AttendanceStatus.WORKING.value}):
        user = await User.get(str(att.employee_id))
        if user and user.role == UserRole.MANAGER:
            # Transition to offline state
            att.status = AttendanceStatus.OFFLINE
            now = datetime.utcnow()
            att.logout_time = now
            att.monitoring_end_time = now
            # Compute work type based on accumulated hours
            wt = compute_work_type(att.total_working_hours)
            att.work_type = wt["work_type"]
            att.overtime_seconds = wt["overtime_seconds"]
            await att.save()
            logger.info(f"Manager {user.email} attendance reset to Offline on startup.")
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

# CORS-enabled avatar endpoint
from fastapi import APIRouter, HTTPException
from pathlib import Path
from fastapi.responses import FileResponse

avatar_router = APIRouter()

@avatar_router.get("/uploads/avatars/{filename}")
async def serve_avatar(filename: str):
    """Serve avatar files with CORS headers"""
    avatar_path = Path("uploads") / "avatars" / filename
    if not avatar_path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(avatar_path, headers={"Access-Control-Allow-Origin": "*"})

app.include_router(avatar_router, prefix="/api/v1", include_in_schema=False)

# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "company": "SynTask",
        "copyright": "© 2025 SynTask. All Rights Reserved."
    }
