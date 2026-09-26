// verify-smtp-config.mjs — explicit SMTP verification for the auth-fix report.
// Uses nodemailer transporter.verify() (DNS → TCP → TLS/STARTTLS → AUTH)
// WITHOUT sending any message. Prints SAFE metadata only (no passwords).
// Read-only with respect to the app: no DB access, no writes.
import { readFileSync } from 'fs';
import nodemailer from 'nodemailer';

const envSrc = readFileSync('/home/z/my-project/.env', 'utf8');
const getEnv = (name) => {
  const m = envSrc.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!m) return undefined;
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};

const host = getEnv('SMTP_HOST');
const portRaw = getEnv('SMTP_PORT');
const port = portRaw ? parseInt(portRaw, 10) : NaN;
const user = getEnv('SMTP_USER') || getEnv('SMTP_USERNAME') || getEnv('GMAIL_USER');
const pass = getEnv('SMTP_PASSWORD') || getEnv('SMTP_PASS') || getEnv('GMAIL_APP_PASSWORD');

// SAFE metadata only — never print the password value.
console.log('SMTP configured metadata:', {
  host: host || 'MISSING',
  port: portRaw || 'MISSING',
  secureMode: port === 465 ? 'implicit TLS (465)' : port === 587 ? 'STARTTLS (587)' : String(port),
  user: user ? `${user.slice(0, 3)}***@${user.includes('@') ? user.split('@')[1] : ''}` : 'MISSING',
  password: pass ? `SET (len=${pass.length})` : 'MISSING',
});

if (!host || !user || !pass || Number.isNaN(port)) {
  console.log('RESULT: INCOMPLETE — SMTP verification not possible');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS (nodemailer default)
  auth: { user, pass },
});

try {
  // verify(): DNS resolution, TCP connection, TLS upgrade, SMTP AUTH — no mail sent.
  await transporter.verify();
  console.log('RESULT: SMTP connection verified: YES');
  console.log('RESULT: SMTP authentication verified: YES');
  process.exit(0);
} catch (err) {
  console.log('RESULT: SMTP verification FAILED');
  console.log('error code:', err?.code || 'n/a');
  console.log('error command:', err?.command || 'n/a');
  process.exit(1);
}
