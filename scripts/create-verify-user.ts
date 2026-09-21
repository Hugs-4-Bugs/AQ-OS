/**
 * Creates (or resets) a dedicated preview-verification user for the
 * AcquisitionOS dev database. Idempotent — safe to re-run.
 * Password is printed to stdout only (never committed).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const EMAIL = 'preview.verify@acquisitionos.local';
const PASSWORD = 'PreviewVerify#2026';

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
