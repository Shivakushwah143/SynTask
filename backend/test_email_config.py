"""
Email Configuration Test Script
Run this to verify email settings and test email sending
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.core.email import EMAIL_CONFIGURED, send_welcome_email

async def test_email_config():
    print("=" * 60)
    print("EMAIL CONFIGURATION TEST")
    print("=" * 60)
    
    print("\n📧 Email Settings:")
    print(f"  MAIL_USERNAME: {settings.MAIL_USERNAME or '❌ NOT SET'}")
    print(f"  MAIL_PASSWORD: {'✅ SET' if settings.MAIL_PASSWORD else '❌ NOT SET'}")
    print(f"  MAIL_SERVER: {settings.MAIL_SERVER or '❌ NOT SET'}")
    print(f"  MAIL_PORT: {settings.MAIL_PORT}")
    print(f"  MAIL_FROM: {settings.MAIL_FROM}")
    print(f"  MAIL_FROM_NAME: {settings.MAIL_FROM_NAME}")
    print(f"  MAIL_TLS: {settings.MAIL_TLS}")
    print(f"  MAIL_SSL: {settings.MAIL_SSL}")
    
    print(f"\n🔧 Email Configured: {'✅ YES' if EMAIL_CONFIGURED else '❌ NO'}")
    
    if not EMAIL_CONFIGURED:
        print("\n⚠️  EMAIL NOT CONFIGURED!")
        print("\nTo configure email, create a .env file in the backend directory with:")
        print("""
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_FROM=noreply@syntask.com
MAIL_FROM_NAME=SynTask
MAIL_TLS=True
MAIL_SSL=False
        """)
        print("\n📖 For Gmail:")
        print("  1. Enable 2-Factor Authentication")
        print("  2. Go to Google Account → Security → App Passwords")
        print("  3. Generate an app password for 'Mail'")
        print("  4. Use that password in MAIL_PASSWORD")
        return
    
    # Test sending email
    print("\n" + "=" * 60)
    test_email = input("\n📨 Enter test email address (or press Enter to skip): ").strip()
    
    if test_email:
        print(f"\n🚀 Sending test welcome email to {test_email}...")
        try:
            result = await send_welcome_email(
                email=test_email,
                password="TestPassword123",
                first_name="Test",
                last_name="User",
                role="EMPLOYEE",
                created_by_name="Admin User"
            )
            
            if result:
                print("✅ Email sent successfully!")
                print(f"📬 Check {test_email} inbox for the welcome email")
            else:
                print("❌ Email sending failed - check logs above")
        except Exception as e:
            print(f"❌ Error sending email: {str(e)}")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    asyncio.run(test_email_config())
