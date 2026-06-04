"""
Application Configuration
"""
from pydantic_settings import BaseSettings
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
    SECRET_KEY: str = "your-secret-key-change-in-production"
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
    ALLOWED_HOSTS: List[str] = ["*"]
    # Frontend URL (for email links and redirects)
    FRONTEND_URL: str = "https://task.synzent.ai"
    
    # Database
    # For MongoDB Atlas, set this via environment variable or .env file:
    # MONGODB_URL=mongodb+srv://tms-madhu:madhu12345@cluster0.knbbp3j.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority
    MONGODB_URL: str = "mongodb+srv://tms-madhu:madhu12345@cluster0.knbbp3j.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
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
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Celery (Background tasks)
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60  # seconds
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    # Super Admin
    SUPER_ADMIN_EMAIL: str = "admin@alphanexis.com"
    SUPER_ADMIN_PASSWORD: str = "changeme123"  # Change in production
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

