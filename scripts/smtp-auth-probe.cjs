#!/usr/bin/env node
/**
 * Gmail SMTP AUTH probe — tests the stored App Password in raw and
 * space-stripped form. NEVER prints the password; only outcomes.
 * Connects, authenticates, QUITs. Sends no mail.
 */
const fs = require('fs');

const env = {};
for (const line of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
}

const user = env.SMTP_USER || env.GMAIL_USER;
const rawPass = env.SMTP_PASSWORD || env.SMTP_PASS || env.GMAIL_APP_PASSWORD;
const host = env.SMTP_HOST || 'smtp.gmail.com';
const port = parseInt(env.SMTP_PORT || '587', 10);

async function tryAuth(label, password) {
  const nodemailer = require('/home/z/my-project/node_modules/nodemailer');
  return new Promise((resolve) => {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass: password },
      connectionTimeout: 20000, socketTimeout: 20000,
    });
    transporter.verify((err, success) => {
      if (err) {
        const msg = (err.message || String(err)).split('\n')[0].slice(0, 140);
        const code = err.responseCode || err.code || 'n/a';
        console.log(`[${label}] AUTH FAILED — code=${code} :: ${msg}`);
      } else {
        console.log(`[${label}] AUTH SUCCEEDED`);
      }
      transporter.close();
      resolve();
    });
  });
}

(async () => {
  console.log(`SMTP target: ${host}:${port} (secure=${port === 465})`);
  console.log(`user present: ${!!user}, password present: ${!!rawPass}`);
  console.log('password format: raw stored form (len=' + rawPass.length + ', has-spaces=' + /\s/.test(rawPass) + ')');
  await tryAuth('variant-1 raw-stored-value', rawPass);
  await tryAuth('variant-2 spaces-stripped', rawPass.replace(/\s+/g, ''));
  console.log('probe complete — no mail sent');
})();
