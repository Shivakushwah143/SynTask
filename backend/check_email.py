"""
Simple Email Configuration Checker
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.core.email import EMAIL_CONFIGURED

def check_email_config():
    print("=" * 60)
    print("EMAIL CONFIGURATION CHECK")
    print("=" * 60)
    
    print("\nEmail Settings:")
    print(f"  MAIL_USERNAME: {settings.MAIL_USERNAME or 'NOT SET'}")
    print(f"  MAIL_PASSWORD: {'SET' if settings.MAIL_PASSWORD else 'NOT SET'}")
    print(f"  MAIL_SERVER: {settings.MAIL_SERVER or 'NOT SET'}")
    print(f"  MAIL_PORT: {settings.MAIL_PORT}")
    print(f"  MAIL_FROM: {settings.MAIL_FROM}")
    
    print(f"\nEmail Configured: {'YES' if EMAIL_CONFIGURED else 'NO'}")
    
    if not EMAIL_CONFIGURED:
        print("\nEMAIL NOT CONFIGURED!")
        print("\nAdd these to your .env file:")
        print("MAIL_USERNAME=your-email@gmail.com")
        print("MAIL_PASSWORD=your-app-password")
        print("MAIL_SERVER=smtp.gmail.com")
    else:
        print("\nEmail is configured correctly!")
    
    print("=" * 60)

if __name__ == "__main__":
    check_email_config()
