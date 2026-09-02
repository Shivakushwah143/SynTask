"""Debug the Vite error overlay on the AI assistant page."""
import time, httpx, json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    
    console_msgs = []
    page.on("console", lambda msg: console_msgs.append(f"{msg.type}: {msg.text[:300]}"))
    
    r = httpx.post("http://localhost:8000/api/v1/auth/login",
                    json={"email": "admin@demo.com", "password": "Admin@123"}, timeout=10)
    td = r.json()
    
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    page.evaluate("""(args) => {
        localStorage.setItem('auth_token', args.token);
        localStorage.setItem('refresh_token', args.refresh);
        localStorage.setItem('auth_user', JSON.stringify(args.user));
        localStorage.setItem('auth_remember_me', 'false');
    }""", {"token": td["access_token"], "refresh": td["refresh_token"], "user": td["user"]})
    
    page.goto("http://localhost:5173/ai-assistant")
    page.wait_for_load_state("networkidle")
    time.sleep(5)
    
    # Check for vite-error-overlay
    overlay = page.locator("vite-error-overlay")
    print(f"Vite error overlay visible: {overlay.count()}")
    
    if overlay.count() > 0:
        # Get the error message from the shadow DOM
        error_text = page.evaluate("""() => {
            const overlay = document.querySelector('vite-error-overlay');
            if (!overlay || !overlay.shadowRoot) return 'NO OVERLAY SHADOW';
            const msg = overlay.shadowRoot.querySelector('.message-body');
            return msg ? msg.textContent : overlay.shadowRoot.innerHTML.substring(0, 2000);
        }""")
        print(f"Vite error: {error_text[:1000]}")
    
    # Console messages
    print(f"\nConsole messages ({len(console_msgs)}):")
    for m in console_msgs:
        print(f"  {m}")
    
    page.screenshot(path="screenshots/agent-verification/debug-vite-error.png")
    browser.close()
