// List users + create a test session for API E2E testing.
import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient();
  const users = await db.user.findMany({ take: 5, select: { id: true, email: true, name: true } });
  console.log(JSON.stringify(users, null, 2));
  await db.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
