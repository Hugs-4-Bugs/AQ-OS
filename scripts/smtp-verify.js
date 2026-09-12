/**
 * Live SMTP credential verification for AcquisitionOS.
 * Performs nodemailer verify() — SMTP handshake + AUTH only.
 * Does NOT send any email. Reads credentials from /home/z/my-project/.env.
 */
const fs = require('fs');

// Minimal .env loader (no dotenv dependency needed)
const envText = fs.readFileSync('/home/z/my-project/.env', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const passAliases = [
  'SMTP_PASSWORD', 'SMTP_PASS', 'SMTP_AUTH_PASSWORD', 'GMAIL_APP_PASSWORD',
  'GMAIL_PASSWORD', 'EMAIL_PASSWORD', 'EMAIL_PASS', 'MAIL_PASSWORD', 'MAIL_PASS',
];
const userAliases = ['SMTP_USER', 'SMTP_USERNAME', 'GMAIL_USER', 'EMAIL_USER'];

const user = userAliases.map((k) => process.env[k]).find(Boolean);
const pass = passAliases.map((k) => process.env[k]).find(Boolean);
const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = parseInt(process.env.SMTP_PORT || '587', 10);

console.log(`Host: ${host}:${port}`);
console.log(`User: ${user}`);
console.log(`Pass: ${pass ? `SET (${pass.length} chars, spaces: ${(pass.match(/ /g) || []).length})` : 'MISSING'}`);

if (!user || !pass) {
  console.error('FAIL: missing SMTP user or password');
  process.exit(1);
}

const nodemailer = require('/home/z/my-project/node_modules/nodemailer');

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
  connectionTimeout: 20000,
  greetingTimeout: 15000,
});

transporter
  .verify()
  .then(() => {
    console.log('RESULT: SMTP AUTH SUCCESS — Gmail accepted the credentials');
    process.exit(0);
  })
  .catch((err) => {
    console.error('RESULT: SMTP AUTH FAILED —', err.message);
    console.error('code:', err.code, '| response:', err.response || 'none');
    process.exit(1);
  });
