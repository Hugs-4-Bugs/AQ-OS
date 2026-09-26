// Mint a short-lived access token for BROWSER VERIFICATION of the Admin
// Dashboard (test harness only — does not change any app code or data).
// Usage: bun scripts/mint-admin-token.ts <userEmail>
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'acquisitionos-dev-secret-change-in-production') {
  console.error('Refusing to mint tokens: JWT_SECRET is missing or set to the public dev fallback. Configure a real secret first.');
  process.exit(1);
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('usage: bun scripts/mint-admin-token.ts <email>');
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, plan: true, orgId: true, isTrial: true, trialEndsAt: true, isActive: true },
  });
  if (!user) throw new Error('user not found: ' + email);
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId,
      isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt?.toISOString() || null,
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '30m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
  console.log(JSON.stringify({ id: user.id, email: user.email, role: user.role, isActive: user.isActive, token }));
}

main()
  .catch((e) => { console.error('ERR:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
