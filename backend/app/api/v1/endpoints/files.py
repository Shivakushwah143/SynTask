"""
File Upload Endpoints
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from fastapi.responses import FileResponse
import mimetypes
import logging
from pathlib import Path
import re

from app.models.user import User
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.services.file_service import FileService

router = APIRouter()
logger = logging.getLogger(__name__)

# ============================================================
# ✅ FIXED: Get absolute path for upload directory
# ============================================================
# File location: /backend/app/api/v1/endpoints/files.py
# Get absolute path for upload directory (relative to backend folder)
BACKEND_DIR = Path(__file__).resolve().parents[4]  # Go up from app/api/v1/endpoints/files.py to backend/
UPLOAD_DIR = BACKEND_DIR / "uploads"
PROJECT_UPLOAD_DIR = UPLOAD_DIR / "projects"

# Ensure all directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROJECT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "avatars").mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "clients").mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "msa").mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "leaves").mkdir(parents=True, exist_ok=True)

logger.info(f"📁 Upload directory: {UPLOAD_DIR.absolute()}")
logger.info(f"📁 Avatars directory: {(UPLOAD_DIR / 'avatars').absolute()}")


def resolve_upload_path(root: Path, relative_path: str) -> Path:
    """Resolve a requested upload path while preventing traversal outside root."""
    root_path = root.resolve()
    requested = (root_path / relative_path).resolve()
    try:
        requested.relative_to(root_path)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path",
        )
    return requested


def detect_content_type(file_path: Path) -> str:
    """Detect content type based on file extension."""
    content_type, _ = mimetypes.guess_type(str(file_path))
    if content_type:
        return content_type

    ext = file_path.suffix.lower()
    if ext in ['.jpg', '.jpeg']:
        return 'image/jpeg'
    if ext == '.png':
        return 'image/png'
    if ext == '.gif':
        return 'image/gif'
    if ext == '.webp':
        return 'image/webp'
    if ext == '.pdf':
        return 'application/pdf'
    if ext in ['.doc', '.docx']:
        return 'application/msword'
    if ext in ['.xls', '.xlsx']:
        return 'application/vnd.ms-excel'
    return 'application/octet-stream'


def serve_upload_file(root: Path, relative_path: str, download_name: str | None = None) -> FileResponse:
    """Serve a file from the upload directory"""
    file_path = resolve_upload_path(root, relative_path)
    
    if not file_path.exists() or not file_path.is_file():
        logger.warning(f"❌ File not found: {file_path.absolute()}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found",
        )

    content_type = detect_content_type(file_path)
    headers = {}
    if content_type.startswith('image/'):
        headers['Cache-Control'] = 'private, max-age=86400'

    logger.info(f"✅ Serving file: {file_path.name}")
    return FileResponse(
        path=file_path,
        filename=download_name or file_path.name,
        media_type=content_type,
        headers=headers,
    )


# ============================================================
# ✅ FIXED: Avatar endpoints for profile pictures
# ============================================================
@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload user avatar/profile picture"""
    try:
        # Validate file type
        allowed_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PNG, JPG, JPEG, and WEBP images are allowed"
            )
        
        # Validate file size (5MB max)
        content = await file.read()
        file_size = len(content)
        if file_size > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File size must be 5 MB or smaller"
            )
        
        await file.seek(0)
        stored = await FileService.store_uploaded_file(
            file,
            upload_dir=UPLOAD_DIR / "avatars",
            url_prefix="/uploads/avatars",
            scope="avatars",
            sensitive=False,
        )
        avatar_url = stored["file_url"]
        
        # Save to database
        from app.core.clock import utc_now
        current_user.avatar = avatar_url
        current_user.avatar_public_id = stored.get("cloudinary_public_id")
        current_user.updated_at = utc_now()
        await current_user.save()
        
        logger.info(f"✅ Avatar uploaded successfully: {avatar_url}")
        
        return {
            "avatar_url": avatar_url,
            "public_id": stored.get("cloudinary_public_id"),
            "filename": stored["filename"],
            "size": file_size,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Avatar upload failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Avatar upload failed: {str(e)}"
        )


