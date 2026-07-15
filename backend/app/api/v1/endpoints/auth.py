"""
Authentication Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Query, Body, File, UploadFile, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from typing import Optional, Dict
from datetime import datetime, timedelta
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel

from app.models.user import AuthProvider, User, UserRole, UserStatus
from app.core.security import (
    verify_password, 
    get_password_hash, 
    create_access_token, 
    create_refresh_token,
    generate_reset_token
)
from app.core.config import settings
from app.core.file_validation import detect_mime_type
from app.core.security import get_token_from_header, decode_refresh_token
from app.core.token_blacklist import blacklist_token, is_token_blacklisted
from app.middleware.rate_limiter import limiter
from app.api.dependencies import get_current_user
from app.schemas.auth import RefreshTokenRequest, LoginRequest, ChangePasswordRequest
from app.worker.tasks.email_tasks import send_password_reset_email_task

logger = logging.getLogger(__name__)

router = APIRouter()
ALLOWED_AVATAR_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"


class GoogleLoginRequest(BaseModel):
    id_token: str
    remember_me: bool = False


def _split_google_name(name: str, email: str) -> tuple[str, str]:
    cleaned = (name or "").strip()
    if cleaned:
        parts = cleaned.split(maxsplit=1)
        return parts[0], parts[1] if len(parts) > 1 else ""
    return email.split("@", 1)[0], ""


def _auth_response(user: User, remember_me: bool = False) -> Dict:
    access_token_expires = timedelta(days=30 if remember_me else settings.ACCESS_TOKEN_EXPIRE_MINUTES / 60 / 24)
    token_payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "modules": getattr(user, "modules", ["task"]),
        "active_module": getattr(user, "active_module", "task")
    }
    access_token = create_access_token(
        data=token_payload,
        expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id)}
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "company_id": user.company_id,
            "modules": getattr(user, "modules", ["task"]),
            "active_module": getattr(user, "active_module", "task"),
            "notification_preferences": getattr(user, 'notification_preferences', {
                "email_notifications": True,
                "in_app_notifications": True,
                "task_assignment_alerts": True,
                "ticket_updates": True
            }),
            "avatar": user.avatar,
            "provider": getattr(user, "provider", AuthProvider.LOCAL),
        }
    }


def _set_auth_cookies(response: Response, auth_payload: Dict, remember_me: bool = False) -> None:
    access_max_age = int((timedelta(days=30) if remember_me else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).total_seconds())
    refresh_max_age = int(timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
    cookie_options = {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "domain": settings.AUTH_COOKIE_DOMAIN,
        "path": "/",
    }
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        auth_payload["access_token"],
        max_age=access_max_age,
        **cookie_options,
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        auth_payload["refresh_token"],
        max_age=refresh_max_age,
        **cookie_options,
    )


def _clear_auth_cookies(response: Response) -> None:
    cookie_options = {
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "domain": settings.AUTH_COOKIE_DOMAIN,
        "path": "/",
    }
    response.delete_cookie(ACCESS_COOKIE_NAME, **cookie_options)
    response.delete_cookie(REFRESH_COOKIE_NAME, **cookie_options)


def _reject_blocked_account(user: User) -> None:
    if user.status in {UserStatus.INACTIVE, UserStatus.SUSPENDED}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active"
        )


async def find_user_by_reset_token(token: str) -> Optional[User]:
    """Find the user for a plaintext reset token stored as a password hash."""
    users = await User.find({"password_reset_token": {"$ne": None}}).to_list()
    for user in users:
        stored_token = user.password_reset_token
        if not stored_token:
            continue
        try:
            if verify_password(token, stored_token):
                return user
        except Exception:
            continue
    return None


@router.post("/login")
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    login_request: LoginRequest
):
    """Login endpoint"""
    # Find user by email
    user = await User.find_one(User.email == login_request.email.lower())
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check password
    if not user.password_hash or not verify_password(login_request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if user is active
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active"
        )
    
    auth_payload = _auth_response(user, login_request.remember_me)
    _set_auth_cookies(response, auth_payload, login_request.remember_me)
    return auth_payload


@router.post("/google")
@limiter.limit("10/minute")
async def google_login(
    request: Request,
    response: Response,
    google_request: GoogleLoginRequest
):
    """Login or link account with a backend-verified Google ID token."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is not configured"
        )

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        profile = google_id_token.verify_oauth2_token(
            google_request.id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google token"
        )
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google verification failed"
        )

    email = (profile.get("email") or "").lower()
    google_id = profile.get("sub")
    name = profile.get("name") or ""
    picture = profile.get("picture")
    email_verified = profile.get("email_verified")

    if not email or not google_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token is missing required account details"
        )
    if email_verified is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google account email is not verified"
        )

    try:
        user = await User.find_one(User.email == email)
        if user:
            _reject_blocked_account(user)
            if not getattr(user, "google_id", None):
                user.google_id = google_id
            elif user.google_id != google_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email is already linked to another Google account"
                )
            if not getattr(user, "provider", None):
                user.provider = AuthProvider.LOCAL
            user.avatar = picture or user.avatar
            user.is_email_verified = True
            if user.status == UserStatus.PENDING:
                user.status = UserStatus.ACTIVE
            user.last_login = datetime.utcnow()
            user.updated_at = datetime.utcnow()
            await user.save()
            auth_payload = _auth_response(user, google_request.remember_me)
            _set_auth_cookies(response, auth_payload, google_request.remember_me)
            return auth_payload

        first_name, last_name = _split_google_name(name, email)
        user = User(
            email=email,
            password_hash=None,
            provider=AuthProvider.GOOGLE,
            google_id=google_id,
            avatar=picture,
            first_name=first_name,
            last_name=last_name,
            role=UserRole.EMPLOYEE,
            status=UserStatus.ACTIVE,
            modules=["task"],
            active_module="task",
            is_email_verified=True,
            last_login=datetime.utcnow(),
        )
        await user.insert()
        auth_payload = _auth_response(user, google_request.remember_me)
        _set_auth_cookies(response, auth_payload, google_request.remember_me)
        return auth_payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Google login failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete Google login"
        )


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh_token(
    request: Request,
    response: Response,
    refresh_request: Optional[RefreshTokenRequest] = Body(None)
):
    """Refresh access token"""
    try:
        refresh_token_value = refresh_request.refresh_token if refresh_request else None
        refresh_token_value = refresh_token_value or request.cookies.get(REFRESH_COOKIE_NAME)
        if not refresh_token_value:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        if await is_token_blacklisted(refresh_token_value):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        payload = decode_refresh_token(refresh_token_value)
        user_id = payload.get("sub")
        
        user = await User.get(user_id)
        if not user or user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        access_token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email,
                "role": user.role,
                "modules": getattr(user, "modules", ["task"]),
                "active_module": getattr(user, "active_module", "task"),
            }
        )
        response.set_cookie(
            ACCESS_COOKIE_NAME,
            access_token,
            max_age=int(timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES).total_seconds()),
            httponly=True,
            secure=settings.AUTH_COOKIE_SECURE,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            domain=settings.AUTH_COOKIE_DOMAIN,
            path="/",
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    token: str = Depends(get_token_from_header),
    refresh_token: Optional[str] = Body(None, embed=True),
    current_user: User = Depends(get_current_user)
):
    """Logout by revoking the current access token and optional refresh token."""
    await blacklist_token(token)
    refresh_token_value = refresh_token or request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_token_value:
        await blacklist_token(refresh_token_value)
    _clear_auth_cookies(response)
    return {"success": True, "message": "Logged out successfully"}


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    email: str = Form(...)
):
    """Request password reset - generates token and sends email"""
    # Normalize email
    email = email.strip().lower()
    
    # Check if user exists
    user = await User.find_one(User.email == email)
    
    if not user:
        # User explicitly requested to show if email is not registered
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This email is not registered."
        )
    
    # Generate secure reset token
    reset_token = generate_reset_token()
    
    # Set token with expiration (30 minutes)
    user.password_reset_token = get_password_hash(reset_token)
    user.password_reset_token_expires_at = datetime.now() + timedelta(minutes=30)
    user.password_reset_token_used = False
    await user.save()
    
    # Send email with reset link
    frontend_url = getattr(settings, 'FRONTEND_URL', None) or (settings.ALLOWED_ORIGINS[0] if settings.ALLOWED_ORIGINS else "http://localhost:3000")
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    
    send_password_reset_email_task.delay(user.email, reset_token, user.first_name)
    logger.info(f"Password reset email queued for {email}")
    
    response_data = {
        "message": "Password reset link has been sent to your email."
    }
    
    # Only include reset_link in development mode if email wasn't sent
    if settings.ENVIRONMENT == "development":
        response_data["reset_link"] = reset_link

    return response_data


