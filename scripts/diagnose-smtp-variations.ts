// Try password normalizations — Gmail app passwords are often pasted with spaces
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/z/my-project/.env' });
async function main() {
  const nodemailer = await import('nodemailer');
  const host = process.env.SMTP_HOST!;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER!;
  const raw = process.env.SMTP_PASSWORD!;
  const variants: Array<[string, string]> = [
    ['original', raw],
    ['trimmed', raw.trim()],
    ['spaces-removed', raw.replace(/\s+/g, '')],
    ['lowercase', raw.trim().toLowerCase()],
  ];
  for (const [name, pass] of variants) {
    try {
      const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 15000 });
      await t.verify();
      console.log(`✓ variant "${name}" WORKS`);
      process.exit(0);
    } catch (err) {
      console.log(`✗ variant "${name}": ${(err as Error).message.split('\n')[0].slice(0, 90)}`);
    }
  }
  console.log('ALL VARIANTS REJECTED — credential itself is invalid/revoked at Google');
  process.exit(1);
}
main();
