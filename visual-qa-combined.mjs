import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

const screenshots = [];
const findings = [];
const allErrors = [];

// Helper to make HTTP requests from Node.js
function nodeFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function takeScreenshot(page, name) {
  try {
    const path = `/home/z/my-project/download/rc-visual-qa-${name}.png`;
    await page.screenshot({ path, fullPage: false });
    screenshots.push({ name, path });
    console.log(`📸 Screenshot: ${name}`);
  } catch (e) {
    console.log(`⚠ Screenshot failed: ${e.message}`);
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // ==========================================
  // Pre-flight: Verify server accessibility from Node.js
  // ==========================================
  console.log('=== PRE-FLIGHT: Server Check ===');
  try {
    const check = await nodeFetch('http://localhost:3000/');
    console.log(`Server check: status=${check.status}, body length=${check.body.length}`);
    if (check.status !== 200) {
      console.error('Server not responding properly. Aborting browser tests.');
      findings.push({ severity: 'CRITICAL', message: `Server returned status ${check.status}` });
    }
  } catch (e) {
    console.error('Server not accessible from Node.js:', e.message);
    findings.push({ severity: 'CRITICAL', message: `Server not accessible: ${e.message}` });
  }

  // ==========================================
  // API-based tests (more reliable than browser)
  // ==========================================
  console.log('\n=== API TESTS ===');

  // Test 1: Health endpoint
  try {
    const health = await nodeFetch('http://localhost:3000/api/health');
    console.log(`Health API: ${health.status} - ${health.body.substring(0, 200)}`);
    if (health.status === 200) {
      findings.push({ severity: 'INFO', message: 'Health API working' });
    } else {
      findings.push({ severity: 'MEDIUM', message: `Health API returned ${health.status}` });
    }
  } catch (e) {
    findings.push({ severity: 'HIGH', message: `Health API failed: ${e.message}` });
  }

  // Test 2: Auth me endpoint (should be 401)
  try {
    const authMe = await nodeFetch('http://localhost:3000/api/auth/me');
    console.log(`Auth/me API: ${authMe.status}`);
    if (authMe.status === 401) {
      findings.push({ severity: 'INFO', message: 'Auth/me correctly returns 401 for unauthenticated users' });
    } else {
      findings.push({ severity: 'MEDIUM', message: `Auth/me returned unexpected status ${authMe.status}` });
    }
  } catch (e) {
    findings.push({ severity: 'HIGH', message: `Auth/me API failed: ${e.message}` });
  }

  // Test 3: Signup API
  let signupOtp = null;
  try {
    const signupData = JSON.stringify({
      name: 'RC Test',
      email: 'rc-test-002@test.com',
      password: 'TestPass123!',
    });
    const signup = await nodeFetch('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: signupData,
    });
    console.log(`Signup API: ${signup.status}`);
    const signupResp = JSON.parse(signup.body);
    console.log('Signup response keys:', Object.keys(signupResp));
    
    if (signup.status === 200 || signup.status === 201) {
      findings.push({ severity: 'INFO', message: 'Signup API working' });
      if (signupResp.otp) {
        signupOtp = signupResp.otp;
        console.log(`✓ Dev OTP from signup: ${signupOtp}`);
        findings.push({ severity: 'INFO', message: `Dev OTP returned: ${signupOtp} (FEATURE_RETURN_DEV_OTP working)` });
      } else if (signupResp.data?.otp) {
        signupOtp = signupResp.data.otp;
        console.log(`✓ Dev OTP from signup (nested): ${signupOtp}`);
        findings.push({ severity: 'INFO', message: `Dev OTP returned: ${signupOtp} (FEATURE_RETURN_DEV_OTP working)` });
      } else {
        console.log('⚠ No OTP in signup response');
        findings.push({ severity: 'INFO', message: 'No OTP returned in signup response - email verification may use different flow' });
      }
    } else if (signup.status === 409) {
      findings.push({ severity: 'INFO', message: 'User already exists (rc-test-002@test.com) - expected on re-run' });
    } else {
      findings.push({ severity: 'HIGH', message: `Signup API returned ${signup.status}: ${signup.body.substring(0, 200)}` });
    }
  } catch (e) {
    findings.push({ severity: 'HIGH', message: `Signup API error: ${e.message}` });
  }

  // Test 4: Verify email with OTP
  let emailVerified = false;
  if (signupOtp) {
    try {
      const verifyData = JSON.stringify({
        email: 'rc-test-002@test.com',
        otp: signupOtp,
      });
      const verify = await nodeFetch('http://localhost:3000/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: verifyData,
      });
      console.log(`Verify email API: ${verify.status}`);
      if (verify.status === 200) {
        emailVerified = true;
        findings.push({ severity: 'INFO', message: 'Email verification API working with dev OTP' });
      } else {
        findings.push({ severity: 'MEDIUM', message: `Email verification returned ${verify.status}: ${verify.body.substring(0, 200)}` });
      }
    } catch (e) {
      findings.push({ severity: 'MEDIUM', message: `Email verification error: ${e.message}` });
    }
  }

  // Test 5: Sign in
  let authCookies = null;
  try {
    const signinData = JSON.stringify({
      email: 'rc-test-002@test.com',
      password: 'TestPass123!',
    });
    
    // Use raw http to capture Set-Cookie headers
    const signin = await new Promise((resolve, reject) => {
      const req = http.request('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        const cookies = res.headers['set-cookie'];
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data, cookies }));
      });
      req.on('error', reject);
      req.write(signinData);
      req.end();
    });

    console.log(`Signin API: ${signin.status}`);
    if (signin.status === 200) {
      findings.push({ severity: 'INFO', message: 'Signin API working' });
      authCookies = signin.cookies;
      if (authCookies) {
        console.log(`✓ Auth cookies received: ${authCookies.length} cookie(s)`);
        findings.push({ severity: 'INFO', message: `Auth cookies set correctly (${authCookies.length} cookies)` });
      }
    } else {
      findings.push({ severity: 'HIGH', message: `Signin failed with ${signin.status}: ${signin.body.substring(0, 200)}` });
    }
  } catch (e) {
    findings.push({ severity: 'HIGH', message: `Signin API error: ${e.message}` });
  }

  // Test 6: Auth/me with cookies
  if (authCookies) {
    try {
      const cookieStr = authCookies.map(c => c.split(';')[0]).join('; ');
      const authMeResp = await new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3000/api/auth/me', {
          headers: { Cookie: cookieStr },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
      });
      console.log(`Auth/me (authenticated): ${authMeResp.status}`);
      if (authMeResp.status === 200) {
        const userData = JSON.parse(authMeResp.body);
        findings.push({ severity: 'INFO', message: `Auth/me returns user data: name=${userData.name || userData.data?.name}, email=${userData.email || userData.data?.email}, plan=${userData.plan || userData.data?.plan}` });
      }
    } catch (e) {
      findings.push({ severity: 'MEDIUM', message: `Auth/me (authenticated) error: ${e.message}` });
    }
  }

  // Test 7: Subscription and entitlements
  if (authCookies) {
    try {
      const cookieStr = authCookies.map(c => c.split(';')[0]).join('; ');
      const subResp = await new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3000/api/subscriptions/current', {
          headers: { Cookie: cookieStr },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
      });
      console.log(`Subscription current: ${subResp.status}`);
      findings.push({ severity: 'INFO', message: `Subscription API: status=${subResp.status}` });
    } catch (e) {
      findings.push({ severity: 'LOW', message: `Subscription API error: ${e.message}` });
    }

    try {
      const cookieStr = authCookies.map(c => c.split(';')[0]).join('; ');
      const entResp = await new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3000/api/subscriptions/entitlements', {
          headers: { Cookie: cookieStr },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
      });
      console.log(`Entitlements: ${entResp.status}`);
      if (entResp.status === 200) {
        const entData = JSON.parse(entResp.body);
        const enabledCount = Object.values(entData.entitlements || entData.data?.entitlements || {})
          .filter(v => v === true || v?.enabled === true).length;
        findings.push({ severity: 'INFO', message: `Entitlements: ${enabledCount} features enabled for free plan` });
      }
    } catch (e) {
      findings.push({ severity: 'LOW', message: `Entitlements API error: ${e.message}` });
    }
  }

  // Test 8: Payment endpoints
  if (authCookies) {
    try {
      const cookieStr = authCookies.map(c => c.split(';')[0]).join('; ');
      const addonsResp = await new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3000/api/payments/credit-addons', {
          headers: { Cookie: cookieStr },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
      });
      console.log(`Credit addons: ${addonsResp.status}`);
      findings.push({ severity: 'INFO', message: `Credit addons API: status=${addonsResp.status}` });
    } catch (e) {
      findings.push({ severity: 'LOW', message: `Credit addons error: ${e.message}` });
    }
  }

  // ==========================================
  // Browser-based Visual QA
  // ==========================================
  console.log('\n=== BROWSER VISUAL QA ===');

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
  } catch (e) {
    console.error('Cannot launch browser:', e.message);
    findings.push({ severity: 'HIGH', message: `Cannot launch browser: ${e.message}` });
    // Still output API test results
    printSummary();
    return;
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  // Set auth cookies if available
  if (authCookies) {
    for (const cookieStr of authCookies) {
      const parts = cookieStr.split(';')[0].split('=');
      const name = parts[0];
      const value = parts.slice(1).join('=');
      await context.addCookies([{
        name,
        value,
        domain: 'localhost',
        path: '/',
      }]);
    }
    console.log('✓ Auth cookies set in browser context');
  }

  page.on('console', msg => {
    if (msg.type() === 'error') allErrors.push({ type: 'console', message: msg.text().substring(0, 300) });
  });
  page.on('pageerror', err => {
    allErrors.push({ type: 'page', message: err.message.substring(0, 300) });
  });

  // STEP 1: Navigate to homepage
  console.log('\n--- Step 1: Homepage ---');
  try {
    await page.goto('http://localhost:3000', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await wait(8000); // Wait for JS to hydrate and render
    await takeScreenshot(page, '01-homepage');
    console.log(`URL: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);
    
    // Check if we're on the landing page or dashboard
    const bodyText = await page.textContent('body').catch(() => '');
    if (bodyText.includes('Dashboard') || bodyText.includes('Overview')) {
      findings.push({ severity: 'INFO', message: 'Landed on dashboard (authenticated session)' });
    } else if (bodyText.includes('Sign') || bodyText.includes('Login')) {
      findings.push({ severity: 'INFO', message: 'Landed on auth/landing page' });
    }
  } catch (e) {
    findings.push({ severity: 'CRITICAL', message: `Browser cannot connect to localhost:3000 - ${e.message}` });
    console.error('Browser connection failed:', e.message);
    
    // Try again with longer wait
    try {
      await wait(5000);
      await page.goto('http://localhost:3000', { timeout: 30000, waitUntil: 'domcontentloaded' });
      await wait(8000);
      await takeScreenshot(page, '01-homepage-retry');
      console.log('Retry succeeded!');
    } catch (e2) {
      findings.push({ severity: 'CRITICAL', message: `Browser retry also failed: ${e2.message}` });
      console.error('Browser retry also failed');
    }
  }

  // Continue browser tests only if we have a working page
  const currentUrl = page.url();
  if (currentUrl.includes('localhost:3000')) {
    
    // STEP 2: Sign Up flow (if on landing page)
    console.log('\n--- Step 2: Sign Up Flow ---');
    try {
      const isOnAuthPage = await page.locator('text=Sign Up, text=Sign up, text=Create Account').first().isVisible({ timeout: 3000 }).catch(() => false);
      
      if (isOnAuthPage || !currentUrl.includes('dashboard')) {
        // Try to click Sign Up
        const signUpClicked = await safeClick(page, 'text=Sign Up', 'Sign Up button') ||
                              await safeClick(page, 'text=Sign up', 'Sign up button') ||
                              await safeClick(page, 'a:has-text("Sign Up")', 'Sign Up link');
        
        if (signUpClicked) {
          await wait(3000);
          await takeScreenshot(page, '02-signup-page');
        }
        
        // Fill the form
        await safeFill(page, 'input[name="name"], input[placeholder*="name" i]', 'RC Test', 'Name');
        await safeFill(page, 'input[name="email"], input[type="email"]', 'rc-test-002@test.com', 'Email');
        await safeFill(page, 'input[name="password"], input[type="password"]', 'TestPass123!', 'Password');
        
        // Confirm password if field exists
        const confirmField = page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first();
        if (await confirmField.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmField.fill('TestPass123!');
          console.log('✓ Filled confirm password');
        }
        
        // Check terms checkbox
        const checkbox = page.locator('input[type="checkbox"], [role="checkbox"]').first();
        if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          await checkbox.click();
          console.log('✓ Checked terms');
        }
        
        await wait(1000);
        await takeScreenshot(page, '03-signup-form-filled');
        
        // Click Create Account
        const createClicked = await safeClick(page, 'button:has-text("Create Account")', 'Create Account') ||
                              await safeClick(page, 'button[type="submit"]', 'Submit');
        
        if (createClicked) {
          await wait(5000);
          await takeScreenshot(page, '04-after-create-account');
          console.log(`After create URL: ${page.url()}`);
        }
        
        // Check for OTP
        const pageContent = await page.textContent('body').catch(() => '');
        if (pageContent.includes('OTP') || pageContent.includes('verification') || pageContent.includes('verify')) {
          console.log('✓ Email verification page detected');
          const otpMatch = pageContent.match(/(\d{6})/);
          if (otpMatch) {
            findings.push({ severity: 'INFO', message: `Dev OTP shown on page: ${otpMatch[1]}` });
          }
          await takeScreenshot(page, '05-email-verification');
        }
      }
    } catch (e) {
      console.log('Sign up flow error:', e.message);
    }
    
    // STEP 3: Dashboard checks
    console.log('\n--- Step 3: Dashboard ---');
    try {
      // Navigate to dashboard if not already there
      if (!page.url().includes('dashboard') && !page.url().includes('overview')) {
        // We might need to sign in via the page
        const bodyText = await page.textContent('body').catch(() => '');
        if (bodyText.includes('Sign In') || bodyText.includes('Email')) {
          // Try signing in via the form
          await safeFill(page, 'input[name="email"], input[type="email"]', 'rc-test-002@test.com', 'Signin Email');
          await safeFill(page, 'input[name="password"], input[type="password"]', 'TestPass123!', 'Signin Password');
          await safeClick(page, 'button:has-text("Sign In"), button[type="submit"]', 'Sign In');
          await wait(5000);
        }
        
        // Try navigating to dashboard directly
        if (!page.url().includes('localhost:3000') || page.url().includes('auth')) {
          await page.goto('http://localhost:3000', { timeout: 15000, waitUntil: 'domcontentloaded' });
          await wait(5000);
        }
      }
      
      await takeScreenshot(page, '06-dashboard');
      console.log(`Dashboard URL: ${page.url()}`);
    } catch (e) {
      console.log('Dashboard navigation error:', e.message);
    }
    
    // STEP 4: Profile menu
    console.log('\n--- Step 4: Profile Menu ---');
    try {
      if (page.url().includes('localhost:3000')) {
        // Look for any avatar or profile button
        const avatarSelectors = [
          'button:has(img)',
          '[class*="avatar"]',
          '[class*="Avatar"]',
          '[class*="user-menu"]',
          '[class*="profile"]',
          '[data-testid="user-menu"]',
        ];
        
        for (const sel of avatarSelectors) {
          try {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 2000 })) {
              await el.click();
              await wait(1000);
              await takeScreenshot(page, '07-profile-menu');
              console.log(`✓ Opened profile menu with: ${sel}`);
              break;
            }
          } catch (e) {
            // continue
          }
        }
        
        await page.keyboard.press('Escape');
        await wait(500);
      }
    } catch (e) {
      console.log('Profile menu error:', e.message);
    }
    
    // STEP 5: Navigate tabs
    console.log('\n--- Step 5: Navigate Tabs ---');
    try {
      const tabNames = ['Overview', 'Leads', 'Pipeline', 'Deals', 'Insights', 'Discover', 'Outreach', 'Assistant'];
      for (const tabName of tabNames) {
        try {
          // Try clicking the tab text
          const tab = page.locator(`text="${tabName}"`).first();
          if (await tab.isVisible({ timeout: 2000 })) {
            await tab.click();
            await wait(3000);
            await takeScreenshot(page, `08-tab-${tabName.toLowerCase()}`);
            console.log(`✓ Tab: ${tabName}`);
          }
        } catch (e) {
          console.log(`⚠ Tab ${tabName} not found`);
        }
      }
    } catch (e) {
      console.log('Tab navigation error:', e.message);
    }
    
    // STEP 6: AI Chat Bubble
    console.log('\n--- Step 6: AI Chat Bubble ---');
    try {
      // Look for floating chat elements
      const chatSelectors = [
        'button[aria-label*="chat" i]',
        'button[aria-label*="AI" i]',
        '[class*="chat-bubble"]',
        '[class*="ai-chat"]',
      ];
      
      for (const sel of chatSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            await el.click();
            await wait(2000);
            await takeScreenshot(page, '09-ai-chat');
            console.log(`✓ AI Chat opened with: ${sel}`);
            break;
          }
        } catch (e) {
          // continue
        }
      }
      
      await page.keyboard.press('Escape');
      await wait(500);
    } catch (e) {
      console.log('AI Chat error:', e.message);
    }
    
    // STEP 7: Mobile viewport
    console.log('\n--- Step 7: Mobile Viewport ---');
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await wait(3000);
      await takeScreenshot(page, '10-mobile-viewport');
      console.log('✓ Mobile viewport screenshot taken');
      
      // Look for mobile menu
      const mobileMenu = page.locator('button[aria-label*="menu" i], [class*="hamburger"]').first();
      if (await mobileMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
        await mobileMenu.click();
        await wait(2000);
        await takeScreenshot(page, '10-mobile-menu');
        console.log('✓ Mobile menu opened');
      }
      
      // Reset viewport
      await page.setViewportSize({ width: 1440, height: 900 });
      await wait(2000);
    } catch (e) {
      console.log('Mobile viewport error:', e.message);
    }
  } else {
    findings.push({ severity: 'HIGH', message: 'Browser-based visual QA could not be performed - page not loaded' });
  }

  await browser.close();

  // ==========================================
  // Print Summary
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('VISUAL QA TEST REPORT');
  console.log('='.repeat(70));
  
  console.log(`\n📊 Screenshots: ${screenshots.length}`);
  screenshots.forEach(s => console.log(`   ${s.name}: ${s.path}`));
  
  console.log(`\n📋 Findings: ${findings.length}`);
  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const high = findings.filter(f => f.severity === 'HIGH');
  const medium = findings.filter(f => f.severity === 'MEDIUM');
  const low = findings.filter(f => f.severity === 'LOW');
  const info = findings.filter(f => f.severity === 'INFO');
  
  if (critical.length) { console.log(`\n🔴 CRITICAL (${critical.length}):`); critical.forEach(f => console.log(`   - ${f.message}`)); }
  if (high.length) { console.log(`\n🟠 HIGH (${high.length}):`); high.forEach(f => console.log(`   - ${f.message}`)); }
  if (medium.length) { console.log(`\n🟡 MEDIUM (${medium.length}):`); medium.forEach(f => console.log(`   - ${f.message}`)); }
  if (low.length) { console.log(`\n🔵 LOW (${low.length}):`); low.forEach(f => console.log(`   - ${f.message}`)); }
  if (info.length) { console.log(`\nℹ️  INFO (${info.length}):`); info.forEach(f => console.log(`   - ${f.message}`)); }
  
  console.log(`\n🐛 Browser Errors: ${allErrors.length}`);
  allErrors.slice(0, 10).forEach(e => console.log(`   [${e.type}] ${e.message.substring(0, 150)}`));
  
  // Write findings to a JSON file for later use
  const report = {
    timestamp: new Date().toISOString(),
    screenshots,
    findings,
    browserErrors: allErrors,
  };
  fs.writeFileSync('/home/z/my-project/download/rc-visual-qa-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Report saved to /home/z/my-project/download/rc-visual-qa-report.json');
}

async function safeClick(page, selector, description) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 })) {
      await el.click();
      console.log(`✓ Clicked: ${description}`);
      return true;
    }
  } catch (e) { /* not found */ }
  return false;
}

async function safeFill(page, selector, value, description) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 })) {
      await el.fill(value);
      console.log(`✓ Filled: ${description}`);
      return true;
    }
  } catch (e) { /* not found */ }
  return false;
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
