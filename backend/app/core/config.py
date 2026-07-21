"""
Application Configuration
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

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
    GOOGLE_CLIENT_ID: Optional[str] = None
    AUTH_COOKIE_SECURE: bool = True
    AUTH_COOKIE_SAMESITE: str = "lax"
    AUTH_COOKIE_DOMAIN: Optional[str] = None
    
    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
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

    # IMAP recruitment inbox sync
    IMAP_ENABLED: bool = False
    IMAP_HOST: Optional[str] = None
    IMAP_PORT: int = 993
    IMAP_SSL: bool = True
    IMAP_USERNAME: Optional[str] = None
    IMAP_PASSWORD: Optional[str] = None
    IMAP_FOLDER: str = "INBOX"
    IMAP_POLL_SECONDS: int = 60
    IMAP_MARK_SEEN: bool = True
    IMAP_TARGET_COMPANY_EMAIL: Optional[str] = None

    # Brevo outbound email
    BREVO_API_KEY: Optional[str] = None
    BREVO_SENDER_EMAIL: Optional[str] = None
    BREVO_SENDER_NAME: str = "SynTask"
    BREVO_REPLY_TO: Optional[str] = None
    BREVO_BASE_URL: str = "https://api.brevo.com/v3"
    BREVO_TIMEOUT_SECONDS: int = 20
    BREVO_RETRY_ATTEMPTS: int = 3
    
    # Payment Gateway - Stripe
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_PUBLISHABLE_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    
    # Payment Gateway - Razorpay
    RAZORPAY_KEY_ID: Optional[str] = None
    RAZORPAY_KEY_SECRET: Optional[str] = None
    RAZORPAY_INVOICE_PAYMENTS_ENABLED: bool = False
    
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
        ".doc", ".docx", ".pptx", ".xls", ".xlsx", ".csv", ".html", ".htm", ".txt", ".md", ".markdown", ".zip"
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
    REDIS_CONNECT_TIMEOUT_SECONDS: float = 2.0
    REDIS_OPERATION_TIMEOUT_SECONDS: float = 2.0
    REDIS_HEALTH_CACHE_SECONDS: int = 30
    REDIS_RETRY_ATTEMPTS: int = 3
    REDIS_RETRY_BASE_DELAY_SECONDS: float = 0.2
    DISABLE_REDIS: bool = False

    # Celery (Background tasks)
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None
    DISABLE_CELERY: bool = False
    CELERY_ALWAYS_EAGER: bool = False
    DISABLE_EVENT_PROCESSING: bool = False

    # Meta integration. Disabled until deployment and tenant configuration pass.
    META_INTEGRATION_ENABLED: bool = False
    META_APP_ID: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    META_VERIFY_TOKEN: Optional[str] = None
    META_PAGE_ID: Optional[str] = None
    META_PAGE_ACCESS_TOKEN: Optional[str] = None
    META_BUSINESS_ID: Optional[str] = None
    META_AD_ACCOUNT_ID: Optional[str] = None
    META_SYSTEM_USER_TOKEN: Optional[str] = None
    META_LEAD_FORM_ID: Optional[str] = None
    META_WHATSAPP_BUSINESS_ID: Optional[str] = None
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 500
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60  # seconds
    AUTH_RATE_LIMIT_REQUESTS: int = 10
    AUTH_RATE_LIMIT_PERIOD: int = 60  # seconds
    
    # Logging
    LOG_LEVEL: str = "INFO"

    # AI pipeline
    AI_PROVIDER: str = "groq"  # groq, openai
    GROQ_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    AI_TIMEOUT: int = 30
    AI_MAX_TOKENS: int = 500
    AI_TEMPERATURE: float = 0.2
    AI_MODEL_GROQ: str = "llama-3.1-70b-versatile"
    AI_MODEL_OPENAI: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_EMBEDDING_DIMENSIONS: int = 1536

    # Central RAG foundation
    RAG_ENABLED: bool = False
    QDRANT_URL: Optional[str] = None
    QDRANT_API_KEY: Optional[str] = None
    QDRANT_COLLECTION: str = "syntask_rag_text_embedding_3_small_1536"
    QDRANT_DEPLOYMENT_MODE: str = "shared"  # shared, dedicated, customer_hosted
    QDRANT_TIMEOUT_SECONDS: int = 10
    RAG_MAX_UPLOAD_SIZE: int = 26214400
    RAG_PDF_MAX_PAGES: int = 200
    RAG_CHUNK_MAX_TOKENS: int = 700
    RAG_CHUNK_OVERLAP_TOKENS: int = 80
    RAG_RETRIEVAL_TOP_K: int = 5
    RAG_CITATION_EXCERPT_CHARS: int = 600
    RAG_AUDIT_RETENTION_DAYS: int = 90
    RAG_WORKING_MEMORY_IDLE_TTL_SECONDS: int = 1800
    RAG_WORKING_MEMORY_ABSOLUTE_TTL_SECONDS: int = 28800
    RAG_WORKING_MEMORY_MAX_MESSAGES: int = 20
    RAG_WORKING_MEMORY_MAX_TOOL_OUTPUTS: int = 10
    RAG_WORKING_MEMORY_MAX_ENTITIES: int = 25
    RAG_WORKING_MEMORY_MESSAGE_CHARS: int = 1000
    RAG_WORKING_MEMORY_TOOL_OUTPUT_CHARS: int = 1500
    RAG_CONTEXT_PACKAGE_MAX_ITEMS: int = 20
    RAG_CONTEXT_PACKAGE_MAX_CHARS: int = 6000
    RAG_LOG_RAW_CONTEXT: bool = False
    RAG_LOG_FULL_PROMPTS: bool = False
    RAG_QUERY_UNDERSTANDING_VERSION: str = "query-understanding-v1"
    RAG_QUERY_MAX_REWRITES: int = 3
    RAG_QUERY_MAX_SUBQUERIES: int = 3
    RAG_HYBRID_COLLECTION: str = "syntask_rag_hybrid_v1_text_embedding_3_small_1536"
    RAG_DENSE_VECTOR_NAME: str = "dense"
    RAG_SPARSE_VECTOR_NAME: str = "sparse"
    RAG_SPARSE_ENCODER_VERSION: str = "sparse-hash-v1"
    RAG_HYBRID_PREFETCH_LIMIT: int = 20
    RAG_MIN_EVIDENCE_SCORE: float = 0.2
    RAG_OFFICE_MAX_UNCOMPRESSED_BYTES: int = 50_000_000
    RAG_XLSX_MAX_SHEETS: int = 30
    RAG_XLSX_MAX_ROWS: int = 5000
    RAG_PPTX_MAX_SLIDES: int = 300
    RAG_CSV_MAX_ROWS: int = 10000

    # Shared Agent Platform foundation
    AGENT_PLATFORM_ENABLED: bool = False
    PROJECT_AGENT_ENABLED: bool = False
    EMAIL_DRAFT_AGENT_ENABLED: bool = False
    TASK_PERFORMANCE_AGENT_ENABLED: bool = False
    AGENT_RUN_RETENTION_DAYS: int = 90
    AGENT_RUN_EVENT_RETENTION_DAYS: int = 180
    AGENT_SANITIZED_OUTPUT_RETENTION_DAYS: int = 90
    AGENT_PROPOSAL_RETENTION_DAYS: int = 90
    AGENT_EVALUATION_RETENTION_DAYS: int = 180
    AGENT_DEFAULT_RUN_TIMEOUT_SECONDS: int = 30
    AGENT_DEFAULT_MAX_TOKENS_PER_RUN: int = 4000
    AGENT_DEFAULT_MAX_COST_PER_RUN: float = 1.0

    # Super Admin
    SUPER_ADMIN_EMAIL: str = Field(..., description="Super admin bootstrap email address.")
    SUPER_ADMIN_PASSWORD: str = Field(..., description="Super admin bootstrap password. Minimum 16 characters.")

    @model_validator(mode="after")
    def validate_production_settings(self):
        """Fail fast when production is configured with unsafe defaults."""
        if self.META_INTEGRATION_ENABLED:
            missing_meta = [
                field
                for field in ("META_APP_ID", "META_APP_SECRET", "META_VERIFY_TOKEN")
                if not getattr(self, field)
            ]
            if missing_meta:
                raise ValueError(
                    "Enabled Meta integration is missing deployment credentials: "
                    + ", ".join(missing_meta)
                )

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

        if self.RAG_ENABLED and not self.QDRANT_URL:
            raise ValueError("QDRANT_URL must be set when RAG_ENABLED is true in production")

        return self
    
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
