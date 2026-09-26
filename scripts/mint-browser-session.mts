/* eslint-disable no-console */
// Mint an access_token cookie for browser verification of the pipeline tab.
const BASE = 'http://localhost:3000';
const TEST_EMAIL = 'realtest+signup@example.com';

async function main() {
  const mod = await import('../src/lib/auth');
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  const user = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) throw new Error('no test user');
  const token = mod.generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    orgId: user.orgId,
    isTrial: false,
    trialEndsAt: null,
  });
  // Dedicated lead for the browser run
  const lead = await db.lead.create({
    data: {
      userId: user.id,
      businessName: 'Brew & Bean Cafe',
      website: 'https://example.com',
      email: 'owner@example.com',
      city: 'Pune',
      country: 'India',
      niche: 'cafe',
      hasWebsite: true,
      source: 'test-browser',
    },
  });
  console.log(JSON.stringify({ token, leadId: lead.id }, null, 2));
  await db.$disconnect();
}
main();
