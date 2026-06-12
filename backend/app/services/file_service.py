from app.core.file_validation import detect_mime_type


class FileService:
    detect_mime_type = staticmethod(detect_mime_type)