@router.delete("/avatar")
async def delete_avatar(
    current_user: User = Depends(get_current_user)
):
    """Delete user avatar"""
    try:
        avatar_path = current_user.avatar
        if not avatar_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No avatar found to delete"
            )
        
        from app.services.cloudinary_storage import CloudinaryStorage
        if getattr(current_user, "avatar_public_id", None):
            CloudinaryStorage.delete(current_user.avatar_public_id, "image", "upload")

        # Extract filename from URL
        match = re.search(r'/uploads/avatars/([^?]+)', avatar_path)
        if match:
            filename = match.group(1)
            file_path = UPLOAD_DIR / "avatars" / filename
            
            if file_path.exists() and file_path.is_file():
                file_path.unlink()
                logger.info(f"🗑️ Deleted avatar: {filename}")
            else:
                logger.warning(f"⚠️ Avatar file not found: {file_path}")
        else:
            logger.warning(f"⚠️ Could not extract filename from: {avatar_path}")
        
        # Save to database
        from app.core.clock import utc_now
        current_user.avatar = None
        current_user.avatar_public_id = None
        current_user.updated_at = utc_now()
        await current_user.save()
        
        return {"message": "Avatar deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Avatar deletion failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Avatar deletion failed: {str(e)}"
        )


@router.get("/avatars/{filename}")
async def get_avatar_file(
    filename: str,
    current_user: User = Depends(get_current_user)
):
    """Get user avatar file"""
    filename = Path(filename).name
    logger.info(f"🔍 Serving avatar: {filename}")
    return serve_upload_file(UPLOAD_DIR / "avatars", filename, filename)


# ============================================================
# General file upload endpoint
# ============================================================
@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a general file"""
    try:
        stored = await FileService.store_uploaded_file(
            file, 
            upload_dir=UPLOAD_DIR, 
            url_prefix="/uploads",
            scope="files",
            sensitive=True,
        )
        logger.info(f"📤 File uploaded: {stored['filename']}, user: {current_user.email}")
        return {
            "message": "File uploaded successfully",
            "file_url": stored["file_url"],
            "public_id": stored.get("cloudinary_public_id"),
            "filename": stored["filename"],
            "size": stored["size"],
            "type": stored["type"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ File upload failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File upload failed: {str(e)}"
        )


# ============================================================
# Other file endpoints
# ============================================================
@router.get("/clients/{filename}")
async def get_client_file(
    filename: str, 
    current_user: User = Depends(get_current_user)
):
    """Get client document file"""
    filename = Path(filename).name
    return serve_upload_file(UPLOAD_DIR / "clients", filename, filename)


@router.get("/projects/{filename}")
async def get_project_file(
    filename: str, 
    current_user: User = Depends(get_current_user)
):
    """Get project file"""
    filename = Path(filename).name
    return serve_upload_file(PROJECT_UPLOAD_DIR, filename, filename)


@router.get("/msa/{filename}")
async def get_msa_file(
    filename: str, 
    current_user: User = Depends(get_current_user)
):
    """Get MSA file (stamp image)"""
    filename = Path(filename).name
    return serve_upload_file(UPLOAD_DIR / "msa", filename, filename)


@router.get("/leaves/{filename}")
async def get_leave_file(
    filename: str, 
    current_user: User = Depends(get_current_user)
):
    """Get leave attachment file"""
    filename = Path(filename).name
    return serve_upload_file(UPLOAD_DIR / "leaves", filename, filename)


@router.get("/{filename}")
async def get_file(
    filename: str, 
    current_user: User = Depends(get_current_user)
):
    """Get uploaded file"""
    filename = Path(filename).name
    return serve_upload_file(UPLOAD_DIR, filename, filename)
