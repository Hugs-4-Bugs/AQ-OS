// Read-only inspection of QA fixture users (no writes anywhere).
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const users = await db.user.findMany({
  where: { OR: [{ email: { contains: 'test.local' } }, { email: { contains: 'qa' } }] },
  orderBy: { createdAt: 'desc' },
  take: 8,
  select: { id: true, email: true, isActive: true, deletedAt: true, plan: true, name: true, phone: true, company: true, credits: true },
});
console.table(users.map(u => ({
  id: u.id, email: u.email, isActive: u.isActive, deleted: !!u.deletedAt,
  plan: u.plan, name: u.name, hasPhone: !!u.phone, company: u.company, credits: u.credits,
})));
await db.$disconnect();
