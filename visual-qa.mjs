import { chromium } from 'playwright';

const screenshots = [];
const findings = [];

async function takeScreenshot(page, name) {
  const path = `/home/z/my-project/download/rc-visual-qa-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push({ name, path });
  console.log(`📸 Screenshot: ${name} → ${path}`);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  // Step 1: Navigate to the app
  console.log('\n=== STEP 1: Navigate to http://localhost:3000 ===');
  try {
    await page.goto('http://localhost:3000', { timeout: 30000, waitUntil: 'networkidle' });
    await takeScreenshot(page, '01-homepage');
    console.log(`Current URL: ${page.url()}`);
    console.log(`Page title: ${await page.title()}`);
  } catch (e) {
    findings.push({ severity: 'CRITICAL', message: `Cannot load homepage: ${e.message}` });
    console.error('CRITICAL: Cannot load homepage:', e.message);
    // Try one more time with just domcontentloaded
    try {
      await page.goto('http://localhost:3000', { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await takeScreenshot(page, '01-homepage-retry');
    } catch (e2) {
      findings.push({ severity: 'CRITICAL', message: `Retry also failed: ${e2.message}` });
      console.error('Retry also failed');
      await browser.close();
      return;
    }
  }

  // Step 2: Look for Sign Up button and click it
  console.log('\n=== STEP 2: Click Sign Up ===');
  try {
    // Wait for the page to be interactive
    await page.waitForTimeout(2000);
    
    // Find and click Sign Up button
    const signUpBtn = page.locator('text=Sign Up').first();
    if (await signUpBtn.isVisible({ timeout: 5000 })) {
      await signUpBtn.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '02-signup-page');
      console.log(`After signup click URL: ${page.url()}`);
    } else {
      // Try alternative selectors
      const signUpLink = page.locator('a:has-text("Sign Up"), button:has-text("Sign Up"), [data-testid="signup"]').first();
      if (await signUpLink.isVisible({ timeout: 5000 })) {
        await signUpLink.click();
        await page.waitForTimeout(2000);
        await takeScreenshot(page, '02-signup-page-alt');
      } else {
        findings.push({ severity: 'MEDIUM', message: 'Sign Up button not found on homepage' });
        console.log('Sign Up button not found. Taking snapshot...');
        await takeScreenshot(page, '02-no-signup-btn');
      }
    }
  } catch (e) {
    findings.push({ severity: 'MEDIUM', message: `Error clicking Sign Up: ${e.message}` });
    console.log('Error clicking Sign Up:', e.message);
    await takeScreenshot(page, '02-signup-error');
  }

  // Step 3: Fill signup form
  console.log('\n=== STEP 3: Fill Signup Form ===');
  try {
    // Wait for form fields to be visible
    await page.waitForTimeout(1000);
    
    // Try to find and fill the name field
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i], input[placeholder*="Name"]').first();
    if (await nameField.isVisible({ timeout: 5000 })) {
      await nameField.fill('RC Test');
      console.log('✓ Filled name: RC Test');
    } else {
      console.log('⚠ Name field not found');
      findings.push({ severity: 'LOW', message: 'Name field not found on signup form' });
    }
    
    // Email field
    const emailField = page.locator('input[name="email"], input[type="email"], input[placeholder*="email" i]').first();
    if (await emailField.isVisible({ timeout: 5000 })) {
      await emailField.fill('rc-test-002@test.com');
      console.log('✓ Filled email: rc-test-002@test.com');
    } else {
      console.log('⚠ Email field not found');
      findings.push({ severity: 'MEDIUM', message: 'Email field not found on signup form' });
    }
    
    // Password field
    const passwordField = page.locator('input[name="password"], input[type="password"]').first();
    if (await passwordField.isVisible({ timeout: 5000 })) {
      await passwordField.fill('TestPass123!');
      console.log('✓ Filled password');
    } else {
      console.log('⚠ Password field not found');
      findings.push({ severity: 'MEDIUM', message: 'Password field not found on signup form' });
    }
    
    // Confirm password field
    const confirmField = page.locator('input[name="confirmPassword"], input[name="confirm_password"], input[placeholder*="confirm" i]').first();
    if (await confirmField.isVisible({ timeout: 5000 })) {
      await confirmField.fill('TestPass123!');
      console.log('✓ Filled confirm password');
    } else {
      console.log('⚠ Confirm password field not found');
      findings.push({ severity: 'LOW', message: 'Confirm password field not found (may not be required)' });
    }
    
    // Terms checkbox
    const termsCheckbox = page.locator('input[type="checkbox"], [role="checkbox"]').first();
    if (await termsCheckbox.isVisible({ timeout: 5000 })) {
      await termsCheckbox.check();
      console.log('✓ Checked terms checkbox');
    } else {
      console.log('⚠ Terms checkbox not found');
      findings.push({ severity: 'LOW', message: 'Terms checkbox not found' });
    }
    
    await takeScreenshot(page, '03-signup-form-filled');
  } catch (e) {
    findings.push({ severity: 'MEDIUM', message: `Error filling signup form: ${e.message}` });
    console.log('Error filling signup form:', e.message);
    await takeScreenshot(page, '03-signup-form-error');
  }

  // Step 4: Click Create Account
  console.log('\n=== STEP 4: Click Create Account ===');
  try {
    const createBtn = page.locator('button:has-text("Create Account"), button:has-text("Sign Up"), button[type="submit"]').first();
    if (await createBtn.isVisible({ timeout: 5000 })) {
      await createBtn.click();
      console.log('✓ Clicked Create Account button');
      
      // Wait for navigation or response
      await page.waitForTimeout(5000);
      await takeScreenshot(page, '04-after-create-account');
      console.log(`After create account URL: ${page.url()}`);
    } else {
      console.log('⚠ Create Account button not found');
      findings.push({ severity: 'MEDIUM', message: 'Create Account button not found' });
    }
  } catch (e) {
    findings.push({ severity: 'MEDIUM', message: `Error clicking Create Account: ${e.message}` });
    console.log('Error clicking Create Account:', e.message);
    await takeScreenshot(page, '04-create-account-error');
  }

  // Step 5: Check for email verification / dev OTP
  console.log('\n=== STEP 5: Check Email Verification / Dev OTP ===');
  try {
    const pageContent = await page.textContent('body');
    
    // Check for OTP/verification related text
    if (pageContent.includes('OTP') || pageContent.includes('verification') || pageContent.includes('verify')) {
      console.log('✓ Email verification page detected');
      
      // Try to find dev OTP
      const otpMatch = pageContent.match(/OTP[:\s]*(\d{4,6})/i) || pageContent.match(/code[:\s]*(\d{4,6})/i);
      if (otpMatch) {
        console.log(`✓ Dev OTP found: ${otpMatch[1]}`);
        findings.push({ severity: 'INFO', message: `Dev OTP displayed: ${otpMatch[1]}` });
      } else {
        console.log('⚠ No dev OTP displayed on page');
        findings.push({ severity: 'INFO', message: 'Email verification required but no dev OTP shown' });
      }
      
      await takeScreenshot(page, '05-email-verification');
    } else if (page.url().includes('dashboard') || page.url().includes('overview')) {
      console.log('✓ Redirected directly to dashboard (no email verification)');
      findings.push({ severity: 'INFO', message: 'No email verification required in dev mode' });
    } else {
      console.log(`Current page content preview: ${pageContent.substring(0, 200)}`);
      await takeScreenshot(page, '05-unknown-state');
    }
  } catch (e) {
    console.log('Error checking verification:', e.message);
  }

  // Step 6: If on verification page, try to proceed
  console.log('\n=== STEP 6: Try to Proceed to Dashboard ===');
  try {
    // Check if we need to enter OTP
    const otpInput = page.locator('input[name="otp"], input[placeholder*="OTP" i], input[placeholder*="code" i]').first();
    if (await otpInput.isVisible({ timeout: 3000 })) {
      // Try to find OTP from the page or use a dev OTP
      const pageContent = await page.textContent('body');
      const otpMatch = pageContent.match(/(\d{6})/);
      if (otpMatch) {
        await otpInput.fill(otpMatch[1]);
        console.log(`✓ Filled OTP: ${otpMatch[1]}`);
      }
      
      // Click verify button
      const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Submit"), button[type="submit"]').first();
      if (await verifyBtn.isVisible({ timeout: 3000 })) {
        await verifyBtn.click();
        await page.waitForTimeout(5000);
        await takeScreenshot(page, '06-after-otp-verify');
      }
    }
    
    // If we're still not on dashboard, try navigating directly
    if (!page.url().includes('dashboard')) {
      // Try the API approach - use the signup API directly
      console.log('Trying API-based signup flow...');
      const apiResponse = await page.request.post('http://localhost:3000/api/auth/signup', {
        data: {
          name: 'RC Test',
          email: 'rc-test-002@test.com',
          password: 'TestPass123!',
        }
      });
      
      const signupResult = await apiResponse.json();
      console.log(`Signup API response status: ${apiResponse.status()}`);
      
      if (signupResult.otp) {
        console.log(`✓ Dev OTP from API: ${signupResult.otp}`);
        findings.push({ severity: 'INFO', message: `Dev OTP returned from signup API: ${signupResult.otp}` });
      }
      
      if (apiResponse.ok()) {
        // Try to verify email if needed
        if (signupResult.otp) {
          const verifyResp = await page.request.post('http://localhost:3000/api/auth/verify-email', {
            data: { email: 'rc-test-002@test.com', otp: signupResult.otp }
          });
          console.log(`Verify email response: ${verifyResp.status()}`);
        }
        
        // Now sign in
        const signinResp = await page.request.post('http://localhost:3000/api/auth/signin', {
          data: { email: 'rc-test-002@test.com', password: 'TestPass123!' }
        });
        console.log(`Signin API response: ${signinResp.status()}`);
        
        // Navigate to the dashboard
        await page.goto('http://localhost:3000', { timeout: 15000, waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        await takeScreenshot(page, '06-dashboard-api-auth');
      }
    }
  } catch (e) {
    findings.push({ severity: 'MEDIUM', message: `Error during auth flow: ${e.message}` });
    console.log('Error during auth flow:', e.message);
  }

  // Step 7: Dashboard checks
  console.log('\n=== STEP 7: Dashboard Checks ===');
  try {
    if (page.url().includes('dashboard') || page.url().includes('overview') || page.url().includes('localhost:3000') && !page.url().includes('auth')) {
      await takeScreenshot(page, '07-dashboard');
      
      // Check profile menu / avatar
      console.log('Checking profile menu...');
      const avatar = page.locator('[data-testid="user-menu"], button:has(img), [class*="avatar"], [class*="Avatar"]').first();
      if (await avatar.isVisible({ timeout: 5000 })) {
        await avatar.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '07-profile-menu');
        console.log('✓ Profile menu opened');
        
        // Close the menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        console.log('⚠ Avatar/profile menu not found');
        findings.push({ severity: 'LOW', message: 'Profile menu/avatar not found on dashboard' });
      }
    } else {
      console.log(`Not on dashboard. Current URL: ${page.url()}`);
      findings.push({ severity: 'MEDIUM', message: `Could not reach dashboard. Current URL: ${page.url()}` });
    }
  } catch (e) {
    console.log('Error checking dashboard:', e.message);
  }

  // Step 8: Navigate between tabs
  console.log('\n=== STEP 8: Navigate Between Tabs ===');
  try {
    const tabs = ['Leads', 'Pipeline', 'Deals', 'Insights', 'Discover', 'Outreach', 'Assistant'];
    
    for (const tabName of tabs) {
      try {
        const tab = page.locator(`text="${tabName}"`).first();
        if (await tab.isVisible({ timeout: 2000 })) {
          await tab.click();
          await page.waitForTimeout(2000);
          await takeScreenshot(page, `08-tab-${tabName.toLowerCase()}`);
          console.log(`✓ Navigated to ${tabName} tab`);
        } else {
          console.log(`⚠ ${tabName} tab not visible`);
        }
      } catch (e) {
        console.log(`⚠ Error navigating to ${tabName}: ${e.message}`);
      }
    }
    
    // Go back to overview
    const overviewTab = page.locator('text="Overview"').first();
    if (await overviewTab.isVisible({ timeout: 2000 })) {
      await overviewTab.click();
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    console.log('Error navigating tabs:', e.message);
  }

  // Step 9: Check AI Chat Bubble
  console.log('\n=== STEP 9: Check AI Chat Bubble ===');
  try {
    const chatBubble = page.locator('[class*="chat-bubble"], [class*="ai-chat"], button[aria-label*="chat" i], [class*="floating"]').first();
    if (await chatBubble.isVisible({ timeout: 3000 })) {
      await chatBubble.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '09-ai-chat-open');
      console.log('✓ AI Chat bubble found and opened');
    } else {
      console.log('⚠ AI Chat bubble not found');
      findings.push({ severity: 'LOW', message: 'AI Chat bubble not found or not visible' });
    }
    
    // Close the chat
    const closeBtn = page.locator('button[aria-label*="close" i], button:has-text("Close")').first();
    if (await closeBtn.isVisible({ timeout: 2000 })) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log('Error checking AI chat bubble:', e.message);
  }

  // Step 10: Test mobile viewport
  console.log('\n=== STEP 10: Mobile Viewport Test ===');
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '10-mobile-viewport');
    console.log('✓ Mobile viewport screenshot taken');
    
    // Check mobile menu/hamburger
    const mobileMenu = page.locator('button[aria-label*="menu" i], [class*="hamburger"], svg[class*="menu"]').first();
    if (await mobileMenu.isVisible({ timeout: 3000 })) {
      await mobileMenu.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '10-mobile-menu');
      console.log('✓ Mobile menu opened');
    } else {
      console.log('⚠ Mobile menu button not found');
      findings.push({ severity: 'LOW', message: 'Mobile menu/hamburger button not found' });
    }
  } catch (e) {
    console.log('Error testing mobile viewport:', e.message);
    findings.push({ severity: 'LOW', message: `Mobile viewport test error: ${e.message}` });
  }

  // Collect console and page errors
  if (consoleErrors.length > 0) {
    findings.push({ severity: 'MEDIUM', message: `${consoleErrors.length} console errors detected` });
    consoleErrors.slice(0, 5).forEach(e => console.log(`  Console Error: ${e.substring(0, 200)}`));
  }
  if (pageErrors.length > 0) {
    findings.push({ severity: 'HIGH', message: `${pageErrors.length} page errors detected` });
    pageErrors.slice(0, 5).forEach(e => console.log(`  Page Error: ${e.substring(0, 200)}`));
  }

  // Summary
  console.log('\n=== VISUAL QA SUMMARY ===');
  console.log(`Screenshots taken: ${screenshots.length}`);
  console.log(`Findings: ${findings.length}`);
  findings.forEach((f, i) => {
    console.log(`  ${i+1}. [${f.severity}] ${f.message}`);
  });

  await browser.close();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
