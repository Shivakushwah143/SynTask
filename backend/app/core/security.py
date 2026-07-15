"""
Security utilities for authentication and authorization
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from cryptography.fernet import Fernet
import secrets

from app.core.config import settings

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer token
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "type": "access", "jti": secrets.token_urlsafe(16)})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({"exp": expire, "type": "refresh", "jti": secrets.token_urlsafe(16)})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and verify JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def decode_token_with_blacklist_check(token: str) -> Dict[str, Any]:
    """Decode JWT and verify it has not been revoked."""
    from app.core.token_blacklist import is_token_blacklisted

    if await is_token_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(token)


def get_token_from_header(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """Extract token from Authorization header or httpOnly access cookie."""
    if credentials:
        return credentials.credentials

    token = request.cookies.get("access_token")
    if token:
        return token

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_token_type(token: str, expected_type: str) -> Dict[str, Any]:
    """Verify token type (access or refresh)"""
    payload = decode_token(token)
    
    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token type. Expected {expected_type}",
        )
    
    return payload


def decode_refresh_token(token: str) -> Dict[str, Any]:
    """Decode refresh token"""
    return verify_token_type(token, "refresh")


def generate_reset_token() -> str:
    """Generate a secure random token for password reset"""
    # Generate a URL-safe token of 32 bytes (256 bits)
    return secrets.token_urlsafe(32)


def encrypt_sensitive_value(value: str) -> str:
    """Encrypt sensitive values before storing them at rest."""
    return Fernet(settings.ENCRYPTION_KEY.encode()).encrypt(value.encode()).decode()


def decrypt_sensitive_value(encrypted_value: str) -> str:
    """Decrypt sensitive values loaded from storage."""
    return Fernet(settings.ENCRYPTION_KEY.encode()).decrypt(encrypted_value.encode()).decode()

