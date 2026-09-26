// Direct SMTP test — replicates src/lib/email.ts sendViaSmtp config
const nodemailer = require('/home/z/my-project/node_modules/nodemailer');

async function main() {
  // SECURITY: credentials come from .env — never hardcoded (they were
  // previously committed here and had to be rotated).
  const cfg = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
    },
  };
  if (!cfg.auth.user || !cfg.auth.pass) {
    console.error('Set SMTP_USER and SMTP_PASSWORD in .env before running this script.');
    process.exit(1);
  }
  const t = nodemailer.createTransport(cfg);
  console.log('[1] verifying SMTP connection...');
  await t.verify();
  console.log('[1] VERIFY OK — credentials valid, server ready');

  console.log('[2] sending real test email...');
  const info = await t.sendMail({
    from: '"AcquisitionOS" <mailtoprabhat72@gmail.com>',
    to: 'mailtoprabhat72@gmail.com',
    subject: 'SMTP test ' + new Date().toISOString(),
    text: 'If you can read this in your Gmail inbox, email delivery works.',
  });
  console.log('[2] SEND OK — messageId:', info.messageId, 'response:', info.response);
}

main().catch((e) => { console.error('SMTP FAILED:', e.message, e.code || ''); process.exit(1); });
