"""
Application Configuration
"""
from pydantic_settings import BaseSettings
from pydantic import Field, model_validator
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    # Project Information
    PROJECT_NAME: str = "SynTask Task Management Platform"
    VERSION: str = "1.0.0"
    COMPANY: str = "SynTask"
    
    # Environment
    ENVIRONMENT: str = "development"  # development, staging, production
    
    # API Settings
    API_V1_PREFIX: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = Field(..., description="Strong random secret for JWT signing. Minimum 32 characters.")
    ENCRYPTION_KEY: str = Field(..., description="Fernet key for encrypting sensitive fields at rest.")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "https://task.synzent.ai",
    ]
    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1"]
    # Frontend URL (for email links and redirects)
    FRONTEND_URL: str = "https://task.synzent.ai"
    
    # Database
    MONGODB_URL: str = Field(..., description="MongoDB connection string.")
    DATABASE_NAME: str = "alphanexis_task_management"
    
    # Email Configuration
    MAIL_USERNAME: Optional[str] = None
    MAIL_PASSWORD: Optional[str] = None
    MAIL_FROM: Optional[str] = "noreply@alphanexis.com"
    MAIL_PORT: int = 587
    MAIL_SERVER: Optional[str] = "smtp.gmail.com"
    MAIL_FROM_NAME: str = "SynTask"
    MAIL_TLS: bool = True
    MAIL_SSL: bool = False
    
    # Payment Gateway - Stripe
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_PUBLISHABLE_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    
    # Payment Gateway - Razorpay
    RAZORPAY_KEY_ID: Optional[str] = None
    RAZORPAY_KEY_SECRET: Optional[str] = None
    
    # Zoom Integration
    ZOOM_API_KEY: Optional[str] = None
    ZOOM_API_SECRET: Optional[str] = None
    ZOOM_CLIENT_ID: Optional[str] = None
    ZOOM_CLIENT_SECRET: Optional[str] = None
    ZOOM_ACCOUNT_ID: Optional[str] = None  # For Server-to-Server OAuth
    
    @property
    def ZOOM_API_KEY_COMPUTED(self) -> Optional[str]:
        """Return ZOOM_CLIENT_ID if ZOOM_API_KEY is not set"""
        return self.ZOOM_API_KEY or self.ZOOM_CLIENT_ID
    
    @property
    def ZOOM_API_SECRET_COMPUTED(self) -> Optional[str]:
        """Return ZOOM_CLIENT_SECRET if ZOOM_API_SECRET is not set"""
        return self.ZOOM_API_SECRET or self.ZOOM_CLIENT_SECRET
    
    # File Upload
    MAX_UPLOAD_SIZE: int = 10485760  # 10MB
    ALLOWED_EXTENSIONS: List[str] = [
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", 
        ".doc", ".docx", ".xls", ".xlsx", ".txt", ".zip"
    ]
    UPLOAD_DIR: str = "uploads"
    
    # AWS S3 (Optional for file storage)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_BUCKET_NAME: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    
    # Redis (for caching and Celery)
    REDIS_URL: str = Field(..., description="Redis URL for token blacklist and rate limiting.")
    ENABLE_TOKEN_REVOCATION: bool = True
    
    # Celery (Background tasks)
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60  # seconds
    AUTH_RATE_LIMIT_REQUESTS: int = 10
    AUTH_RATE_LIMIT_PERIOD: int = 60  # seconds
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    # Super Admin
    SUPER_ADMIN_EMAIL: str = Field(..., description="Super admin bootstrap email address.")
    SUPER_ADMIN_PASSWORD: str = Field(..., description="Super admin bootstrap password. Minimum 16 characters.")

    @model_validator(mode="after")
    def validate_production_settings(self):
        """Fail fast when production is configured with unsafe defaults."""
        if self.ENVIRONMENT != "production":
            return self

        errors = []
        if not self.SECRET_KEY or len(self.SECRET_KEY) < 32:
            errors.append("SECRET_KEY must be set to a strong value of at least 32 characters")
        if not self.ENCRYPTION_KEY:
            errors.append("ENCRYPTION_KEY must be set")
        if not self.MONGODB_URL:
            errors.append("MONGODB_URL must be set")
        if len(self.SUPER_ADMIN_PASSWORD) < 16:
            errors.append("SUPER_ADMIN_PASSWORD must be at least 16 characters")
        if "*" in self.ALLOWED_ORIGINS:
            errors.append("ALLOWED_ORIGINS cannot contain '*' in production")
        if "*" in self.ALLOWED_HOSTS:
            errors.append("ALLOWED_HOSTS cannot contain '*' in production")

        if errors:
            raise ValueError("Unsafe production configuration: " + "; ".join(errors))

        return self
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    try:
        return Settings()
    except Exception as e:
        raise RuntimeError(
            "FATAL: Missing required environment variables.\n"
            "Copy backend/.env.example to backend/.env and fill in all required values.\n"
            f"Error: {e}"
        ) from e


settings = get_settings()

