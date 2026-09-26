// Diagnose REAL SMTP delivery using the exact same code path as src/lib/email.ts
// 1. transporter.verify() → connection + auth check
// 2. self-send → real end-to-end delivery to the SMTP account itself
/* eslint-disable no-console */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/z/my-project/.env' });

async function main() {
  const nodemailer = await import('nodemailer');

  const host = process.env.SMTP_HOST;
  const rawPort = process.env.SMTP_PORT;
  const port = rawPort ? parseInt(rawPort, 10) : NaN;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  console.log('SMTP config present:', {
    host: host || 'MISSING',
    port: rawPort || 'MISSING',
    user: user ? `${user.slice(0, 3)}***${user.slice(user.indexOf('@'))}` : 'MISSING',
    pass: pass ? `SET (${pass.length} chars)` : 'MISSING',
  });

  if (!host || !user || !pass || Number.isNaN(port)) {
    console.log('❌ Incomplete SMTP configuration — this alone would cause the OTP failure.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 25000,
  });

  console.log(`\n=== verify() → ${host}:${port} secure=${port === 465} ===`);
  try {
    await transporter.verify();
    console.log('✓ SMTP connection + auth OK');
  } catch (err) {
    console.log('❌ verify() FAILED — this is the OTP delivery root cause:');
    console.log(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('\n=== self-send test (real delivery to own address) ===');
  try {
    const info = await transporter.sendMail({
      from: `AcquisitionOS <${user}>`,
      to: user,
      subject: 'AcquisitionOS SMTP diagnostic — real delivery test',
      text: 'If you receive this, real SMTP delivery works. You can delete this email.',
      html: '<p>If you receive this, <b>real SMTP delivery works</b>. You can delete this email.</p>',
    });
    console.log('✓ ACCEPTED by provider — messageId:', info.messageId, '| response:', info.response);
  } catch (err) {
    console.log('❌ send FAILED — root cause:');
    console.log(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('\nSMTP DELIVERY FULLY FUNCTIONAL');
  process.exit(0);
}

main();
