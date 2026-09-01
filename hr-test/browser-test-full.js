const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Users/shiva kushwah/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';
const SDIR = path.join(__dirname, 'screenshots');
const results = [];

async function ss(page, file, folder) {
  const dir = path.join(SDIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, file);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function go(page, url, folder, name) {
  try {
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 12000 });
    await page.waitForTimeout(1500);
    const p = await ss(page, name, folder);
    const text = await page.locator('body').textContent();
    return { ok: true, text, screenshot: p };
  } catch(e) {
    return { ok: false, text: '', error: e.message };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  
  // === LOGIN ===
  console.log('TEST 00: LOGIN');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill('hr.admin@example.com');
  await page.locator('input[type="password"]').first().fill('Demo@123456');
  await page.locator('button[type="submit"]').first().click();
  try { await page.waitForURL('**/dashboard**', { timeout: 15000 }); } catch(e) {}
  await page.waitForTimeout(2000);
  const afterLogin = page.url();
  await ss(page, '01-login-success.png', '00-login');
  const loginOk = afterLogin.includes('dashboard');
  console.log(`  Login URL: ${afterLogin} → ${loginOk ? 'PASS' : 'FAIL'}`);
  results.push({ area: 'Login', result: loginOk ? 'PASS' : 'FAIL', notes: afterLogin });

  // === TEST 01: RECRUITMENT ===
  console.log('TEST 01: RECRUITMENT');
  let r = await go(page, '/hr/recruitment', '01-recruitment', '01-dashboard.png');
  const recDash = r.ok;
  r = await go(page, '/hr/recruitment/jobs', '01-recruitment', '02-jobs.png');
  const recJobs = r.ok;
  r = await go(page, '/hr/recruitment/candidates', '01-recruitment', '03-candidates.png');
  const recCands = r.ok;
  r = await go(page, '/hr/recruitment/offers', '01-recruitment', '04-offers.png');
  const recOffers = r.ok;
  r = await go(page, '/hr/recruitment/interviews', '01-recruitment', '05-interviews.png');
  const recInterviews = r.ok;
  const recAll = recDash && recJobs && recCands && recOffers && recInterviews;
  console.log(`  Dashboard:${recDash} Jobs:${recJobs} Candidates:${recCands} Offers:${recOffers} Interviews:${recInterviews}`);
  results.push({ area: 'Recruitment', result: recAll ? 'PASS' : 'PARTIAL', notes: `dash:${recDash} jobs:${recJobs} cands:${recCands} offers:${recOffers} interviews:${recInterviews}` });

  // === TEST 02: EMPLOYEES ===
  console.log('TEST 02: EMPLOYEES');
  r = await go(page, '/hr/employees', '02-employees', '01-list.png');
  const empList = r.ok;
  // Check for employee links
  const empLinks = await page.locator('a[href*="/hr/employees/"]').count();
  console.log(`  Employee links found: ${empLinks}`);
  if (empLinks > 0) {
    const href = await page.locator('a[href*="/hr/employees/"]').first().getAttribute('href');
    console.log(`  Clicking first employee: ${href}`);
    r = await go(page, href, '02-employees', '02-detail.png');
    // Check tabs
    const tabs = ['Overview', 'Employment', 'Documents', 'Attendance', 'Leave', 'Salary', 'Lifecycle'];
    for (const t of tabs) {
      const tab = page.locator(`button:has-text("${t}"), [role="tab"]:has-text("${t}")`).first();
      if (await tab.count() > 0) {
        await tab.click();
        await page.waitForTimeout(1000);
        await ss(page, `03-${t.toLowerCase()}.png`, '02-employees');
      }
    }
  }
  results.push({ area: 'Employees', result: empList ? 'PASS' : 'FAIL', notes: `list:${empList} links:${empLinks}` });

  // === TEST 03: DOCUMENTS ===
  console.log('TEST 03: DOCUMENTS');
  r = await go(page, '/hr/documents', '03-documents', '01-list.png');
  const docList = r.ok;
  r = await go(page, '/hr/settings/document-types', '03-documents', '02-types.png');
  const docTypes = r.ok;
  results.push({ area: 'Documents', result: (docList && docTypes) ? 'PASS' : 'PARTIAL', notes: `list:${docList} types:${docTypes}` });

  // === TEST 04: LEAVE ===
  console.log('TEST 04: LEAVE');
  r = await go(page, '/hr/settings/leave-types', '04-leave', '01-types.png');
  const leaveTypes = r.ok;
  r = await go(page, '/hr/leave-allocations', '04-leave', '02-allocations.png');
  const leaveAlloc = r.ok;
  r = await go(page, '/hr/me/leave', '04-leave', '03-my-leave.png');
  const myLeave = r.ok;
  results.push({ area: 'Leave', result: (leaveTypes && leaveAlloc && myLeave) ? 'PASS' : 'PARTIAL', notes: `types:${leaveTypes} alloc:${leaveAlloc} myLeave:${myLeave}` });

  // === TEST 05: ATTENDANCE ===
  console.log('TEST 05: ATTENDANCE');
  r = await go(page, '/attendance', '05-attendance', '01-main.png');
  const attMain = r.ok;
  r = await go(page, '/attendance/live', '05-attendance', '02-live.png');
  const attLive = r.ok;
  r = await go(page, '/attendance/reports', '05-attendance', '03-reports.png');
  const attReports = r.ok;
  r = await go(page, '/attendance/corrections', '05-attendance', '04-corrections.png');
  const attCorr = r.ok;
  r = await go(page, '/hr/me/attendance', '05-attendance', '05-my-attendance.png');
  const myAtt = r.ok;
  results.push({ area: 'Attendance', result: attMain ? 'PASS' : 'PARTIAL', notes: `main:${attMain} live:${attLive} reports:${attReports} corrections:${attCorr} myAtt:${myAtt}` });

  // === TEST 06: SALARY ===
  console.log('TEST 06: SALARY');
  r = await go(page, '/hr/payroll/salary-components', '06-salary', '01-components.png');
  const salComp = r.ok;
  r = await go(page, '/hr/payroll/salary-structures', '06-salary', '02-structures.png');
  const salStruct = r.ok;
  results.push({ area: 'Salary', result: (salComp && salStruct) ? 'PASS' : 'PARTIAL', notes: `components:${salComp} structures:${salStruct}` });

  // === TEST 07: PAYROLL ===
  console.log('TEST 07: PAYROLL');
  r = await go(page, '/hr/payroll', '07-payroll', '01-periods.png');
  const payPeriods = r.ok;
  results.push({ area: 'Payroll', result: payPeriods ? 'PASS' : 'FAIL', notes: `periods:${payPeriods}` });

  // === TEST 09: MY HR ===
  console.log('TEST 09: MY HR');
  r = await go(page, '/hr/me', '09-my-hr', '01-overview.png');
  const myHROverview = r.ok;
  r = await go(page, '/hr/me/profile', '09-my-hr', '02-profile.png');
  const myProfile = r.ok;
  r = await go(page, '/hr/me/attendance', '09-my-hr', '03-attendance.png');
  const myHRAtt = r.ok;
  r = await go(page, '/hr/me/leave', '09-my-hr', '04-leave.png');
  const myHRLeave = r.ok;
  r = await go(page, '/hr/me/documents', '09-my-hr', '05-documents.png');
  const myHRDocs = r.ok;
  r = await go(page, '/hr/me/payslips', '09-my-hr', '06-payslips.png');
  const myHRPayslips = r.ok;
  const myHROk = myHROverview && myProfile && myHRAtt && myHRLeave && myHRDocs && myHRPayslips;
  console.log(`  Overview:${myHROverview} Profile:${myProfile} Att:${myHRAtt} Leave:${myHRLeave} Docs:${myHRDocs} Payslips:${myHRPayslips}`);
  results.push({ area: 'My HR', result: myHROk ? 'PASS' : 'PARTIAL', notes: `ov:${myHROverview} prof:${myProfile} att:${myHRAtt} leave:${myHRLeave} docs:${myHRDocs} pays:${myHRPayslips}` });

  // === TEST 10: LIFECYCLE ===
  console.log('TEST 10: LIFECYCLE');
  // Lifecycle is on employee detail page
  const empLinks2 = await page.locator('a[href*="/hr/employees/"]').count();
  if (empLinks2 > 0) {
    const href = await page.locator('a[href*="/hr/employees/"]').first().getAttribute('href');
    await page.goto(BASE + href, { waitUntil: 'networkidle', timeout: 12000 });
    await page.waitForTimeout(1500);
    const lifeTab = page.locator('button:has-text("Lifecycle"), button:has-text("History"), [role="tab"]:has-text("Lifecycle")').first();
    if (await lifeTab.count() > 0) {
      await lifeTab.click();
      await page.waitForTimeout(1500);
      await ss(page, '01-lifecycle.png', '10-lifecycle');
      results.push({ area: 'Lifecycle', result: 'PASS', notes: 'Lifecycle tab found and rendered' });
    } else {
      results.push({ area: 'Lifecycle', result: 'PARTIAL', notes: 'No lifecycle tab found on employee detail' });
    }
  } else {
    results.push({ area: 'Lifecycle', result: 'FAIL', notes: 'No employees found for lifecycle test' });
  }

  // === TEST 11: HR DASHBOARD ===
  console.log('TEST 11: HR DASHBOARD');
  r = await go(page, '/hr/dashboard', '11-dashboard', '01-dashboard.png');
  const dashOk = r.ok;
  const hasMetrics = r.text.includes('Total') || r.text.includes('Active') || r.text.includes('Present') || r.text.includes('Employee');
  console.log(`  Dashboard:${dashOk} Metrics:${hasMetrics}`);
  results.push({ area: 'HR Dashboard', result: dashOk ? 'PASS' : 'FAIL', notes: `loaded:${dashOk} metrics:${hasMetrics}` });

  // === TEST 12: HR REPORTS ===
  console.log('TEST 12: HR REPORTS');
  r = await go(page, '/hr/reports', '12-reports', '01-reports.png');
  const reportsOk = r.ok;
  results.push({ area: 'HR Reports', result: reportsOk ? 'PASS' : 'FAIL', notes: `loaded:${reportsOk}` });

  // === TEST 14: REGRESSION ===
  console.log('TEST 14: REGRESSION');
  const regPages = ['/dashboard', '/users', '/projects', '/tasks'];
  let regOk = true;
  for (const p of regPages) {
    r = await go(page, p, '14-regression', `${p.replace(/\//g, '-')}.png`);
    if (!r.ok) regOk = false;
  }
  results.push({ area: 'Regression', result: regOk ? 'PASS' : 'PARTIAL', notes: `allPages:${regOk}` });

  // === SUMMARY ===
  await browser.close();
  
  const passed = results.filter(r => r.result === 'PASS').length;
  const partial = results.filter(r => r.result === 'PARTIAL').length;
  const failed = results.filter(r => r.result === 'FAIL').length;
  
  console.log('\n========================================');
  console.log(`FINAL: ${passed} PASS, ${partial} PARTIAL, ${failed} FAIL out of ${results.length}`);
  console.log('========================================');
  results.forEach(r => console.log(`  [${r.result}] ${r.area}: ${r.notes}`));
  
  fs.writeFileSync(path.join(__dirname, 'test-results.json'), JSON.stringify({ timestamp: new Date().toISOString(), results, summary: { passed, partial, failed } }, null, 2));
  console.log('\nResults saved to hr-test/test-results.json');
})();
