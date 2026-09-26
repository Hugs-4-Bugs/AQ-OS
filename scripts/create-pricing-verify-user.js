// Seed a fresh, verified test user for pricing UI verification (local dev SQLite).
// ADDITIVE ONLY — creates one new user; does not touch any existing user,
// subscription, credit balance, ledger entry, or payment history.
const bcrypt = require('bcryptjs');

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const email = 'pricing.verify@example.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Seed user already exists — leaving untouched. id=' + existing.id);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash('Verify!2026', 12);
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Pricing Verify',
      passwordHash,
      emailVerified: true,
      plan: 'free',
      country: 'IN',
    },
    select: { id: true, email: true, plan: true, emailVerified: true },
  });
  console.log('Created verified seed user:', JSON.stringify(user));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
