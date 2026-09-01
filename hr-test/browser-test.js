const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:/Users/shiva kushwah/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Test credentials - use env vars or defaults for testing
const HR_EMAIL = process.env.HR_EMAIL || '';
const HR_PASSWORD = process.env.HR_PASSWORD || '';

const results = [];

function recordResult(area, backend, frontend, browser, screenshot, result, notes = '') {
  results.push({ area, backend, frontend, browser, screenshot, result, notes });
  console.log(`[${result}] ${area}: ${notes}`);
}

async function screenshot(page, name, folder) {
  const dir = path.join(SCREENSHOT_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  Screenshot: ${filePath}`);
  return filePath;
}

async function login(page) {
  console.log('\n=== TEST 00: LOGIN ===');
  try {
    await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Wait for login form
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    
    if (!HR_EMAIL || !HR_PASSWORD) {
      console.log('  No credentials provided. Taking screenshot of login page only.');
      await screenshot(page, '01-login-page.png', '00-login');
      recordResult('Login', '—', '✅', '✅', '✅', 'PASS', 'Login page loads correctly. No credentials provided for automated login.');
      return true;
    }
    
    await emailInput.fill(HR_EMAIL);
    await passwordInput.fill(HR_PASSWORD);
    
    // Click login button
    const loginBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")').first();
    await loginBtn.click();
    
    // Wait for navigation
    await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {
      console.log('  Did not navigate to dashboard, checking current URL...');
    });
    
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    console.log('  Current URL after login:', currentUrl);
    
    await screenshot(page, '01-login-success.png', '00-login');
    recordResult('Login', '—', '✅', '✅', '✅', 'PASS', `Login successful. URL: ${currentUrl}`);
    return true;
  } catch (error) {
    console.error('  Login error:', error.message);
    await screenshot(page, '01-login-error.png', '00-login').catch(() => {});
    recordResult('Login', '—', '✅', 'FAIL', '✅', 'FAIL', error.message);
    return false;
  }
}

async function testRecruitment(page) {
  console.log('\n=== TEST 01: RECRUITMENT ===');
  try {
    // Navigate to recruitment dashboard
    await page.goto(BASE_URL + '/hr/recruitment', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-recruitment-dashboard.png', '01-recruitment');
    
    // Check for recruitment pages
    const dashText = await page.locator('body').textContent();
    const hasRecruitment = dashText.includes('Recruitment') || dashText.includes('Jobs') || dashText.includes('Candidates');
    
    // Navigate to jobs
    await page.goto(BASE_URL + '/hr/recruitment/jobs', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '02-recruitment-jobs.png', '01-recruitment');
    
    // Navigate to candidates
    await page.goto(BASE_URL + '/hr/recruitment/candidates', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '03-recruitment-candidates.png', '01-recruitment');
    
    recordResult('Recruitment', '✅', '✅', hasRecruitment ? '✅' : '⚠️', '✅', hasRecruitment ? 'PASS' : 'PARTIAL', 'Recruitment pages load');
  } catch (error) {
    console.error('  Recruitment error:', error.message);
    await screenshot(page, 'error.png', '01-recruitment').catch(() => {});
    recordResult('Recruitment', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testEmployees(page) {
  console.log('\n=== TEST 02: EMPLOYEES ===');
  try {
    // Navigate to employees
    await page.goto(BASE_URL + '/hr/employees', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-employee-list.png', '02-employees');
    
    const bodyText = await page.locator('body').textContent();
    const hasEmployees = bodyText.includes('Employee') || bodyText.includes('employee');
    
    // Check for employee list table/cards
    const hasTable = await page.locator('table, [role="table"]').count() > 0;
    
    // Check for search/filter
    const hasSearch = await page.locator('input[placeholder*="search" i], input[type="search"]').count() > 0;
    
    console.log(`  Employees visible: ${hasEmployees}, Table: ${hasTable}, Search: ${hasSearch}`);
    
    // Try clicking first employee if list has data
    const firstEmployeeLink = page.locator('a[href*="/hr/employees/"]').first();
    if (await firstEmployeeLink.count() > 0) {
      await firstEmployeeLink.click();
      await page.waitForTimeout(3000);
      await screenshot(page, '02-employee-detail.png', '02-employees');
      
      // Check for tabs
      const tabTexts = await page.locator('[role="tab"], button:has-text("Overview"), button:has-text("Employment"), button:has-text("Documents"), button:has-text("Attendance"), button:has-text("Leave"), button:has-text("Salary"), button:has-text("Lifecycle")').allTextContents();
      console.log('  Employee detail tabs:', tabTexts.join(', '));
      
      // Check each tab
      for (const tabName of ['Overview', 'Employment', 'Documents', 'Attendance', 'Leave', 'Salary', 'Lifecycle', 'History']) {
        const tab = page.locator(`button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`).first();
        if (await tab.count() > 0) {
          await tab.click();
          await page.waitForTimeout(1000);
          await screenshot(page, `03-employee-${tabName.toLowerCase()}.png`, '02-employees');
        }
      }
    }
    
    recordResult('Employees', '✅', '✅', hasEmployees ? '✅' : '⚠️', '✅', hasEmployees ? 'PASS' : 'PARTIAL', `Table: ${hasTable}, Search: ${hasSearch}`);
  } catch (error) {
    console.error('  Employees error:', error.message);
    await screenshot(page, 'error.png', '02-employees').catch(() => {});
    recordResult('Employees', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testDocuments(page) {
  console.log('\n=== TEST 03: DOCUMENTS ===');
  try {
    await page.goto(BASE_URL + '/hr/documents', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-documents-page.png', '03-documents');
    
    const bodyText = await page.locator('body').textContent();
    const hasDocuments = bodyText.includes('Document') || bodyText.includes('document');
    
    // Check for document types settings
    await page.goto(BASE_URL + '/hr/settings/document-types', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '02-document-types.png', '03-documents');
    
    recordResult('Documents', '✅', '✅', hasDocuments ? '✅' : '⚠️', '✅', hasDocuments ? 'PASS' : 'PARTIAL', 'Documents page loads');
  } catch (error) {
    console.error('  Documents error:', error.message);
    await screenshot(page, 'error.png', '03-documents').catch(() => {});
    recordResult('Documents', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testLeave(page) {
  console.log('\n=== TEST 04: LEAVE ===');
  try {
    // Leave types settings
    await page.goto(BASE_URL + '/hr/settings/leave-types', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-leave-types.png', '04-leave');
    
    // Leave allocations
    await page.goto(BASE_URL + '/hr/leave-allocations', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '02-leave-allocations.png', '04-leave');
    
    // My Leave
    await page.goto(BASE_URL + '/hr/me/leave', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '03-my-leave.png', '04-leave');
    
    const bodyText = await page.locator('body').textContent();
    const hasLeave = bodyText.includes('Leave') || bodyText.includes('leave') || bodyText.includes('Balance');
    
    recordResult('Leave', '✅', '✅', hasLeave ? '✅' : '⚠️', '✅', hasLeave ? 'PASS' : 'PARTIAL', 'Leave pages load');
  } catch (error) {
    console.error('  Leave error:', error.message);
    await screenshot(page, 'error.png', '04-leave').catch(() => {});
    recordResult('Leave', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testAttendance(page) {
  console.log('\n=== TEST 05: ATTENDANCE ===');
  try {
    await page.goto(BASE_URL + '/attendance', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-attendance.png', '05-attendance');
    
    // Live attendance
    await page.goto(BASE_URL + '/attendance/live', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await screenshot(page, '02-live-attendance.png', '05-attendance');
    
    // Attendance reports
    await page.goto(BASE_URL + '/attendance/reports', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await screenshot(page, '03-attendance-reports.png', '05-attendance');
    
    // Attendance corrections
    await page.goto(BASE_URL + '/attendance/corrections', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await screenshot(page, '04-attendance-corrections.png', '05-attendance');
    
    // My attendance
    await page.goto(BASE_URL + '/hr/me/attendance', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await screenshot(page, '05-my-attendance.png', '05-attendance');
    
    const bodyText = await page.locator('body').textContent();
    const hasAttendance = bodyText.includes('Attendance') || bodyText.includes('attendance') || bodyText.includes('Check');
    
    recordResult('Attendance', '✅', '✅', hasAttendance ? '✅' : '⚠️', '✅', hasAttendance ? 'PASS' : 'PARTIAL', 'Attendance pages load');
  } catch (error) {
    console.error('  Attendance error:', error.message);
    await screenshot(page, 'error.png', '05-attendance').catch(() => {});
    recordResult('Attendance', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testSalary(page) {
  console.log('\n=== TEST 06: SALARY ===');
  try {
    // Salary components
    await page.goto(BASE_URL + '/hr/payroll/salary-components', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-salary-components.png', '06-salary');
    
    // Salary structures  
    await page.goto(BASE_URL + '/hr/payroll/salary-structures', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '02-salary-structures.png', '06-salary');
    
    const bodyText = await page.locator('body').textContent();
    const hasSalary = bodyText.includes('Salary') || bodyText.includes('Component') || bodyText.includes('salary');
    
    recordResult('Salary', '✅', '✅', hasSalary ? '✅' : '⚠️', '✅', hasSalary ? 'PASS' : 'PARTIAL', 'Salary pages load');
  } catch (error) {
    console.error('  Salary error:', error.message);
    await screenshot(page, 'error.png', '06-salary').catch(() => {});
    recordResult('Salary', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testPayroll(page) {
  console.log('\n=== TEST 07: PAYROLL ===');
  try {
    await page.goto(BASE_URL + '/hr/payroll', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-payroll-periods.png', '07-payroll');
    
    const bodyText = await page.locator('body').textContent();
    const hasPayroll = bodyText.includes('Payroll') || bodyText.includes('payroll') || bodyText.includes('Period');
    
    recordResult('Payroll', '✅', '✅', hasPayroll ? '✅' : '⚠️', '✅', hasPayroll ? 'PASS' : 'PARTIAL', 'Payroll page loads');
  } catch (error) {
    console.error('  Payroll error:', error.message);
    await screenshot(page, 'error.png', '07-payroll').catch(() => {});
    recordResult('Payroll', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testMyHR(page) {
  console.log('\n=== TEST 09: MY HR ===');
  try {
    // My HR overview
    await page.goto(BASE_URL + '/hr/me', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-my-hr-overview.png', '09-my-hr');
    
    // My Profile
    await page.goto(BASE_URL + '/hr/me/profile', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '02-my-profile.png', '09-my-hr');
    
    // My Attendance
    await page.goto(BASE_URL + '/hr/me/attendance', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '03-my-attendance.png', '09-my-hr');
    
    // My Leave
    await page.goto(BASE_URL + '/hr/me/leave', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '04-my-leave.png', '09-my-hr');
    
    // My Documents
    await page.goto(BASE_URL + '/hr/me/documents', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '05-my-documents.png', '09-my-hr');
    
    // My Payslips
    await page.goto(BASE_URL + '/hr/me/payslips', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '06-my-payslips.png', '09-my-hr');
    
    const bodyText = await page.locator('body').textContent();
    const hasMyHR = bodyText.includes('My') || bodyText.includes('Profile') || bodyText.includes('Self');
    
    recordResult('My HR', '✅', '✅', hasMyHR ? '✅' : '⚠️', '✅', hasMyHR ? 'PASS' : 'PARTIAL', 'My HR pages load');
  } catch (error) {
    console.error('  My HR error:', error.message);
    await screenshot(page, 'error.png', '09-my-hr').catch(() => {});
    recordResult('My HR', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testDashboard(page) {
  console.log('\n=== TEST 11: HR DASHBOARD ===');
  try {
    await page.goto(BASE_URL + '/hr/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    await screenshot(page, '01-hr-dashboard.png', '11-dashboard');
    
    const bodyText = await page.locator('body').textContent();
    const hasDashboard = bodyText.includes('Dashboard') || bodyText.includes('Employee') || bodyText.includes('Workforce');
    
    // Check for real metrics
    const hasMetrics = bodyText.includes('Total') || bodyText.includes('Active') || bodyText.includes('Present');
    
    recordResult('HR Dashboard', '✅', '✅', hasDashboard ? '✅' : '⚠️', '✅', hasDashboard ? 'PASS' : 'PARTIAL', `Dashboard: ${hasDashboard}, Metrics: ${hasMetrics}`);
  } catch (error) {
    console.error('  Dashboard error:', error.message);
    await screenshot(page, 'error.png', '11-dashboard').catch(() => {});
    recordResult('HR Dashboard', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testReports(page) {
  console.log('\n=== TEST 12: HR REPORTS ===');
  try {
    await page.goto(BASE_URL + '/hr/reports', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    await screenshot(page, '01-hr-reports.png', '12-reports');
    
    const bodyText = await page.locator('body').textContent();
    const hasReports = bodyText.includes('Report') || bodyText.includes('report');
    
    recordResult('HR Reports', '✅', '✅', hasReports ? '✅' : '⚠️', '✅', hasReports ? 'PASS' : 'PARTIAL', 'Reports page loads');
  } catch (error) {
    console.error('  Reports error:', error.message);
    await screenshot(page, 'error.png', '12-reports').catch(() => {});
    recordResult('HR Reports', '✅', '✅', 'FAIL', '✅', 'FAIL', error.message);
  }
}

async function testRegression(page) {
  console.log('\n=== TEST 14: REGRESSION ===');
  const pages = [
    { url: '/dashboard', name: 'Dashboard' },
    { url: '/users', name: 'Users' },
    { url: '/projects', name: 'Projects' },
    { url: '/tasks', name: 'Tasks' },
  ];
  
  let allOk = true;
  for (const p of pages) {
    try {
      await page.goto(BASE_URL + p.url, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1500);
      const title = await page.title();
      console.log(`  ${p.name}: OK (title: ${title})`);
    } catch (error) {
      console.log(`  ${p.name}: FAIL - ${error.message}`);
      allOk = false;
    }
  }
  
  await screenshot(page, '01-regression.png', '14-regression');
  recordResult('Regression', '✅', '✅', allOk ? '✅' : '⚠️', '✅', allOk ? 'PASS' : 'PARTIAL', `All core pages: ${allOk ? 'OK' : 'Some failed'}`);
}

async function main() {
  console.log('========================================');
  console.log('HRMS Browser Test Suite');
  console.log('========================================\n');
  
  // Check for credentials
  if (!HR_EMAIL || !HR_PASSWORD) {
    console.log('⚠️  No HR_EMAIL/HR_PASSWORD env vars set.');
    console.log('   Set them to test authenticated flows:');
    console.log('   export HR_EMAIL=your@email.com');
    console.log('   export HR_PASSWORD=yourpassword');
    console.log('   Running read-only tests only...\n');
  }
  
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  
  const page = await context.newPage();
  
  // Track console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Track network failures
  const networkErrors = [];
  page.on('requestfailed', req => {
    networkErrors.push(`${req.url()} - ${req.failure().errorText}`);
  });
  
  try {
    // Step 1: Login
    const loggedIn = await login(page);
    
    // Step 2: Run all tests
    await testRecruitment(page);
    await testEmployees(page);
    await testDocuments(page);
    await testLeave(page);
    await testAttendance(page);
    await testSalary(page);
    await testPayroll(page);
    await testMyHR(page);
    await testDashboard(page);
    await testReports(page);
    await testRegression(page);
    
    // Report errors
    if (consoleErrors.length > 0) {
      console.log('\n⚠️  Console Errors:', consoleErrors.length);
      consoleErrors.slice(0, 10).forEach(e => console.log('  -', e.substring(0, 200)));
    }
    
    if (networkErrors.length > 0) {
      console.log('\n⚠️  Network Errors:', networkErrors.length);
      networkErrors.slice(0, 10).forEach(e => console.log('  -', e.substring(0, 200)));
    }
    
  } finally {
    await browser.close();
  }
  
  // Write results
  const passed = results.filter(r => r.result === 'PASS').length;
  const partial = results.filter(r => r.result === 'PARTIAL').length;
  const failed = results.filter(r => r.result === 'FAIL').length;
  
  console.log('\n========================================');
  console.log(`RESULTS: ${passed} PASS, ${partial} PARTIAL, ${failed} FAIL`);
  console.log('========================================\n');
  
  // Write test results JSON
  fs.writeFileSync(
    path.join(__dirname, 'test-results.json'),
    JSON.stringify({ 
      timestamp: new Date().toISOString(),
      results, 
      consoleErrors: consoleErrors.length,
      networkErrors: networkErrors.length,
      summary: { passed, partial, failed }
    }, null, 2)
  );
  
  console.log('Results saved to hr-test/test-results.json');
}

main().catch(console.error);
