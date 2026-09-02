"""Browser automation for HR + Executive Agent acceptance testing."""
import time
import os
import json
import httpx
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "screenshots", "agent-verification")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

FRONTEND_URL = "http://localhost:5173"
BACKEND_URL = "http://localhost:8000"
AI_CHAT_PATH = "/ai-assistant"


def screenshot(page, name):
    path = os.path.join(SCREENSHOT_DIR, name)
    page.screenshot(path=path, full_page=True)
    print(f"  [SCREENSHOT] {name}")
    return path


def get_auth_token():
    """Login via API and return token data."""
    r = httpx.post(
        f"{BACKEND_URL}/api/v1/auth/login",
        json={"email": "admin@demo.com", "password": "Admin@123"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def inject_auth(page, token_data):
    """Inject auth tokens into browser localStorage for the SPA."""
    page.evaluate("""(args) => {
        localStorage.setItem('auth_token', args.token);
        localStorage.setItem('refresh_token', args.refresh);
        localStorage.setItem('auth_user', JSON.stringify(args.user));
        localStorage.setItem('auth_remember_me', 'false');
    }""", {"token": token_data["access_token"], "refresh": token_data["refresh_token"], "user": token_data["user"]})


def wait_for_agent_response(page, timeout=120):
    """Wait for agent to finish responding."""
    start = time.time()
    time.sleep(5)
    
    while time.time() - start < timeout:
        is_loading = False
        for text in ["Thinking", "Processing", "Loading", "Analyzing", "Investigating"]:
            try:
                loc = page.locator(f"text={text}").first
                if loc.is_visible(timeout=300):
                    is_loading = True
                    break
            except:
                pass
        
        if not is_loading and time.time() - start > 8:
            time.sleep(3)
            still_loading = False
            for text in ["Thinking", "Processing", "Loading"]:
                try:
                    if page.locator(f"text={text}").first.is_visible(timeout=300):
                        still_loading = True
                        break
                except:
                    pass
            if not still_loading:
                return True
        
        time.sleep(2)
    
    print(f"  [WARN] Response wait timed out after {timeout}s")
    return False


def type_and_send(page, text):
    """Type message using keyboard (React-compatible) and send."""
    # Find the chat textarea
    textarea = None
    try:
        ta = page.locator("textarea").first
        if ta.is_visible(timeout=3000):
            textarea = ta
    except:
        pass
    
    if not textarea:
        print("  [ERROR] Could not find chat textarea")
        return False
    
    # Click to focus
    textarea.click()
    time.sleep(0.3)
    
    # Use keyboard to type (works with React controlled inputs)
    textarea.press_sequentially(text, delay=15)
    time.sleep(0.5)
    
    # Find the Send submit button (the one with Send text, not the password toggle)
    try:
        send_btn = page.locator("form button[type='submit']").last
        if send_btn.is_visible(timeout=2000):
            send_btn.click()
            return True
    except:
        pass
    
    # Fallback: press Enter
    textarea.press("Enter")
    return True


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        # ================================================================
        # STEP 1: Get auth token via API
        # ================================================================
        print("\n=== STEP 1: Login via API ===")
        token_data = get_auth_token()
        print(f"  Token obtained (role: {token_data['user'].get('role')})")

        # ================================================================
        # STEP 2: Inject token and navigate to AI Chat
        # ================================================================
        print("\n=== STEP 2: Navigate to AI Chat ===")
        page.goto(FRONTEND_URL)
        page.wait_for_load_state("domcontentloaded")
        time.sleep(2)
        
        inject_auth(page, token_data)
        
        page.goto(f"{FRONTEND_URL}{AI_CHAT_PATH}", wait_until='domcontentloaded')
        time.sleep(8)
        
        print(f"  URL: {page.url}")
        screenshot(page, "01-ai-chat-loaded.png")

        # ================================================================
        # STEP 3: HR Agent - Employee 360 (Riya Jain)
        # ================================================================
        print("\n=== STEP 3: HR Agent - Employee 360 ===")
        type_and_send(page, "Tell me everything important about Riya Jain.")
        wait_for_agent_response(page, timeout=120)
        screenshot(page, "02-hr-riya-360.png")

        # ================================================================
        # STEP 4: HR Follow-up - Attendance
        # ================================================================
        print("\n=== STEP 4: HR Follow-up - Attendance ===")
        type_and_send(page, "What about her attendance?")
        wait_for_agent_response(page, timeout=90)
        screenshot(page, "03-hr-riya-attendance.png")

        # ================================================================
        # STEP 5: HR Follow-up - Payroll
        # ================================================================
        print("\n=== STEP 5: HR Follow-up - Payroll ===")
        type_and_send(page, "Does she have any payroll or payslip issue?")
        wait_for_agent_response(page, timeout=90)
        screenshot(page, "04-hr-riya-payroll.png")

        # ================================================================
        # STEP 6: HR Recruitment
        # ================================================================
        print("\n=== STEP 6: HR Recruitment ===")
        type_and_send(page, "Tell me everything important about Rahul Sharma.")
        wait_for_agent_response(page, timeout=120)
        screenshot(page, "05-hr-recruitment.png")

        # ================================================================
        # STEP 7: Fresh conversation for Executive Agent
        # ================================================================
        print("\n=== STEP 7: Fresh conversation for Executive ===")
        page.goto(f"{FRONTEND_URL}{AI_CHAT_PATH}", wait_until='domcontentloaded')
        time.sleep(8)
        screenshot(page, "06-executive-fresh-start.png")

        # ================================================================
        # STEP 8: Executive Daily Brief
        # ================================================================
        print("\n=== STEP 8: Executive Daily Brief ===")
        type_and_send(page, "What needs my attention today?")
        wait_for_agent_response(page, timeout=150)
        screenshot(page, "07-executive-brief.png")

        # ================================================================
        # STEP 9: Executive - Employee Tasks
        # ================================================================
        print("\n=== STEP 9: Executive - Employee Tasks ===")
        type_and_send(page, "What tasks are assigned to Emp11 Demo?")
        wait_for_agent_response(page, timeout=120)
        screenshot(page, "08-executive-user-tasks.png")

        # ================================================================
        # STEP 10: Executive - Task Follow-up
        # ================================================================
        print("\n=== STEP 10: Executive - Task Follow-up ===")
        type_and_send(page, "How many tasks did they complete today?")
        wait_for_agent_response(page, timeout=90)
        screenshot(page, "09-executive-task-followup.png")

        # ================================================================
        # STEP 11: Executive - Cross-domain
        # ================================================================
        print("\n=== STEP 11: Executive - Cross-domain ===")
        type_and_send(page, "Why is Orchid Labs at risk?")
        wait_for_agent_response(page, timeout=150)
        screenshot(page, "10-executive-cross-domain.png")

        # ================================================================
        # STEP 12: Hallucination Test
        # ================================================================
        print("\n=== STEP 12: Hallucination Test ===")
        type_and_send(page, "Tell me about Project ZZZNonexistent123.")
        wait_for_agent_response(page, timeout=90)
        screenshot(page, "11-no-hallucination.png")

        # ================================================================
        # HEALTH CHECK
        # ================================================================
        print("\n=== HEALTH CHECK ===")
        print(f"  Console errors: {len(console_errors)}")
        for err in console_errors[:10]:
            print(f"    - {err[:200]}")

        print(f"\n=== SCREENSHOTS ===")
        for f in sorted(os.listdir(SCREENSHOT_DIR)):
            size = os.path.getsize(os.path.join(SCREENSHOT_DIR, f))
            print(f"  {f} ({size:,} bytes)")

        browser.close()
        print("\n=== ALL TESTS COMPLETE ===")


if __name__ == "__main__":
    main()
