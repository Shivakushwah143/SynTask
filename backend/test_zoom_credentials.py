"""
Test script to verify Zoom credentials are being loaded
"""
import sys
sys.path.insert(0, '.')

try:
    from app.core.config import settings
    
    print("=" * 60)
    print("ZOOM CREDENTIALS CHECK")
    print("=" * 60)
    
    print(f"\nFrom .env file:")
    print(f"  ZOOM_API_KEY: {settings.ZOOM_API_KEY}")
    print(f"  ZOOM_API_SECRET: {'***' if settings.ZOOM_API_SECRET else None}")
    print(f"  ZOOM_CLIENT_ID: {settings.ZOOM_CLIENT_ID}")
    print(f"  ZOOM_CLIENT_SECRET: {'***' if settings.ZOOM_CLIENT_SECRET else None}")
    print(f"  ZOOM_ACCOUNT_ID: {settings.ZOOM_ACCOUNT_ID}")
    
    print(f"\nComputed properties:")
    print(f"  ZOOM_API_KEY_COMPUTED: {settings.ZOOM_API_KEY_COMPUTED}")
    print(f"  ZOOM_API_SECRET_COMPUTED: {'***' if settings.ZOOM_API_SECRET_COMPUTED else None}")
    
    print(f"\nZoom Integration Status:")
    if settings.ZOOM_API_KEY_COMPUTED and settings.ZOOM_API_SECRET_COMPUTED:
        print(f"  ✓ Zoom credentials are CONFIGURED")
        print(f"  ✓ Zoom integration should WORK")
    else:
        print(f"  ✗ Zoom credentials are NOT configured")
        print(f"  ✗ Zoom integration will NOT work")
    
    print("=" * 60)
    
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()

