/**
 * QA FIXTURE ONLY — temporarily set the synthetic QA account to an active
 * elite subscription (matches the end-user environment shown in the task
 * screenshots: Elite plan, no trial banner). Restore with --restore.
 * Synthetic test account only — no real user data touched.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EMAIL = 'preview.verify@acquisitionos.local';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    console.error('QA user not found:', EMAIL);
    process.exit(1);
  }
  const restore = process.argv.includes('--restore');

  if (restore) {
    await prisma.subscription.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { plan: 'free' } });
    console.log('RESTORED: subscription rows removed, user.plan=free');
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await prisma.subscription.deleteMany({ where: { userId: user.id } });
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: 'elite',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      isTrial: false,
      creditsTotal: 2000,
      creditsRemaining: 2000,
      creditsUsed: 0,
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { plan: 'elite' } });
  console.log('SET: elite active subscription for', EMAIL);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
