// Read-only: list tables + session table count to diagnose signin 500
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log('TABLES:', tables.map(t => t.name).join(', '));
try {
  const cnt = await db.session.count();
  console.log('session count:', cnt);
} catch (e) {
  console.log('session.count() ERROR:', e.message?.slice(0, 200));
}
await db.$disconnect();
