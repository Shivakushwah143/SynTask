"""
File Upload Endpoints
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from fastapi.responses import FileResponse
import mimetypes
import logging
from pathlib import Path

from app.models.user import User
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.services.file_service import FileService

router = APIRouter()
logger = logging.getLogger(__name__)

# Get absolute path for upload directory (relative to backend folder)
BACKEND_DIR = Path(__file__).parent.parent.parent.parent  # Go up from app/api/v1/endpoints/files.py to backend/
UPLOAD_DIR = BACKEND_DIR / settings.UPLOAD_DIR

# Ensure upload directory exists
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
logger.info(f"Upload directory set to: {UPLOAD_DIR.absolute()}")
PROJECT_UPLOAD_DIR = UPLOAD_DIR / "projects"
PROJECT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


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
    file_path = resolve_upload_path(root, relative_path)
    if not file_path.exists() or not file_path.is_file():
        logger.warning(f"File not found: {relative_path}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    content_type = detect_content_type(file_path)
    headers = {}
    if content_type.startswith('image/'):
        headers['Cache-Control'] = 'private, max-age=86400'

    return FileResponse(
        path=file_path,
        filename=download_name or file_path.name,
        media_type=content_type,
        headers=headers,
    )

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a file"""
    try:
        stored = await FileService.store_uploaded_file(file, upload_dir=UPLOAD_DIR, url_prefix="/api/v1/files")
        logger.info(f"Upload attempt: {file.filename}, size: {stored['size']} bytes, user: {current_user.email}")
        logger.info(f"File uploaded successfully: {stored['unique_filename']}, URL: {stored['file_url']}")
        return {
            "message": "File uploaded successfully",
            "file_url": stored["file_url"],
            "filename": stored["filename"],
            "size": stored["size"],
            "type": stored["type"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during file upload: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File upload failed: {str(e)}"
        )


@router.get("/clients/{filename}")
async def get_client_file(filename: str, current_user: User = Depends(get_current_user)):
    """Get client document file"""
    filename = Path(filename).name
    return serve_upload_file(UPLOAD_DIR / "clients", filename, filename)


@router.get("/projects/{filename}")
async def get_project_file(filename: str, current_user: User = Depends(get_current_user)):
    """Get project file"""
    filename = Path(filename).name
    
    return serve_upload_file(PROJECT_UPLOAD_DIR, filename, filename)


@router.get("/msa/{filename}")
async def get_msa_file(filename: str, current_user: User = Depends(get_current_user)):
    """Get MSA file (stamp image)"""
    filename = Path(filename).name
    
    return serve_upload_file(UPLOAD_DIR / "msa", filename, filename)


@router.get("/leaves/{filename}")
async def get_leave_file(filename: str, current_user: User = Depends(get_current_user)):
    """Get leave attachment file."""
    filename = Path(filename).name
    return serve_upload_file(UPLOAD_DIR / "leaves", filename, filename)


@router.get("/{filename}")
async def get_file(filename: str, current_user: User = Depends(get_current_user)):
    """Get uploaded file."""
    filename = Path(filename).name
    return serve_upload_file(UPLOAD_DIR, filename, filename)
