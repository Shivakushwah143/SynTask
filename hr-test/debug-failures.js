const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Users/shiva kushwah/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';
const SDIR = path.join(__dirname, 'screenshots');

async function debug(page, url, folder, name) {
  const dir = path.join(SDIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  
  try {
    const resp = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 12000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: p, fullPage: true });
    const finalUrl = page.url();
    const status = resp ? resp.status() : 'unknown';
    const text = await page.locator('body').textContent().catch(() => '');
    const h1 = await page.locator('h1, h2').first().textContent().catch(() => 'none');
    console.log(`  [${status}] ${url} → ${finalUrl} | heading: ${h1} | text snippet: ${text.substring(0, 200)}`);
    return { url: finalUrl, status, text: text.substring(0, 500), heading: h1 };
  } catch(e) {
    console.log(`  [ERROR] ${url}: ${e.message}`);
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    return { url: page.url(), status: 'error', text: e.message, heading: 'error' };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  
  // Login
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill('hr.admin@example.com');
  await page.locator('input[type="password"]').first().fill('Demo@123456');
  await page.locator('button[type="submit"]').first().click();
  try { await page.waitForURL('**/dashboard**', { timeout: 15000 }); } catch(e) {}
  await page.waitForTimeout(2000);
  console.log('Logged in. URL:', page.url());
  
  // Debug failed pages
  console.log('\n--- DEBUG: Payroll ---');
  await debug(page, '/hr/payroll', 'debug', 'payroll.png');
  
  console.log('\n--- DEBUG: HR Dashboard ---');
  await debug(page, '/hr/dashboard', 'debug', 'dashboard.png');
  
  console.log('\n--- DEBUG: My Leave ---');
  await debug(page, '/hr/me/leave', 'debug', 'my-leave.png');
  
  console.log('\n--- DEBUG: Employee List (check links) ---');
  await debug(page, '/hr/employees', 'debug', 'employees.png');
  // Check for any links on the page
  const allLinks = await page.locator('a').allAttributes('href');
  const empLinks = allLinks.filter(h => h && h.includes('/hr/employees/'));
  console.log('  Employee detail links:', empLinks.slice(0, 5));
  
  console.log('\n--- DEBUG: Various payroll routes ---');
  await debug(page, '/payroll', 'debug', 'payroll-alt.png');
  
  console.log('\n--- DEBUG: Dashboard (root) ---');
  await debug(page, '/dashboard', 'debug', 'root-dashboard.png');
  
  console.log('\n--- DEBUG: HR Settings ---');
  await debug(page, '/hr/settings', 'debug', 'hr-settings.png');
  
  console.log('\n--- DEBUG: Attendance alt routes ---');
  await debug(page, '/hr/attendance', 'debug', 'hr-attendance.png');
  
  await browser.close();
  console.log('\nDONE');
})();
