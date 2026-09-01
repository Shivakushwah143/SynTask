const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Users/shiva kushwah/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';
const SDIR = path.join(__dirname, 'screenshots');

const batch = process.argv[2] || '1';

async function ss(page, file, folder) {
  const dir = path.join(SDIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, file), fullPage: true });
}

async function visText(page) {
  return await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let t = '';
    while (w.nextNode()) { const n = w.currentNode; if (n.parentElement && n.parentElement.offsetParent !== null && n.textContent.trim()) t += n.textContent.trim() + ' '; }
    return t.trim().substring(0, 500);
  });
}

async function go(page, url, folder, name) {
  try {
    const resp = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    await ss(page, name, folder);
    return { ok: resp && resp.status() === 200, url: page.url() };
  } catch(e) { return { ok: false, error: e.message }; }
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
  console.log(`LOGIN: ${page.url().includes('dashboard') ? 'PASS' : 'FAIL'}`);
  await ss(page, '01-login-success.png', '00-login');

  const routes = {
    '1': [
      ['/hr/recruitment', '01-recruitment', '01-dashboard.png'],
      ['/hr/recruitment/jobs', '01-recruitment', '02-jobs.png'],
      ['/hr/recruitment/candidates', '01-recruitment', '03-candidates.png'],
      ['/hr/recruitment/offers', '01-recruitment', '04-offers.png'],
      ['/hr/recruitment/interviews', '01-recruitment', '05-interviews.png'],
      ['/hr/employees', '02-employees', '01-list.png'],
      ['/hr/documents', '03-documents', '01-list.png'],
      ['/hr/settings/document-types', '03-documents', '02-types.png'],
    ],
    '2': [
      ['/hr/settings/leave-types', '04-leave', '01-types.png'],
      ['/hr/leave-allocations', '04-leave', '02-allocations.png'],
      ['/hr/me/leave', '04-leave', '03-my-leave.png'],
      ['/attendance', '05-attendance', '01-main.png'],
      ['/attendance/live', '05-attendance', '02-live.png'],
      ['/attendance/reports', '05-attendance', '03-reports.png'],
      ['/attendance/corrections', '05-attendance', '04-corrections.png'],
      ['/hr/me/attendance', '05-attendance', '05-my-attendance.png'],
    ],
    '3': [
      ['/hr/payroll/salary-components', '06-salary', '01-components.png'],
      ['/hr/payroll/salary-structures', '06-salary', '02-structures.png'],
      ['/hr/payroll', '07-payroll', '01-periods.png'],
      ['/hr/me', '09-my-hr', '01-overview.png'],
      ['/hr/me/profile', '09-my-hr', '02-profile.png'],
      ['/hr/me/documents', '09-my-hr', '05-documents.png'],
      ['/hr/me/payslips', '09-my-hr', '06-payslips.png'],
    ],
    '4': [
      ['/hr/dashboard', '11-dashboard', '01-dashboard.png'],
      ['/hr/reports', '12-reports', '01-reports.png'],
      ['/dashboard', '14-regression', 'dashboard.png'],
      ['/users', '14-regression', 'users.png'],
      ['/projects', '14-regression', 'projects.png'],
      ['/tasks', '14-regression', 'tasks.png'],
    ],
  };

  const batchRoutes = routes[batch] || routes['1'];
  for (const [url, folder, name] of batchRoutes) {
    const r = await go(page, url, folder, name);
    console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${url}`);
  }

  await browser.close();
  console.log('BATCH DONE');
})();
