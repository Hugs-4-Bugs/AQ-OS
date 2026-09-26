/**
 * One-off dev helper: completes the relation setup for the E2E test user
 * created by scripts/create-verify-user.ts (settings + trial subscription,
 * mirroring what the public signup API creates). Touches ONLY the single
 * test user identified by TEST_USER_EMAIL below — never any real user.
 */
import { PrismaClient } from '@prisma/client';

const EMAIL = process.env.TEST_USER_EMAIL;

if (!EMAIL) {
  console.error('Set TEST_USER_EMAIL');
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  const user = await db.user.findUnique({
    where: { email: EMAIL },
    include: { settings: true, subscriptions: true },
  });
  if (!user) {
    console.error('user not found:', EMAIL);
    process.exit(1);
  }

  if (!user.settings) {
    await db.userSettings.create({ data: { userId: user.id } });
    console.log('created settings for', EMAIL);
  }

  if (user.subscriptions.length === 0) {
    await db.subscription.create({
      data: {
        userId: user.id,
        plan: 'free',
        status: 'trial',
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    console.log('created trial subscription for', EMAIL);
  }

  // Mirror the signup defaults the script skipped.
  await db.user.update({
    where: { id: user.id },
    data: {
      authProvider: 'email',
      isTrial: true,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  console.log('user finalized:', EMAIL);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
