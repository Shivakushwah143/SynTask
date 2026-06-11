"""
Two-Factor Authentication Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
import pyotp
import qrcode
import io
import base64

from app.models.user import User
from app.api.dependencies import get_current_user
from app.core.security import decrypt_sensitive_value, encrypt_sensitive_value, verify_password

router = APIRouter()


@router.post("/enable-2fa")
async def enable_2fa(
    password: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Enable 2FA for current user"""
    # Verify password
    if not verify_password(password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )
    
    # Generate secret
    secret = pyotp.random_base32()
    
    # Update user
    current_user.two_factor_enabled = True
    current_user.two_factor_secret = encrypt_sensitive_value(secret)
    await current_user.save()
    
    # Generate QR code
    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=current_user.email,
        issuer_name="SynTask"
    )
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(totp_uri)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_code_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_code_base64}",
        "message": "2FA enabled. Scan QR code with authenticator app."
    }


@router.post("/disable-2fa")
async def disable_2fa(
    password: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Disable 2FA for current user"""
    if not verify_password(password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )
    
    current_user.two_factor_enabled = False
    current_user.two_factor_secret = None
    await current_user.save()
    
    return {"message": "2FA disabled successfully"}


@router.post("/verify-2fa")
async def verify_2fa(
    code: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Verify 2FA code"""
    if not current_user.two_factor_enabled or not current_user.two_factor_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA not enabled"
        )
    
    try:
        secret = decrypt_sensitive_value(current_user.two_factor_secret)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="2FA configuration is invalid"
        )

    totp = pyotp.TOTP(secret)
    
    if not totp.verify(code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code"
        )
    
    return {"message": "2FA code verified"}

