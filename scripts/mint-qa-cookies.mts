/* eslint-disable no-console */
// Mint access_token cookies for EXISTING QA users (no data mutation).
// Usage: npx tsx scripts/mint-qa-cookies.mts
import { writeFileSync } from 'fs';

async function main() {
  const mod = await import('../src/lib/auth');
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();

  for (const [name, email] of [
    ['free', 'realtest+signup@example.com'],
    ['pro', 'pro-qa@test.local'],
  ] as const) {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`[mint] user not found: ${email}`);
      continue;
    }
    const token = mod.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId ?? null,
      isTrial: false,
      trialEndsAt: null,
    });
    const cookieLine = `localhost\tFALSE\t/\tFALSE\t0\taccess_token\t${token}`;
    writeFileSync(`/home/z/my-project/scripts/qa-${name}.fresh.cookies`, cookieLine + '\n');
    console.log(`[mint] ${name}: ${email} plan=${user.plan} userId=${user.id} -> scripts/qa-${name}.fresh.cookies`);
  }
  await db.$disconnect();
}
main();
