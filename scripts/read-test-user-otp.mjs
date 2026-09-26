// Read-only diagnostic: fetch the verification OTP for the e2e test user
// created via the PUBLIC signup API (starter-e2e-20260923@test.local).
// Read-only — performs no writes. Used to complete the app's own
// verify-email flow for browser E2E verification.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const user = await db.user.findUnique({
  where: { email: 'starter-e2e-20260923@test.local' },
  select: { id: true, email: true, plan: true, emailVerified: true, emailVerificationOtp: true },
});
console.log(JSON.stringify({
  id: user?.id,
  email: user?.email,
  plan: user?.plan,
  emailVerified: user?.emailVerified,
  otp: user?.emailVerificationOtp ? 'PRESENT(' + user.emailVerificationOtp + ')' : 'MISSING',
}, null, 2));
await db.$disconnect();
