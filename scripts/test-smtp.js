// Direct SMTP test — replicates src/lib/email.ts sendViaSmtp config
const nodemailer = require('/home/z/my-project/node_modules/nodemailer');

async function main() {
  const cfg = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: 'mailtoprabhat72@gmail.com', pass: 'rodvowtaifcfjmue' },
  };
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
