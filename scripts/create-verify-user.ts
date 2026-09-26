/**
 * Creates (or resets) a dedicated preview-verification user for the
 * AcquisitionOS dev database. Idempotent — safe to re-run.
 * Password is printed to stdout only (never committed).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// SECURITY: password comes from the environment — a known hardcoded
// password previously created email-verified accounts with public
// credentials on any database this script ran against.
const EMAIL = process.env.VERIFY_USER_EMAIL || 'preview.verify@acquisitionos.local';
const PASSWORD = process.env.VERIFY_USER_PASSWORD;

if (!PASSWORD) {
  console.error('Set VERIFY_USER_PASSWORD (and optionally VERIFY_USER_EMAIL) in the environment before running this script.');
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const existing = await db.user.findUnique({ where: { email: EMAIL } });

  if (existing) {
    await db.user.update({
      where: { email: EMAIL },
      data: { passwordHash: hash, emailVerified: true },
    });
    console.log('updated existing user:', EMAIL);
  } else {
    await db.user.create({
      data: {
        email: EMAIL,
        name: 'Preview Verifier',
        passwordHash: hash,
        role: 'owner',
        plan: 'free',
        emailVerified: true,
      },
    });
    console.log('created user:', EMAIL);
  }
  console.log('PASSWORD:', PASSWORD);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
