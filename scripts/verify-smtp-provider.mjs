/**
 * REAL provider-level Gmail SMTP validation using the app's own path
 * (nodemailer + alias-aware env helpers) with credentials from .env.
 * NEVER prints secret values — only connection/auth verdicts.
 *
 * Steps:
 *  1. transporter.verify() → real SMTP TCP + STARTTLS + AUTH LOGIN against smtp.gmail.com
 *  2. If AUTH succeeds: real sendMail to the SMTP account itself (self-address),
 *     proving end-to-end acceptance by Gmail (250 + messageId).
 */
import { readFileSync } from 'fs';

function envValue(...keys) {
  const env = {};
  for (const line of readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  for (const k of keys) if (env[k]) return env[k];
  return undefined;
}

const host = envValue('SMTP_HOST', 'MAIL_HOST', 'EMAIL_HOST');
const portRaw = envValue('SMTP_PORT', 'MAIL_PORT', 'EMAIL_PORT');
const user = envValue('SMTP_USER', 'SMTP_USERNAME', 'GMAIL_USER', 'EMAIL_USER', 'MAIL_USER');
const pass = envValue('SMTP_PASSWORD', 'SMTP_PASS', 'GMAIL_APP_PASSWORD', 'EMAIL_PASSWORD', 'MAIL_PASSWORD');
const port = Number(portRaw || 587);

console.log(`SMTP_HOST=${host || 'MISSING'} SMTP_PORT=${port || 'MISSING'}`);
console.log(`SMTP_USER=${user ? user : 'MISSING'}`);
console.log(`SMTP_PASSWORD=${pass ? `PRESENT (len=${pass.length}, has-whitespace=${/\s/.test(pass)})` : 'MISSING'}`);
if (!host || !user || !pass) { console.log('RESULT: NOT DONE — SMTP config incomplete'); process.exit(1); }

const nodemailerMod = await import('nodemailer');
const nodemailer = nodemailerMod.default ?? nodemailerMod;

const transporter = nodemailer.createTransport({
  host, port, secure: port === 465,
  auth: { user, pass },
  connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 25000,
});

console.log(`\n── Step 1: transporter.verify() → ${host}:${port} (secure=${port === 465}) ──`);
try {
  await transporter.verify();
  console.log('VERIFY: SUCCESS — TCP + STARTTLS/TLS + AUTH LOGIN accepted by Gmail.');
} catch (e) {
  console.log(`VERIFY: FAILED — code=${e.code || 'n/a'} response=${(e.response || e.message || '').toString().replace(/\r?\n/g, ' | ').slice(0, 300)}`);
  console.log('RESULT: BLOCKED — EXTERNAL CREDENTIAL (Gmail rejected AUTH). No send attempted.');
  process.exit(2);
}

console.log('\n── Step 2: real sendMail to self (proves Gmail accepted the message) ──');
try {
  const info = await transporter.sendMail({
    from: `AcquisitionOS <${user}>`,
    to: user,
    subject: 'AcquisitionOS SMTP verification — real send test',
    text: 'This is a real SMTP delivery verification sent by the AcquisitionOS server using the credentials configured in .env. If you received this in the Gmail inbox, SMTP delivery works end-to-end.',
  });
  console.log(`SEND: SUCCESS messageId=${info.messageId}`);
  console.log(`SEND: response=${(info.response || '').slice(0, 160)}`);
  console.log('RESULT: SMTP FULLY OPERATIONAL with the .env credentials.');
} catch (e) {
  console.log(`SEND: FAILED — code=${e.code || 'n/a'} response=${(e.response || e.message || '').toString().replace(/\r?\n/g, ' | ').slice(0, 300)}`);
  console.log('RESULT: PARTIAL — AUTH ok but send rejected.');
  process.exit(3);
}
console.log('\nNo secrets were printed.');
