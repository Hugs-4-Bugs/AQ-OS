/** Quick DB inspection: remaining notification rows. */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const rows = await db.notification.findMany({
    select: { id: true, userId: true, type: true, title: true, read: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  console.log('remaining notifications:', rows.length);
  for (const r of rows) {
    console.log('-', r.type, '|', r.title.slice(0, 50), '| read:', r.read, '|', r.createdAt.toISOString());
  }
  const users = await db.user.findMany({
    where: { notifications: { some: {} } },
    select: { id: true, email: true, role: true },
  });
  console.log('users with notifications:', JSON.stringify(users));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