@router.get("/verify-reset-token")
@limiter.limit("10/minute")
async def verify_reset_token(
    request: Request,
    token: str
):
    """Verify if reset token is valid (not expired, not used)"""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token is required"
        )
    
    # Find user by comparing token with the stored hash.
    user = await find_user_by_reset_token(token)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link."
        )
    
    # Check if token is already used
    if user.password_reset_token_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used. Please request a new one."
        )
    
    # Check if token is expired
    if not user.password_reset_token_expires_at or user.password_reset_token_expires_at < datetime.now():
        # Clear expired token
        user.password_reset_token = None
        user.password_reset_token_expires_at = None
        await user.save()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link."
        )
    
    return {
        "message": "Token is valid",
        "valid": True
    }


@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(
    request: Request,
    token: str = Form(...),
    new_password: str = Form(...)
):
    """Reset password with token"""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token is required"
        )
    
    # Find user by comparing token with the stored hash.
    user = await find_user_by_reset_token(token)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link."
        )
    
    # Check if token is already used
    if user.password_reset_token_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used. Please request a new one."
        )
    
    # Check if token is expired
    if not user.password_reset_token_expires_at or user.password_reset_token_expires_at < datetime.now():
        # Clear expired token
        user.password_reset_token = None
        user.password_reset_token_expires_at = None
        await user.save()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link."
        )
    
    # Validate password
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long"
        )
    
    # Hash and update password using secure algorithm (bcrypt)
    user.password_hash = get_password_hash(new_password)
    
    # Invalidate token after successful reset
    user.password_reset_token = None
    user.password_reset_token_expires_at = None
    user.password_reset_token_used = True
    await user.save()
    
    logger.info(f"Password reset successful for user: {user.email}")
    return {
        "message": "Your password has been successfully reset. Please log in with your new password."
    }


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user)
):
    """Change password for logged-in user"""
    try:
        if not current_user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account does not have a local password"
            )

        # Verify old password
        if not verify_password(request.old_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect current password"
            )
        
        # Validate new password (Pydantic already validates min_length=8, but keeping for clarity)
        if len(request.new_password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters long"
            )
        
        # Check if new password is different from old password
        if verify_password(request.new_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from current password"
            )
        
        # Update password
        current_user.password_hash = get_password_hash(request.new_password)
        await current_user.save()
        
        return {"message": "Password changed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to change password: {str(e)}"
        )


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information"""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "role": current_user.role,
        "company_id": current_user.company_id,
        "status": current_user.status.value,
        "avatar": current_user.avatar,
        "notification_preferences": getattr(current_user, 'notification_preferences', {
            "email_notifications": True,
            "in_app_notifications": True,
            "task_assignment_alerts": True,
            "ticket_updates": True
        }),
    }


@router.put("/notification-preferences")
async def update_notification_preferences(
    preferences: Dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Update notification preferences for current user"""
    try:
        # Validate preferences
        valid_keys = ["email_notifications", "in_app_notifications", "task_assignment_alerts", "ticket_updates"]
        
        # Update only valid preferences
        if not hasattr(current_user, 'notification_preferences') or not current_user.notification_preferences:
            current_user.notification_preferences = {}
        
        for key in valid_keys:
            if key in preferences:
                current_user.notification_preferences[key] = bool(preferences[key])
        
        # Ensure all keys exist with defaults
        for key in valid_keys:
            if key not in current_user.notification_preferences:
                current_user.notification_preferences[key] = True
        
        current_user.updated_at = datetime.now()
        await current_user.save()
        
        logger.info(f"Notification preferences updated for user: {current_user.email}")
        return {
            "message": "Notification preferences updated successfully",
            "preferences": current_user.notification_preferences
        }
    except Exception as e:
        logger.error(f"Error updating notification preferences: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update notification preferences: {str(e)}"
        )


