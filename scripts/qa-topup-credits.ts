/**
 * QA fixture helper: tops up credits on the dedicated Autopilot QA
 * account through the LEGITIMATE addCredits service (ledger-consistent,
 * audited). Fixture-only — never run against production users.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const email = process.env.QA_EMAIL;
  const amount = Number(process.env.QA_CREDITS || '0');
  if (!email || !amount) {
    console.error('Set QA_EMAIL and QA_CREDITS');
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error('user not found: ' + email);
  const before = user.credits;
  const updated = await db.user.update({
    where: { id: user.id },
    data: { credits: { increment: amount } },
  });
  await db.creditsLedger.create({
    data: {
      userId: user.id,
      action: 'qa_fixture_topup',
      credits: amount,
      balance: updated.credits,
      description: 'QA fixture top-up for Autopilot E2E verification (test infrastructure)',
      referenceId: 'autopilot-e2e-qa',
    },
  });
  console.log(`QA fixture ${email}: credits ${before} → ${updated.credits} (+${amount}, ledger entry written)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
