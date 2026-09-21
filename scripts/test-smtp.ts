/**
 * Direct Gmail SMTP verification — sends ONE real test email to the SMTP user's
 * own mailbox to prove credentials work. Run: npx tsx scripts/test-smtp.ts
 */
import * as nodemailer from 'nodemailer';

async function main() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;

  console.log(`SMTP config: host=${host}:${port}, user=${user ? user : 'MISSING'}, pass=${pass ? 'SET(16)' : 'MISSING'}`);
  if (!user || !pass) {
    console.error('FAIL: SMTP_USER / SMTP_PASSWORD not present in env');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: `AcquisitionOS <${user}>`,
      to: user,
      subject: 'AcquisitionOS SMTP verification test',
      text: 'This is a one-time verification email confirming real SMTP delivery is working for AcquisitionOS authentication emails (OTP / magic link). You can safely ignore or delete it.',
      html: '<p>This is a one-time verification email confirming <b>real SMTP delivery</b> is working for AcquisitionOS authentication emails (OTP / magic link). You can safely ignore or delete it.</p>',
    });
    console.log('SUCCESS: messageId=' + info.messageId);
    console.log('response=' + info.response);
    process.exit(0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

main();
