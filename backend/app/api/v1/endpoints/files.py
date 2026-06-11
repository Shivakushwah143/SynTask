"""
File Upload Endpoints
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from fastapi.responses import FileResponse
import uuid
import mimetypes
import logging
from pathlib import Path

from app.models.user import User
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.core.file_validation import detect_mime_type

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

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
}


def validate_uploaded_file(filename: str, file_content: bytes) -> str:
    file_ext = Path(filename or "").suffix.lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )

    detected_mime = detect_mime_type(file_content, filename)
    if detected_mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{detected_mime}' not allowed"
        )

    return file_ext


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a file"""
    try:
        # Validate file size
        file_content = await file.read()
        file_size = len(file_content)
        
        logger.info(f"Upload attempt: {file.filename}, size: {file_size} bytes, user: {current_user.email}")
        
        if file_size > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB"
            )
        
        file_ext = validate_uploaded_file(file.filename, file_content)
        
        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / unique_filename
        
        # Save file
        try:
            with open(file_path, "wb") as f:
                f.write(file_content)
            logger.info(f"File saved successfully to: {file_path.absolute()}")
            
            # Verify file was saved
            if not file_path.exists():
                logger.error(f"File save verification failed: {file_path.absolute()}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="File upload failed - file not saved"
                )
            
            file_size_on_disk = file_path.stat().st_size
            if file_size_on_disk != file_size:
                logger.error(f"File size mismatch: uploaded {file_size}, saved {file_size_on_disk}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="File upload failed - size mismatch"
                )
                
        except Exception as e:
            logger.error(f"Error saving file: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save file: {str(e)}"
            )
        
        # Return file URL
        file_url = f"/api/v1/files/{unique_filename}"
        
        logger.info(f"File uploaded successfully: {unique_filename}, URL: {file_url}")
        
        return {
            "message": "File uploaded successfully",
            "file_url": file_url,
            "filename": file.filename,
            "size": file_size,
            "type": file.content_type
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
async def get_client_file(filename: str):
    """Get client document file"""
    # Sanitize filename to prevent directory traversal
    filename = Path(filename).name
    
    # Client files are stored in uploads/clients/
    CLIENT_UPLOAD_DIR = UPLOAD_DIR / "clients"
    file_path = CLIENT_UPLOAD_DIR / filename
    
    if not file_path.exists():
        logger.warning(f"Client file not found: {filename}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # Detect content type
    content_type, _ = mimetypes.guess_type(str(file_path))
    if not content_type:
        ext = file_path.suffix.lower()
        if ext == '.pdf':
            content_type = 'application/pdf'
        elif ext in ['.doc', '.docx']:
            content_type = 'application/msword'
        elif ext in ['.xls', '.xlsx']:
            content_type = 'application/vnd.ms-excel'
        else:
            content_type = 'application/octet-stream'
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=content_type
    )


@router.get("/projects/{filename}")
async def get_project_file(filename: str):
    """Get project file"""
    filename = Path(filename).name
    
    file_path = PROJECT_UPLOAD_DIR / filename
    
    if not file_path.exists():
        logger.warning(f"Project file not found: {filename}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    content_type, _ = mimetypes.guess_type(str(file_path))
    if not content_type:
        ext = file_path.suffix.lower()
        if ext == '.pdf':
            content_type = 'application/pdf'
        elif ext in ['.doc', '.docx']:
            content_type = 'application/msword'
        elif ext in ['.xls', '.xlsx']:
            content_type = 'application/vnd.ms-excel'
        else:
            content_type = 'application/octet-stream'
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=content_type
    )


@router.get("/msa/{filename}")
async def get_msa_file(filename: str):
    """Get MSA file (stamp image)"""
    filename = Path(filename).name
    
    MSA_UPLOAD_DIR = UPLOAD_DIR / "msa"
    file_path = MSA_UPLOAD_DIR / filename
    
    if not file_path.exists():
        logger.warning(f"MSA file not found: {filename}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    content_type, _ = mimetypes.guess_type(str(file_path))
    if not content_type:
        ext = file_path.suffix.lower()
        if ext in ['.jpg', '.jpeg']:
            content_type = 'image/jpeg'
        elif ext == '.png':
            content_type = 'image/png'
        elif ext == '.gif':
            content_type = 'image/gif'
        elif ext == '.webp':
            content_type = 'image/webp'
        else:
            content_type = 'application/octet-stream'
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=content_type
    )


@router.get("/{filename}")
async def get_file(filename: str):
    """Get uploaded file - Public access for images"""
    # Sanitize filename to prevent directory traversal
    filename = Path(filename).name
    
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        logger.warning(f"File not found: {filename}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # Detect content type
    content_type, _ = mimetypes.guess_type(str(file_path))
    if not content_type:
        # Default based on extension
        ext = file_path.suffix.lower()
        if ext in ['.jpg', '.jpeg']:
            content_type = 'image/jpeg'
        elif ext == '.png':
            content_type = 'image/png'
        elif ext == '.gif':
            content_type = 'image/gif'
        elif ext == '.webp':
            content_type = 'image/webp'
        elif ext == '.pdf':
            content_type = 'application/pdf'
        else:
            content_type = 'application/octet-stream'
    
    # Add cache headers for images
    headers = {}
    if content_type.startswith('image/'):
        headers['Cache-Control'] = 'public, max-age=31536000'  # 1 year
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=content_type,
        headers=headers
    )
