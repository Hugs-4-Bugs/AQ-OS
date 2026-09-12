import { chromium } from 'playwright';
import http from 'http';

// First, verify the server is accessible via Node.js HTTP
function checkServer() {
  return new Promise((resolve) => {
    http.get('http://localhost:3000/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: true, status: res.statusCode, data: data.substring(0, 500) }));
    }).on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

async function main() {
  // Check server accessibility from Node.js
  const serverCheck = await checkServer();
  console.log('Server check from Node.js:', JSON.stringify(serverCheck, null, 2));
  
  if (!serverCheck.ok) {
    console.error('Server is not accessible from Node.js. Aborting.');
    process.exit(1);
  }

  // Try launching browser with different settings
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Collect errors
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log('Attempting to navigate to http://localhost:3000...');
  
  try {
    await page.goto('http://localhost:3000', { timeout: 30000, waitUntil: 'domcontentloaded' });
    console.log('Navigation succeeded!');
    console.log('URL:', page.url());
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/home/z/my-project/download/rc-visual-qa-homepage.png' });
    console.log('Screenshot saved!');
  } catch (e) {
    console.error('Navigation failed:', e.message);
    
    // Try using the IP address
    try {
      await page.goto('http://127.0.0.1:3000', { timeout: 15000, waitUntil: 'domcontentloaded' });
      console.log('Navigation to 127.0.0.1 succeeded!');
      await page.screenshot({ path: '/home/z/my-project/download/rc-visual-qa-homepage-ip.png' });
    } catch (e2) {
      console.error('Navigation to 127.0.0.1 also failed:', e2.message);
      
      // Try to use page.setRequestInterception to proxy requests
      // Actually, let's try a different approach - use the page's evaluate to fetch content
      try {
        const result = await page.evaluate(async () => {
          const resp = await fetch('http://localhost:3000/');
          return { status: resp.status, ok: resp.ok };
        });
        console.log('Fetch from browser context:', JSON.stringify(result));
      } catch (e3) {
        console.error('Fetch from browser context also failed:', e3.message);
      }
    }
  }

  await browser.close();
}

main().catch(e => console.error('Fatal:', e));
