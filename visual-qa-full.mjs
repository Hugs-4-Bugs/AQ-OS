import { chromium } from 'playwright';

const screenshots = [];
const findings = [];
const errors = [];

async function takeScreenshot(page, name) {
  try {
    const path = `/home/z/my-project/download/rc-visual-qa-${name}.png`;
    await page.screenshot({ path, fullPage: false });
    screenshots.push({ name, path });
    console.log(`📸 Screenshot: ${name}`);
  } catch (e) {
    console.log(`⚠ Screenshot failed for ${name}: ${e.message}`);
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeClick(page, selector, description) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 5000 })) {
      await el.click();
      console.log(`✓ Clicked: ${description}`);
      return true;
    } else {
      console.log(`⚠ Not visible: ${description}`);
      return false;
    }
  } catch (e) {
    console.log(`⚠ Error clicking ${description}: ${e.message}`);
    return false;
  }
}

async function safeFill(page, selector, value, description) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 5000 })) {
      await el.fill(value);
      console.log(`✓ Filled: ${description}`);
      return true;
    } else {
      console.log(`⚠ Not visible: ${description}`);
      return false;
    }
  } catch (e) {
    console.log(`⚠ Error filling ${description}: ${e.message}`);
    return false;
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  // Collect console and page errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console', message: msg.text().substring(0, 300) });
    }
  });
  page.on('pageerror', err => {
    errors.push({ type: 'page', message: err.message.substring(0, 300) });
  });

  // ==========================================
  // STEP 1: Navigate to the app
  // ==========================================
  console.log('\n=== STEP 1: Navigate to http://localhost:3000 ===');
  try {
    await page.goto('http://localhost:3000', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await wait(5000);
    await takeScreenshot(page, '01-homepage');
    console.log(`URL: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);
  } catch (e) {
    findings.push({ severity: 'CRITICAL', message: `Cannot load homepage: ${e.message}` });
    console.error('CRITICAL: Cannot load homepage:', e.message);
  }

  // ==========================================
  // STEP 2: Find and click Sign Up
  // ==========================================
  console.log('\n=== STEP 2: Click Sign Up ===');
  try {
    // Try various selectors for Sign Up
    const signUpSelectors = [
      'a:has-text("Sign Up")',
      'button:has-text("Sign Up")',
      'a:has-text("Sign up")',
      'button:has-text("Sign up")',
      'text=Sign Up',
      'text=Sign up',
      'a[href*="signup"]',
      'a[href*="sign-up"]',
    ];

    let clicked = false;
    for (const sel of signUpSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          clicked = true;
          console.log(`✓ Clicked Sign Up using selector: ${sel}`);
          break;
        }
      } catch (e) {
        // continue trying
      }
    }

    if (!clicked) {
      findings.push({ severity: 'MEDIUM', message: 'Sign Up button not found on homepage' });
      console.log('⚠ Sign Up button not found');

      // Check what's on the page
      const bodyText = await page.textContent('body').catch(() => '');
      console.log('Page text preview:', bodyText.substring(0, 300));
    }

    await wait(3000);
    await takeScreenshot(page, '02-signup-page');
    console.log(`URL after signup click: ${page.url()}`);
  } catch (e) {
    findings.push({ severity: 'MEDIUM', message: `Error clicking Sign Up: ${e.message}` });
  }

  // ==========================================
  // STEP 3: Fill signup form
  // ==========================================
  console.log('\n=== STEP 3: Fill Signup Form ===');
  try {
    await wait(2000);

    // Name field
    const nameSelectors = [
      'input[name="name"]',
      'input[placeholder*="name" i]',
      'input[placeholder*="Name"]',
      'input[id*="name" i]',
      'input[aria-label*="name" i]',
    ];
    let nameFilled = false;
    for (const sel of nameSelectors) {
      if (await safeFill(page, sel, 'RC Test', 'Name')) {
        nameFilled = true;
        break;
      }
    }
    if (!nameFilled) {
      findings.push({ severity: 'LOW', message: 'Name field not found on signup form' });
    }

    // Email field
    const emailSelectors = [
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[id*="email" i]',
    ];
    let emailFilled = false;
    for (const sel of emailSelectors) {
      if (await safeFill(page, sel, 'rc-test-002@test.com', 'Email')) {
        emailFilled = true;
        break;
      }
    }
    if (!emailFilled) {
      findings.push({ severity: 'MEDIUM', message: 'Email field not found on signup form' });
    }

    // Password field
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="password" i]',
    ];
    let passwordFilled = false;
    for (const sel of passwordSelectors) {
      if (await safeFill(page, sel, 'TestPass123!', 'Password')) {
        passwordFilled = true;
        break;
      }
    }
    if (!passwordFilled) {
      findings.push({ severity: 'MEDIUM', message: 'Password field not found on signup form' });
    }

    // Confirm password
    const confirmSelectors = [
      'input[name="confirmPassword"]',
      'input[name="confirm_password"]',
      'input[name="passwordConfirm"]',
      'input[placeholder*="confirm" i]',
    ];
    let confirmFilled = false;
    for (const sel of confirmSelectors) {
      if (await safeFill(page, sel, 'TestPass123!', 'Confirm Password')) {
        confirmFilled = true;
        break;
      }
    }
    if (!confirmFilled) {
      findings.push({ severity: 'LOW', message: 'Confirm password field not found (may not be required)' });
    }

    // Terms checkbox
    const termsSelectors = [
      'input[type="checkbox"]',
      '[role="checkbox"]',
      'button[role="checkbox"]',
    ];
    for (const sel of termsSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          console.log('✓ Checked terms checkbox');
          break;
        }
      } catch (e) {
        // continue
      }
    }

    await wait(1000);
    await takeScreenshot(page, '03-signup-form-filled');
  } catch (e) {
    findings.push({ severity: 'MEDIUM', message: `Error filling signup form: ${e.message}` });
  }

  // ==========================================
  // STEP 4: Click Create Account
  // ==========================================
  console.log('\n=== STEP 4: Click Create Account ===');
  try {
    const createSelectors = [
      'button:has-text("Create Account")',
      'button:has-text("Sign Up")',
      'button:has-text("Sign up")',
      'button[type="submit"]',
      'button:has-text("Register")',
    ];

    let clicked = false;
    for (const sel of createSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          clicked = true;
          console.log(`✓ Clicked Create Account using: ${sel}`);
          break;
        }
      } catch (e) {
        // continue
      }
    }

    if (!clicked) {
      findings.push({ severity: 'MEDIUM', message: 'Create Account button not found' });
    }

    await wait(5000);
    await takeScreenshot(page, '04-after-create-account');
    console.log(`URL after create: ${page.url()}`);
  } catch (e) {
    findings.push({ severity: 'MEDIUM', message: `Error clicking Create Account: ${e.message}` });
  }

  // ==========================================
  // STEP 5: Check for email verification / dev OTP
  // ==========================================
  console.log('\n=== STEP 5: Check Email Verification / Dev OTP ===');
  try {
    const pageContent = await page.textContent('body').catch(() => '');
    const currentUrl = page.url();

    if (pageContent.includes('OTP') || pageContent.includes('verification') || pageContent.includes('verify') || currentUrl.includes('verify')) {
      console.log('✓ Email verification page detected');

      // Try to find dev OTP
      const otpPatterns = [
        /OTP[:\s]*(\d{4,6})/i,
        /code[:\s]*(\d{4,6})/i,
        /(\d{6})/,  // Just a 6-digit number
      ];

      let otp = null;
      for (const pattern of otpPatterns) {
        const match = pageContent.match(pattern);
        if (match) {
          otp = match[1];
          console.log(`✓ Dev OTP found: ${otp}`);
          findings.push({ severity: 'INFO', message: `Dev OTP displayed on page: ${otp}` });
          break;
        }
      }

      if (!otp) {
        console.log('⚠ No dev OTP found on page');
        findings.push({ severity: 'INFO', message: 'Email verification required but no dev OTP shown on page' });
      }

      await takeScreenshot(page, '05-email-verification');
    } else if (currentUrl.includes('dashboard') || currentUrl.includes('overview')) {
      console.log('✓ Redirected directly to dashboard (no email verification)');
      findings.push({ severity: 'INFO', message: 'No email verification required - went straight to dashboard' });
    } else {
      console.log(`Current state - URL: ${currentUrl}`);
      console.log(`Page content preview: ${pageContent.substring(0, 300)}`);
      await takeScreenshot(page, '05-unknown-state');
    }
  } catch (e) {
    console.log('Error checking verification:', e.message);
  }

  // ==========================================
  // STEP 6: Try to get to dashboard via API if needed
  // ==========================================
  console.log('\n=== STEP 6: Try to Reach Dashboard ===');
  try {
    const currentUrl = page.url();

    // If we're on a verification page, try to enter OTP
    const otpInput = page.locator('input[name="otp"], input[placeholder*="OTP" i], input[placeholder*="code" i]').first();
    if (await otpInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const pageContent = await page.textContent('body').catch(() => '');
      const otpMatch = pageContent.match(/(\d{6})/);
      if (otpMatch) {
        await otpInput.fill(otpMatch[1]);
        console.log(`✓ Filled OTP: ${otpMatch[1]}`);

        const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Submit"), button[type="submit"]').first();
        if (await verifyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await verifyBtn.click();
          await wait(5000);
          await takeScreenshot(page, '06-after-otp-verify');
        }
      }
    }

    // If still not on dashboard, use API to authenticate
    if (!page.url().includes('dashboard') && !page.url().includes('overview')) {
      console.log('Using API-based auth to reach dashboard...');

      // Sign up via API
      try {
        const signupResp = await page.request.post('http://localhost:3000/api/auth/signup', {
          data: {
            name: 'RC Test',
            email: 'rc-test-002@test.com',
            password: 'TestPass123!',
          }
        });
        const signupData = await signupResp.json();
        console.log(`Signup API: status=${signupResp.status()}`);

        if (signupData.otp) {
          console.log(`✓ Dev OTP from API: ${signupData.otp}`);
          findings.push({ severity: 'INFO', message: `Dev OTP returned from signup API: ${signupData.otp}` });

          // Verify email
          try {
            const verifyResp = await page.request.post('http://localhost:3000/api/auth/verify-email', {
              data: { email: 'rc-test-002@test.com', otp: signupData.otp }
            });
            console.log(`Verify email API: status=${verifyResp.status()}`);
          } catch (e) {
            console.log('Verify email failed:', e.message);
          }
        }

        // Sign in
        const signinResp = await page.request.post('http://localhost:3000/api/auth/signin', {
          data: { email: 'rc-test-002@test.com', password: 'TestPass123!' }
        });
        console.log(`Signin API: status=${signinResp.status()}`);

        if (signinResp.ok()) {
          // Navigate to the app
          await page.goto('http://localhost:3000', { timeout: 15000, waitUntil: 'domcontentloaded' });
          await wait(5000);
          await takeScreenshot(page, '06-dashboard-via-api');
          console.log(`Dashboard URL: ${page.url()}`);
        }
      } catch (e) {
        console.log('API auth failed:', e.message);
        // Try direct sign-in (user might already exist)
        try {
          const signinResp = await page.request.post('http://localhost:3000/api/auth/signin', {
            data: { email: 'rc-test-002@test.com', password: 'TestPass123!' }
          });
          console.log(`Signin retry: status=${signinResp.status()}`);
          if (signinResp.ok()) {
            await page.goto('http://localhost:3000', { timeout: 15000, waitUntil: 'domcontentloaded' });
            await wait(5000);
            await takeScreenshot(page, '06-dashboard-signin-retry');
          }
        } catch (e2) {
          console.log('Signin retry also failed:', e2.message);
        }
      }
    }

    // Final check on dashboard state
    const dashboardUrl = page.url();
    console.log(`Current URL: ${dashboardUrl}`);
    await takeScreenshot(page, '06-final-dashboard-state');
  } catch (e) {
    findings.push({ severity: 'MEDIUM', message: `Error reaching dashboard: ${e.message}` });
    console.log('Error reaching dashboard:', e.message);
  }

  // ==========================================
  // STEP 7: Dashboard checks - Profile menu
  // ==========================================
  console.log('\n=== STEP 7: Dashboard - Profile Menu ===');
  try {
    if (page.url().includes('localhost:3000') && !page.url().includes('auth')) {
      await takeScreenshot(page, '07-dashboard-before-profile');

      // Look for avatar/profile button
      const avatarSelectors = [
        'button[class*="avatar"]',
        'button[class*="Avatar"]',
        '[data-testid="user-menu"]',
        'img[class*="avatar"]',
        '[class*="user-menu"]',
        '[class*="profile"]',
        'button:has(img[alt*="avatar" i])',
        '[class*="rounded-full"]',
      ];

      let profileClicked = false;
      for (const sel of avatarSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            await el.click();
            profileClicked = true;
            console.log(`✓ Clicked profile menu using: ${sel}`);
            break;
          }
        } catch (e) {
          // continue
        }
      }

      if (profileClicked) {
        await wait(1000);
        await takeScreenshot(page, '07-profile-menu-open');
      } else {
        console.log('⚠ Profile menu/avatar not found');
        findings.push({ severity: 'LOW', message: 'Profile menu/avatar not found on dashboard' });
      }

      // Close any open menus
      await page.keyboard.press('Escape');
      await wait(500);
    } else {
      console.log('Not on dashboard, skipping profile menu check');
      findings.push({ severity: 'MEDIUM', message: `Could not reach dashboard for profile check. URL: ${page.url()}` });
    }
  } catch (e) {
    console.log('Error checking profile menu:', e.message);
  }

  // ==========================================
  // STEP 8: Navigate between tabs
  // ==========================================
  console.log('\n=== STEP 8: Navigate Between Tabs ===');
  try {
    const tabs = [
      { name: 'Leads', selectors: ['text="Leads"', 'a:has-text("Leads")', 'button:has-text("Leads")', '[data-tab="leads"]'] },
      { name: 'Pipeline', selectors: ['text="Pipeline"', 'a:has-text("Pipeline")', 'button:has-text("Pipeline")', '[data-tab="pipeline"]'] },
      { name: 'Deals', selectors: ['text="Deals"', 'a:has-text("Deals")', 'button:has-text("Deals")', '[data-tab="deals"]'] },
      { name: 'Insights', selectors: ['text="Insights"', 'a:has-text("Insights")', 'button:has-text("Insights")', '[data-tab="insights"]'] },
      { name: 'Discover', selectors: ['text="Discover"', 'a:has-text("Discover")', 'button:has-text("Discover")', '[data-tab="discover"]'] },
      { name: 'Outreach', selectors: ['text="Outreach"', 'a:has-text("Outreach")', 'button:has-text("Outreach")', '[data-tab="outreach"]'] },
      { name: 'Assistant', selectors: ['text="Assistant"', 'a:has-text("Assistant")', 'button:has-text("Assistant")', '[data-tab="assistant"]'] },
    ];

    for (const tab of tabs) {
      let tabClicked = false;
      for (const sel of tab.selectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            await el.click();
            tabClicked = true;
            break;
          }
        } catch (e) {
          // continue
        }
      }

      if (tabClicked) {
        await wait(3000);
        await takeScreenshot(page, `08-tab-${tab.name.toLowerCase()}`);
        console.log(`✓ Navigated to ${tab.name} tab`);
      } else {
        console.log(`⚠ ${tab.name} tab not visible`);
      }
    }

    // Go back to Overview
    const overviewSelectors = ['text="Overview"', 'a:has-text("Overview")', 'button:has-text("Overview")'];
    for (const sel of overviewSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          await wait(3000);
          break;
        }
      } catch (e) {
        // continue
      }
    }
  } catch (e) {
    console.log('Error navigating tabs:', e.message);
  }

  // ==========================================
  // STEP 9: Check AI Chat Bubble
  // ==========================================
  console.log('\n=== STEP 9: Check AI Chat Bubble ===');
  try {
    // Look for the chat bubble - it's usually in the bottom right
    const chatSelectors = [
      'button[aria-label*="chat" i]',
      'button[aria-label*="AI" i]',
      '[class*="chat-bubble"]',
      '[class*="ai-chat"]',
      '[class*="floating-chat"]',
      'button[class*="fixed"]',
    ];

    let chatClicked = false;
    for (const sel of chatSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          chatClicked = true;
          console.log(`✓ Clicked AI chat bubble using: ${sel}`);
          break;
        }
      } catch (e) {
        // continue
      }
    }

    if (chatClicked) {
      await wait(2000);
      await takeScreenshot(page, '09-ai-chat-open');
    } else {
      console.log('⚠ AI Chat bubble not found');
      findings.push({ severity: 'LOW', message: 'AI Chat bubble not found or not visible' });

      // Try scrolling to find it
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await wait(1000);
      await takeScreenshot(page, '09-searching-chat-bubble');
    }

    // Close chat if open
    const closeChat = page.locator('button[aria-label*="close" i], button:has-text("Close")').first();
    if (await closeChat.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeChat.click();
      await wait(500);
    } else {
      await page.keyboard.press('Escape');
      await wait(500);
    }
  } catch (e) {
    console.log('Error checking AI chat bubble:', e.message);
  }

  // ==========================================
  // STEP 10: Mobile Viewport Test
  // ==========================================
  console.log('\n=== STEP 10: Mobile Viewport Test ===');
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await wait(3000);
    await takeScreenshot(page, '10-mobile-viewport');
    console.log('✓ Mobile viewport screenshot taken');

    // Check for mobile menu/hamburger button
    const mobileMenuSelectors = [
      'button[aria-label*="menu" i]',
      '[class*="hamburger"]',
      'svg[class*="menu"]',
      'button:has(svg)', // Generic button with icon
      '[class*="mobile-menu"]',
    ];

    let menuOpened = false;
    for (const sel of mobileMenuSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          menuOpened = true;
          console.log(`✓ Opened mobile menu using: ${sel}`);
          break;
        }
      } catch (e) {
        // continue
      }
    }

    if (menuOpened) {
      await wait(2000);
      await takeScreenshot(page, '10-mobile-menu-open');
    } else {
      console.log('⚠ Mobile menu/hamburger not found');
      findings.push({ severity: 'LOW', message: 'Mobile menu/hamburger button not found' });
    }

    // Test mobile signup page too
    await page.goto('http://localhost:3000', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await wait(3000);
    await takeScreenshot(page, '10-mobile-homepage');

    // Reset viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await wait(2000);
  } catch (e) {
    console.log('Error testing mobile viewport:', e.message);
    findings.push({ severity: 'LOW', message: `Mobile viewport test error: ${e.message}` });
  }

  // ==========================================
  // Collect errors
  // ==========================================
  if (errors.length > 0) {
    const consoleErrs = errors.filter(e => e.type === 'console');
    const pageErrs = errors.filter(e => e.type === 'page');

    if (consoleErrs.length > 0) {
      findings.push({ severity: 'MEDIUM', message: `${consoleErrs.length} console errors detected` });
      consoleErrs.slice(0, 5).forEach(e => console.log(`  Console Error: ${e.message.substring(0, 200)}`));
    }
    if (pageErrs.length > 0) {
      findings.push({ severity: 'HIGH', message: `${pageErrs.length} page errors detected` });
      pageErrs.slice(0, 5).forEach(e => console.log(`  Page Error: ${e.message.substring(0, 200)}`));
    }
  }

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n' + '='.repeat(60));
  console.log('VISUAL QA SUMMARY');
  console.log('='.repeat(60));
  console.log(`Screenshots taken: ${screenshots.length}`);
  screenshots.forEach(s => console.log(`  📸 ${s.name}: ${s.path}`));
  console.log(`\nFindings: ${findings.length}`);
  findings.forEach((f, i) => {
    const icon = f.severity === 'CRITICAL' ? '🔴' : f.severity === 'HIGH' ? '🟠' : f.severity === 'MEDIUM' ? '🟡' : f.severity === 'LOW' ? '🔵' : 'ℹ️';
    console.log(`  ${icon} [${f.severity}] ${f.message}`);
  });
  console.log(`\nErrors captured: ${errors.length}`);
  errors.slice(0, 10).forEach(e => console.log(`  [${e.type}] ${e.message.substring(0, 150)}`));

  await browser.close();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
