/**
 * Test BOTH Gmail app-password candidates found in the repo and report
 * which one actually authenticates. Sends nothing — verify() only.
 */
const nodemailer = require('/home/z/my-project/node_modules/nodemailer');

// SECURITY: credentials come from .env — never hardcoded (they were
// previously committed here and had to be rotated).
const USER = process.env.SMTP_USER;
const CANDIDATES = [
  { label: 'SMTP_PASSWORD', pass: process.env.SMTP_PASSWORD },
  { label: 'SMTP_PASS', pass: process.env.SMTP_PASS },
  { label: 'GMAIL_APP_PASSWORD', pass: process.env.GMAIL_APP_PASSWORD },
].filter(c => !!c.pass);

if (!USER || CANDIDATES.length === 0) {
  console.error('Set SMTP_USER and SMTP_PASSWORD in .env before running this script.');
  process.exit(1);
}

async function tryPass(pass) {
  const t = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: USER, pass },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
  });
  await t.verify();
}

(async () => {
  for (const c of CANDIDATES) {
    try {
      await tryPass(c.pass);
      console.log(`SUCCESS  ${c.label}`);
    } catch (e) {
      console.log(`FAILED   ${c.label}  ->  ${e.code || ''} ${e.message}`.slice(0, 160));
    }
  }
})();
