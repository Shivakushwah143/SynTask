"""Check registered routes"""
from app.main import app

print("Registered Routes:")
print("=" * 80)
for route in app.routes:
    if hasattr(route, 'path') and '/users' in route.path:
        methods = getattr(route, 'methods', [])
        print(f"{methods} {route.path}")

