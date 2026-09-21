import { db } from './src/lib/db';
(async () => {
  const users = await db.user.findMany({ select: { email: true, name: true, authProvider: true, emailVerified: true }, take: 10, orderBy: { createdAt: 'desc' } });
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
