/**
 * Creates (or resets) a dedicated Autopilot QA user with a chosen plan.
 * Mirrors scripts/create-verify-user.ts (the repo's own preview-verification
 * tooling). Password comes from the environment — never hardcoded.
 *
 * Usage: VERIFY_USER_EMAIL=... VERIFY_USER_PASSWORD=... VERIFY_USER_PLAN=pro \
 *        npx tsx scripts/create-autopilot-qa-user.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const EMAIL = process.env.VERIFY_USER_EMAIL || 'preview.verify@acquisitionos.local';
const PASSWORD = process.env.VERIFY_USER_PASSWORD;
const PLAN = process.env.VERIFY_USER_PLAN || 'free';

if (!PASSWORD) {
  console.error('Set VERIFY_USER_PASSWORD (and optionally VERIFY_USER_EMAIL/VERIFY_USER_PLAN) first.');
  process.exit(1);
}
if (!['free', 'starter', 'pro', 'elite'].includes(PLAN)) {
  console.error('VERIFY_USER_PLAN must be one of free|starter|pro|elite');
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const existing = await db.user.findUnique({ where: { email: EMAIL } });

  if (existing) {
    await db.user.update({
      where: { email: EMAIL },
      data: { passwordHash: hash, emailVerified: true, plan: PLAN },
    });
    console.log('updated existing user:', EMAIL, '→ plan', PLAN);
  } else {
    const user = await db.user.create({
      data: {
        email: EMAIL,
        name: 'Autopilot QA',
        passwordHash: hash,
        role: 'owner',
        plan: PLAN,
        emailVerified: true,
      },
    });
    console.log('created user:', EMAIL, 'id:', user.id, 'plan:', PLAN);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
