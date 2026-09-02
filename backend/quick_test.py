"""Minimal type + send test."""
import time, httpx, json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    
    r = httpx.post("http://localhost:8000/api/v1/auth/login",
                    json={"email": "admin@demo.com", "password": "Admin@123"}, timeout=10)
    td = r.json()
    
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # Inject auth via JS
    page.evaluate("""(args) => {
        localStorage.setItem('auth_token', args.token);
        localStorage.setItem('refresh_token', args.refresh);
        localStorage.setItem('auth_user', JSON.stringify(args.user));
        localStorage.setItem('auth_remember_me', 'false');
    }""", {"token": td["access_token"], "refresh": td["refresh_token"], "user": td["user"]})
    
    page.goto("http://localhost:5173/ai-assistant")
    page.wait_for_load_state("networkidle")
    time.sleep(5)
    
    ta = page.locator("textarea").first
    print(f"Visible: {ta.is_visible()}")
    print(f"Placeholder: {ta.get_attribute('placeholder')}")
    
    ta.click()
    time.sleep(0.3)
    ta.press_sequentially("Hello test", delay=30)
    time.sleep(0.5)
    val = ta.input_value()
    print(f"Value: '{val}'")
    
    send_btn = page.locator("form button[type='submit']").last
    print(f"Send visible: {send_btn.is_visible()}")
    
    page.screenshot(path="screenshots/agent-verification/type-test.png")
    browser.close()
    print("TYPE TEST OK")
