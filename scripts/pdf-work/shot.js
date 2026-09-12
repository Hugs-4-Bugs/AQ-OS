// Diagram screenshot: HTML -> PNG at 2x device scale (300dpi print quality)
// Sanctioned by pdf skill SKILL.md "Diagram Generation Strategy":
//   "Or via Playwright directly: page.screenshot(..., device_scale_factor=2)"
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(process.argv[2] || 'architecture.html');
  const outPath = path.resolve(process.argv[3] || 'architecture.png');
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600); // font settle
  const el = await page.$('.canvas');
  await el.screenshot({ path: outPath });
  await browser.close();
  console.log('PNG written:', outPath);
})();