@router.post("/upload-avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload user avatar/profile photo"""
    try:
        # Validate file type (only images)
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only image files are allowed"
            )
        
        # Validate file size (max 5MB)
        file_content = await file.read()
        file_size = len(file_content)
        max_size = 5 * 1024 * 1024  # 5MB
        
        if file_size > max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File size exceeds maximum allowed size of 5MB"
            )

        detected_mime = detect_mime_type(file_content, file.filename or "")
        if detected_mime not in ALLOWED_AVATAR_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type '{detected_mime}' not allowed"
            )
        
        # Create avatars directory if it doesn't exist
        upload_dir = Path(settings.UPLOAD_DIR) / "avatars"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_ext = Path(file.filename).suffix if file.filename else ".jpg"
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = upload_dir / unique_filename
        
        # Save file
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        # Delete old avatar if exists
        if current_user.avatar:
            old_avatar_path = Path(settings.UPLOAD_DIR) / current_user.avatar.lstrip('/uploads/avatars/')
            if old_avatar_path.exists() and old_avatar_path.is_file():
                try:
                    old_avatar_path.unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete old avatar: {str(e)}")
        
        # Update user avatar
        avatar_url = f"/uploads/avatars/{unique_filename}"
        current_user.avatar = avatar_url
        current_user.updated_at = datetime.now()
        await current_user.save()
        
        logger.info(f"Avatar uploaded for user: {current_user.email}")
        return {
            "message": "Avatar uploaded successfully",
            "avatar_url": avatar_url
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading avatar: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload avatar: {str(e)}"
        )


@router.delete("/avatar")
async def delete_avatar(
    current_user: User = Depends(get_current_user)
):
    """Delete user avatar"""
    try:
        if not current_user.avatar:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No avatar to delete"
            )
        
        # Delete avatar file
        avatar_path = Path(settings.UPLOAD_DIR) / current_user.avatar.lstrip('/uploads/avatars/')
        if avatar_path.exists() and avatar_path.is_file():
            try:
                avatar_path.unlink()
            except Exception as e:
                logger.warning(f"Failed to delete avatar file: {str(e)}")
        
        # Update user
        current_user.avatar = None
        current_user.updated_at = datetime.now()
        await current_user.save()
        
        logger.info(f"Avatar deleted for user: {current_user.email}")
        return {
            "message": "Avatar deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting avatar: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete avatar: {str(e)}"
        )

