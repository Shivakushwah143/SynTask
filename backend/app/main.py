"""
Main Application Entry Point
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import logging
import time
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager

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
from app.recruitment.subscribers import register_recruitment_subscribers
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

async def _startup_tasks() -> None:
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    if settings.ENVIRONMENT == "production":
        assert len(settings.SECRET_KEY) >= 32, "SECRET_KEY too short for production"
        assert "changeme" not in settings.SECRET_KEY.lower(), "SECRET_KEY is default value"
        assert "changeme" not in settings.SUPER_ADMIN_PASSWORD.lower(), "SUPER_ADMIN_PASSWORD is default"

    try:
        await init_db()
        logger.info("Database initialized successfully")
        await rebuild_all_ancestors()
        app.state.db_ready = True
    except Exception as db_err:
        logger.error(f"Database connection failed on startup: {db_err}")
        app.state.db_ready = False
        if settings.ENVIRONMENT == "production":
            raise
        logger.warning(
            "DEVELOPMENT MODE: Backend started WITHOUT database. "
            "Most API endpoints will fail. Fix MongoDB connection and restart."
        )
    register_knowledge_subscribers()
    register_recruitment_subscribers()
    logger.info("Knowledge subscribers registered")
    from app.models.user import User, UserRole
    from app.models.attendance import Attendance, AttendanceStatus
    try:
        today_str = utc_now().strftime("%Y-%m-%d")
        async for att in Attendance.find({"date": today_str, "status": AttendanceStatus.WORKING.value}):
            user = await User.get(str(att.employee_id))
            if user and user.role == UserRole.MANAGER:
                att.status = AttendanceStatus.OFFLINE
                now = utc_now()
                att.logout_time = now
                att.monitoring_end_time = now
                wt = compute_work_type(att.total_working_hours)
                att.work_type = wt["work_type"]
                att.overtime_seconds = wt["overtime_seconds"]
                await att.save()
                logger.info(f"Manager {user.email} attendance reset to Offline on startup.")
    except Exception as attendance_err:
        logger.warning(f"Attendance startup cleanup skipped: {attendance_err}")
    if SEMANTIC_AVAILABLE:
        register_semantic_subscribers()
        logger.info("Semantic subscribers registered")
    else:
        logger.info("Semantic subscribers skipped (dependencies not available)")
    try:
        await get_redis()
    except Exception as redis_err:
        app.state.db_ready = False if not app.state.db_ready else app.state.db_ready
        logger.warning(f"Redis startup check skipped or failed: {redis_err}")

    import asyncio
    from app.core.deadline_checker import run_deadline_checker
    from app.services.hr_mail_sync import run_imap_recruitment_sync_loop
    from app.services.reminder_service import run_reminder_scheduler
    if app.state.db_ready:
        try:
            asyncio.create_task(run_deadline_checker())
            logger.info("Deadline checker background task started")
        except Exception as deadline_err:
            logger.warning(f"Deadline checker startup skipped: {deadline_err}")
        try:
            asyncio.create_task(run_reminder_scheduler())
            logger.info("Reminder scheduler background task started")
        except Exception as reminder_err:
            logger.warning(f"Reminder scheduler startup skipped: {reminder_err}")
        try:
            asyncio.create_task(run_imap_recruitment_sync_loop())
            logger.info("IMAP recruitment sync background task started")
        except Exception as imap_err:
            logger.warning(f"IMAP recruitment sync startup skipped: {imap_err}")
        try:
            from app.services.scheduling_service import SchedulingService
            asyncio.create_task(SchedulingService.run_scheduled_jobs_loop())
            logger.info("Scheduled jobs background task started")
        except Exception as scheduling_err:
            logger.warning(f"Scheduled jobs startup skipped: {scheduling_err}")
    else:
        logger.warning("Database background workers skipped because MongoDB/Beanie is not ready.")


async def _shutdown_tasks() -> None:
    logger.info("Shutting down application")
    await close_redis()
    await close_db()
    logger.info("Database connections closed")


async def startup_event():
    await _startup_tasks()


async def shutdown_event():
    await _shutdown_tasks()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _startup_tasks()
    try:
        yield
    finally:
        await _shutdown_tasks()


# Initialize FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Task Management & Ticketing SaaS Platform",
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/api/openapi.json" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.state.db_ready = True
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
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    expose_headers=["Content-Type", "Authorization"],
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
    if (
        request.url.path.startswith("/uploads/")
        or request.url.path.startswith("/api/v1/files/")
        or request.url.path.startswith("/api/v1/uploads/")
    ):
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
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    
    # Log failed requests
    if response.status_code >= 400:
        logger.warning(f"{request.method} {request.url.path} - {response.status_code}")
    
    return response


@app.middleware("http")
async def require_database_ready(request: Request, call_next):
    if request.url.path.startswith("/api/v1") and not getattr(request.app.state, "db_ready", False):
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "message": "Database unavailable. Check MongoDB connection and restart the backend.",
            },
        )
    return await call_next(request)

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


# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check(request: Request):
    db_ready = getattr(request.app.state, "db_ready", False)
    status = "healthy" if db_ready else "degraded"
    return JSONResponse(
        status_code=200 if db_ready else 503,
        content={
            "status": status,
            "version": settings.VERSION,
            "environment": settings.ENVIRONMENT,
            "database": "connected" if db_ready else "unavailable",
        },
    )


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

# CORS-enabled avatar endpoint
from fastapi import APIRouter, Depends
from pathlib import Path
from app.api.dependencies import get_current_user
from app.api.v1.endpoints.files import UPLOAD_DIR, serve_upload_file
from app.models.user import User
from app.core.clock import utc_now

avatar_router = APIRouter()

@avatar_router.get("/uploads/avatars/{filename}")
async def serve_avatar(filename: str):
    """Serve avatar files with CORS headers"""
    return serve_upload_file(UPLOAD_DIR / "avatars", Path(filename).name)

app.include_router(avatar_router, prefix="/api/v1", include_in_schema=False)
app.include_router(avatar_router, include_in_schema=False)

uploads_router = APIRouter()

@uploads_router.get("/uploads/{file_path:path}")
async def serve_authenticated_upload(
    file_path: str,
    current_user: User = Depends(get_current_user),
):
    """Serve uploaded files through authenticated API access."""
    return serve_upload_file(UPLOAD_DIR, file_path)

app.include_router(uploads_router, prefix="/api/v1", include_in_schema=False)

# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "company": "SynTask",
        "copyright": "© 2025 SynTask. All Rights Reserved."
    }

